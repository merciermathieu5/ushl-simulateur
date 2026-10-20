"use strict";
// Trame de jeu sur les sept vrais matchs de la finale Y21 et les sommaires de test :
// tirs de chaque joueur, mises au jeu, hors-jeu, dégagements refusés et cohérence de la rondelle.
const test = require("node:test"), assert = require("node:assert");
const fs = require("fs"), path = require("path");
const { load, fixture } = require("./load");
const api = load();
const DIR = path.join(__dirname, "fixtures", "auto", "finale-y21");
const read = f => fs.readFileSync(path.join(DIR, f), "latin1");
const L = api.parseLines(read("USHL21PLFLines.html"));
const SNAP = api.parseLines(api.LINES_SNAPSHOT);
const games = [];
for (let i = 1; i <= 7; i++) { const raw = read(`USHL21PLF-R4-${i}.html`); games.push({ name: "finale " + i, G: api.buildGame(api.parseSummary(raw), L, raw), real: true }); }
for (const f of ["base.txt", "five-on-three.txt", "tie.txt", "double-ot.txt", "empty-net.txt"]) { const raw = fixture(f); games.push({ name: f, G: api.buildGame(api.parseSummary(raw), SNAP, raw) }); }
const SIDES = ["away", "home"];
const onIce = (G, side, p, t) => G.segAt(Math.min(t, G.T - 1e-3)).line[side].some(e => e.p === p);
const near = (a, b, tol) => Math.abs(a - b) <= (tol || 0.01);

test("chaque joueur a exactement ses tirs de la feuille de match, pris pendant ses présences", () => {
  for (const { name, G, real } of games) {
    if (real) SIDES.forEach(s => G.roster[s].forEach(p => {
      const n = G.shots.filter(x => x.p === p).length;
      assert.strictEqual(n, p.s, `${name} : ${p.name} ${n} tirs, ${p.s} sur la feuille`);
    }));
    G.shots.forEach(s => assert.ok(onIce(G, s.side, s.p, s.t - 0.01), `${name} : tireur sur la glace à ${s.t.toFixed(1)}`));
    // le tir part du bâton du tireur et arrive au filet au moment prévu
    G.shots.forEach(s => {
      const it = G.script.find(x => x.k === "shot" && near(x.t1, s.t, 0.06));
      assert.ok(it && it.p === s.p, `${name} : tir de ${s.p.name} à ${s.t.toFixed(1)}`);
    });
    assert.strictEqual(G.late.length, 0, `${name} : ${G.late.length} tir(s) en retard`);
  }
});

test("chaque but : les passes décisives dans l'ordre, puis le tir du marqueur dans le filet", () => {
  for (const { name, G } of games) G.goals.forEach(g => {
    const shot = G.script.find(x => x.k === "shot" && x.goal && near(x.t1, g.t, 0.06));
    assert.ok(shot && shot.p === g.scorer, `${name} : but de ${g.scorer.name}`);
    assert.ok(Math.abs(shot.x1) > 89 && Math.abs(shot.y1) < 3, `${name} : rondelle dans le filet`);
    const n = g.assists.length; if (!n) return;
    const passes = G.script.filter(x => x.k === "pass" && x.t1 <= shot.t0 + 1e-6 && x.t0 > g.t - 10).slice(-n);
    const want = n === 2 ? [[g.assists[1], g.assists[0]], [g.assists[0], g.scorer]] : [[g.assists[0], g.scorer]];
    assert.deepStrictEqual(JSON.parse(JSON.stringify(passes.map(x => [x.from.name, x.to.name]))), want.map(([a, b]) => [a.name, b.name]), `${name} : passes du but de ${fmtT(g.t)}`);
  });
});
const fmtT = t => `${Math.floor(t / 60)}:${String(Math.round(t % 60)).padStart(2, "0")}`;

