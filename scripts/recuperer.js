#!/usr/bin/env node
"use strict";
/* Récupération automatique des matchs simulés sur ushl.ca.

   Lancé aux 20 minutes en soirée par .github/workflows/matchs.yml, ou à la main :
       node scripts/recuperer.js

   1. Le calendrier de la ligue (USHL22Schedule.html, puis ceux des séries) est demandé avec
      « If-Modified-Since » : tant que la ligue ne publie rien, le serveur répond 304 et rien n'est téléchargé.
   2. Chaque match joué qui n'est pas encore dans data/auto/ est récupéré : son sommaire FHL et,
      pour ses deux équipes, la page des trios publiée avec la même simulation.
   3. data/auto/index.js (la liste des matchs) et un fichier par match sont écrits pour l'interface.

   Rien n'est jamais effacé. Un match simulé de nouveau (pointage différent au calendrier) est remplacé. */

const fs = require("fs"), path = require("path");
const F = require("./fhl");
const M = require("./moteur");

const ROOT = path.join(__dirname, "..");
const AUTO = path.join("data", "auto");

/* ---------- Fichiers de données ---------- */
function readIndex(root) {
  const f = path.join(root, AUTO, "index.js");
  if (!fs.existsSync(f)) return null;
  const s = fs.readFileSync(f, "utf8");
  const a = s.indexOf("{"), b = s.lastIndexOf("}");
  return a >= 0 && b > a ? JSON.parse(s.slice(a, b + 1)) : null;
}
// Un match par ligne : fichier compact (chargé par la page) et différences lisibles dans l'historique git.
function serializeIndex(idx) {
  const saisons = Object.entries(idx.saisons).map(([k, S]) => {
    const { matchs, ...rest } = S;
    const head = JSON.stringify(rest, null, 1).replace(/\n/g, "\n  ").replace(/\n  }$/, "");
    const rows = matchs.map(m => "    " + JSON.stringify(m)).join(",\n");
    return `  ${JSON.stringify(k)}: ${head},\n   "matchs": [${rows ? "\n" + rows + "\n   " : ""}]\n  }`;
  });
  const { saisons: _s, ...top } = idx;
  const topJson = JSON.stringify(top, null, 1).replace(/\n}$/, "");
  return "/* Liste des matchs récupérés sur ushl.ca. Fichier généré par scripts/recuperer.js : ne pas modifier. */\n" +
    "window.USHL_AUTO=" + topJson + `${Object.keys(top).length ? "," : ""}\n "saisons": {${saisons.length ? "\n" + saisons.join(",\n") + "\n " : ""}}\n};\n`;
}
function gamePath(season, id) { return path.join(AUTO, season, id + ".js"); }
function writeGame(root, rec) {
  const rel = gamePath(rec.saison, rec.id), f = path.join(root, rel);
  fs.mkdirSync(path.dirname(f), { recursive: true });
  fs.writeFileSync(f, "/* Match récupéré sur ushl.ca. Fichier généré par scripts/recuperer.js : ne pas modifier. */\n" +
    "USHL_AUTO_MATCH(" + JSON.stringify(rec) + ");\n");
  return rel.split(path.sep).join("/");
}

/* ---------- Page de vérification servie parfois aux robots par le pare-feu du site ---------- */
const ANTI_ROBOT = /please wait while your request is being verified|request is being verified|verifying (that )?you are (a )?human|just a moment\.\.\.|attention required|captcha|challenge-platform|imunify/i;
function blocked(url) {
  const e = new Error(`${url} : le site a servi une page de vérification anti-robot au lieu de la page FHL. Rien n'est écrit; le prochain passage réessaiera.`);
  e.antiRobot = true;
  return e;
}

/* ---------- Décodage : FHL écrit souvent en Windows-1252 (accents des mois, par exemple « août ») ---------- */
function decode(buf) {
  try { return new TextDecoder("utf-8", { fatal: true }).decode(buf); }
  catch (e) { return new TextDecoder("windows-1252").decode(buf); }
}

