#!/usr/bin/env node
"use strict";
/* Cote SP (vitesse) de chaque joueur de la ligue, pour le simulateur : data/vitesses.js.

   Source : le relevé quotidien des alignements PRO des 32 équipes fait par l'interface des Sharks
   (github.com/merciermathieu5/Sharks, fichier data/rosters.json), lui-même tiré de ushl.ca.

   Le simulateur prend d'abord la cote de la page des alignements récupérée avec chaque match (la plus à jour).
   Ce fichier sert quand elle manque : sommaire collé à la main, lien partagé, match d'exemple, joueur rappelé.

   Usage : node scripts/vitesses.js [chemin ou adresse du relevé]
   Sortie : code 0 (fichier écrit ou déjà à jour), 1 si le relevé est illisible ou incomplet (rien n'est écrit). */

const fs = require("fs"), path = require("path");

const SOURCE = "https://raw.githubusercontent.com/merciermathieu5/Sharks/main/data/rosters.json";
const SORTIE = path.join(__dirname, "..", "data", "vitesses.js");
const MIN_EQUIPES = 28, MIN_JOUEURS = 500;
// même normalisation des noms que le simulateur (js/util.js)
const norm = s => (s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toUpperCase().replace(/[^A-Z]/g, "");

/* Relevé des Sharks → { releve, equipes: { CODE: { NOM: SP } } }, noms et équipes triés (différences lisibles dans git). */
function cotes(releve) {
  const eq = releve && releve.equipes;
  if (!eq || typeof eq !== "object") throw new Error("relevé sans équipes");
  const equipes = {};
  let n = 0;
  for (const code of Object.keys(eq).sort()) {
    const t = {};
    for (const j of (eq[code] && eq[code].joueurs) || []) {
      const k = norm(j.nom);
      if (!k || !(j.sp > 0) || j.po === "G") continue;
      t[k] = j.sp; n++;
    }
    if (Object.keys(t).length) equipes[code] = Object.fromEntries(Object.entries(t).sort(([a], [b]) => a < b ? -1 : 1));
  }
  if (Object.keys(equipes).length < MIN_EQUIPES || n < MIN_JOUEURS) throw new Error(`relevé incomplet : ${Object.keys(equipes).length} équipes, ${n} patineurs`);
  const quand = releve.genere ? String(releve.genere).slice(0, 10) : null;
  return { releve: quand, equipes, n };
}

function fichier(c, source) {
  const lignes = Object.entries(c.equipes).map(([code, t]) => `  ${JSON.stringify(code)}: ${JSON.stringify(t)}`);
  return "/* Cote SP (vitesse) de chaque patineur de la ligue, par équipe. Fichier généré par scripts/vitesses.js : ne pas modifier.\n" +
    `   Source : ${source} (relevé du ${c.releve || "?"}).\n` +
    "   Sert quand le match n'apporte pas sa page des alignements (sommaire collé, lien partagé, match d'exemple). */\n" +
    `const VITESSES = {"releve": ${JSON.stringify(c.releve)}, "equipes": {\n${lignes.join(",\n")}\n}};\n`;
}

async function lire(src) {
  if (!/^https?:/i.test(src)) return fs.readFileSync(src, "utf8");
  const r = await fetch(src, { signal: AbortSignal.timeout(30000) });
  if (!r.ok) throw new Error(`${src} : HTTP ${r.status}`);
  return r.text();
}

async function main() {
  const src = process.argv[2] || SOURCE;
  const c = cotes(JSON.parse(await lire(src)));
  const txt = fichier(c, /^https?:/i.test(src) ? src : "github.com/merciermathieu5/Sharks, data/rosters.json");
  const avant = fs.existsSync(SORTIE) ? fs.readFileSync(SORTIE, "utf8") : "";
  // seules les cotes comptent : un relevé plus récent aux mêmes cotes ne réécrit pas le fichier
  const corps = s => s.replace(/^[\s\S]*?const VITESSES = \{"releve": [^,]*,/, "");
  if (avant && corps(avant) === corps(txt)) { console.log(`Cotes déjà à jour (${c.n} patineurs).`); return; }
  fs.writeFileSync(SORTIE, txt);
  console.log(`data/vitesses.js : ${c.n} patineurs de ${Object.keys(c.equipes).length} équipes (relevé du ${c.releve}).`);
}

if (require.main === module) main().catch(e => { console.error("Cotes de vitesse non mises à jour : " + e.message); process.exit(1); });
module.exports = { cotes, fichier, norm };