test("mises au jeu : une cinquantaine par match, toujours sur un des neuf points", () => {
  const dots = [[0, 0], ...[-69, -20, 20, 69].flatMap(x => [[x, -22], [x, 22]])];
  for (const { name, G, real } of games) {
    const F = G.plays.filter(p => p.type === "face");
    if (real) assert.ok(F.length >= 35 && F.length <= 75, `${name} : ${F.length} mises au jeu`);
    F.forEach(f => assert.ok(dots.some(([x, y]) => near(f.x, x) && near(f.y, y)), `${name} : point (${f.x},${f.y})`));
    // début de chaque période et après chaque but (sauf en fin de période) : au centre
    for (let per = 1; per <= G.nPer; per++) {
      const f = F.find(x => near(x.t, (per - 1) * 1200, 0.05));
      assert.ok(f && f.x === 0 && f.y === 0, `${name} : mise au jeu au centre en début de période ${per}`);
    }
    G.goals.forEach(g => {
      if (g.t >= Math.min(g.per * 1200, G.T) - 0.05) return;
      const f = F.find(x => x.t >= g.t && x.t < g.t + 0.2);
      assert.ok(f && f.x === 0 && f.y === 0, `${name} : mise au jeu au centre après le but de ${fmtT(g.t)}`);
    });
  }
});

test("mises au jeu au bon endroit après chaque arrêt de jeu", () => {
  let n = { freeze: 0, penalty: 0, icing: 0, offside: 0, out: 0 };
  for (const { name, G } of games) G.stopsList.forEach(s => {
    if (!(s.cause in n)) return;
    n[s.cause]++;
    const d = G.attackDir(s.side, s.t);
    // zone de l'équipe : gardien qui immobilise, équipe pénalisée, équipe qui a dégagé illégalement
    if (s.cause === "freeze" || s.cause === "penalty" || s.cause === "icing") assert.ok(near(s.x, -d * 69) && Math.abs(s.y) === 22, `${name} : ${s.cause} à (${s.x},${s.y})`);
    // hors-jeu ou rondelle sortie par l'attaque : zone neutre, devant la zone offensive de l'équipe fautive
    else assert.ok(near(s.x, d * 20) && Math.abs(s.y) === 22, `${name} : ${s.cause} à (${s.x},${s.y})`);
    const f = G.plays.find(p => p.type === "face" && near(p.t, s.t, 0.2));
    assert.ok(f && near(f.x, s.x) && near(f.y, s.y), `${name} : mise au jeu suivant ${s.cause}`);
  });
  // chaque sorte d'arrêt se produit dans l'ensemble des matchs
  Object.entries(n).forEach(([k, v]) => assert.ok(v > 0, `aucun arrêt « ${k} »`));
});

test("alignement des mises au jeu : les deux centres au point, les autres hors du cercle", () => {
  for (const { name, G } of games) G.script.filter(x => x.k === "dead" && x.face).forEach(it => {
    const t = (it.t0 + it.t1) / 2, list = api.targetsAt(G, t).list.filter(o => o.role !== "G");
    const fx = it.face.x, fy = it.face.y;
    SIDES.forEach(side => {
      const mine = list.filter(o => o.side === side), c = mine.find(o => o.role === "C") || mine[0];
      assert.ok(Math.hypot(c.x - fx, c.y - fy) < 3.5, `${name} : centre au point à ${fmtT(t)}`);
      mine.filter(o => o !== c).forEach(o => assert.ok(Math.hypot(o.x - fx, o.y - fy) >= 14.5, `${name} : ${o.p.name} (${o.role}) à ${Math.hypot(o.x - fx, o.y - fy).toFixed(1)} pi du point, ${fmtT(t)}`));
    });
  });
});

test("hors-jeu : l'attaquant est en zone avant la rondelle; sinon personne ne la devance", () => {
  for (const { name, G } of games) {
    // chaque hors-jeu sifflé : un attaquant au-delà de la ligne bleue pendant que la rondelle est encore en zone neutre
    G.offsides.forEach(o => {
      const t = o.t1 - 0.25, tg = api.targetsAt(G, t), d = G.attackDir(o.side, t);
      const me = tg.list.find(x => x.p === o.p);
      assert.ok(me && d * me.x > 25 && d * tg.puck.x < 25, `${name} : hors-jeu de ${o.p.name} à ${fmtT(o.t1)}`);
    });
    // entrées en zone permises : juste avant que la rondelle portée franchisse la ligne bleue, aucun coéquipier n'est déjà en zone
    const T = G.rec.t;
    let n = 0;
    for (let k = 1; k < T.length; k++) {
      if (T[k] - T[k - 1] < 1e-9) continue;
      const it = G.itemAt(T[k - 1]), it2 = G.itemAt(T[k]);
      if (!it || it.k !== "carry" || !it2 || it2.k !== "carry" || it2.side !== it.side) continue;
      const d = G.attackDir(it.side, T[k - 1]), u0 = d * G.rec.px[k - 1], u1 = d * G.rec.px[k];
      if (!(u0 <= 25 && u1 > 25)) continue;
      if (G.offsides.some(o => Math.abs(o.t1 - T[k]) < 0.25)) continue;
      n++;
      api.targetsAt(G, T[k - 1]).list.filter(o => o.side === it.side && o.role !== "G" && o.p !== it.p).forEach(o =>
        assert.ok(d * o.x <= 25.01, `${name} : ${o.p.name} en zone avant la rondelle à ${fmtT(T[k])} (u=${(d * o.x).toFixed(1)})`));
    }
    assert.ok(n > 10, `${name} : ${n} entrées en zone avec la rondelle`);
  }
});

