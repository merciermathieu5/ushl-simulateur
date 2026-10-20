"use strict";
// Temps de glace et trios sur les sept vrais matchs de la finale Y21 (Montréal contre Nashville) :
// le temps de glace animé suit la colonne IT de la feuille de match, sans défaire les trios de la ligue.
const test = require("node:test"), assert = require("node:assert");
const fs = require("fs"), path = require("path");
const { load } = require("./load");
const api = load();
const DIR = path.join(__dirname, "fixtures", "auto", "finale-y21");
const read = f => fs.readFileSync(path.join(DIR, f), "latin1");
const L = api.parseLines(read("USHL21PLFLines.html"));
const key = names => names.map(n => n.toUpperCase().replace(/[^A-Z]/g, "")).sort().join("|");

test("temps de glace animé proche de la feuille de match, trios respectés", () => {
  let gap = 0, n = 0, in2 = 0, t5 = 0, intact = 0;
  for (let i = 1; i <= 7; i++) {
    const raw = read(`USHL21PLF-R4-${i}.html`);
    const S = api.parseSummary(raw), G = api.buildGame(S, L, raw);
    const toi = new Map();
    G.segs.forEach(sg => ["away", "home"].forEach(side => {
      const d = sg.b - sg.a;
      sg.line[side].forEach(e => toi.set(e.p, (toi.get(e.p) || 0) + d));
      if (sg.state.away.kind !== "ES" || sg.state.away.n !== 5 || sg.state.home.n !== 5 || sg.state[side].pulled) return;
      const fw = key(sg.line[side].filter(e => ["C", "LW", "RW"].includes(e.role)).map(e => e.p.name));
      t5 += d; if (L.teams[S[side]].es.some(r => key(r.slice(0, 3)) === fw)) intact += d;
    }));
    ["away", "home"].forEach(side => G.roster[side].forEach(p => {
      if (p.ghost || !(p.it > 0)) return;
      const x = Math.abs((toi.get(p) || 0) / 60 - p.it); gap += x; n++; if (x <= 2) in2++;
    }));
  }
  // moteur d'origine : 3,6 min d'écart moyen, 34 % des joueurs à 2 minutes près, trios intacts 86 % du 5 contre 5
  assert.ok(gap / n < 1.4, `écart moyen ${(gap / n).toFixed(2)} min`);
  assert.ok(in2 / n > 0.8, `${(100 * in2 / n).toFixed(0)} % des joueurs à 2 minutes près`);
  assert.ok(intact / t5 > 0.8, `trios intacts ${(100 * intact / t5).toFixed(0)} % du 5 contre 5`);
});

test("un but : la deuxième passe, puis la première, puis le marqueur ont la rondelle", () => {
  const raw = read("USHL21PLF-R4-7.html");
  const G = api.buildGame(api.parseSummary(raw), L, raw);
  const g = G.goals.find(x => x.assists.length === 2);
  assert.ok(g, "un but avec deux passes");
  // les deux dernières passes avant le but, puis le tir du marqueur qui entre dans le filet au moment du but
  const passes = G.script.filter(it => it.k === "pass" && it.t1 <= g.t && it.t0 > g.t - 8);
  const chain = passes.slice(-2).map(it => [it.from.name, it.to.name]);
  assert.deepStrictEqual(Array.from(chain, c => Array.from(c)), [[g.assists[1].name, g.assists[0].name], [g.assists[0].name, g.scorer.name]]);
  const shot = G.script.find(it => it.k === "shot" && it.goal && Math.abs(it.t1 - g.t) < 0.01);
  assert.ok(shot && shot.p === g.scorer, "tir du marqueur");
});
