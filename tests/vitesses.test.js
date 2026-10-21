"use strict";
// Cotes de vitesse (SP) : relevé de la ligue (data/vitesses.js, tiré du relevé des Sharks) et page des alignements du match.
const test = require("node:test"), assert = require("node:assert");
const fs = require("fs"), path = require("path");
const { load } = require("./load");
const F = require("../scripts/fhl");
const V = require("../scripts/vitesses");
const api = load();
const DIR = path.join(__dirname, "fixtures", "auto", "finale-y21");
const read = f => fs.readFileSync(path.join(DIR, f), "latin1");
const norm = s => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toUpperCase().replace(/[^A-Z]/g, "");

test("relevé des Sharks : cotes SP par équipe, gardiens exclus, relevé incomplet refusé", () => {
  const equipes = {};
  for (let i = 0; i < 30; i++) equipes["EQ" + String.fromCharCode(65 + i)] = { joueurs: Array.from({ length: 20 }, (_, j) => ({ nom: `Joueur ${String.fromCharCode(65 + i)}${String.fromCharCode(65 + j)}`, po: j === 0 ? "G" : "C", sp: 60 + j })) };
  const c = V.cotes({ genere: "2026-10-20T15:51:06.195Z", equipes });
  assert.strictEqual(c.releve, "2026-10-20");
  assert.strictEqual(c.n, 30 * 19);
  assert.ok(!("JOUEURAA" in c.equipes.EQA), "gardien exclu");
  assert.strictEqual(c.equipes.EQA.JOUEURAB, 61);
  assert.throws(() => V.cotes({ equipes: { EQA: equipes.EQA } }), /incomplet/);
  assert.throws(() => V.cotes({}), /sans équipes/);
  // le fichier produit se lit tel quel dans le simulateur
  const txt = V.fichier(c, "essai");
  assert.match(txt, /const VITESSES = \{"releve": "2026-10-20", "equipes": \{\n/);
  const ctx = {}; require("vm").runInNewContext(txt + ";globalThis.lu=VITESSES", ctx);
  assert.strictEqual(ctx.lu.equipes.EQB.JOUEURBC, 62);
});

test("vitesse d'un joueur : la page des alignements du match d'abord, sinon le relevé de la ligue", () => {
  const raw = read("USHL21PLF-R4-1.html"), S = api.parseSummary(raw);
  const find = (G, name) => G.roster.away.concat(G.roster.home).find(p => p.name === name);
  // sans page des alignements : le relevé de la ligue (équipe du match, sinon toute la ligue si le nom est unique)
  const G0 = api.buildGame(S, api.parseLines(read("USHL21PLFLines.html")), raw);
  assert.strictEqual(find(G0, "Nikita Kucherov").sp, 80);
  assert.strictEqual(find(G0, "Michael Bunting").sp, 85, "joueur échangé depuis : trouvé dans une autre équipe");
  assert.strictEqual(find(G0, "Alexander Ovechkin").sp, null, "joueur absent du relevé : cote inconnue");
  // avec la page des alignements publiée avec la simulation : ses cotes l'emportent
  const L = api.parseLines(read("USHL21PLFLines.html")), P = F.parseRosters(read("USHL21PLFRosters.html"));
  L.roster = {};
  Object.entries(F.rostersFor(P, Object.keys(P))).forEach(([team, rows]) => { const t = L.roster[team] = {}; rows.forEach(([num, name, pos, sp, st, pc, ex]) => { t[norm(name)] = { num, pos, sp, st, pc, ex } }) });
  const G1 = api.buildGame(S, L, raw);
  assert.strictEqual(find(G1, "Nikita Kucherov").sp, 84);
  assert.strictEqual(find(G1, "Alexander Ovechkin").sp, 66);
});