test("dégagement refusé : rondelle lancée de sa moitié de patinoire, jamais en désavantage numérique", () => {
  for (const { name, G } of games) G.stopsList.filter(s => s.cause === "icing").forEach(s => {
    const dump = [...G.script].reverse().find(it => it.k === "dump" && it.t1 <= s.t + 1e-6);
    const d = G.attackDir(s.side, s.t);
    assert.ok(dump && dump.side === s.side && d * dump.x0 < 0 && d * dump.x1 > 89, `${name} : dégagement de ${fmtT(s.t)}`);
    const st = G.stateAt(dump.t0);
    assert.ok(st[s.side].n >= st[s.side === "home" ? "away" : "home"].n, `${name} : dégagement refusé en désavantage numérique`);
  });
});

test("trame continue : porteur et receveur sur la glace, rien ne déborde de la période", () => {
  for (const { name, G } of games) {
    G.script.forEach((it, i) => {
      const per = Math.min(Math.floor(it.t0 / 1200) + 1, G.nPer), b = Math.min(per * 1200, G.T);
      assert.ok(it.t1 <= b + 1e-6, `${name} : ${it.k} au-delà de la fin de période`);
      if (i > 0) assert.ok(it.t0 >= G.script[i - 1].t1 - 0.011, `${name} : chevauchement à ${fmtT(it.t0)}`);
      if (it.k === "carry" && it.p) assert.ok(onIce(G, it.side, it.p, (it.t0 + it.t1) / 2), `${name} : porteur ${it.p.name} hors de la glace à ${fmtT(it.t0)}`);
      if (it.k === "pass" && it.to) assert.ok(onIce(G, it.side, it.to, it.t1), `${name} : receveur ${it.to.name} hors de la glace à ${fmtT(it.t1)}`);
    });
    // la rondelle ne saute jamais, sauf quand l'arbitre la replace pour une mise au jeu
    const dead = G.script.filter(x => x.k === "dead").map(x => x.t0);
    let jumps = 0;
    for (let t = 0; t < G.T - 0.1; t += 0.1) {
      const a = api.puckAt(G, t), b = api.puckAt(G, t + 0.1);
      if (Math.hypot(a.x - b.x, a.y - b.y) > 12 && !dead.some(d => d >= t - 0.05 && d <= t + 0.15)) jumps++;
    }
    assert.ok(jumps <= 12, `${name} : ${jumps} sauts de rondelle`);
    // à tout moment, chaque équipe a ses patineurs et son gardien (ou un attaquant de plus)
    for (let t = 3; t < G.T; t += 17.3) {
      const tg = api.targetsAt(G, t);
      SIDES.forEach(s => assert.strictEqual(tg.list.filter(o => o.side === s).length, G.segAt(t).line[s].length + 1, `${name} : effectif à ${fmtT(t)}`));
    }
  }
});

