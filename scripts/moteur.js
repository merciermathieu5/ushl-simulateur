"use strict";
/* Charge le moteur du site (js/util.js, js/parser.js, js/game.js, js/jeu.js) dans Node, comme le fait la page,
   pour vérifier qu'un sommaire récupéré se rejoue avant de l'annoncer dans l'interface. */
const fs = require("fs"), path = require("path"), vm = require("vm");
const FILES = ["data/vitesses.js", "js/util.js", "js/parser.js", "js/game.js", "js/jeu.js"];

function charger(root) {
  const src = FILES.filter(f => fs.existsSync(path.join(root, f))).map(f => fs.readFileSync(path.join(root, f), "utf8").replace(/^"use strict";/, "")).join("\n");
  const ctx = { console };
  vm.createContext(ctx);
  // Le tout dans une fonction, avec les objets globaux en variables locales : dans un contexte vm, chaque accès
  // à une variable globale est lent, ce qui ralentirait beaucoup la simulation du match.
  vm.runInContext('(function(){"use strict";const {Math,Infinity,NaN,Set,Map,Array,Object,Number,String,JSON,Float32Array,Float64Array,Error}=globalThis;\n' + src + "\n;globalThis.__m={parseSummary,parseLines,buildGame};})();", ctx);
  return ctx.__m;
}

/* Rejoue le match et compare le pointage à celui du calendrier. Renvoie null si tout concorde, sinon le problème. */
function verifier(m, sommaire, trios, attendu) {
  try {
    const S = m.parseSummary(sommaire);
    const G = m.buildGame(S, m.parseLines(trios || ""), sommaire);
    const sc = { away: 0, home: 0 };
    G.goals.forEach(g => sc[g.side]++);
    if (sc.away !== attendu.pv || sc.home !== attendu.pl) return `pointage rejoué ${sc.away}-${sc.home}, calendrier ${attendu.pv}-${attendu.pl}`;
    return null;
  } catch (e) {
    return "sommaire illisible : " + e.message;
  }
}
module.exports = { charger, verifier };
