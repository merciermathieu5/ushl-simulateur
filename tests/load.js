"use strict";
// Charge les scripts du site dans un contexte Node isolé, dans l'ordre de index.html.
const fs=require("fs"), path=require("path"), vm=require("vm");
const ROOT=path.join(__dirname,"..");
const FILES=["data/sample-summary.js","data/lines-snapshot.js","js/util.js","js/parser.js","js/game.js","js/share.js"];

function load(){
  const src=FILES.map(f=>fs.readFileSync(path.join(ROOT,f),"utf8").replace(/^"use strict";/,"")).join("\n");
  const names=["SAMPLE_SUMMARY","LINES_SNAPSHOT","LINES_SNAPSHOT_DATE","parseSummary","parseLines","buildGame","targetsAt","puckAt","htmlToText","linesDate","perName","perShort","splitGames","linesSubset","packShare","unpackShare"];
  const ctx={console,TextEncoder,Blob,Response,CompressionStream,DecompressionStream,btoa,atob};
  vm.createContext(ctx);
  vm.runInContext('"use strict";\n'+src+"\n;globalThis.__api={"+names.map(n=>`${n}:typeof ${n}!=="undefined"?${n}:undefined`).join(",")+"};",ctx);
  return ctx.__api;
}
function fixture(name){return fs.readFileSync(path.join(__dirname,"fixtures",name),"utf8")}

// Résumé sérialisable d'un match construit, pour comparer deux versions du moteur.
function digest(api,G){
  const samp=[];
  for(let t=0;t<=G.T;t+=7.3){const r=api.targetsAt(G,t);samp.push(r.list.map(o=>[o.p.id,o.role,+o.x.toFixed(4),+o.y.toFixed(4)]),[+r.puck.x.toFixed(4),+r.puck.y.toFixed(4)])}
  return JSON.stringify({T:G.T,kfs:G.kfs,shots:G.shots.map(s=>[s.t,s.side,s.p&&s.p.id]),
    segs:G.segs.map(s=>[s.a,s.b,s.line.away.map(e=>e.p.id+e.role),s.line.home.map(e=>e.p.id+e.role)]),
    events:G.events.map(e=>[e.t,e.type]),samp});
}
module.exports={load,fixture,digest,ROOT};
