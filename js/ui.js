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
  $("newGame").onclick=()=>{playing=false;updatePlayIcon();$("game").hidden=true;$("setup").hidden=false;$("newGame").hidden=true;window.scrollTo(0,0)};

  let G=null, g=0, playing=false, speed=20, freezeUntil=0, lastNow=0, posMap=new Map(), lastFeedCount=-1, lastSecond=-1, toastUntil=0, bannerUntil=0, bannerSticky=false, litUntil={away:0,home:0};
  const renderer=createRenderer($("rink"));
  const draw=()=>renderer.draw({G,g,posMap,current,freezeUntil,showNames:$("showNames").checked});
  window.addEventListener("resize",()=>{if(G){renderer.resize();draw()}});
  if(window.matchMedia) window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change",()=>{renderer.readTheme();if(G)draw()});
  renderer.readTheme();

  function start(){
    $("err").textContent="";
    const raw=sumIn.value;
    if(!raw.trim()){$("err").textContent="Collez d’abord un sommaire de match, ou chargez l’exemple.";return}
    let S;
    try{S=parseSummary(raw)}catch(e){$("err").textContent=e.message;return}
    const L=parseLines(linesIn.value);
    // l'instantané n'est pas enregistré : une mise à jour du dépôt sera ainsi visible
    if(linesIn.value.trim()===snapText) store.del("ushl-sim-lines"); else store.set("ushl-sim-lines",linesIn.value);
    store.set("ushl-sim-summary",raw);
    try{G=buildGame(S,L,raw)}catch(e){console.error(e);$("err").textContent="Le match n’a pas pu être construit : "+e.message;return}
    setupGame();
  }
  function setupGame(){
    $("setup").hidden=true;$("game").hidden=false;$("newGame").hidden=false;
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
    $("diag").textContent=d.join(". ")+".";
    renderer.resize(); posMap=new Map(); lastFeedCount=-1; lastSecond=-1; freezeUntil=0; bannerSticky=false; hideBanner(); $("toast").hidden=true;
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
  document.addEventListener("keydown",e=>{
    if($("game").hidden||/TEXTAREA|SELECT|INPUT/.test(e.target.tagName)&&e.target.type!=="range"&&e.target.type!=="checkbox") return;
    if(e.code==="Space"){e.preventDefault();togglePlay()}
    else if(e.key==="ArrowRight"&&e.target.type!=="range"){seek(Math.min(G.T,g+15))}
    else if(e.key==="ArrowLeft"&&e.target.type!=="range"){seek(Math.max(0,g-15))}
  });
  function togglePlay(){if(!G)return;if(g>=G.T-0.01){seek(0)}playing=!playing;freezeUntil=0;if(playing&&!bannerSticky)hideBanner();updatePlayIcon()}
  function updatePlayIcon(){$("playIcon").innerHTML=playing?'<path d="M6 4h4v16H6zM14 4h4v16h-4z"/>':'<path d="M7 4v16l13-8z"/>';$("bPlay").setAttribute("aria-label",playing?"Pause":"Lecture")}
  function seek(t){g=clamp(t,0,G.T);freezeUntil=0;litUntil={away:0,home:0};bannerSticky=false;hideBanner();$("toast").hidden=true;posMap=new Map();stepPositions(1e9);if(g>=G.T-0.01)showFinal();updateUI(true);draw()}

  function frame(now){
    const dtR=lastNow?Math.min(0.1,(now-lastNow)/1000):0; lastNow=now;
    if(G&&!$("game").hidden){
      let dtG=0;
      if(playing&&now>=freezeUntil){
        let ng=g+dtR*speed;
        const crossed=G.stops.filter(s=>s.t>g&&s.t<=ng);
        const hard=crossed.find(s=>s.type!=="pen");
        crossed.filter(s=>s.type==="pen"&&(!hard||s.t<=hard.t)).forEach(s=>showToast(s.p));
        if(hard){ng=hard.t;triggerStop(hard,now)}
        if(ng>=G.T){ng=G.T;playing=false;updatePlayIcon();showFinal()}
        dtG=ng-g; g=ng;
      }
      stepPositions(dtG);
      if(now>bannerUntil&&!bannerSticky) hideBanner();
      if(now>toastUntil) $("toast").hidden=true;
      SIDES.forEach(s=>{const el=$(s==="away"?"scAway":"scHome");el.classList.toggle("lit",now<litUntil[s])});
      updateUI(false); draw(now);
    }
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);

  function triggerStop(s,now){
    if(s.type==="goal"){
      freezeUntil=now+2800; bannerUntil=now+2800; litUntil[s.g.side]=now+2800;
      const gg=s.g; const tm=G.team[gg.side];
      const ast=gg.assists.length?"Aides : "+gg.assists.map(p=>p.name).join(", "):"Sans aide";
      const tags=[]; if(gg.ppGoal||/PP/.test(gg.tag))tags.push("en avantage numérique"); if(/SH/.test(gg.tag))tags.push("en désavantage numérique"); if(/EN/.test(gg.tag))tags.push("dans un filet désert");
      showBanner(`<div class="big goal">But ${esc2(tm.abbr)} !</div><div class="mid">${esc2(gg.scorer?gg.scorer.name:"")}</div><div class="small">${esc2(ast)}</div><div class="small">${perShort(gg.per,G.nPer)} ${gg.per>=4?"":"période "}à ${fmt(gg.sec)}${tags.length?", "+tags.join(", "):""}</div>`);
    } else if(s.type==="end"){
      freezeUntil=now+1700; bannerUntil=now+1700;
      const sc=scoreAt(s.t+0.001);
      showBanner(`<div class="big">Fin de la ${perName(s.per,G.nPer)}</div><div class="small">${esc2(G.team.away.abbr)} ${sc.away}, ${esc2(G.team.home.abbr)} ${sc.home}</div>`);
    }
  }
  function showToast(p){const el=$("toast");el.textContent="Pénalité : "+(p.p?p.p.name:"")+" ("+G.team[p.side].abbr+"), "+p.inf.toLowerCase()+", "+p.label;el.hidden=false;toastUntil=performance.now()+2600}
  function showBanner(html){const b=$("banner");b.innerHTML=html;b.hidden=false}
  function hideBanner(){$("banner").hidden=true}
  function showFinal(){
    const sc=scoreAt(G.T+1); const ot=G.T>3600;
    const stars=G.S.stars.slice(0,3).map(s=>`<li>${"★".repeat(4-s.n)} ${esc2(s.name)} (${esc2(s.abbr)})</li>`).join("");
    showBanner(`<div class="big">Final${ot?" ("+finalOT()+")":""}</div><div class="mid">${esc2(G.team.away.name)} ${sc.away}, ${esc2(G.team.home.name)} ${sc.home}</div>${sc.away===sc.home?`<div class="small">Match nul</div>`:""}${stars?`<ul class="stars">${stars}</ul>`:""}${G.S.attendance?`<div class="small">Assistance : ${esc2(G.S.attendance)}</div>`:""}`);
    bannerSticky=true;
  }
  function finalOT(){return G.nPer>4?perShort(G.nPer,G.nPer):"prol."}
  function esc2(s){return String(s).replace(/[&<>"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]))}
  function scoreAt(t){const o={away:0,home:0};G.goals.forEach(x=>{if(x.t<=t)o[x.side]++});return o}

  /* Positions lissées */
  function stepPositions(dtG){
    const tg=targetsAt(G,g); const k=dtG>5?1:1-Math.exp(-dtG*3.2);
    const seen=new Set();
    tg.list.forEach(o=>{
      const id=o.p.id; seen.add(id); let cur=posMap.get(id);
      if(!cur){const b=dtG>5||posMap.size===0?{x:o.x,y:o.y}:{x:BENCH[o.side].x,y:BENCH[o.side].y};cur={x:b.x,y:b.y};posMap.set(id,cur)}
      cur.x+= (o.x-cur.x)*k; cur.y+=(o.y-cur.y)*k; cur.o=o;
    });
    for(const id of [...posMap.keys()]) if(!seen.has(id)) posMap.delete(id);
    current=tg;
  }
  let current=null;

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
    $("strength").textContent=strTxt;
    // présences
    const seg=G.segAt(g);
    SIDES.forEach(s=>{
      const el=$(s==="away"?"oiAway":"oiHome"); const tm=G.team[s];
      const k=seg.state[s].kind; const lab=k==="PP"?"Avantage numérique":k==="PK"?"Désavantage numérique":(seg.state[s].n<5?seg.state[s].n+" contre "+seg.state[s].n:"Forces égales");
      const rows=seg.line[s].map(e=>`<li><span class="role">${ROLE_FR[e.role]}</span><span>${esc2(e.p.name)}</span></li>`).join("")+`<li><span class="role">G</span><span>${esc2(G.goalie[s].name)}</span></li>`;
      const bx=[...G.boxedAt(s,g)].map(p=>esc2(p.name)).join(", ");
      el.innerHTML=`<h4><span class="dot" style="background:${dotColor(G,s)}"></span>${esc2(tm.name)}</h4><div class="st">${lab}</div><ul>${rows}</ul>${bx?`<div class="box">Au banc des pénalités : ${bx}</div>`:""}`;
    });
    // déroulement
    const evs=G.events.filter(e=>e.t<=g+0.0001&&!(e.type==="final"&&g<G.T-0.01));
    if(evs.length!==lastFeedCount){
      lastFeedCount=evs.length; const f=$("feed");
      if(!evs.length){f.innerHTML='<li class="empty">Mise au jeu initiale. Appuyez sur lecture.</li>';return}
      f.innerHTML=evs.slice().reverse().map(e=>{
        const when=e.type==="final"?"":(perShort(e.type==="end"?e.per:(e.g||e.p).per,G.nPer)+" "+(e.type==="end"?"":fmt((e.g||e.p).sec)));
        let body="";
        if(e.type==="goal"){const x=e.g;body=`<span class="goal"><span class="tag" style="background:${dotColor(G,x.side)}"></span>But ${esc2(G.team[x.side].abbr)} : ${esc2(x.scorer?x.scorer.name:"")}</span>${x.assists.length?" ("+x.assists.map(p=>esc2(p.name)).join(", ")+")":" (sans aide)"}${x.ppGoal?", AN":""}`}
        else if(e.type==="pen"){const p=e.p;body=`Pénalité ${esc2(G.team[p.side].abbr)} : ${esc2(p.p?p.p.name:"")}, ${esc2(p.inf.toLowerCase())}, ${esc2(p.label)}`}
        else if(e.type==="end"){body=`Fin de la ${perName(e.per,G.nPer)}`}
        else {const s2=scoreAt(G.T+1);body=`<span class="goal">Final${G.T>3600?" ("+finalOT()+")":""} : ${esc2(G.team.away.abbr)} ${s2.away}, ${esc2(G.team.home.abbr)} ${s2.home}${s2.away===s2.home?", match nul":""}</span>`}
        return `<li data-t="${e.t}"><span class="ft">${when}</span><span>${body}</span></li>`;
      }).join("");
      f.querySelectorAll("li[data-t]").forEach(li=>li.onclick=()=>{const t=+li.dataset.t;seek(Math.max(0,t-8))});
    }
  }
}
