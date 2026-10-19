"use strict";

/* ---------- Matchs récupérés automatiquement sur ushl.ca ----------
   data/auto/index.js (window.USHL_AUTO) liste les matchs déposés par scripts/recuperer.js.
   Chaque match est un petit script (data/auto/<saison>/<id>.js) chargé au besoin : la page
   fonctionne ainsi en ligne comme depuis le disque, sans serveur. */
if(typeof document!=="undefined") initAuto();

function initAuto(){
  const $=id=>document.getElementById(id);
  const box=$("autoBox"); if(!box) return;
  const cache={}, waiting={};
  window.USHL_AUTO_MATCH=rec=>{cache[rec.id]=rec;(waiting[rec.id]||[]).forEach(f=>f(rec));delete waiting[rec.id]};
  let idx=null, season=null, groups=[], gi=0;

  // L'index est chargé avec un paramètre unique pour toujours avoir la liste à jour (cache de GitHub Pages).
  loadScript("data/auto/index.js?t="+Date.now()).then(()=>{idx=window.USHL_AUTO||null;start()},()=>start());

  function loadScript(src){
    return new Promise((ok,ko)=>{const s=document.createElement("script");s.src=src;s.onload=ok;s.onerror=()=>ko(new Error(src));document.head.appendChild(s)});
  }
  function loadGame(m){
    if(cache[m.id]) return Promise.resolve(cache[m.id]);
    const p=new Promise(ok=>(waiting[m.id]=waiting[m.id]||[]).push(ok));
    return loadScript(m.src+"?v="+encodeURIComponent(m.c||"")).then(()=>p);
  }

  function start(){
    const S=idx&&idx.saisons&&idx.saisons[idx.saison];
    if(!S){openManual(true);return}
    box.hidden=false;
    const seasons=Object.keys(idx.saisons).filter(k=>idx.saisons[k].matchs.length||k===idx.saison).sort();
    const sp=$("autoSeason");
    sp.innerHTML=seasons.map(k=>`<option value="${k}">${esc(seasonLabel(k))}</option>`).join("");
    $("autoSeasonWrap").hidden=seasons.length<2;
    sp.onchange=()=>showSeason(sp.value,true);
    $("autoDay").onchange=e=>showGroup(+e.target.value);
    $("autoPrev").onclick=()=>showGroup(gi-1);
    $("autoNext").onclick=()=>showGroup(gi+1);
    $("autoNight").onclick=()=>playGroup(0);
    $("manualToggle").onclick=()=>openManual($("manualBox").hidden);
    // la saison en cours, ou la plus récente qui a des matchs tant que la saison en cours n'en a pas
    const withGames=seasons.filter(k=>idx.saisons[k].matchs.length);
    showSeason(idx.saisons[idx.saison].matchs.length||!withGames.length?idx.saison:withGames[withGames.length-1],false);
    if(idx.maj) $("autoMeta").textContent="Mis à jour automatiquement après chaque simulation. Dernière mise à jour : "+new Date(idx.maj).toLocaleString("fr-CA",{dateStyle:"long",timeStyle:"short"})+".";
    openFromHash(); window.addEventListener("hashchange",openFromHash);
  }

  function showSeason(k,user){
    season=k; $("autoSeason").value=k;
    const ms=idx.saisons[k].matchs;
    const by=new Map();
    ms.forEach(m=>{const key=(m.t==="series"?"S"+m.r+"-":"")+m.j;if(!by.has(key))by.set(key,{key,t:m.t,r:m.r,j:m.j,d:null,games:[]});const g=by.get(key);g.games.push(m);g.d=g.d||m.d});
    groups=[...by.values()];
    $("autoEmpty").hidden=groups.length>0; $("autoMain").hidden=!groups.length;
    openManual(!groups.length&&!user);
    if(!groups.length) return;
    $("autoDay").innerHTML=groups.map((x,i)=>`<option value="${i}">${esc(groupLabel(x))}</option>`).join("");
    showGroup(groups.length-1);
  }
  function showGroup(i){
    if(i<0||i>=groups.length) return;
    gi=i; const grp=groups[i];
    $("autoDay").value=String(i); $("autoPrev").disabled=i===0; $("autoNext").disabled=i===groups.length-1;
    $("autoNight").hidden=grp.games.length<2;
    $("autoNight").textContent="Rejouer les "+grp.games.length+" matchs de la soirée";
    const ul=$("autoCards");
    ul.innerHTML=grp.games.map((m,k)=>card(m,k)).join("");
    ul.querySelectorAll("button[data-k]").forEach(b=>b.onclick=()=>playGroup(+b.dataset.k));
  }
  function card(m,k){
    const a=teamInfo(m.v), h=teamInfo(m.l), ot=m.x?(m.x==="OT"?"Prol.":m.x):"";
    const row=(t,sc,win)=>`<span class="crow${win?" win":""}"><span class="chip" style="background:${luminance(t.c1)<0.03?t.c2:t.c1}"></span><span class="cname">${esc(t.name)}</span><span class="cscore">${sc}</span></span>`;
    const notes=[ot,m.tr==="approx"?"Trios approximatifs":m.tr==="aucun"?"Sans trios":"",m.pb?"À vérifier":""].filter(Boolean);
    const lab=`${a.name} ${m.pv}, ${h.name} ${m.pl}${m.x?", en prolongation":""}. Rejouer ce match.`;
    return `<li><button type="button" class="gcard" data-k="${k}" aria-label="${esc(lab)}">${row(a,m.pv,m.pv>m.pl)}${row(h,m.pl,m.pl>m.pv)}<span class="cfoot">${esc(notes.join(" · ")||"Final")}</span></button></li>`;
  }

  // Charge les matchs d'une soirée (pour passer de l'un à l'autre) et lance celui qui a été choisi.
  async function playGroup(k){
    const grp=groups[gi];
    try{
      const recs=await Promise.all(grp.games.map(loadGame));
      const list=recs.map((rec,i)=>{
        const m=grp.games[i];
        return {raw:rec.sommaire,S:parseSummary(rec.sommaire),L:parseLines(rec.trios?rec.trios.html:""),id:m.id,note:linesNote(rec,m)};
      });
      if(window.USHL_UI.jouer(list,k)) setHash("#match="+list[k].id);
    }catch(e){console.error(e);window.USHL_UI.erreur("Ce match n’a pas pu être chargé ("+e.message+").")}
  }
  // Adresse du match dans la barre d'adresse (impossible depuis le disque : on s'en passe alors).
  function setHash(h){if(location.hash===h)return;try{history.replaceState(null,"",h)}catch(e){}}
  function linesNote(rec,m){
    const t=rec.trios;
    if(!t) return "Trios introuvables pour ce match.";
    const asOf=t.asOf?" ("+frDate(t.asOf)+")":"";
    if(t.qualite==="exact") return "Trios publiés avec cette simulation"+asOf+"."+(m.pb?" Avertissement : "+m.pb+".":"");
    return "Trios approximatifs : seule une page publiée plus tard"+asOf+" était disponible."+(m.pb?" Avertissement : "+m.pb+".":"");
  }

  // Lien direct : #match=USHL22-123
  function openFromHash(){
    const h=decodeURIComponent(location.hash).match(/^#match=([\w.-]+)$/); if(!h) return;
    for(const k of Object.keys(idx.saisons)){
      const ms=idx.saisons[k].matchs; const m=ms.find(x=>x.id===h[1]); if(!m) continue;
      if(season!==k) showSeason(k,true);
      const i=groups.findIndex(g=>g.games.includes(m)); if(i<0) return;
      showGroup(i); playGroup(groups[i].games.indexOf(m)); return;
    }
    window.USHL_UI.erreur("Ce match n’est pas (ou plus) dans la liste des matchs récupérés.");
  }

  function openManual(open){
    $("manualBox").hidden=!open;
    $("manualToggle").setAttribute("aria-expanded",String(open));
    $("manualToggle").textContent=open?"Masquer le collage manuel":"Coller un sommaire à la main";
  }
  function seasonLabel(k){const m=k.match(/(\d+)$/);return m?"Saison Y"+m[1]:k}
  // « dimanche, juin 28 2026 » (format FHL) devient « dimanche 28 juin 2026 »
  const MOIS={jan:"janvier",fev:"février",mar:"mars",avr:"avril",mai:"mai",juin:"juin",juil:"juillet",aou:"août",sep:"septembre",oct:"octobre",nov:"novembre",dec:"décembre"};
  function frDate(s){
    const m=String(s).match(/^(\S+?),?\s+(\S+?)\.?\s+(\d{1,2}),?\s+(\d{4})$/); if(!m) return s;
    const k=m[2].normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase();
    const mois=MOIS[k]||MOIS[k.slice(0,4)]||MOIS[k.slice(0,3)];
    return mois?`${m[1]} ${+m[3]===1?"1er":+m[3]} ${mois} ${m[4]}`:s;
  }
  function groupLabel(x){
    const date=x.d?" · "+frDate(x.d):"";
    return (x.t==="series"?"Séries, ronde "+x.r+", jour "+x.j:"Jour "+x.j)+date;
  }
  function esc(s){return String(s).replace(/[&<>"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]))}
}
