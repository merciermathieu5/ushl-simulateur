"use strict";

/* ---------- Interface ---------- */
if(typeof document!=="undefined") initUI();

function initUI(){
  const $=id=>document.getElementById(id);
  const sumIn=$("sumIn"), linesIn=$("linesIn");
  const store={get(k){try{return localStorage.getItem(k)}catch(e){return null}},set(k,v){try{localStorage.setItem(k,v)}catch(e){}},del(k){try{localStorage.removeItem(k)}catch(e){}}};
  const snapText=htmlToText(LINES_SNAPSHOT).replace(/\n{3,}/g,"\n\n").trim();
  const useSnapshot=newer=>{linesIn.value=snapText;$("linesNote").textContent="(instantané du "+LINES_SNAPSHOT_DATE+(newer?", plus récent que votre dernière version":"")+")"};
  const savedLines=store.get("ushl-sim-lines"), savedSum=store.get("ushl-sim-summary");
  // Une version collée plus ancienne que l'instantané est remplacée par celui-ci.
  const savedDate=linesDate(savedLines), snapDate=linesDate(LINES_SNAPSHOT);
  if(savedLines!==null&&!(savedDate&&snapDate&&savedDate<snapDate)){linesIn.value=savedLines;$("linesNote").textContent="(dernière version collée)"}
  else useSnapshot(savedLines!==null);
  if(savedSum) sumIn.value=savedSum;
  $("example").onclick=()=>{sumIn.value=SAMPLE_SUMMARY;$("err").textContent=""};
  $("clearLines").onclick=()=>{linesIn.value="";$("linesNote").textContent="";linesIn.focus()};
  $("snapLines").onclick=()=>useSnapshot(false);
  $("go").onclick=start;
  const showSetup=()=>{playing=false;updatePlayIcon();$("game").hidden=true;$("setup").hidden=false;$("newGame").hidden=true;$("share").hidden=true;window.scrollTo(0,0)};
  // history.replaceState échoue sur une page ouverte depuis le disque (file://) : on s'en passe alors.
  $("newGame").onclick=()=>{showSetup();if(location.hash) try{history.replaceState(null,"",location.pathname+location.search)}catch(err){}};
  $("share").onclick=shareLink;
  $("gamePick").onchange=e=>{const x=games[+e.target.value];play(x,curL);if(x.id&&location.hash!=="#match="+x.id)try{history.replaceState(null,"","#match="+x.id)}catch(err){}};

  let G=null, g=0, games=[], skippedNote="", curRaw="", curL=null, curGame=null, hitFx=[], playing=false, speed=1, freezeUntil=0, lastNow=0, posMap=new Map(), lastFeedKey="", lastSecond=-1, toastUntil=0, bannerUntil=0, bannerSticky=false, litUntil={away:0,home:0};
  // arrêt de jeu en cours (les joueurs gagnent leur place pour la mise au jeu), trace de la rondelle, ligne ou point mis en évidence
  let freeze=null, trail=[], mark=null, feedAll=[], ppStarts=[];
  let feedMode=store.get("ushl-sim-feed")==="saillants"?"saillants":"tout";
  const renderer=createRenderer($("rink"));
  const reduceMotion=!!(window.matchMedia&&window.matchMedia("(prefers-reduced-motion: reduce)").matches);
  const draw=()=>renderer.draw({G,g,posMap,current,puck:puckView(performance.now()),trail,mark,freezeUntil,hitFx,showNames:$("showNames").checked});
  window.addEventListener("resize",()=>{if(G){renderer.resize();draw()}});
  if(window.matchMedia) window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change",()=>{renderer.readTheme();if(G)draw()});
  renderer.readTheme();

  function start(){
    $("err").textContent="";
    const raw=sumIn.value;
    if(!raw.trim()){$("err").textContent="Collez d’abord un sommaire de match, ou chargez l’exemple.";return}
    // un ou plusieurs matchs ; les morceaux illisibles sont écartés
    let firstErr=null;
    const chunks=splitGames(raw);
    const list=chunks.map(r=>{try{return {raw:r,S:parseSummary(r)}}catch(e){firstErr=firstErr||e;return null}}).filter(Boolean);
    if(!list.length){$("err").textContent=firstErr.message;return}
    const L=parseLines(linesIn.value);
    // l'instantané n'est pas enregistré : une mise à jour du dépôt sera ainsi visible
    if(linesIn.value.trim()===snapText) store.del("ushl-sim-lines"); else store.set("ushl-sim-lines",linesIn.value);
    store.set("ushl-sim-summary",raw);
    if(location.hash.startsWith("#match=")) try{history.replaceState(null,"",location.pathname+location.search)}catch(err){}
    setGames(list,chunks.length-list.length);
    play(list[0],L);
  }
  function setGames(list,skipped){
    games=list; skippedNote=skipped?` ${skipped} sommaire${skipped>1?"s":""} illisible${skipped>1?"s":""} ignoré${skipped>1?"s":""}.`:"";
    const sel=$("gamePick");
    sel.innerHTML=list.map((x,i)=>`<option value="${i}">${i+1}. ${esc2(teamInfo(x.S.away).name)} à ${esc2(teamInfo(x.S.home).name)}</option>`).join("");
    $("gameBar").hidden=list.length<2;
  }
  function play(game,L){
    // un match récupéré automatiquement porte les trios publiés avec sa simulation
    const lines=game.L||L;
    try{G=buildGame(game.S,lines,game.raw)}catch(e){console.error(e);$("err").textContent="Le match n’a pas pu être construit : "+e.message;return false}
    curRaw=game.raw; curL=game.L?curL:L; curGame=game; $("gamePick").value=String(games.indexOf(game));
    setupGame(); return true;
  }
  // Point d'entrée pour js/auto.js : une liste de matchs {raw, S, L, id, note} déjà prêts à jouer.
  window.USHL_UI={
    jouer(list,i){$("err").textContent="";const prev=games;setGames(list,0);const ok=play(list[i||0],curL||{teams:{},pos:{}});if(!ok)setGames(prev,0);return ok},
    erreur(msg){showSetup();$("err").textContent=msg},
    accueil(){showSetup()}
  };
  /* Partage */
  async function shareLink(){
    const auto=curGame&&curGame.id;
    if(!auto&&!canShare()){showToastText("Ce navigateur ne permet pas de créer un lien de partage.");return}
    const url=location.href.split("#")[0]+(auto?"#match="+curGame.id:"#m="+await packShare(curRaw,linesSubset(curL,G.S)));
    try{history.replaceState(null,"",url)}catch(err){}
    try{await navigator.clipboard.writeText(url);showToastText("Lien copié. Collez-le pour partager ce match.")}
    catch(e){window.prompt("Copiez ce lien :",url)}
  }
  async function openShared(){
    const m=location.hash.match(/^#m=([A-Za-z0-9_-]+)$/); if(!m) return;
    try{
      const {raw,L}=await unpackShare(m[1]);
      sumIn.value=raw; setGames([{raw,S:parseSummary(raw)}]); play(games[0],L);
    }catch(e){console.error(e);showSetup();$("err").textContent="Ce lien de partage est invalide ou incomplet."}
  }
  function setupGame(){
    $("setup").hidden=true;$("game").hidden=false;$("newGame").hidden=false;$("share").hidden=false;
    SIDES.forEach(s=>{
      const tm=G.team[s], cap=s==="away"?"Away":"Home";
      $("n"+cap).textContent=tm.name; $("c"+cap).style.background=luminance(tm.c1)<0.03?tm.c2:tm.c1;
    });
    const sc=$("scrub"); sc.max=Math.ceil(G.T); sc.value=0;
    const mk=$("marks"); mk.innerHTML="";
    const addMk=(t,cls,color,title)=>{const d=document.createElement("span");d.className="mk "+cls;d.style.left=(t/G.T*100)+"%";if(color)d.style.background=color;if(title)d.title=title;mk.appendChild(d)};
    for(let x=1200;x<G.T;x+=1200) addMk(x,"per");
    G.pens.forEach(p=>addMk(p.t,"pen"));
    G.goals.forEach(gg=>addMk(gg.t,"goal",dotColor(G,gg.side)));
    const d=SIDES.map(s=>{const q=G.diag[s];const nm=G.team[s].name;
      if(!q.hasTeam) return nm+" : trios introuvables, alignement bâti selon le temps de glace";
      return nm+" : "+q.fromLines+" joueur"+(q.fromLines>1?"s":"")+" sur "+q.total+" placés selon les trios, les autres selon le temps de glace";});
    const gaps=(G.shotGaps||[]).map(x=>`${G.team[x.side].abbr} : ${x.joueurs} tirs aux joueurs pour ${x.equipe} à l’équipe, l’écart suit le temps de glace`);
    $("diag").textContent=d.join(". ")+"."+(gaps.length?" Feuille incohérente ("+gaps.join("; ")+").":"")+skippedNote+(curGame&&curGame.note?" "+curGame.note:"");
    $("bsBody").innerHTML=boxScore();
    buildFeed();
    renderer.resize(); posMap=new Map(); lastFeedKey=""; lastSecond=-1; freezeUntil=0; freeze=null; trail=[]; mark=null; bannerSticky=false; hideBanner(); $("toast").hidden=true;
    seek(0); playing=false; updatePlayIcon();
  }

  /* Lecture */
  $("bPlay").onclick=togglePlay;
  $("bStart").onclick=()=>{seek(0)};
  $("bNext").onclick=()=>{const ev=G.events.find(e=>e.t>g+9);if(ev)seek(Math.max(0,ev.type==="goal"?ev.t-8:ev.t-3))};
  $("bPrev").onclick=()=>{const evs=G.events.filter(e=>(e.type==="goal"?e.t-8:e.t-3)<g-2);const ev=evs[evs.length-1];seek(ev?Math.max(0,ev.type==="goal"?ev.t-8:ev.t-3):0)};
  $("speed").onchange=e=>{speed=+e.target.value};
  $("showNames").onchange=()=>draw();
  $("scrub").addEventListener("input",e=>seek(+e.target.value));
  const setFeedMode=m=>{feedMode=m;store.set("ushl-sim-feed",m);$("fAll").setAttribute("aria-pressed",String(m==="tout"));$("fMajor").setAttribute("aria-pressed",String(m!=="tout"));lastFeedKey="";if(G)updateUI(true)};
  $("fAll").onclick=()=>setFeedMode("tout"); $("fMajor").onclick=()=>setFeedMode("saillants");
  setFeedMode(feedMode);
  document.addEventListener("keydown",e=>{
    if($("game").hidden||/TEXTAREA|SELECT|INPUT/.test(e.target.tagName)&&e.target.type!=="range"&&e.target.type!=="checkbox") return;
    if(e.code==="Space"){e.preventDefault();togglePlay()}
    else if(e.key==="ArrowRight"&&e.target.type!=="range"){seek(Math.min(G.T,g+15))}
    else if(e.key==="ArrowLeft"&&e.target.type!=="range"){seek(Math.max(0,g-15))}
  });
  function togglePlay(){if(!G)return;if(g>=G.T-0.01){seek(0)}playing=!playing;freezeUntil=0;freeze=null;mark=null;if(playing&&!bannerSticky)hideBanner();updatePlayIcon()}
  function updatePlayIcon(){$("playIcon").innerHTML=playing?'<path d="M6 4h4v16H6zM14 4h4v16h-4z"/>':'<path d="M7 4v16l13-8z"/>';$("bPlay").setAttribute("aria-label",playing?"Pause":"Lecture")}
  function seek(t){g=clamp(t,0,G.T);hitFx=[];freezeUntil=0;freeze=null;mark=null;trail=[];litUntil={away:0,home:0};bannerSticky=false;hideBanner();$("toast").hidden=true;posMap=new Map();stepPositions(1e9,0);if(g>=G.T-0.01)showFinal();updateUI(true);draw()}

  function frame(now){
    const dtR=lastNow?Math.min(0.1,(now-lastNow)/1000):0; lastNow=now;
    if(G&&!$("game").hidden){
      if(playing&&now>=freezeUntil){
        if(freeze){freeze=null;mark=null}               // fin de l'arrêt : la rondelle tombe
        let ng=g+dtR*speed;
        const crossed=G.stops.filter(s=>s.t>g&&s.t<=ng);
        const hard=crossed.find(s=>!SOFT.has(s.type));
        crossed.filter(s=>SOFT.has(s.type)&&(!hard||s.t<=hard.t)).forEach(s=>showToast(s));
        if(hard) ng=hard.t;
        if(ng>=G.T){ng=G.T;playing=false;updatePlayIcon();showFinal()}
        if(!reduceMotion) G.hits.forEach(h=>{if(h.t>g&&h.t<=ng)hitFx.push({h,until:now+700})});
        const dtG=ng-g; g=ng;
        stepPositions(dtG,dtR);
        // l'arrêt commence une fois les joueurs rendus à l'endroit du coup de sifflet
        if(hard&&g<G.T) triggerStop(hard,now);
      } else stepPositions(0,dtR);
      pushTrail();
      if(now>bannerUntil&&!bannerSticky) hideBanner();
      if(now>toastUntil) $("toast").hidden=true;
      if(hitFx.length) hitFx=hitFx.filter(f=>f.until>now);
      SIDES.forEach(s=>{const el=$(s==="away"?"scAway":"scHome");el.classList.toggle("lit",now<litUntil[s])});
      updateUI(false); draw();
    }
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
  openShared(); window.addEventListener("hashchange",openShared);

  // Durée d'un arrêt de jeu (temps réel) : un peu plus court en lecture rapide
  const whistleMs=()=>reduceMotion?600:speed>=10?1000:1300;
  function startFreeze(now,ms,delay){
    freezeUntil=now+ms;
    const tg=targetsAt(G,g), it=tg.item;
    freeze={start:now,dur:ms,delay:delay||0,from:new Map([...posMap].map(([id,c])=>[id,{x:c.x,y:c.y}])),
      px:tg.puck.x,py:tg.puck.y,dot:it&&it.k==="dead"&&it.face?it.face:null};
  }
  function triggerStop(s,now){
    // les trios qui changent pendant l'arrêt sont déjà là : on se place à la fin de l'arrêt, juste avant la mise au jeu
    const it=G.itemAt(g); if(it&&it.k==="dead") g=Math.max(g,it.t1-1e-4);
    if(s.type==="goal"){
      startFreeze(now,2800,1100); bannerUntil=now+2800; litUntil[s.g.side]=now+2800;
      const gg=s.g; const tm=G.team[gg.side];
      const ast=gg.assists.length?"Aides : "+gg.assists.map(p=>p.name).join(", "):"Sans aide";
      const tags=[]; if(gg.ppGoal||/PP/.test(gg.tag))tags.push("en avantage numérique"); if(/SH/.test(gg.tag))tags.push("en désavantage numérique"); if(/EN/.test(gg.tag))tags.push("dans un filet désert");
      const after=scoreAt(gg.t+0.001);
      announce(`But ${tm.name}, ${gg.scorer?gg.scorer.name:""}. ${ast}. ${G.team.away.name} ${after.away}, ${G.team.home.name} ${after.home}.`);
      const how=gg.shot&&gg.shot.kind?`<div class="small">${esc2(cap(SHOT_FR[gg.shot.kind]||"tir"))}, ${gg.shot.dist} pi</div>`:"";
      showBanner(`<div class="big goal">But ${esc2(tm.abbr)} !</div><div class="mid">${esc2(gg.scorer?gg.scorer.name:"")}</div><div class="small">${esc2(ast)}</div>${how}<div class="small">${perShort(gg.per,G.nPer)} ${gg.per>=4?"":"période "}à ${fmt(gg.sec)}${tags.length?", "+tags.join(", "):""}</div>`);
    } else if(s.type==="end"){
      startFreeze(now,1700,500); bannerUntil=now+1700;
      const sc=scoreAt(s.t+0.001);
      announce(`Fin de la ${perName(s.per,G.nPer)}. ${G.team.away.name} ${sc.away}, ${G.team.home.name} ${sc.home}.`);
      showBanner(`<div class="big">Fin de la ${perName(s.per,G.nPer)}</div><div class="small">${esc2(G.team.away.abbr)} ${sc.away}, ${esc2(G.team.home.abbr)} ${sc.home}</div>`);
    } else if(s.type==="whistle"){
      // coup de sifflet : les joueurs gagnent leur place, la rondelle va au point de mise au jeu
      // la situation reste visible un instant (ligne en cause, joueur hors-jeu), puis chacun gagne sa place
      const ms=whistleMs(); startFreeze(now,ms,ms*0.35);
      const d=s.side?G.attackDir(s.side,s.t):1;
      mark={kind:s.cause,dot:{x:s.x,y:s.y},line:s.cause==="offside"?d*25:s.cause==="icing"?d*89:undefined};
      const txt=whistleText(s);
      if(txt) showToastText(txt);
    }
  }
  // Où se fait la mise au jeu, en clair
  function faceWhere(x,y,t){
    if(x===0&&y===0) return "au centre";
    if(Math.abs(x)<25) return "en zone neutre";
    const s=SIDES.find(sd=>G.attackDir(sd,t)*x<0);
    return "dans la zone de "+G.team[s].abbr;
  }
  function whistleText(s){
    const where=faceWhere(s.x,s.y,s.t), ab=s.side?G.team[s.side].abbr:"";
    if(s.cause==="freeze") return `Arrêt de ${s.g?s.g.name:"gardien"}. Mise au jeu ${where}`;
    if(s.cause==="icing") return `Dégagement refusé, ${ab}. Mise au jeu ${where}`;
    if(s.cause==="offside") return `Hors-jeu, ${ab}. Mise au jeu ${where}`;
    if(s.cause==="out") return `Rondelle hors de la patinoire. Mise au jeu ${where}`;
    if(s.pens&&s.pens.length) return s.pens.map(penText).join(" · ")+`. Mise au jeu ${where}`;
    return null;
  }
  // Événements qui n'arrêtent pas la lecture : un bandeau en bas de la patinoire
  const SOFT=new Set(["pen","pull","goalie"]);
  const penText=p=>"Pénalité : "+(p.who||(p.p?p.p.name:""))+" ("+G.team[p.side].abbr+"), "+p.inf.toLowerCase()+", "+p.label;
  function softText(s){
    if(s.type==="pen") return penText(s.p);
    if(s.type==="pull") return "Filet désert : "+G.team[s.side].abbr+" retire son gardien";
    return "Changement de gardien "+G.team[s.side].abbr+" : "+s.in.name+" remplace "+s.out.name;
  }
  function showToast(s){showToastText(softText(s))}
  function showToastText(text){const el=$("toast");el.textContent=text;el.hidden=false;toastUntil=performance.now()+2600;announce(text)}
  // annonces pour les lecteurs d'écran
  function announce(text){$("live").textContent=text}
  function showBanner(html){const b=$("banner");b.innerHTML=html;b.hidden=false}
  function hideBanner(){$("banner").hidden=true}
  function showFinal(){
    const sc=scoreAt(G.T+1); const ot=G.T>3600;
    announce(`Final${ot?" en prolongation":""} : ${G.team.away.name} ${sc.away}, ${G.team.home.name} ${sc.home}${sc.away===sc.home?", match nul":""}.`);
    const stars=G.S.stars.slice(0,3).map(s=>`<li>${"★".repeat(4-s.n)} ${esc2(s.name)} (${esc2(s.abbr)})</li>`).join("");
    showBanner(`<div class="big">Final${ot?" ("+finalOT()+")":""}</div><div class="mid">${esc2(G.team.away.name)} ${sc.away}, ${esc2(G.team.home.name)} ${sc.home}</div>${sc.away===sc.home?`<div class="small">Match nul</div>`:""}${stars?`<ul class="stars">${stars}</ul>`:""}${G.S.attendance?`<div class="small">Assistance : ${esc2(G.S.attendance)}</div>`:""}`);
    bannerSticky=true;
  }
  /* Feuille de match */
  const DEC_FR={W:"victoire",L:"défaite",T:"match nul",O:"défaite en prolongation"};
  function boxScore(){
    const pers=[1,2,3].concat(G.hasOT?[4]:[]);
    const head=`<tr><th></th>${pers.map(p=>`<th>${p<4?p:"Prol."}</th>`).join("")}<th>T</th></tr>`;
    const byPer=(list,side)=>{const n=pers.map(p=>list.filter(x=>x.side===side&&Math.min(4,x.per||(x.goal&&x.goal.per)||Math.floor(x.t/1200)+1)===p).length);
      return n.map(v=>`<td>${v}</td>`).join("")+`<td class="tot">${n.reduce((a,b)=>a+b,0)}</td>`};
    const tbl=(title,list)=>`<h4>${title}</h4><div class="tw"><table>${head}${SIDES.map(s=>`<tr><td>${esc2(G.team[s].name)}</td>${byPer(list,s)}</tr>`).join("")}</table></div>`;
    const pp=SIDES.map(s=>{const v=G.S.pp[G.S[s]];return v?`${esc2(G.team[s].abbr)} : ${v.g} en ${v.n}`:null}).filter(Boolean);
    const goalies=G.S.goalies.map(q=>{const pct=q.shots?(q.saves/q.shots*100).toFixed(1).replace(".",","):"";
      return `<tr><td>${esc2(q.name)} (${esc2(q.abbr)})</td><td>${q.saves}</td><td>${q.shots}</td><td>${pct?pct+" %":""}</td><td>${DEC_FR[q.dec]||""}</td></tr>`}).join("");
    const pm=v=>v>0?"+"+v:String(v);
    const players=SIDES.map(s=>{
      const rows=G.roster[s].filter(p=>!p.ghost&&(p.it>0||p.p||p.pim||p.s)).map(p=>`<tr><td>${p.num!=null?`<span class="bnum">${esc2(String(p.num))}</span>`:""}${esc2(p.name)}</td><td>${p.g}</td><td>${p.a}</td><td>${p.p}</td><td>${pm(p.pm)}</td><td>${p.pim}</td><td>${p.s}</td><td>${p.ht}</td><td>${p.it}</td></tr>`).join("");
      return `<div><h4><span class="dot" style="background:${dotColor(G,s)}"></span>${esc2(G.team[s].name)}</h4><div class="tw"><table><tr><th>Joueur</th><th>B</th><th>A</th><th>PTS</th><th>+/-</th><th>PUN</th><th>T</th><th>MÉ</th><th>TG</th></tr>${rows}</table></div></div>`;
    }).join("");
    return `<div class="bsgrid"><div>${tbl("Buts",G.goals)}</div><div>${tbl("Tirs",G.shots)}</div></div>`
      +(pp.length?`<h4>Avantages numériques</h4><p>${pp.join(", ")}</p>`:"")
      +(goalies?`<h4>Gardiens</h4><div class="tw"><table><tr><th>Gardien</th><th>Arrêts</th><th>Tirs</th><th>%</th><th>Décision</th></tr>${goalies}</table></div>`:"")
      +`<div class="bsgrid">${players}</div>`
      +`<p class="legend">B : buts, A : aides, PTS : points, PUN : minutes de pénalité, T : tirs, MÉ : mises en échec, TG : temps de glace (min).</p>`;
  }
  function finalOT(){return G.nPer>4?perShort(G.nPer,G.nPer):"prol."}
  function esc2(s){return String(s).replace(/[&<>"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]))}
  const cap=s=>s.charAt(0).toUpperCase()+s.slice(1);
  function scoreAt(t){const o={away:0,home:0};G.goals.forEach(x=>{if(x.t<=t)o[x.side]++});return o}

  /* Positions des joueurs à l'écran */
  const ease=k=>k*k*(3-2*k);
  // porte du banc : les joueurs entrent et sortent par là
  const door=side=>({x:BENCH[side].x,y:-43});
  function stepPositions(dtG,dtR){
    const tg=targetsAt(G,g), now=performance.now();
    const fz=freeze&&now<freezeUntil?freeze:null;
    const snap=dtG>5||(posMap.size===0&&!fz);
    const seen=new Set();
    tg.list.forEach(o=>{
      const id=o.p.id; seen.add(id); let cur=posMap.get(id);
      if(!cur){const b=snap?{x:o.x,y:o.y}:door(o.side);cur={x:b.x,y:b.y,alpha:1};posMap.set(id,cur);if(fz)fz.from.set(id,{x:b.x,y:b.y})}
      cur.leaving=false; cur.alpha=1;
      if(snap){cur.x=o.x;cur.y=o.y}
      else if(fz){
        // arrêt de jeu : chacun gagne sa place pour la mise au jeu pendant l'arrêt
        const f=fz.from.get(id)||{x:cur.x,y:cur.y};
        const k=ease(clamp((now-fz.start-fz.delay)/Math.max(1,fz.dur*0.85-fz.delay),0,1));
        cur.x=lerp(f.x,o.x,k); cur.y=lerp(f.y,o.y,k);
      } else if(dtG>0){
        // vitesse d'un patineur (un peu plus pour qui chasse la rondelle); le porteur reste collé à la rondelle
        const dx=o.x-cur.x, dy=o.y-cur.y, d=Math.hypot(dx,dy);
        if(o.carrier&&d<8){cur.x=o.x;cur.y=o.y}
        else{
          const kk=1-Math.exp(-dtG*4.5), vmax=(o.role==="G"?20:31)*dtG*(o.carrier||o.receiver?1.35:1);
          let mx=dx*kk, my=dy*kk; const m=Math.hypot(mx,my); if(m>vmax){mx*=vmax/m;my*=vmax/m}
          cur.x+=mx; cur.y+=my;
        }
      }
      cur.o=o;
    });
    // joueurs qui sortent de la glace : ils patinent jusqu'à la porte de leur banc et s'effacent
    for(const [id,cur] of [...posMap]){
      if(seen.has(id)) continue;
      if(snap||!cur.o){posMap.delete(id);continue}
      if(!cur.leaving){cur.leaving=true;cur.o={...cur.o,carrier:false,receiver:false,offside:false}}
      const dr=door(cur.o.side), dx=dr.x-cur.x, dy=dr.y-cur.y, d=Math.hypot(dx,dy);
      const step=Math.max(31*dtG,45*dtR);
      if(d<=step||d<2){posMap.delete(id);continue}
      cur.x+=dx/d*step; cur.y+=dy/d*step; cur.alpha=clamp(d/18,0.2,1);
    }
    current=tg;
  }
  let current=null;
  // Rondelle affichée : pendant un arrêt, l'officiel la porte au point de mise au jeu
  function puckView(now){
    if(!current) return null;
    if(freeze&&now<freezeUntil&&freeze.dot){
      const k=ease(clamp((now-freeze.start-Math.max(freeze.delay,freeze.dur*0.3))/(freeze.dur*0.55),0,1));
      return {x:lerp(freeze.px,freeze.dot.x,k),y:lerp(freeze.py,freeze.dot.y,k)};
    }
    return current.puck;
  }
  function pushTrail(){
    const p=current&&current.puck; if(!p) return;
    const span=clamp(0.06*speed,0.8,3), last=trail[trail.length-1];
    if(freeze){trail=[];return}
    if(last&&Math.abs(last.g-g)<1e-6) return;
    const cut=!!last&&Math.hypot(last.x-p.x,last.y-p.y)>25;
    trail.push({x:p.x,y:p.y,g,cut});
    while(trail.length&&(trail[0].g<g-span||trail.length>60)) trail.shift();
  }

  /* Déroulement : événements de la feuille de match et jeux de l'animation */
  const SHOT_FR={wrist:"lancer du poignet",snap:"lancer sec",slap:"lancer frappé",back:"lancer du revers",tip:"déviation",wrap:"en contournant le filet",one:"lancer sur réception"};
  const ZONE_FR={C:"au centre",N:"en zone neutre",O:"en zone offensive",D:"en zone défensive"};
  const MAJOR=new Set(["goal","pen","end","pull","goalie","final"]);
  function buildFeed(){
    // ordre à temps égal : l'événement, puis le jeu, puis la mise au jeu qui suit, la fin de match en dernier
    const rank=e=>e.type==="final"?4:e.type==="face"?3:MAJOR.has(e.type)?(e.type==="end"?1:0):2;
    feedAll=[...G.events,...G.plays].sort((a,b)=>a.t-b.t||rank(a)-rank(b));
    // avantages numériques : chaque passage à l'avantage
    ppStarts=[]; const ts=[...new Set(G.pens.map(p=>p.t))].sort((a,b)=>a-b);
    ts.forEach(t=>{const a=G.stateAt(t-0.01),b=G.stateAt(t+0.01);SIDES.forEach(s=>{if(b[s].kind==="PP"&&a[s].kind!=="PP")ppStarts.push({t,side:s})})});
  }
  const who=(p,side)=>`${esc2(p?p.name:"")} (${esc2(G.team[side].abbr)})`;
  function feedBody(e){
    const tag=side=>`<span class="tag" style="background:${dotColor(G,side)}"></span>`;
    const kind=k=>`<span class="kind">${k}</span>`;
    switch(e.type){
      case "goal":{const x=e.g;const how=x.shot&&x.shot.kind?`, ${SHOT_FR[x.shot.kind]||"tir"} de ${x.shot.dist} pi`:"";
        return `<span class="goal">${tag(x.side)}But ${esc2(G.team[x.side].abbr)} : ${esc2(x.scorer?x.scorer.name:"")}</span>${x.assists.length?" ("+x.assists.map(p=>esc2(p.name)).join(", ")+")":" (sans aide)"}${how}${x.ppGoal?", AN":""}`}
      case "pen":{const p=e.p;return `${tag(p.side)}${kind("Pénalité")}${esc2(p.who||(p.p?p.p.name:""))} (${esc2(G.team[p.side].abbr)}), ${esc2(p.inf.toLowerCase())}, ${esc2(p.label)}`}
      case "pull": case "goalie": return `${tag(e.side)}${esc2(softText(e))}`;
      case "end": return `<span class="goal">Fin de la ${perName(e.per,G.nPer)}</span>`;
      case "final":{const s2=scoreAt(G.T+1);return `<span class="goal">Final${G.T>3600?" ("+finalOT()+")":""} : ${esc2(G.team.away.abbr)} ${s2.away}, ${esc2(G.team.home.abbr)} ${s2.home}${s2.away===s2.home?", match nul":""}</span>`}
      case "shot": return `${tag(e.side)}${kind("Tir")}${who(e.p,e.side)}, ${SHOT_FR[e.kind]||"tir"} de ${e.dist} pi, arrêt de ${esc2(e.g?e.g.last:"")}`;
      case "face": return `${tag(e.side)}${kind("Mise au jeu")}${who(e.p,e.side)} l’emporte contre ${esc2(e.q?e.q.last:"")}, ${ZONE_FR[e.zone]||""}`;
      case "freeze": return `${tag(e.side)}${kind("Arrêt")}${esc2(e.g?e.g.name:"")} immobilise la rondelle`;
      case "icing": return `${tag(e.side)}${kind("Dégagement refusé")}${esc2(G.team[e.side].name)}`;
      case "offside": return `${tag(e.side)}${kind("Hors-jeu")}${e.p?who(e.p,e.side):esc2(G.team[e.side].name)}`;
      case "out": return `${tag(e.side)}${kind("Arrêt")}rondelle hors de la patinoire`;
      case "hit": return `${tag(e.side)}${kind("Mise en échec")}${who(e.p,e.side)} sur ${esc2(e.q?e.q.last:"un adversaire")}`;
      case "takeaway": return `${tag(e.side)}${kind("Récupération")}${who(e.p,e.side)}`;
      case "giveaway": return `${tag(e.side)}${kind("Revirement")}${who(e.p,e.side)} perd la rondelle`;
    }
    return "";
  }
  function renderFeed(){
    // nombre d'éléments déjà joués (recherche dichotomique), le final seulement à la fin
    let lo=0,hi=feedAll.length;
    while(lo<hi){const m=(lo+hi)>>1;if(feedAll[m].t<=g+0.0001)lo=m+1;else hi=m}
    let shown=feedAll.slice(0,lo).filter(e=>!(e.type==="final"&&g<G.T-0.01));
    if(feedMode!=="tout") shown=shown.filter(e=>MAJOR.has(e.type));
    const key=feedMode+"|"+shown.length+"|"+(shown.length?shown[shown.length-1].t:0);
    if(key===lastFeedKey) return; lastFeedKey=key;
    const f=$("feed");
    if(!shown.length){f.innerHTML=`<li class="empty">${feedMode==="tout"?"Mise au jeu initiale. Appuyez sur lecture.":"Aucun fait saillant pour l’instant."}</li>`;return}
    f.innerHTML=shown.slice(-250).reverse().map(e=>{
      const src=e.g&&e.type==="goal"?e.g:e.p&&e.type==="pen"?e.p:e;
      const per=src.per||Math.min(Math.floor(e.t/1200)+1,G.nPer), sec=src.sec!==undefined?src.sec:e.t-(per-1)*1200;
      const when=e.type==="final"?"":(perShort(per,G.nPer)+" "+(e.type==="end"?"":fmt(sec)));
      const cls=MAJOR.has(e.type)?"major":"play";
      return `<li data-t="${e.t}" class="${cls}" tabindex="0" role="button"><span class="ft">${when}</span><span>${feedBody(e)}</span></li>`;
    }).join("");
    f.querySelectorAll("li[data-t]").forEach(li=>{
      const go=()=>seek(Math.max(0,+li.dataset.t-(li.classList.contains("major")?8:3)));
      li.onclick=go;
      li.onkeydown=e=>{if(e.key==="Enter"||e.key===" "){e.preventDefault();e.stopPropagation();go()}};
    });
  }
  /* Statistiques en direct, comme sur les suivis de match */
  function renderStats(){
    const upto=x=>x.t<=g+0.0001, cnt=(list,side)=>list.filter(x=>x.side===side&&upto(x)).length;
    const plays=k=>G.plays.filter(p=>p.type===k);
    const face=plays("face");
    const pim=side=>G.pens.filter(p=>p.side===side&&upto(p)).reduce((a,p)=>a+(p.misc?10:p.dur/60),0);
    const ppg=side=>G.goals.filter(x=>x.side===side&&upto(x)&&(x.ppGoal||/PP/.test(x.tag))).length;
    const rows=[
      ["Tirs au but",s=>cnt(G.shots,s)],
      ["Mises au jeu gagnées",s=>cnt(face,s),true],
      ["Mises en échec",s=>cnt(G.hits,s)],
      ["Minutes de pénalité",s=>pim(s)],
      ["Avantages numériques",s=>cnt(ppStarts,s),false,s=>`${ppg(s)} en ${cnt(ppStarts,s)}`],
      ["Hors-jeu",s=>cnt(plays("offside"),s),true],
      ["Dégagements refusés",s=>cnt(plays("icing"),s),true],
      ["Revirements",s=>cnt(plays("giveaway"),s),true],
      ["Récupérations",s=>cnt(plays("takeaway"),s),true]
    ];
    $("stats").innerHTML=`<div class="shead"><span>${esc2(G.team.away.abbr)}</span><span></span><span>${esc2(G.team.home.abbr)}</span></div>`+rows.map(([lab,f,sim,txt])=>{
      const a=f("away"), h=f("home"), tot=a+h, pa=tot?a/tot*100:50;
      return `<div class="srow"><span class="sv">${txt?txt("away"):a}</span><span class="sl"><span>${lab}${sim?'<sup aria-label="simulé">*</sup>':""}</span><span class="sbar" aria-hidden="true"><i style="width:${pa.toFixed(1)}%;background:${dotColor(G,"away")}"></i><i style="width:${(100-pa).toFixed(1)}%;background:${dotColor(G,"home")}"></i></span></span><span class="sv">${txt?txt("home"):h}</span></div>`;
    }).join("");
  }

  /* Tableau, présences, déroulement */
  function updateUI(force){
    const sec=Math.floor(g*2)/2;
    if(!force&&sec===lastSecond) return; lastSecond=sec;
    $("scrub").value=Math.round(g);
    const nP=G.nPer;
    let per=Math.min(Math.floor(g/1200)+1,nP), rem;
    if(g>0&&g<=nP*1200&&Math.abs(g%1200)<1e-6){per=Math.round(g/1200);rem=0}
    else rem=per*1200-g;
    if(g>=G.T-0.001&&G.T>3600){per=nP;rem=nP*1200-G.T}
    $("per").textContent=perName(per,nP); $("clock").textContent=fmtClock(rem);
    $("scrub").setAttribute("aria-valuetext",perName(per,nP)+", "+fmtClock(rem));
    const sc=scoreAt(g+0.0001);
    $("scAway").textContent=sc.away; $("scHome").textContent=sc.home;
    const sh={away:0,home:0}; G.shots.forEach(s=>{if(s.t<=g)sh[s.side]++});
    $("sAway").textContent="Tirs "+sh.away; $("sHome").textContent="Tirs "+sh.home;
    const st=G.stateAt(g+0.0001);
    let strTxt="";
    if(st.away.kind!=="ES"){
      const pp=st.away.kind==="PP"?"away":"home", pkS=pp==="away"?"home":"away";
      const act=G.pens.filter(p=>p.side===pkS&&p.strength&&p.t<=g&&g<p.end).sort((a,b)=>a.end-b.end);
      strTxt="Avantage numérique "+G.team[pp].abbr+(act.length?" "+fmtClock(act[0].end-g):"")+(st[pp].n-st[pkS].n>1?" (5 c. 3)":"");
    } else if(st.away.n<5) strTxt=st.away.n+" contre "+st.home.n;
    const pulled=SIDES.filter(s=>st[s].pulled).map(s=>"Filet désert "+G.team[s].abbr);
    $("strength").textContent=[...pulled,strTxt].filter(Boolean).join(", ");
    // présences : numéro, nom et tirs jusqu'ici
    const seg=G.segAt(g);
    const shotsOf=p=>G.shots.filter(s=>s.p===p&&s.t<=g+0.0001).length;
    SIDES.forEach(s=>{
      const el=$(s==="away"?"oiAway":"oiHome"); const tm=G.team[s];
      const k=seg.state[s].kind; const lab=k==="PP"?"Avantage numérique":k==="PK"?"Désavantage numérique":(seg.state[s].n<5?seg.state[s].n+" contre "+seg.state[s].n:"Forces égales");
      const gk=G.goalieAt(s,g), out=G.pulledAt(s,g);
      const num=p=>p&&p.num!=null?`<span class="num">${esc2(String(p.num))}</span>`:"";
      const rows=seg.line[s].map(e=>{const n=shotsOf(e.p);return `<li><span class="role">${ROLE_FR[e.role]}</span><span class="nm">${num(e.p)}${esc2(e.p.name)}${e.role==="X"?" (6e attaquant)":""}</span><span class="pstat" title="Tirs jusqu’ici, sur ${e.p.s} au match">${n} T</span></li>`}).join("")
        +`<li><span class="role">G</span><span class="nm">${out?"Filet désert ("+esc2(gk.name)+" au banc)":num(gk)+esc2(gk.name)}</span></li>`;
      const bx=[...G.boxedAt(s,g)].map(p=>esc2(p.name)).join(", ");
      el.innerHTML=`<h4><span class="dot" style="background:${dotColor(G,s)}"></span>${esc2(tm.name)}</h4><div class="st">${lab}</div><ul>${rows}</ul>${bx?`<div class="box">Au banc des pénalités : ${bx}</div>`:""}`;
    });
    $("boxscore").hidden=g<G.T-0.01;
    renderStats();
    renderFeed();
  }
}