const ordre = m => [m.t === "series" ? 1 : 0, m.r || 0, m.no];
const cmp = (a, b) => { const x = ordre(a), y = ordre(b); for (let i = 0; i < 3; i++) if (x[i] !== y[i]) return x[i] - y[i]; return 0; };

async function recuperer(options) {
  const o = Object.assign({
    root: ROOT, fetch: globalThis.fetch, now: () => new Date(), log: console.log, pause: 250,
    saisonSuivante: null,
    // en-tête HTTP : ASCII seulement
    ua: "ushl-simulateur-bot/1.0 (+" + (process.env.GITHUB_REPOSITORY ? "https://github.com/" + process.env.GITHUB_REPOSITORY : "github actions") + ")"
  }, options);
  const cfg = JSON.parse(fs.readFileSync(path.join(o.root, AUTO, "config.json"), "utf8"));
  const before = readIndex(o.root);
  const idx = before ? JSON.parse(JSON.stringify(before)) : { v: 1, saison: cfg.saison, saisons: {} };
  // --archive USHL21 : import ponctuel des séries d'une saison archivée, sans toucher à la saison en cours.
  const archive = o.archive || null;
  if (archive && !/^[A-Za-z]+\d+$/.test(archive)) throw new Error(`Nom de saison archivée invalide : « ${archive} » (attendu : USHL21, par exemple).`);
  if (archive && !cfg.archive) throw new Error("config.json : l'adresse « archive » est requise pour importer une saison archivée.");
  const base = String(o.base || (archive ? cfg.archive.replace("{saison}", archive) : cfg.base)).replace(/\/?$/, "/");
  // Saison en cours : la plus récente entre config.json (modifiable à la main) et celle détectée sur le site.
  const num = k => +(String(k || "").match(/(\d+)$/) || [0, -1])[1];
  let season = archive || o.saison || (num(idx.saison) > num(cfg.saison) ? idx.saison : cfg.saison);
  const types = archive ? ["series"] : (cfg.types || ["saison", "series"]);
  const now = o.now();
  const sleep = ms => ms > 0 ? new Promise(r => setTimeout(r, ms)) : Promise.resolve();
  const report = { nouveaux: [], remplaces: [], manquants: [], erreurs: [] };

  async function get(file, { ims, head } = {}) {
    const headers = { "User-Agent": o.ua, "Accept": "text/html,*/*;q=0.8" };
    if (ims) headers["If-Modified-Since"] = ims;
    const r = await o.fetch(base + file, { method: head ? "HEAD" : "GET", headers, redirect: "follow" });
    await sleep(o.pause);
    if (r.status === 304) return { status: 304 };
    if (r.status === 404 || r.status === 410) return { status: 404 };
    if (!r.ok) throw new Error(`${base + file} : réponse HTTP ${r.status}`);
    const res = { status: 200, lm: r.headers.get("last-modified") || null };
    if (!head) res.body = decode(new Uint8Array(await r.arrayBuffer()));
    return res;
  }
  // Fichier jamais vu ou absent : on vérifie d'abord qu'il existe, sans télécharger la page d'erreur du site.
  async function getIfChanged(file, rec) {
    if (!rec || !rec.lm) { const h = await get(file, { head: true }); if (h.status === 404) return h; }
    return get(file, { ims: rec && rec.lm });
  }

  // Passage à la saison suivante : vérifié une fois par jour (ou sur demande) avec une seule requête HEAD.
  const daily = now.getUTCHours() === 16 && now.getUTCMinutes() < 15;
  if (!archive && (o.saisonSuivante === true || (o.saisonSuivante !== false && daily && cfg.saisonSuivanteAuto !== false))) {
    const nxt = F.nextSeason(season);
    if (nxt && (await get(nxt + "Schedule.html", { head: true })).status === 200) {
      o.log(`Nouvelle saison détectée sur le site : ${nxt}`);
      season = nxt;
    }
  }
  if (!archive) idx.saison = season;
  const S = idx.saisons[season] || (idx.saisons[season] = { base, calendriers: {}, matchs: [], attente: {} });
  S.base = base;

  /* 1. Calendriers modifiés depuis le dernier passage */
  const changed = [];
  async function checkSchedule(kind, round, file) {
    const rec = S.calendriers[file] || {};
    const r = await getIfChanged(file, rec);
    if (r.status === 304) return rec;
    if (r.status === 404) { S.calendriers[file] = { absent: true }; return S.calendriers[file]; }
    // Publication en cours : les fichiers d'une simulation n'arrivent pas tous en même temps sur le serveur.
    // On attend qu'elle date d'au moins quelques minutes avant de la lire (le passage suivant s'en chargera).
    const age = (now - Date.parse(r.lm)) / 60e3;
    if (age < (cfg.stabilisationMinutes ?? 10)) { o.log(`${file} vient d'être publié, lecture au prochain passage.`); report.enCours = true; return rec; }
    const sch = F.parseSchedule(r.body);
    if (ANTI_ROBOT.test(r.body) && !sch.games.length) throw blocked(base + file);
    if (!/Schedule/i.test(sch.title) || !sch.games.length) throw new Error(`${base + file} ne ressemble pas à un calendrier FHL.`);
    S.calendriers[file] = { lm: r.lm, joues: sch.played.length, restants: sch.upcoming.length };
    changed.push({ kind, round, sch });
    return S.calendriers[file];
  }
  let reg = null;
  if (types.includes("saison")) reg = await checkSchedule("saison", 0, `${season}Schedule.html`);
  // Les séries ne sont consultées qu'une fois la saison terminée, et une ronde seulement si la précédente existe.
  if (types.includes("series") && (!reg || reg.absent || reg.restants === 0)) {
    for (let r = 1; r <= 4; r++) {
      const c = await checkSchedule("series", r, `${season}PLF-Round${r}-Schedule.html`);
      if (c.absent) break;
    }
  }

  /* 2. Matchs à récupérer : nouveaux, ou simulés de nouveau (pointage différent) */
  const known = new Map(S.matchs.map(m => [m.id, m]));
  const todo0 = new Map();
  for (const { kind, round, sch } of changed) for (const g of sch.played) {
    const id = F.gameId(season, kind, round, g.no);
    const k = known.get(id);
    if (k && k.pv === g.sa && k.pl === g.sh && (k.x || "") === g.extra) continue;
    todo0.set(id, { id, kind, round, g });
  }
  // Matchs en attente : ceux qui n'ont pas encore été tentés (plafond du passage précédent) sont repris tout de suite;
  // un sommaire absent est redemandé une fois par heure, jusqu'à « essaisMax ».
  const hourly = now.getUTCMinutes() < 15 || o.reessayer;
  for (const [id, a] of Object.entries(S.attente)) {
    if (!todo0.has(id) && (a.n === 0 || (hourly && a.n < (cfg.essaisMax || 24)))) todo0.set(id, { id, kind: a.t, round: a.r, g: a.g });
  }
  let todo = [...todo0.values()];
  todo.sort((a, b) => cmp({ t: a.kind, r: a.round, no: a.g.no }, { t: b.kind, r: b.round, no: b.g.no }));
  const max = cfg.maxParPassage || 150;
  if (todo.length > max) {
    o.log(`${todo.length} matchs à récupérer, ${max} dans ce passage, la suite au prochain.`);
    todo.slice(max).forEach(t => { if (!S.attente[t.id]) S.attente[t.id] = { n: 0, t: t.kind, r: t.round, g: t.g }; });
    todo = todo.slice(0, max);
  }

  /* 3. Trios et date de la soirée, une fois par type de match */
  const extras = {};
  for (const kind of new Set(todo.map(t => t.kind))) {
    const pre = kind === "series" ? season + "PLF" : season;
    let linesFile = pre + "Lines.html", lines = await get(linesFile);
    if (lines.status !== 200 && kind === "series") { linesFile = season + "Lines.html"; lines = await get(linesFile); }
    const today = await get(pre + "TodayGames.html");
    extras[kind] = {
      lines: lines.status === 200 ? { file: linesFile, lm: lines.lm, split: F.splitLines(lines.body) } : null,
      today: today.status === 200 ? F.parseTodayGames(today.body) : { date: null, files: [] }
    };
  }

  /* 4. Sommaires */
  const fetched = [];
  const wait = t => { const a = S.attente[t.id] || { n: 0, t: t.kind, r: t.round, g: t.g }; a.n++; a.g = t.g; S.attente[t.id] = a; };
  for (const t of todo) {
    // un sommaire déjà absent est d'abord vérifié sans télécharger la page d'erreur du site
    const r = S.attente[t.id] && S.attente[t.id].n > 0 && (await get(t.g.file, { head: true })).status === 404 ? { status: 404 } : await get(t.g.file);
    if (r.status === 404) { wait(t); report.manquants.push(t.id); continue; }
    if (!F.isFHL(r.body)) {
      if (ANTI_ROBOT.test(r.body)) throw blocked(base + t.g.file);
      report.erreurs.push(`${t.id} : ${t.g.file} n'est pas un sommaire FHL`); wait(t); continue;
    }
    const tm = F.summaryTeams(r.body);
    if (!tm || tm.away !== t.g.away || tm.home !== t.g.home) {
      report.erreurs.push(`${t.id} : le sommaire (${tm ? tm.away + " at " + tm.home : "sans en-tête"}) ne correspond pas au calendrier (${t.g.away} at ${t.g.home})`);
      wait(t);
      continue;
    }
    fetched.push({ t, body: r.body, lm: r.lm });
  }

  // Qualité des trios : exacts si la page des trios vient de la même publication que le sommaire
  // et que le match est de la dernière soirée de cette publication. Sinon, approximatifs.
  const time = s => (s ? Date.parse(s) : NaN);
  const close = (a, b) => !(Math.abs(time(a) - time(b)) > 36e5);   // à moins d'une heure (ou date inconnue)
  const order = t => t.round * 1000 + t.g.day;
  let engine = null;
  for (const { t, body, lm } of fetched) {
    const ex = extras[t.kind], L = ex.lines;
    const html = L ? F.linesFor(L.split, [t.g.away, t.g.home]) : null;
    const sameUpload = L && close(L.lm, lm);
    const isLast = fetched.every(f => f.t.kind !== t.kind || !close(f.lm, lm) || order(f.t) <= order(t));
    const quality = !html ? "aucun" : sameUpload && isLast ? "exact" : "approx";
    const date = ex.today.files.includes(t.g.file) ? ex.today.date : null;
    const rec = {
      id: t.id, saison: season, t: t.kind, r: t.round, j: t.g.day, no: t.g.no,
      v: t.g.away, l: t.g.home, pv: t.g.sa, pl: t.g.sh, x: t.g.extra, d: date,
      source: base + t.g.file, sourceModifie: lm, capture: now.toISOString(),
      trios: html ? { source: base + L.file, modifie: L.lm, asOf: L.split.asOf, qualite: quality, html } : null,
      sommaire: body
    };
    const old = known.get(t.id);
    const entry = { id: t.id, t: t.kind, r: t.round, j: t.g.day, no: t.g.no, v: t.g.away, l: t.g.home,
      pv: t.g.sa, pl: t.g.sh, x: t.g.extra, d: date || (old && old.d) || null, tr: quality, c: rec.capture, src: writeGame(o.root, rec) };
    // Le match est rejoué une fois avec le moteur du site : un problème est noté pour l'interface et le journal.
    engine = engine || M.charger(ROOT);
    const pb = M.verifier(engine, body, html, entry);
    if (pb) { entry.pb = pb; report.erreurs.push(`${t.id} : ${pb}`); } else delete entry.pb;
    if (old) { Object.assign(old, entry); report.remplaces.push(t.id); }
    else { S.matchs.push(entry); known.set(t.id, entry); report.nouveaux.push(t.id); }
    delete S.attente[t.id];
  }
  S.matchs.sort(cmp);

  /* 5. Écriture, seulement si quelque chose a changé */
  // Une publication en cours sans nouveau match n'est pas enregistrée : le passage suivant la lira en entier.
  const quiet = report.enCours && !report.nouveaux.length && !report.remplaces.length;
  const modified = !quiet && JSON.stringify(before) !== JSON.stringify(idx);
  if (modified) {
    idx.maj = now.toISOString();
    fs.mkdirSync(path.join(o.root, AUTO), { recursive: true });
    fs.writeFileSync(path.join(o.root, AUTO, "index.js"), serializeIndex(idx));
  }
  report.modifie = modified;
  report.saison = season;
  report.resume = resume(report, S);
  return report;
}

