#!/usr/bin/env node
"use strict";
/* Récupération automatique des matchs simulés sur ushl.ca.

   Lancé aux 20 minutes en soirée par .github/workflows/matchs.yml, ou à la main :
       node scripts/recuperer.js

   1. Le calendrier de la ligue (USHL22Schedule.html, puis ceux des séries) est demandé avec
      « If-Modified-Since » : tant que la ligue ne publie rien, le serveur répond 304 et rien n'est téléchargé.
   2. Chaque match joué qui n'est pas encore dans data/auto/ est récupéré : son sommaire FHL et,
      pour ses deux équipes, la page des trios et celle des alignements (numéros) publiées avec la simulation.
   3. Chaque match est rejoué avec le moteur du site avant d'être annoncé.
   4. data/auto/index.js (la liste des matchs) et un fichier par match sont écrits pour l'interface.

   Rien n'est jamais effacé. Un match simulé de nouveau (pointage différent au calendrier) est remplacé.
   Un problème passager (sommaire absent, page de vérification anti-robot, erreur du serveur) met le match
   en attente : il est repris plus tard, sans perdre ce qui a déjà été récupéré. */

const fs = require("fs"), path = require("path");
const F = require("./fhl");
const M = require("./moteur");

const ROOT = path.join(__dirname, "..");
const AUTO = path.join("data", "auto");
const HOUR = 36e5;

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
  const e = new Error(`${url} : le site a servi une page de vérification anti-robot au lieu de la page FHL. Le prochain passage réessaiera.`);
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
// Nouvel essai d'un match en attente : 1 h, 2 h, 4 h... jusqu'à 24 h entre deux essais
const backoff = n => Math.min(24, Math.pow(2, Math.max(0, n - 1))) * HOUR;

