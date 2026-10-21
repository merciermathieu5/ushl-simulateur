"use strict";
// Jeux étranges à éviter, mesurés sur les sept matchs de la finale Y21 :
// passe vers l'arrière en échappée, joueurs collés ensemble, patineur assis sur un gardien.
// Et ce qu'on veut voir : l'échappée finit par un tir, le patinage est fluide, la vitesse suit la cote SP.
const test = require("node:test"), assert = require("node:assert");
const fs = require("fs"), path = require("path");
const { load } = require("./load");
const api = load();
const DIR = path.join(__dirname, "fixtures", "auto", "finale-y21");
const read = f => fs.readFileSync(path.join(DIR, f), "latin1");
const L = api.parseLines(read("USHL21PLFLines.html"));
const games = [];
for (let i = 1; i <= 7; i++) { const raw = read(`USHL21PLF-R4-${i}.html`); games.push(api.buildGame(api.parseSummary(raw), L, raw)); }

// positions de chacun à chaque échantillon de l'enregistrement (sans les joueurs qui rentrent au banc)
function frames(G) {
  const T = G.rec.t, fr = Array.from({ length: T.length }, () => []);
  G.rec.stints.forEach(s => { for (let k = s.k0; k <= s.k1; k++) { if (s.off !== Infinity && T[k] >= s.off) continue; fr[k].push({ p: s.p, side: s.side, g: s.g, x: s.xs[k - s.k0], y: s.ys[k - s.k0] }) } });
  return fr;
}
const live = (G, t) => { const it = G.itemAt(t); return it && it.k !== "dead" && it.k !== "held" };
function measure(G) {
  const T = G.rec.t, N = T.length, fr = frames(G);
  const m = { breakPass: 0, breakPassFree: 0, breakaways: 0, mates: 0, opps: 0, onGoalie: 0 };
  // échappée : porteur au-delà de sa ligne bleue (ou presque), aucun adversaire à moins de 8 pi d'être plus près du filet
  const alone = (F, side, me, d) => { const dn = Math.hypot(d * 89 - me.x, me.y); return !F.some(o => !o.g && o.side !== side && Math.hypot(d * 89 - o.x, o.y) < dn + 8) };
  let on = false, st = 0, who = null;
  for (let k = 1; k < N; k++) {
    const it = G.itemAt(T[k]); let b = false;
    if (it && it.k === "carry") { const d = G.attackDir(it.side, T[k]), me = fr[k].find(o => o.p === it.p); if (me) { const pu = d * me.x; b = pu > -10 && pu < 84 && alone(fr[k], it.side, me, d) } }
    if (b && !on) { st = T[k]; who = it }
    if (!b && on && T[k] - st >= 1) {
      m.breakaways++;
      const nx = G.itemAt(T[k]);
      if (nx && nx.k === "pass" && nx.from === who.p) {
        const d = G.attackDir(who.side, T[k]), F = fr[k], a = F.find(o => o.p === nx.from), b2 = F.find(o => o.p === nx.to);
        if (a && b2 && Math.hypot(d * 89 - b2.x, b2.y) > Math.hypot(d * 89 - a.x, a.y) + 5) { m.breakPass++; if (!nx.seq && !nx.prot) m.breakPassFree++ }
      }
    }
    on = b;
  }
  // joueurs collés : coéquipiers à moins de 3 pi pendant 1 s, adversaires à moins de 2 pi pendant 1,5 s
  const run = new Map();
  for (let k = 1; k < N; k++) {
    const dt = T[k] - T[k - 1]; if (dt < 1e-9) continue;
    const Lk = fr[k], seen = new Set(), lv = live(G, T[k]);
    const Gs = Lk.filter(o => o.g);
    for (let i = 0; i < Lk.length; i++) {
      const a = Lk[i]; if (a.g) continue;
      if (lv && Gs.some(g => Math.hypot(g.x - a.x, g.y - a.y) < 2.5)) m.onGoalie += dt;
      for (let j = i + 1; j < Lk.length; j++) {
        const b = Lk[j]; if (b.g) continue;
        const mate = a.side === b.side, key = a.p.id + "|" + b.p.id;
        if (lv && Math.hypot(a.x - b.x, a.y - b.y) < (mate ? 3 : 2)) { seen.add(key); const r = run.get(key) || { t: 0, mate }; r.t += dt; run.set(key, r) }
      }
    }
    for (const [key, r] of run) if (!seen.has(key)) { if (r.t >= (r.mate ? 1 : 1.5)) m[r.mate ? "mates" : "opps"]++; run.delete(key) }
  }
  return m;
}
const all = games.map(measure);

