"use strict";
// Jeux étranges à éviter, mesurés sur les sept matchs de la finale Y21 :
// passe vers l'arrière en échappée, joueurs collés ensemble, patineur assis sur un gardien.
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
// tirs au but : distance au filet (pieds)
const shots = games.flatMap(G => G.shots);
const far = shots.filter(s => s.dist > 80).length, farGoals = shots.filter(s => s.goal && s.dist > 60).length;
const sum = k => all.reduce((a, m) => a + m[k], 0);
if (process.env.SHOW) console.log(JSON.stringify({ breakPass: sum("breakPass"), breakPassFree: sum("breakPassFree"), breakaways: sum("breakaways"), mates: sum("mates"), opps: sum("opps"), onGoalie: Math.round(sum("onGoalie")), shots: shots.length, far, farGoals }));

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