async function recuperer(options) {
  const o = Object.assign({
    root: ROOT, fetch: globalThis.fetch, now: () => new Date(), log: console.log, pause: 250, timeout: 30000,
    saisonSuivante: null,
    // en-tête HTTP : ASCII seulement
    ua: "ushl-simulateur-bot/1.0 (+" + (process.env.GITHUB_REPOSITORY ? "https://github.com/" + process.env.GITHUB_REPOSITORY : "github actions") + ")"
  }, options);
  const cfg = JSON.parse(fs.readFileSync(path.join(o.root, AUTO, "config.json"), "utf8"));
  const essaisMax = cfg.essaisMax || 24;
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
    const url = base + file;
    const headers = { "User-Agent": o.ua, "Accept": "text/html,*/*;q=0.8" };
    if (ims) headers["If-Modified-Since"] = ims;
    const init = { method: head ? "HEAD" : "GET", headers, redirect: "follow" };
    // un serveur qui ne répond plus ne bloque pas tout le passage
    if (o.timeout && typeof AbortSignal !== "undefined" && AbortSignal.timeout) init.signal = AbortSignal.timeout(o.timeout);
    let r;
    try { r = await o.fetch(url, init); }
    catch (e) { const err = new Error(`${url} : ${e.name === "TimeoutError" || e.name === "AbortError" ? "aucune réponse après " + Math.round(o.timeout / 1000) + " s" : e.message}`); err.reseau = true; throw err; }
    await sleep(o.pause);
    if (r.status === 304) return { status: 304 };
    if (r.status === 404 || r.status === 410) return { status: 404 };
    // HEAD refusé par le serveur : on demande la page
    if (head && (r.status === 405 || r.status === 501)) return get(file, { ims });
    if (!r.ok) {
      // pare-feu (403, 429, 503...) : page de vérification plutôt qu'une vraie erreur
      const body = head ? "" : await r.text().catch(() => "");
      if (ANTI_ROBOT.test(body) || (head && (r.status === 403 || r.status === 429 || r.status === 503))) throw blocked(url);
      const err = new Error(`${url} : réponse HTTP ${r.status}`); err.http = r.status; throw err;
    }
    const res = { status: 200, lm: r.headers.get("last-modified") || null };
    if (!head) res.body = decode(new Uint8Array(await r.arrayBuffer()));
    return res;
  }
  // Fichier jamais vu ou absent : on vérifie d'abord qu'il existe, sans télécharger la page d'erreur du site.
  async function getIfChanged(file, rec) {
    if (!rec || !rec.lm) { const h = await get(file, { head: true }); if (h.status === 404) return h; }
    return get(file, { ims: rec && rec.lm });
  }

  /* 0. Passage à la saison suivante : vérifié trois fois par jour (passages de 8 h, 12 h et 16 h UTC) ou sur demande.
        On ne change de saison que si le nouveau calendrier est bien un calendrier FHL et que l'ancienne saison
        est finie (finale terminée) ou que la nouvelle a commencé : les séries en cours ne sont jamais abandonnées. */
  const daily = [8, 12, 16].includes(now.getUTCHours());
  if (!archive && (o.saisonSuivante === true || (o.saisonSuivante !== false && daily && cfg.saisonSuivanteAuto !== false))) {
    const nxt = F.nextSeason(season);
    if (nxt && (await get(nxt + "Schedule.html", { head: true })).status === 200) {
      const r = await get(nxt + "Schedule.html");
      const sch = r.status === 200 ? F.parseSchedule(r.body) : null;
      const old = idx.saisons[season] || { calendriers: {} };
      const finale = old.calendriers[`${season}PLF-Round4-Schedule.html`];
      const done = !!(finale && finale.joues > 0 && finale.restants === 0);
      if (sch && /Schedule/i.test(sch.title) && sch.games.length && (done || sch.played.length > 0 || !idx.saisons[season])) {
        o.log(`Nouvelle saison détectée sur le site : ${nxt}`);
        season = nxt;
      }
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
    if (!/Schedule/i.test(sch.title) || !sch.games.length) {
      // Ronde des séries jamais vue qui n'est pas un calendrier (page d'accueil servie pour une adresse inconnue) : absente.
      if (!rec.lm && kind === "series") { S.calendriers[file] = { absent: true }; return S.calendriers[file]; }
      throw new Error(`${base + file} ne ressemble pas à un calendrier FHL.`);
    }
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
  // Matchs en attente : ceux qui n'ont pas encore été tentés (plafond, blocage) sont repris tout de suite;
  // les autres après un délai qui double à chaque essai (1 h, 2 h, 4 h...), jusqu'à « essaisMax ».
  for (const [id, a] of Object.entries(S.attente)) {
    const due = a.n === 0 || o.reessayer || !a.d || now - Date.parse(a.d) >= backoff(a.n) - 5 * 60e3;
    if (!todo0.has(id) && a.n < essaisMax && due) todo0.set(id, { id, kind: a.t, round: a.r, g: a.g });
  }
  let todo = [...todo0.values()];
  todo.sort((a, b) => cmp({ t: a.kind, r: a.round, no: a.g.no }, { t: b.kind, r: b.round, no: b.g.no }));
  const max = cfg.maxParPassage || 150;
  // Reporté sans compter d'essai (plafond du passage, page bloquée) : repris dès le passage suivant
  const defer = list => list.forEach(t => { const a = S.attente[t.id]; if (!a) S.attente[t.id] = { n: 0, t: t.kind, r: t.round, g: t.g }; else delete a.d; });
  if (todo.length > max) {
    o.log(`${todo.length} matchs à récupérer, ${max} dans ce passage, la suite au prochain.`);
    defer(todo.slice(max));
    todo = todo.slice(0, max);
  }
  // Un essai raté : nouvel essai plus tard (le délai double à chaque fois)
  const wait = t => { const a = S.attente[t.id] || { n: 0, t: t.kind, r: t.round, g: t.g }; a.n++; a.g = t.g; a.d = now.toISOString(); S.attente[t.id] = a; };

  /* 3. Sommaires. Une page anti-robot arrête les téléchargements, mais ce qui est déjà là est gardé. */
  const fetched = [];
  for (let i = 0; i < todo.length; i++) {
    const t = todo[i];
    let r;
    try {
      // un sommaire déjà absent est d'abord vérifié sans télécharger la page d'erreur du site
      r = S.attente[t.id] && S.attente[t.id].n > 0 && (await get(t.g.file, { head: true })).status === 404 ? { status: 404 } : await get(t.g.file);
      if (r.status === 200 && !F.isFHL(r.body) && ANTI_ROBOT.test(r.body)) throw blocked(base + t.g.file);
    } catch (e) {
      if (e.antiRobot) { report.bloque = e.message; defer(todo.slice(i)); break; }
      report.erreurs.push(`${t.id} : ${e.message}`); wait(t); continue;
    }
    if (r.status === 404) { wait(t); report.manquants.push(t.id); continue; }
    if (!F.isFHL(r.body)) { report.erreurs.push(`${t.id} : ${t.g.file} n'est pas un sommaire FHL`); wait(t); continue; }
    const tm = F.summaryTeams(r.body);
    if (!tm || tm.away !== t.g.away || tm.home !== t.g.home) {
      report.erreurs.push(`${t.id} : le sommaire (${tm ? tm.away + " at " + tm.home : "sans en-tête"}) ne correspond pas au calendrier (${t.g.away} at ${t.g.home})`);
      wait(t);
      continue;
    }
    fetched.push({ t, body: r.body, lm: r.lm });
  }

  /* 4. Trios, alignements et date de la soirée : une fois par type de match, seulement s'il y a des sommaires */
  const extras = {};
  async function page(file, ok) {
    try {
      const r = await get(file);
      if (r.status !== 200) return { status: r.status };
      if (ANTI_ROBOT.test(r.body) && !ok(r.body)) throw blocked(base + file);
      return ok(r.body) ? r : { status: 404 };
    } catch (e) { if (e.antiRobot) throw e; report.erreurs.push(e.message); return { status: 500 }; }
  }
  for (const kind of new Set(fetched.map(f => f.t.kind))) {
    const pre = kind === "series" ? season + "PLF" : season;
    try {
      const hasTeams = b => F.splitLines(b).order.length > 0;
      let linesFile = pre + "Lines.html", lines = await page(linesFile, hasTeams);
      if (lines.status !== 200 && kind === "series") { linesFile = season + "Lines.html"; lines = await page(linesFile, hasTeams); }
      let rosFile = pre + "Rosters.html", ros = await page(rosFile, b => Object.keys(F.parseRosters(b)).length > 0);
      if (ros.status !== 200 && kind === "series") { rosFile = season + "Rosters.html"; ros = await page(rosFile, b => Object.keys(F.parseRosters(b)).length > 0); }
      const today = await page(pre + "TodayGames.html", b => /Games of/i.test(b) || /<A\s+HREF/i.test(b));
      extras[kind] = {
        lines: lines.status === 200 ? { file: linesFile, lm: lines.lm, split: F.splitLines(lines.body) } : null,
        linesMissing: lines.status !== 200,
        rosters: ros.status === 200 ? { file: rosFile, lm: ros.lm, parsed: F.parseRosters(ros.body) } : null,
        today: today.status === 200 ? F.parseTodayGames(today.body) : { date: null, files: [] }
      };
    } catch (e) {
      // page des trios bloquée : les matchs de ce type attendent le prochain passage, sans compter d'essai
      if (!e.antiRobot) throw e;
      report.bloque = e.message;
      defer(fetched.filter(f => f.t.kind === kind).map(f => f.t));
    }
  }

  /* 5. Chaque match est rejoué avec le moteur du site avant d'être annoncé */
  // Qualité des trios : exacts si la page des trios vient de la même publication que le sommaire
  // et que le match est de la dernière soirée simulée (page des résultats du jour). Sinon, approximatifs.
  const time = s => (s ? Date.parse(s) : NaN);
  const close = (a, b) => !(Math.abs(time(a) - time(b)) > HOUR);   // à moins d'une heure (ou date inconnue)
  let engine = null;
  for (const { t, body, lm } of fetched) {
    const ex = extras[t.kind];
    if (!ex) continue;                                     // mis en attente (page bloquée)
    const a = S.attente[t.id];
    // page des trios absente : on réessaie plus tard; au dernier essai, le match est gardé sans trios
    if (ex.linesMissing && (!a || a.n + 1 < essaisMax)) { wait(t); report.erreurs.push(`${t.id} : page des trios introuvable, nouvel essai plus tard`); continue; }
    const L = ex.lines;
    const html = L ? F.linesFor(L.split, [t.g.away, t.g.home]) : null;
    const lastNight = ex.today.files.includes(t.g.file);
    const quality = !html ? "aucun" : L && close(L.lm, lm) && lastNight ? "exact" : "approx";
    const date = lastNight ? ex.today.date : null;
    const R = ex.rosters, al = R ? F.rostersFor(R.parsed, [t.g.away, t.g.home]) : null;
    const rec = {
      id: t.id, saison: season, t: t.kind, r: t.round, j: t.g.day, no: t.g.no,
      v: t.g.away, l: t.g.home, pv: t.g.sa, pl: t.g.sh, x: t.g.extra, d: date,
      source: base + t.g.file, sourceModifie: lm, capture: now.toISOString(),
      trios: html ? { source: base + L.file, modifie: L.lm, asOf: L.split.asOf, qualite: quality, html } : null,
      alignement: al ? { source: base + R.file, modifie: R.lm, equipes: al } : null,
      sommaire: body
    };
    const old = known.get(t.id);
    const entry = { id: t.id, t: t.kind, r: t.round, j: t.g.day, no: t.g.no, v: t.g.away, l: t.g.home,
      pv: t.g.sa, pl: t.g.sh, x: t.g.extra, d: date || (old && old.d) || null, tr: quality, c: rec.capture, src: gamePath(season, t.id).split(path.sep).join("/") };
    engine = engine || M.charger(ROOT);
    const pb = M.verifier(engine, body, html, entry);
    // Un sommaire qui ne se rejoue pas (téléversement incomplet, calendrier mis à jour avant le sommaire)
    // est repris plus tard; après quelques essais, il est gardé et signalé « À vérifier ».
    if (pb && (!a || a.n + 1 < Math.min(essaisMax, cfg.essaisPointage || 3))) { wait(t); report.erreurs.push(`${t.id} : ${pb}, nouvel essai plus tard`); continue; }
    writeGame(o.root, rec);
    if (pb) { entry.pb = pb; report.erreurs.push(`${t.id} : ${pb}`); }
    if (old) { delete old.pb; Object.assign(old, entry); report.remplaces.push(t.id); }
    else { S.matchs.push(entry); known.set(t.id, entry); report.nouveaux.push(t.id); }
    delete S.attente[t.id];
  }
  S.matchs.sort(cmp);

  /* 6. Écriture, seulement si quelque chose a changé */
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
    if (rep.bloque) return "accès bloqué par le pare-feu du site, nouvel essai au prochain passage";
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
    .filter(Boolean).join(", ") + ` (${parts.join("; ")})` + (rep.bloque ? ", la suite au prochain passage" : "");
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
  const out = s => { if (process.env.GITHUB_OUTPUT) fs.appendFileSync(process.env.GITHUB_OUTPUT, s); };
  recuperer(opt).then(rep => {
    console.log(`Saison ${rep.saison} : ${rep.resume}.`);
    rep.erreurs.forEach(e => console.log("Avertissement : " + e));
    // page anti-robot : pas d'échec rouge aux 20 minutes, on le signale et le passage suivant reprend
    if (rep.bloque) console.log(`::warning::${rep.bloque}`);
    out(`nouveau=${rep.modifie ? "true" : "false"}\nresume=${rep.resume.replace(/\n/g, " ")}\n${rep.bloque ? "bloque=true\n" : ""}`);
    if (process.env.GITHUB_STEP_SUMMARY && (rep.nouveaux.length || rep.remplaces.length || rep.erreurs.length || rep.bloque))
      fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, `### Saison ${rep.saison}\n\n${rep.resume}.\n\n` +
        [...rep.nouveaux, ...rep.remplaces].map(id => `- ${id}`).join("\n") + "\n" +
        rep.erreurs.map(e => `- ⚠️ ${e}`).join("\n") + "\n");
  }).catch(e => {
    // site momentanément inaccessible (pare-feu, panne, délai dépassé) : avertissement, le passage suivant reprend
    if (e.antiRobot || e.reseau || e.http >= 500) {
      console.log(`::warning::${e.message}`);
      out("nouveau=false\nbloque=true\n");
      return;
    }
    console.error("Échec de la récupération : " + e.message); process.exitCode = 1;
  });
}

module.exports = { recuperer, readIndex, serializeIndex };