test("d'autres graines : chaque partie différente reste fidèle à la feuille de match", () => {
  // le même sommaire rejoué avec une autre graine donne un autre match : tirs à la seconde près, passes des buts,
  // porteurs et receveurs sur la glace, jamais un joueur attaquant et défenseur à la fois
  const cases = [["finale 1", read("USHL21PLF-R4-1.html"), L], ["finale 4", read("USHL21PLF-R4-4.html"), L], ["base.txt", fixture("base.txt"), SNAP]];
  for (const [name, raw, Ls] of cases) for (const v of [1, 2]) {
    const G = api.buildGame(api.parseSummary(raw), Ls, raw + "|graine" + v), tag = `${name} (graine ${v})`;
    assert.strictEqual(G.late.length, 0, `${tag} : tir en retard`);
    G.shots.forEach(s => {
      const it = G.script.find(x => x.k === "shot" && near(x.t1, s.t, 0.06));
      assert.ok(it && it.p === s.p && onIce(G, s.side, s.p, s.t - 0.01), `${tag} : tir de ${s.p.name} à ${fmtT(s.t)}`);
    });
    G.goals.forEach(g => {
      const shot = G.script.find(x => x.k === "shot" && x.goal && near(x.t1, g.t, 0.06)), n = g.assists.length;
      assert.ok(shot && shot.p === g.scorer, `${tag} : but de ${g.scorer.name}`);
      if (!n) return;
      const passes = G.script.filter(x => x.k === "pass" && x.t1 <= shot.t0 + 1e-6 && x.t0 > g.t - 10).slice(-n);
      const want = n === 2 ? [[g.assists[1], g.assists[0]], [g.assists[0], g.scorer]] : [[g.assists[0], g.scorer]];
      assert.deepStrictEqual(Array.from(passes, x => x.from.name + ">" + x.to.name), want.map(([a, b]) => a.name + ">" + b.name), `${tag} : passes du but de ${fmtT(g.t)}`);
    });
    G.script.forEach(it => {
      if (it.k === "carry" && it.p) assert.ok(onIce(G, it.side, it.p, (it.t0 + it.t1) / 2), `${tag} : porteur ${it.p.name} à ${fmtT(it.t0)}`);
      if (it.k === "pass" && it.to) assert.ok(onIce(G, it.side, it.to, it.t1), `${tag} : receveur ${it.to.name} à ${fmtT(it.t1)}`);
    });
    SIDES.forEach(s => G.plan[s].F.forEach(f => G.plan[s].D.forEach(d => {
      if (d.a < f.b - 1e-6 && d.b > f.a + 1e-6) assert.ok(!f.members.some(m => d.members.some(n => n.p === m.p)), `${tag} : joueur attaquant et défenseur à ${fmtT(f.a)}`);
    })));
  }
});

test("changements : attaquants et défenseurs chacun à leur moment, à la mise au jeu ou à la volée", () => {
  let both = 0, one = 0, atStop = 0, fly = 0;
  for (const { G, real } of games) {
    if (!real) continue;
    const stops = G.stopsList.map(s => s.t);
    for (let i = 1; i < G.segs.length; i++) {
      const a = G.segs[i - 1], b = G.segs[i];
      SIDES.forEach(s => {
        if (b.state[s].kind !== "ES" || a.state[s].kind !== "ES") return;
        const prev = new Set(a.line[s].map(e => e.p)), inn = b.line[s].filter(e => !prev.has(e.p));
        if (!inn.length) return;
        const f = inn.some(e => !["LD", "RD"].includes(e.role)), d = inn.some(e => ["LD", "RD"].includes(e.role));
        if (f && d) both++; else one++;
        if (stops.some(x => Math.abs(x - b.a) < 0.3)) atStop += inn.length; else fly += inn.length;
      });
    }
  }
  // les deux groupes ne changent pas d'un bloc, et la plupart des changements se font en plein jeu
  assert.ok(one > both * 2, `${one} changements d'un seul groupe, ${both} des deux à la fois`);
  assert.ok(fly > atStop && atStop > 0.15 * (fly + atStop), `${atStop} joueurs arrivés à un arrêt de jeu, ${fly} à la volée`);
});

test("mises en échec : toutes celles de la feuille, souvent contre la bande", () => {
  const boardD = (x, y) => { const ax = Math.abs(x), ay = Math.abs(y), cx = 72, cy = 14.5; if (ax > cx && ay > cy) return 28 - Math.hypot(ax - cx, ay - cy); return Math.min(100 - ax, 42.5 - ay); };
  let n = 0, wall = 0;
  for (const { name, G } of games) {
    const want = SIDES.reduce((a, s) => a + G.roster[s].reduce((b, p) => b + (p.ht || 0), 0), 0);
    assert.strictEqual(G.hits.length, want, `${name} : ${G.hits.length} mises en échec sur ${want}`);
    G.hits.forEach(h => { const v = api.targetsAt(G, h.t).list.find(o => o.p === h.victim); n++; if (v && boardD(v.x, v.y) < 10) wall++; });
  }
  assert.ok(wall / n > 0.3, `${(100 * wall / n).toFixed(0)} % des mises en échec contre la bande`);
});