// Échappée (comme le moteur la voit) : porteur entre la ligne rouge et la ligne des buts, pas au fond du coin, chaque
// patineur adverse à 8 pi derrière lui dans la course au filet, gardien devant son filet, pendant au moins une seconde.
// Ce qui suit : son tir (au but, à côté ou sur le poteau), une passe exigée par la feuille de match (séquence d'un tir
// prévu, ou passe qui prépare un but de la feuille), une autre passe, un coup de sifflet ou la rondelle perdue.
function breakEnds(G) {
  const T = G.rec.t, N = T.length, fr = frames(G), c = { tir: 0, feuille: 0, passe: 0, sifflet: 0, perdue: 0 };
  const alone = (F, side, me, d) => { const dn = Math.hypot(d * 89 - me.x, me.y); return !F.some(o => !o.g && o.side !== side && Math.hypot(d * 89 - o.x, o.y) < dn + 8) };
  let on = false, st = 0, who = null;
  for (let k = 1; k < N; k++) {
    const it = G.itemAt(T[k]); let b = false;
    if (it && it.k === "carry") {
      const d = G.attackDir(it.side, T[k]), me = fr[k].find(o => o.p === it.p);
      // (gardien adverse devant son filet : un filet désert n'est pas une échappée)
      if (me) { const pu = d * me.x, pw = Math.abs(me.y); b = pu > -10 && pu < 84 && !(pu > 70 && pw > 22) && alone(fr[k], it.side, me, d) && fr[k].some(o => o.g && o.side !== it.side) }
    }
    if (b && !on) { st = T[k]; who = it }
    if (!b && on && T[k] - st >= 1) {
      let r = "perdue";
      for (const x of G.script) {
        if (x.t0 < st - 1e-6) continue;
        if (x.t0 > T[k] + 6) break;
        if (x.k === "carry" && x.p === who.p) continue;
        if ((x.k === "shot" && x.p === who.p) || (x.k === "loose" && x.from === who.p && (x.kind === "miss" || x.kind === "block"))) r = "tir";
        // passe d'une séquence prévue, ou qui prépare un but de la feuille dans les secondes qui suivent
        else if (x.k === "pass" && x.from === who.p) r = x.seq || G.goals.some(g => g.side === who.side && g.t >= x.t0 && g.t - x.t0 < 12) ? "feuille" : "passe";
        else if (x.k === "dead") r = "sifflet";
        break;
      }
      c[r]++;
    }
    on = b;
  }
  return c;
}
// Patinage en jeu (pas pendant un arrêt de jeu) : vitesse de chaque patineur d'un échantillon à l'autre
function skating(G) {
  const T = G.rec.t, m = { n: 0, frozen: 0, stopGo: 0, rows: [] }, per = new Map();
  for (const s of G.rec.stints) {
    if (s.g) continue;
    const vs = []; let lst = per.get(s.p); if (!lst) per.set(s.p, lst = []);
    for (let k = s.k0 + 1; k <= s.k1; k++) {
      if (s.off !== Infinity && T[k] >= s.off) break;
      const dt = T[k] - T[k - 1]; if (dt < 0.05) continue;
      if (!live(G, T[k]) || !live(G, T[k - 1])) { vs.push(null); continue }
      const j = k - s.k0, v = Math.hypot(s.xs[j] - s.xs[j - 1], s.ys[j] - s.ys[j - 1]) / dt;
      if (v > 60) { vs.push(null); continue }
      vs.push(v); lst.push(v); m.n++; if (v < 1.5) m.frozen++;
    }
    // arrêt net puis départ : plus de 10 pi/s, presque arrêté (moins de 3) puis plus de 10 pi/s, en moins de deux secondes
    for (let j = 0; j < vs.length; j++) {
      if (vs[j] === null || vs[j] >= 3) continue;
      let b = false, a = false;
      for (let q = j - 1; q >= Math.max(0, j - 8); q--) { if (vs[q] === null) break; if (vs[q] > 10) { b = true; break } }
      for (let q = j + 1; q <= Math.min(vs.length - 1, j + 10); q++) { if (vs[q] === null) break; if (vs[q] > 10) { a = true; break } }
      if (a && b) { m.stopGo++; while (j + 1 < vs.length && vs[j + 1] !== null && vs[j + 1] < 3) j++ }
    }
  }
  // vitesse de pointe (97e centile) de chaque patineur qui a joué au moins 40 secondes
  per.forEach((v, p) => { if (v.length < 400 || !(p.sp > 0)) return; const q = [...v].sort((a, b) => a - b); m.rows.push({ sp: p.sp, top: q[Math.floor(0.97 * (q.length - 1))] }) });
  return m;
}
const ends = games.map(breakEnds), skate = games.map(skating);
// tirs au but : distance au filet (pieds)
const shots = games.flatMap(G => G.shots);
const far = shots.filter(s => s.dist > 80).length, farGoals = shots.filter(s => s.goal && s.dist > 60).length;
const sum = k => all.reduce((a, m) => a + m[k], 0);
const tot = (L, k) => L.reduce((a, m) => a + m[k], 0);
const rows = skate.flatMap(m => m.rows);
function corr(xs, ys) {
  const n = xs.length, mx = xs.reduce((a, b) => a + b, 0) / n, my = ys.reduce((a, b) => a + b, 0) / n;
  let sxy = 0, sxx = 0, syy = 0; for (let i = 0; i < n; i++) { sxy += (xs[i] - mx) * (ys[i] - my); sxx += (xs[i] - mx) ** 2; syy += (ys[i] - my) ** 2 }
  return sxy / Math.sqrt(sxx * syy);
}
const bySp = [...rows].sort((a, b) => a.sp - b.sp), fifth = Math.floor(bySp.length / 5), avgTop = L => L.reduce((a, r) => a + r.top, 0) / L.length;
const slow = avgTop(bySp.slice(0, fifth)), fast = avgTop(bySp.slice(-fifth));
if (process.env.SHOW) console.log(JSON.stringify({ breakPass: sum("breakPass"), breakPassFree: sum("breakPassFree"), breakaways: sum("breakaways"), mates: sum("mates"), opps: sum("opps"), onGoalie: Math.round(sum("onGoalie")), shots: shots.length, far, farGoals,
  fins: ["tir", "feuille", "passe", "sifflet", "perdue"].map(k => k + " " + tot(ends, k)).join(", "), figés: +(100 * tot(skate, "frozen") / tot(skate, "n")).toFixed(2), arrêtsDéparts: Math.round(tot(skate, "stopGo") / games.length),
  corrSP: +corr(rows.map(r => r.sp), rows.map(r => r.top)).toFixed(2), lents: +slow.toFixed(1), rapides: +fast.toFixed(1) }));