function resume(rep, S) {
  const n = rep.nouveaux.length, r = rep.remplaces.length;
  if (!n && !r) {
    if (rep.manquants.length) return `${rep.manquants.length} sommaire${rep.manquants.length > 1 ? "s" : ""} pas encore en ligne`;
    return rep.modifie ? "calendrier de la ligue mis à jour" : "aucun nouveau match";
  }
  // « saison, jours 12 à 14 » ou « séries, ronde 2, jour 3 »
  const touched = S.matchs.filter(m => rep.nouveaux.includes(m.id) || rep.remplaces.includes(m.id));
  const parts = [];
  for (const key of [...new Set(touched.map(m => m.t + "|" + m.r))]) {
    const [t, rd] = key.split("|");
    const days = [...new Set(touched.filter(m => m.t + "|" + m.r === key).map(m => m.j))].sort((a, b) => a - b);
    const span = days.length === 1 ? `jour ${days[0]}` : days[days.length - 1] - days[0] === days.length - 1 ? `jours ${days[0]} à ${days[days.length - 1]}` : `jours ${days.join(", ")}`;
    parts.push((t === "series" ? `séries, ronde ${rd}, ` : "") + span);
  }
  return [n ? `${n} nouveau${n > 1 ? "x" : ""} match${n > 1 ? "s" : ""}` : "", r ? `${r} remplacé${r > 1 ? "s" : ""}` : ""]
    .filter(Boolean).join(", ") + ` (${parts.join("; ")})`;
}

