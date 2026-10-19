"use strict";

/* ---------- Liens de partage ---------- */
// Le lien porte le sommaire et seulement la partie des trios qui sert à ce match,
// compressés dans l'adresse (#m=...). Le match se rejoue à l'identique ailleurs.
function linesSubset(L,S){
  const out={teams:{},pos:{}};
  SIDES.forEach(s=>{
    if(L.teams[S[s]]) out.teams[S[s]]=L.teams[S[s]];
    S.players[s].forEach(p=>{const k=norm(p.name);if(L.pos[k]) out.pos[k]=L.pos[k]});
  });
  return out;
}
const canShare=()=>typeof CompressionStream!=="undefined";
function b64uEnc(bytes){let s="";for(const b of bytes)s+=String.fromCharCode(b);return btoa(s).replace(/\+/g,"-").replace(/\//g,"_").replace(/=+$/,"")}
function b64uDec(str){const s=atob(str.replace(/-/g,"+").replace(/_/g,"/"));return Uint8Array.from(s,c=>c.charCodeAt(0))}
async function packShare(raw,L){
  const data=new TextEncoder().encode(JSON.stringify({v:1,s:raw,l:L}));
  const cs=new Blob([data]).stream().pipeThrough(new CompressionStream("deflate-raw"));
  return b64uEnc(new Uint8Array(await new Response(cs).arrayBuffer()));
}
async function unpackShare(str){
  const ds=new Blob([b64uDec(str)]).stream().pipeThrough(new DecompressionStream("deflate-raw"));
  const o=JSON.parse(await new Response(ds).text());
  if(!o||o.v!==1||typeof o.s!=="string"||!o.l||!o.l.teams||!o.l.pos) throw new Error("lien invalide");
  return {raw:o.s,L:o.l};
}