test("échappées rares, et jamais terminées par une passe vers l'arrière", () => {
  assert.ok(sum("breakaways") / games.length <= 12, `${(sum("breakaways") / games.length).toFixed(1)} échappées par match`);
  // de son propre chef, jamais; seulement, rarement, quand la feuille de match exige une passe vers le tireur ou le passeur
  assert.strictEqual(sum("breakPassFree"), 0, `${sum("breakPassFree")} échappées terminées par une passe vers l'arrière`);
  assert.ok(sum("breakPass") <= games.length, `${sum("breakPass")} échappées terminées par une passe exigée par la feuille`);
});

test("les joueurs ne restent pas collés les uns aux autres", () => {
  assert.ok(sum("mates") / games.length <= 15, `${(sum("mates") / games.length).toFixed(1)} fois par match, deux coéquipiers collés`);
  assert.ok(sum("opps") / games.length <= 35, `${(sum("opps") / games.length).toFixed(1)} fois par match, deux adversaires l'un sur l'autre`);
});

test("aucun patineur ne s'installe sur un gardien", () => {
  assert.ok(sum("onGoalie") / games.length <= 45, `${(sum("onGoalie") / games.length).toFixed(0)} s par match à moins de 2,5 pi d'un gardien`);
});

test("pas de tir au but de sa propre zone ni de but de loin sans raison", () => {
  assert.ok(far / shots.length <= 0.015, `${far} tirs au but de plus de 80 pi sur ${shots.length}`);
  assert.ok(farGoals <= 1, `${farGoals} buts de plus de 60 pi`);
});

test("échappée : le porteur fonce au filet et tire toujours (au but, à côté ou sur le poteau)", () => {
  const n = ["tir", "feuille", "passe", "sifflet", "perdue"].reduce((a, k) => a + tot(ends, k), 0);
  assert.ok(n >= 7, `${n} échappées seulement : la mesure ne voit plus les échappées`);
  assert.strictEqual(tot(ends, "passe"), 0, `${tot(ends, "passe")} échappées terminées par une passe que la feuille de match n'exigeait pas`);
  // le reste : passes décisives d'un but prévu, coup de sifflet, ou l'adversaire qui doit tirer bientôt reprend la rondelle
  assert.ok(tot(ends, "tir") >= 0.85 * n, `${tot(ends, "tir")} tirs sur ${n} échappées`);
});

test("patinage fluide : presque jamais figé, rarement arrêté net pour repartir", () => {
  // (moteur d'origine : 6 % du temps figé, environ 2 000 arrêts-départs par match)
  assert.ok(tot(skate, "frozen") / tot(skate, "n") <= 0.03, `${(100 * tot(skate, "frozen") / tot(skate, "n")).toFixed(1)} % du temps de jeu figé sur place`);
  assert.ok(tot(skate, "stopGo") / games.length <= 800, `${(tot(skate, "stopGo") / games.length).toFixed(0)} arrêts-départs par match`);
});

test("vitesse selon la cote SP : les plus rapides le sont vraiment sur la glace", () => {
  assert.ok(rows.length >= 150, `${rows.length} patineurs mesurés`);
  const c = corr(rows.map(r => r.sp), rows.map(r => r.top));
  assert.ok(c >= 0.75, `corrélation ${c.toFixed(2)} entre la cote SP et la vitesse de pointe`);
  assert.ok(fast - slow >= 2.5, `vitesse de pointe : ${slow.toFixed(1)} pi/s pour les plus lents (SP), ${fast.toFixed(1)} pour les plus rapides`);
});