/* ---------- Ligne de commande ---------- */
if (require.main === module) {
  const args = process.argv.slice(2), opt = {};
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--base") opt.base = args[++i];
    else if (args[i] === "--saison") opt.saison = args[++i];
    else if (args[i] === "--racine") opt.root = path.resolve(args[++i]);
    else if (args[i] === "--saison-suivante") opt.saisonSuivante = true;
    else if (args[i] === "--reessayer") opt.reessayer = true;
    else if (args[i] === "--archive") { const v = (args[++i] || "").trim(); if (v) opt.archive = v; }
  }
  recuperer(opt).then(rep => {
    console.log(`Saison ${rep.saison} : ${rep.resume}.`);
    rep.erreurs.forEach(e => console.log("Avertissement : " + e));
    if (process.env.GITHUB_OUTPUT) fs.appendFileSync(process.env.GITHUB_OUTPUT,
      `nouveau=${rep.modifie ? "true" : "false"}\nresume=${rep.resume.replace(/\n/g, " ")}\n`);
    if (process.env.GITHUB_STEP_SUMMARY && (rep.nouveaux.length || rep.remplaces.length || rep.erreurs.length))
      fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, `### Saison ${rep.saison}\n\n${rep.resume}.\n\n` +
        [...rep.nouveaux, ...rep.remplaces].map(id => `- ${id}`).join("\n") + "\n" +
        rep.erreurs.map(e => `- ⚠️ ${e}`).join("\n") + "\n");
  }).catch(e => {
    if (e.antiRobot) {
      // Pas d'échec rouge aux 20 minutes : on le signale et le passage suivant réessaie.
      console.log(`::warning::${e.message}`);
      if (process.env.GITHUB_OUTPUT) fs.appendFileSync(process.env.GITHUB_OUTPUT, "nouveau=false\nbloque=true\n");
      return;
    }
    console.error("Échec de la récupération : " + e.message); process.exitCode = 1;
  });
}

module.exports = { recuperer, readIndex, serializeIndex };
