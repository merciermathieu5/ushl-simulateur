"use strict";

/* ---------- Construction du match ---------- */
function buildGame(S,L,seedText,opts){
  const rng=mulberry32(hashStr(seedText||"x"));
  const R=()=>rng();
  const G={S,team:{},roster:{},goalie:{},goalies:{},goalieSwap:{},pulls:[],hits:[],units:{},grp:{},diag:{},goals:[],pens:[],shots:[],segs:[],kfs:[],events:[],stops:[]};
  let pid=0;
  // Page des alignements (facultative) : numéro de chandail, position et cotes de chaque joueur
  const rosterOf=side=>((L.roster||{})[S[side]])||{};
  const info=(side,name)=>rosterOf(side)[norm(name)]||null;
  SIDES.forEach(side=>{
    G.team[side]=teamInfo(S[side]);
    G.roster[side]=S.players[side].map(p=>{
      const k=norm(p.name), r=info(side,p.name);
      return {...p,id:"p"+(pid++),side,last:lastName(p.name),pos:L.pos[k]||(r&&r.pos!=="G"?r.pos:null),
        num:r?r.num:null,sp:r?r.sp:null,st:r?r.st:null,pc:r?r.pc:null,ex:r?r.ex:null};
    });
  });
  const other=s=>s==="home"?"away":"home";

  function findPlayer(side,raw,create=true){
    if(!raw) return null; raw=raw.trim(); let init=null,last=raw;
    const m=raw.match(/^([A-Za-z])\.\s*(.+)$/); if(m){init=m[1].toUpperCase();last=m[2]}
    const k=norm(last); if(!k) return null;
    const RS=G.roster[side];
    let c=RS.filter(p=>norm(p.name).endsWith(k));
    if(c.length>1&&init){const c2=c.filter(p=>norm(p.name)[0]===init);if(c2.length)c=c2}
    if(!c.length) c=RS.filter(p=>norm(p.name).includes(k));
    if(c.length) return c[0];
    if(!create) return null;
    // joueur absent des statistiques (nom mal orthographié) : il ne joue qu'au moment de son but ou de sa pénalité
    const p={name:titleCase(raw.replace(/^[A-Za-z]\.\s*/,"")),g:0,a:0,p:0,pm:0,pim:0,s:0,ht:0,it:0,id:"p"+(pid++),side,last:titleCase(last),pos:null,ghost:true};
    RS.push(p); return p;
  }
  function sideOf(code,playerRaw){
    code=(code||"").toUpperCase().replace(/\s+/g,"");
    if(code===S.away) return "away"; if(code===S.home) return "home";
    if(playerRaw){const h=SIDES.filter(s=>findPlayer(s,playerRaw,false));if(h.length===1)return h[0]}
    const a=SIDES.filter(s=>G.team[s].abbr===code); if(a.length===1) return a[0];
    const b=SIDES.filter(s=>subseq(code,S[s])); if(b.length===1) return b[0];
    return null;
  }
  G.findPlayer=findPlayer;

  // Buts
  S.goals.forEach(g=>{
    const side=sideOf(g.teamRaw,g.scorer); if(!side) return;
    G.goals.push({t:g.t,per:g.per,sec:g.sec,side,scorer:findPlayer(side,g.scorer),assists:g.assists.map(a=>findPlayer(side,a)).filter(Boolean),tag:g.tag});
  });
  G.goals.sort((a,b)=>a.t-b.t);
  // Pénalités (celle d'un gardien est purgée par un coéquipier : aucun patineur de plus au banc des pénalités)
  const goalieNamed=(side,raw)=>{const k=norm((raw||"").replace(/^[A-Za-z]\.\s*/,""));return k?S.goalies.find(g=>sideOf(g.abbr,null)===side&&norm(g.name).endsWith(k)):null};
  S.pens.forEach(p=>{
    const side=sideOf(p.abbr,p.name); if(!side) return;
    const gk=!findPlayer(side,p.name,false)&&goalieNamed(side,p.name);
    const k=p.kind.toLowerCase();
    let dur=120, label="2 min";
    if(/double/.test(k)){dur=240;label="4 min"}
    else if(/game misconduct|match/.test(k)){dur=/match/.test(k)?300:0;label=/match/.test(k)?"pénalité de match":"inconduite de partie"}
    else if(/misconduct/.test(k)){dur=0;label="10 min, inconduite"}
    else if(/major/.test(k)){dur=300;label="5 min"}
    const pl=gk?null:findPlayer(side,p.name);
    G.pens.push({t:p.t,per:p.per,sec:p.sec,side,p:pl,who:gk?gk.name:pl?pl.name:titleCase(p.name),inf:infrFr(p.inf),label,dur,strength:dur>0,misc:dur===0});
  });
  G.pens.sort((a,b)=>a.t-b.t);
  // Gardiens
  const gl={away:[],home:[]}; const unassigned=[];
  S.goalies.forEach(g=>{const s=sideOf(g.abbr,null); if(s) gl[s].push(g); else unassigned.push(g)});
  SIDES.forEach(s=>{if(!gl[s].length&&unassigned.length) gl[s].push(unassigned.shift())});
  SIDES.forEach(s=>{
    const mk=(g,id)=>{const r=g?info(s,g.name):null;return {id,side:s,name:g?g.name:"Gardien",last:g?lastName(g.name):"Gardien",grp:"G",stat:g||null,num:r?r.num:null}};
    const list=gl[s];
    if(list.length<2){G.goalie[s]=mk(list[0],"g_"+s);G.goalies[s]=[G.goalie[s]];return}
    // Plusieurs gardiens : le partant est celui de la page des trios, sinon le premier listé.
    const st=(L.teams[S[s]]||{}).goalie;
    const first=list.find(g=>st&&norm(g.name)===norm(st))||list[0];
    const relief=list.filter(g=>g!==first).sort((a,b)=>b.shots-a.shots)[0];
    G.goalies[s]=[mk(first,"g_"+s),mk(relief,"g_"+s+"_2")];
    G.goalie[s]=G.goalies[s][0];
  });

  // Durée du match
  // Saison : une prolongation, le match nul est possible. Séries : prolongations jusqu'au but.
  const otGoal=G.goals.find(g=>g.per>=4);
  const otShots=SIDES.some(s=>(S.shotRows[s][0]||[]).length>=5&&S.shotRows[s][0][3]>0);
  G.nPer=otGoal?otGoal.per:Math.max(3,otShots?4:3,...G.pens.map(p=>p.per));
  const hasOT=G.nPer>3;
  G.hasOT=hasOT;
  G.T=otGoal?otGoal.t:G.nPer*1200;
  G.goals=G.goals.filter(g=>g.t<=G.T);

  // Fin des pénalités (but en avantage numérique)
  G.pens.forEach(p=>{p.end=p.t+p.dur});
  G.goals.forEach(g=>{
    const opp=other(g.side);
    const act=s=>G.pens.filter(p=>p.side===s&&p.strength&&p.t<g.t&&g.t<p.end);
    const op=act(opp), my=act(g.side);
    if(op.length>my.length){
      const minors=op.filter(p=>p.dur===120||p.dur===240).sort((a,b)=>a.end-b.end);
      if(minors.length){const m=minors[0]; if(m.dur===240&&g.t<m.t+120) m.end=g.t+120; else m.end=g.t; g.ppGoal=true}
    }
  });
  G.pens.forEach(p=>{p.end=Math.min(p.end,G.T);p.boxEnd=p.misc?Math.min(p.t+600,G.T):p.end});

  // Gardien retiré : l'équipe qui perd par un ou deux buts en fin de 3e période,
  // et toujours avant un but marqué dans un filet désert (EN).
  const Rp=mulberry32(hashStr((seedText||"x")+"|filet"));
  const scoreBefore=t=>{const o={away:0,home:0};G.goals.forEach(g=>{if(g.t<t)o[g.side]++});return o};
  const marks=[2400,...G.goals.filter(g=>g.t>=2400&&g.t<3600).map(g=>g.t),3600];
  for(let i=0;i<marks.length-1&&G.T>=3600;i++){
    const a=marks[i], b=marks[i+1], sc=scoreBefore(a+0.01), d=sc.home-sc.away;
    if(d===0||Math.abs(d)>2) continue;
    const lead=Math.abs(d)===1?60+Rp()*45:110+Rp()*50;
    const start=Math.max(3600-lead,a>2400?a+10:a);
    if(start<b-4) G.pulls.push({side:d>0?"away":"home",a:start,b:b<3600?b+0.05:3600});
  }
  G.goals.filter(g=>/EN/.test(g.tag)).forEach(g=>{
    const side=other(g.side);
    if(G.pulls.some(p=>p.side===side&&p.a<=g.t&&g.t<p.b)) return;
    const prev=Math.max(Math.floor(g.t/1200)*1200,...G.goals.filter(x=>x.t<g.t).map(x=>x.t+10));
    G.pulls.push({side,a:Math.min(g.t-1,Math.max(prev,g.t-35-Rp()*30)),b:g.t+0.05});
  });
  G.pulls.sort((a,b)=>a.a-b.a);
  G.pulledAt=(side,t)=>G.pulls.some(p=>p.side===side&&p.a<=t&&t<p.b);

  // Changement de gardien : après le dernier but accordé par le partant, sinon à l'entracte
  // le plus proche de sa part des tirs.
  SIDES.forEach(s=>{
    const gs=G.goalies[s]; if(gs.length<2) return;
    const st=gs[0].stat, st2=gs[1].stat, ga=Math.max(0,st.shots-st.saves);
    const against=G.goals.filter(g=>g.side===other(s)&&!/EN/.test(g.tag));
    let t;
    if(ga>0&&against.length>=ga) t=against[ga-1].t+0.05;
    else{
      const target=(st.shots+st2.shots?st.shots/(st.shots+st2.shots):0.5)*Math.min(G.T,3600);
      t=[1200,2400,3600].filter(x=>x<G.T).reduce((a,x)=>Math.abs(x-target)<Math.abs(a-target)?x:a,1200)+0.01;
    }
    if(t<G.T-0.1) G.goalieSwap[s]=t;
  });
  G.goalieAt=(side,t)=>{const gs=G.goalies[side],w=G.goalieSwap[side];return w!==undefined&&t>=w?gs[1]:gs[0]};

  const nSk=(side,t)=>Math.max(3,5-G.pens.filter(p=>p.side===side&&p.strength&&p.t<=t&&t<p.end).length);
  function stateAt(t){
    const na=nSk("away",t), nh=nSk("home",t);
    const mk=(a,b,side)=>({kind:a===b?"ES":(a>b?"PP":"PK"),n:a,pulled:G.pulledAt(side,t)});
    return {away:mk(na,nh,"away"),home:mk(nh,na,"home")};
  }
  G.stateAt=stateAt;
  G.boxedAt=(side,t)=>new Set(G.pens.filter(p=>p.side===side&&p.p&&p.t<=t&&t<p.boxEnd).map(p=>p.p));

  // Positions et trios
  SIDES.forEach(side=>{
    const RS=G.roster[side]; const anyIT=RS.some(p=>p.it>0);
    RS.forEach(p=>p.active=anyIT?(p.it>0||!!p.ghost):true);
    const act=RS.filter(p=>p.active);
    const D=act.filter(p=>p.pos==="D"), F=act.filter(p=>p.pos&&p.pos!=="D"), U=act.filter(p=>!p.pos).sort((a,b)=>b.it-a.it);
    while(D.length<6&&U.length) D.push(U.shift());
    U.forEach(p=>F.push(p));
    D.sort((a,b)=>b.it-a.it); F.sort((a,b)=>b.it-a.it);
    while(D.length>6&&F.length<12) F.push(D.pop());
    F.sort((a,b)=>b.it-a.it);
    D.forEach(p=>p.grp="D"); F.forEach(p=>p.grp="F");
    RS.filter(p=>!p.active).forEach(p=>p.grp=p.pos==="D"?"D":"F");
    G.grp[side]={F,D};

    const T=L.teams[S[side]]||{es:[],pp:[],pk:[]};
    const byName=n=>{const k=norm(n);return RS.find(p=>p.active&&norm(p.name)===k)||null};
    let fromLines=0; const placed=new Set();
    const nF=Math.max(1,Math.min(4,Math.floor(F.length/3)));
    const fl=[...Array(nF)].map(()=>({C:null,LW:null,RW:null})); const used=new Set();
    // Comme dans FHL, un attaquant peut figurer dans deux trios (par exemple le 1er et le 4e) : il joue alors les deux.
    T.es.slice(0,4).forEach((row,i)=>{if(i>=nF)return;["C","LW","RW"].forEach((r,k)=>{const p=byName(row[k]);if(p&&p.grp==="F"&&!Object.values(fl[i]).includes(p)){fl[i][r]=p;used.add(p);placed.add(p)}})});
    const poolF=()=>F.filter(p=>!used.has(p));
    fl.forEach(line=>["C","LW","RW"].forEach(r=>{if(line[r])return;const p=poolF().find(q=>q.pos===r);if(p){line[r]=p;used.add(p)}}));
    fl.forEach(line=>["C","LW","RW"].forEach(r=>{if(line[r])return;const p=poolF()[0];if(p){line[r]=p;used.add(p)}}));
    const nD=Math.max(1,Math.min(3,Math.floor(D.length/2)));
    const dp=[...Array(nD)].map(()=>[null,null]); const usedD=new Set();
    T.es.slice(0,3).forEach((row,i)=>{if(i>=nD)return;[3,4].forEach((k,j)=>{const p=byName(row[k]);if(p&&p.grp==="D"&&!usedD.has(p)){dp[i][j]=p;usedD.add(p);placed.add(p)}})});
    dp.forEach(pr=>[0,1].forEach(j=>{if(pr[j])return;const p=D.find(q=>!usedD.has(q));if(p){pr[j]=p;usedD.add(p)}}));
    const mkUnit=(row,roles,nf,nd,avoid)=>{
      const u={F:[],D:[]};
      // Comme dans FHL, la page des trios peut placer un attaquant à la pointe en avantage numérique.
      if(row) row.forEach((n,k)=>{const p=byName(n);if(!p||u.F.includes(p)||u.D.includes(p))return;const isD=roles[k]==="D";
        if(isD&&u.D.length<nd){u.D.push(p);placed.add(p)}
        else if(!isD&&u.F.length<nf){u.F.push(p);placed.add(p)}});
      const fill=(arr,list,n)=>{for(const p of list){if(arr.length>=n)break;if(!arr.includes(p)&&!avoid.has(p))arr.push(p)}for(const p of list){if(arr.length>=n)break;if(!arr.includes(p))arr.push(p)}};
      fill(u.F,F,nf); fill(u.D,D,nd); return u;
    };
    const ppR=["C","LW","RW","D","D"], pkR=["C","F","D","D"];
    const pp1=mkUnit(T.pp[0],ppR,3,2,new Set());
    const pp2=mkUnit(T.pp[1],ppR,3,2,new Set([...pp1.F,...pp1.D]));
    const pk1=mkUnit(T.pk[0],pkR,2,2,new Set());
    const pk2=mkUnit(T.pk[1],pkR,2,2,new Set([...pk1.F,...pk1.D]));
    G.units[side]={F:fl,D:dp,PP:[pp1,pp2],PK:[pk1,pk2]};
    G.diag[side]={fromLines:placed.size,total:act.length,hasTeam:!!L.teams[S[side]]};
  });

  // Présences. Pour chaque équipe, les attaquants et les défenseurs changent chacun à leur rythme : un trio
  // reste une quarantaine de secondes sur la glace, une paire un peu plus. Les unités spéciales (avantage et
  // désavantage numériques) changent d'un bloc. Un changement ordinaire a une fenêtre de quelques secondes :
  // la trame de jeu (js/jeu.js) choisit le vrai moment, à un arrêt de jeu ou quand la rondelle passe en zone
  // neutre, sinon à la fin de la fenêtre. Les buts, pénalités, retraits du gardien et fins de période imposent
  // leurs moments.
  function lineup(side,st,c,boxed,must,busy){
    const U=G.units[side]; let Lr;
    if(st.kind==="PP"){const u=U.PP[c.pp%U.PP.length];Lr=[{p:u.F[0],role:"C"},{p:u.F[1],role:"LW"},{p:u.F[2],role:"RW"},{p:u.D[0],role:"LD"},{p:u.D[1],role:"RD"}];if(st.n===4)Lr.splice(2,1);if(st.n===3)Lr.splice(1,2)}
    else if(st.kind==="PK"){const u=U.PK[c.pk%U.PK.length];Lr=[{p:u.F[0],role:"C"},{p:u.F[1],role:"W"},{p:u.D[0],role:"LD"},{p:u.D[1],role:"RD"}];if(st.n===3)Lr.splice(1,1)}
    else{const f=U.F[c.f%U.F.length],d=U.D[c.d%U.D.length];Lr=[{p:f.C,role:"C"},{p:f.LW,role:"LW"},{p:f.RW,role:"RW"},{p:d[0],role:"LD"},{p:d[1],role:"RD"}];if(st.n===4)Lr.splice(2,1);if(st.n===3)Lr.splice(1,2)}
    const inL=new Set(); const gl=G.grp[side];
    // busy : joueurs déjà sur la glace avec l'autre groupe (attaquants ou défenseurs)
    const taken=q=>boxed.has(q)||(busy&&busy.has(q));
    const free=q=>!taken(q)&&!inL.has(q)&&!Lr.some(x=>x.p===q);
    const neediest=list=>{let best=null;list.forEach(q=>{if(free(q)&&(!best||need(q)>need(best)))best=q});return best};
    const out=Lr.map(e=>{
      let p=e.p; const isD=e.role==="LD"||e.role==="RD";
      // Joueur déjà au-delà de son temps de glace (blessé en cours de match, peu utilisé) :
      // remplacé par le joueur de la même position qui en manque le plus.
      if(p&&!taken(p)&&!inL.has(p)&&need(p)<-Math.max(20,0.05*(want.get(p)||0))){
        const q=neediest(isD?gl.D:gl.F); if(q&&need(q)>0) p=q;
      }
      if(!p||taken(p)||inL.has(p)) p=neediest(isD?gl.D:gl.F)||neediest(isD?gl.F:gl.D);
      if(p) inL.add(p);
      return {p,role:e.role};
    }).filter(e=>e.p);
    // gardien retiré : un attaquant de plus
    if(st.pulled){const x=neediest(gl.F)||neediest(gl.D);if(x)out.push({p:x,role:"X"})}
    // Marqueur, passeurs et joueur pénalisé sont sur la glace au moment de l'action : ils prennent
    // la place du joueur de leur position qui a le moins besoin de temps de glace.
    (must||[]).forEach(m=>{
      if(!m||taken(m)||out.some(x=>x.p===m)) return;
      const same=x=>(x.role==="LD"||x.role==="RD")===(m.grp==="D");
      let k=-1;
      out.forEach((x,i)=>{
        if(must.includes(x.p)) return;
        if(k<0||(same(x)&&!same(out[k]))||(same(x)===same(out[k])&&need(x.p)<need(out[k].p))) k=i;
      });
      if(k>=0) out[k]={p:m,role:out[k].role};
    });
    return out;
  }
  const B=new Set([0,G.T]); for(let x=1200;x<G.T;x+=1200) B.add(x);
  G.pens.forEach(p=>{if(p.t<G.T)B.add(p.t);if(p.end<G.T)B.add(p.end);if(p.boxEnd<G.T)B.add(p.boxEnd)});
  G.pulls.forEach(p=>{if(p.a<G.T)B.add(p.a);if(p.b<G.T)B.add(p.b)});
  G.goals.forEach(g=>{if(g.t+0.05<G.T)B.add(g.t+0.05)});
  const bs=[...B].sort((a,b)=>a-b);
  // Temps de glace visé : la colonne IT de la feuille de match, ramenée au temps de patinage
  // disponible dans ce match (5 patineurs, moins les pénalisés, plus le 6e attaquant).
  const avail={away:0,home:0};
  for(let i=0;i<bs.length-1;i++){const a=bs[i],b=bs[i+1];if(b-a<0.001)continue;const st=stateAt(a+0.0005);SIDES.forEach(s=>{avail[s]+=(b-a)*(st[s].n+(st[s].pulled?1:0))})}
  const want=new Map(), toi=new Map();
  SIDES.forEach(side=>{
    const act=G.roster[side].filter(p=>p.active), sum=act.reduce((x,p)=>x+Math.max(0,p.it||0),0);
    act.forEach(p=>{want.set(p,sum>0?Math.max(0,p.it||0)/sum*avail[side]:avail[side]/act.length);toi.set(p,0)});
  });
  const need=p=>(want.get(p)||0)-(toi.get(p)||0);
  const perStart=t=>Math.min(Math.floor(t/1200),G.nPer-1)*1200;
  // Prochain trio (ou prochaine paire) : celui dont les joueurs manquent le plus de temps de glace,
  // jamais deux présences de suite pour le même trio.
  const pickUnit=(units,last,excl,members)=>{
    if(units.length<=1) return 0;
    let bi=0,best=-Infinity;
    units.forEach((u,i)=>{if(excl&&i===last)return;const ps=members(u).filter(Boolean);
      const sc=ps.reduce((x,p)=>x+need(p),0)/Math.max(1,ps.length)+R()*12;if(sc>best){best=sc;bi=i}});
    return bi;
  };
  const isDr=r=>r==="LD"||r==="RD";
  // joueurs qui doivent être sur la glace (marqueur, passeurs, joueur pénalisé) entre a et b
  const mustIn=(side,a,b)=>{
    const m=[];
    G.goals.forEach(g=>{const tt=Math.max(perStart(g.t-0.001),g.t-0.3);if(g.side===side&&tt>=a&&tt<b)[g.scorer,...g.assists].forEach(p=>p&&m.push({p,t:g.t}))});
    G.pens.forEach(p=>{const tt=Math.max(perStart(p.t-0.001),p.t-0.3);if(p.side===side&&p.p&&tt>=a&&tt<b&&!G.boxedAt(side,tt).has(p.p))m.push({p:p.p,t:p.t})});
    return m;
  };
  const perStarts=new Set([...Array(G.nPer)].map((_,i)=>i*1200));
  // Moments où le jeu est arrêté : début de période, but, pénalité. Les autres frontières (fin de pénalité,
  // retrait du gardien) arrivent pendant le jeu : les joueurs déjà sur la glace y restent un moment.
  const near=(a,b)=>Math.abs(a-b)<1e-6;
  const whistleAt=t=>perStarts.has(t)||G.goals.some(g=>near(t,g.t)||near(t,g.t+0.05))||G.pens.some(p=>near(t,p.t));
  // rôles d'une situation, par groupe (attaquants : C, LW, RW, W, X; défenseurs : LD, RD)
  const rolesFor=(side,st,c,grp)=>lineup(side,st,c,new Set(),[]).map(x=>x.role).filter(r=>grp==="D"?isDr(r):!isDr(r));
  G.plan={away:{F:[],D:[]},home:{F:[],D:[]}};
  SIDES.forEach(side=>{
    const U=G.units[side], tracks=G.plan[side];
    const c={f:0,d:0,pp:0,pk:0,ppStart:0,last:null};
    const covering=(grp,t)=>{const tr=tracks[grp];for(let i=tr.length-1;i>=0;i--){const x=tr[i];if(x.a<=t&&t<x.b)return x;if(x.b<=t)break}return null};
    const push=(grp,a,b,members,kind,ib,must,extra)=>{
      const x={a,b,members,kind,fixedB:b>=ib-1e-6,must:must.map(m=>m.t),side,grp,atWhistle:whistleAt(a)};
      if(extra) Object.assign(x,extra);
      tracks[grp].push(x);
      members.forEach(m=>toi.set(m.p,(toi.get(m.p)||0)+(b-a)));
      return x;
    };
    for(let i=0;i<bs.length-1;i++){
      const ia=bs[i], ib=bs[i+1]; if(ib-ia<0.001) continue;
      const st=stateAt(ia+0.0005), k=st[side].kind;
      const endAt=(t0,len)=>{
        let e=Math.min(ib,t0+len); if(ib-e<12) e=ib;
        // pas de changement dans les 6 secondes qui précèdent un but : le but et ses passes se jouent sur une même présence
        if(e<ib&&G.goals.some(g=>g.t>e&&g.t-e<6&&g.t<=ib+0.06)) e=ib;
        return e;
      };
      const boxed=G.boxedAt(side,ia+0.0005);
      // Frontière en plein jeu : chaque groupe garde ses joueurs encore quelques secondes, le joueur qui sort
      // du banc des pénalités (ou le 6e attaquant) complète l'alignement, puis les changements reprennent.
      const mid=!perStarts.has(ia)&&!whistleAt(ia);
      // ex : joueurs déjà pris par l'autre groupe (un même joueur ne peut être attaquant et défenseur en même temps)
      const cont=(grp,ex)=>{
        const prev=covering(grp,ia-0.001); if(!mid||!prev||prev.b<ia-1e-6) return null;
        const roles=rolesFor(side,st[side],c,grp), keep=prev.members.filter(m=>!boxed.has(m.p)&&!(ex&&ex.has(m.p)));
        const out=[], used=new Set(ex||[]);
        roles.forEach(r=>{const m=keep.find(q=>q.role===r&&!used.has(q.p));if(m){out.push({p:m.p,role:r});used.add(m.p)}else out.push({p:null,role:r})});
        out.forEach(o=>{if(o.p)return;const m=keep.find(q=>!used.has(q.p));if(m){o.p=m.p;used.add(m.p)}});
        // joueur qui revient du banc des pénalités, sinon celui qui manque le plus de temps de glace
        const back=G.pens.filter(p=>p.side===side&&p.p&&near(p.boxEnd,ia)&&!boxed.has(p.p)).map(p=>p.p);
        const other=covering(grp==="F"?"D":"F",ia-0.001), busy=new Set(other?other.members.map(m=>m.p):[]);
        if(ex) ex.forEach(p=>busy.add(p));
        out.forEach(o=>{
          if(o.p) return;
          let q=back.find(b=>!used.has(b)&&(b.grp==="D")===(grp==="D"));
          if(!q){let best=null;G.grp[side][grp].forEach(r=>{if(r.active&&!used.has(r)&&!boxed.has(r)&&!busy.has(r)&&(!best||need(r)>need(best)))best=r});q=best}
          if(q){o.p=q;used.add(q)}
        });
        return out.filter(o=>o.p);
      };
      if(k!=="ES"){
        // unités spéciales : attaquants et défenseurs changent ensemble
        let t0=ia;
        const cF=cont("F"), cD=cont("D",new Set((cF||[]).map(m=>m.p)));
        if(cF&&cD&&cF.length+cD.length>=st[side].n+(st[side].pulled?1:0)){
          const e=endAt(ia,6+R()*8), must=mustIn(side,ia,e);
          const fx=push("F",ia,e,cF,k,ib,must.filter(m=>m.p.grp!=="D"),{cont:true});
          const dx=push("D",ia,e,cD,k,ib,must.filter(m=>m.p.grp==="D"),{cont:true});
          fx.pair=dx; dx.pair=fx;
          t0=e;
        }
        while(t0<ib-0.001){
          const e=endAt(t0,k==="PP"?44+R()*18:36+R()*14);
          if(k==="PP"){if(c.last!=="PP")c.ppStart=t0;c.pp=(t0-c.ppStart)<62?0:1}else c.pk=c.last==="PK"?c.pk+1:0;
          c.last=k;
          const must=mustIn(side,t0,e);
          const L5=lineup(side,st[side],c,G.boxedAt(side,t0+0.0005),must.map(m=>m.p));
          // unité spéciale : attaquants et défenseurs changent ensemble (un attaquant peut jouer à la pointe)
          const fx=push("F",t0,e,L5.filter(x=>!isDr(x.role)),k,ib,must.filter(m=>m.p.grp!=="D"));
          const dx=push("D",t0,e,L5.filter(x=>isDr(x.role)),k,ib,must.filter(m=>m.p.grp==="D"));
          fx.pair=dx; dx.pair=fx;
          t0=e;
        }
        continue;
      }
      // forces égales : le trio et la paire changent chacun à leur rythme
      const fresh=perStarts.has(ia);
      if(fresh){c.f=0;c.d=0}
      let tf=ia, td=ia, firstF=true, firstD=true;
      const contTaken=new Set();
      ["F","D"].forEach(grp=>{
        const m=cont(grp,contTaken); if(!m||!m.length) return;
        const e=endAt(ia,8+R()*12), must=mustIn(side,ia,e).filter(q=>(q.p.grp==="D")===(grp==="D"));
        // marqueur ou passeur absent de l'alignement conservé : il prend la place du joueur qui en a le moins besoin
        must.forEach(q=>{if(m.some(o=>o.p===q.p)||boxed.has(q.p)||contTaken.has(q.p))return;let j=-1;m.forEach((o,i)=>{if(must.some(z=>z.p===o.p))return;if(j<0||need(o.p)<need(m[j].p))j=i});if(j>=0)m[j]={p:q.p,role:m[j].role}});
        m.forEach(o=>contTaken.add(o.p));
        push(grp,ia,e,m,"ES",ib,must,{cont:true});
        if(grp==="F"){tf=e;firstF=false}else{td=e;firstD=false}
      });
      while(tf<ib-0.001||td<ib-0.001){
        const grp=tf<=td?"F":"D", t0=grp==="F"?tf:td;
        const e=endAt(t0,grp==="F"?34+R()*16:38+R()*18);
        if(grp==="F"){if(!(fresh&&firstF))c.f=pickUnit(U.F,c.f,true,f=>[f.C,f.LW,f.RW]);firstF=false}
        else{if(!(fresh&&firstD))c.d=pickUnit(U.D,c.d,true,d=>d);firstD=false}
        c.last="ES";
        const o=covering(grp==="F"?"D":"F",t0), busy=new Set(o?o.members.map(x=>x.p):[]);
        const must=mustIn(side,t0,e).filter(m=>(m.p.grp==="D")===(grp==="D"));
        const L5=lineup(side,st[side],c,G.boxedAt(side,t0+0.0005),must.map(m=>m.p),busy);
        push(grp,t0,e,L5.filter(x=>grp==="D"?isDr(x.role):!isDr(x.role)),"ES",ib,must);
        if(grp==="F") tf=e; else td=e;
      }
    }
    // Fenêtre de chaque changement ordinaire : jusqu'à 7 s plus tôt ou 5 s plus tard, jamais pendant un but ou une
    // pénalité qui demande ces joueurs, jamais au point de faire une présence de moins de 12 s.
    ["F","D"].forEach(grp=>{
      const tr=tracks[grp];
      tr.forEach((x,i)=>{
        const nx=tr[i+1];
        if(x.fixedB||!nx){x.w0=x.w1=x.b;return}
        let w0=Math.max(x.b-7,x.a+12), w1=Math.min(x.b+5,nx.b-12);
        x.must.forEach(t=>{w0=Math.max(w0,t+0.2)});
        nx.must.forEach(t=>{w1=Math.min(w1,t-10)});
        if(!(w0<=x.b&&x.b<=w1)){w0=w1=x.b}
        x.w0=w0; x.w1=w1;
      });
    });
    tracks.F.forEach(x=>{if(x.pair){const w0=Math.max(x.w0,x.pair.w0),w1=Math.min(x.w1,x.pair.w1);if(w0<=w1){x.w0=x.pair.w0=w0;x.w1=x.pair.w1=w1}else{x.w0=x.w1=x.pair.w0=x.pair.w1=x.b}}});
  });
  // Lignes de la glace aux moments prévus (la trame de jeu les remplace par les moments réels des changements)
  G.buildSegs=()=>{
    const cuts=new Set([0,G.T]);
    SIDES.forEach(side=>["F","D"].forEach(grp=>G.plan[side][grp].forEach(x=>{cuts.add(x.a);cuts.add(x.b)})));
    const ts=[...cuts].filter(t=>t>=0&&t<=G.T).sort((a,b)=>a-b);
    const idx={away:{F:0,D:0},home:{F:0,D:0}};
    G.segs=[];
    for(let i=0;i<ts.length-1;i++){
      const a=ts[i], b=ts[i+1]; if(b-a<1e-6) continue;
      const seg={a,b,line:{},state:stateAt(a+0.0005),forced:{away:new Set(),home:new Set()}};
      SIDES.forEach(side=>{
        seg.line[side]=[];
        ["F","D"].forEach(grp=>{
          const tr=G.plan[side][grp]; let k=idx[side][grp];
          while(k<tr.length-1&&tr[k].b<=a+1e-9) k++;
          idx[side][grp]=k;
          const x=tr[k]; if(!x||x.a>a+1e-9) return;
          x.members.forEach(m=>{seg.line[side].push({p:m.p,role:m.role});if(x.forced&&x.forced.has(m.p))seg.forced[side].add(m.p)});
        });
        // ordre habituel : centre, ailiers, attaquant de plus, défenseurs
        const ord={C:0,LW:1,RW:2,W:2,X:3,LD:4,RD:5};
        seg.line[side].sort((u,v)=>ord[u.role]-ord[v.role]);
      });
      G.segs.push(seg);
    }
  };
  // Sécurité : joueur qui doit être sur la glace (but, pénalité) et que les présences n'y ont pas mis
  function ensureOnIce(side,p,t){
    if(!p) return;
    const nat=p.grp==="D"?"D":"F", alt=nat==="D"?"F":"D", P=G.plan[side];
    const cover=g=>P[g].find(s=>s.a<=t&&t<s.b), xN=cover(nat), xA=cover(alt);
    for(const x of [xN,xA]) if(x&&x.members.some(m=>m.p===p)){x.forced=x.forced||new Set();x.forced.add(p);return true}
    // un même joueur ne peut être attaquant et défenseur en même temps : on évite une présence qui en chevauche
    // une autre où il est déjà
    const over=(x,y)=>y.a<x.b-1e-6&&y.b>x.a+1e-6;
    const conflict=(x,g)=>P[g==="D"?"F":"D"].some(y=>over(x,y)&&y.members.some(m=>m.p===p));
    const x=xN&&!conflict(xN,nat)?xN:xA&&!conflict(xA,alt)?xA:xN||xA; if(!x) return false;
    x.forced=x.forced||new Set();
    const k=x.members.findIndex(m=>!x.forced.has(m.p)); if(k<0) return false;
    x.members[k]={p,role:x.members[k].role}; x.forced.add(p);
    // conflit inévitable : il quitte les présences de l'autre groupe qui chevauchent, remplacé par un joueur libre
    const og=P.F.includes(x)?"D":"F";
    P[og].forEach(y=>{
      if(!over(x,y)) return; const j=y.members.findIndex(m=>m.p===p); if(j<0||(y.forced&&y.forced.has(p))) return;
      const busy=new Set(); ["F","D"].forEach(g=>P[g].forEach(z=>{if(over(y,z))z.members.forEach(m=>busy.add(m.p))}));
      const box=G.boxedAt(side,y.a+0.0005);
      let best=null; G.grp[side][og].concat(G.grp[side][og==="D"?"F":"D"]).forEach(q=>{if(q.active&&!busy.has(q)&&!box.has(q)&&!best)best=q});
      if(best) y.members[j]={p:best,role:y.members[j].role}; else y.members.splice(j,1);
    });
    return true;
  }
  G.goals.forEach(g=>{const tt=Math.max(perStart(g.t-0.001),g.t-0.3);[g.scorer,...g.assists].forEach(p=>ensureOnIce(g.side,p,tt))});
  G.pens.forEach(p=>{const tt=Math.max(perStart(p.t-0.001),p.t-0.3);const box=G.boxedAt(p.side,tt);if(!box.has(p.p))ensureOnIce(p.side,p.p,tt)});
  G.ensureOnIce=ensureOnIce;
  // Moments sûrs pour les tirs de chaque joueur : au cœur de ses présences, quel que soit le moment exact des changements
  G.cores=new Map();
  SIDES.forEach(side=>["F","D"].forEach(grp=>{
    const tr=G.plan[side][grp];
    tr.forEach((x,i)=>{
      const pv=tr[i-1], a=(pv?pv.w1:x.a)+3, b=x.fixedB?x.b-0.3:x.w0;
      if(b-a<0.4) return;
      const per=Math.min(Math.floor(x.a/1200)+1,G.nPer);
      x.members.forEach(m=>{if(!G.cores.has(m.p))G.cores.set(m.p,[]);G.cores.get(m.p).push({a,b,per,kind:x.kind,role:m.role})});
    });
  }));
  G.buildSegs();
  const segAt=t=>{const sg=G.segs;let lo=0,hi=sg.length-1;if(t>=G.T)return sg[hi];while(lo<=hi){const m=(lo+hi)>>1;if(t<sg[m].a)hi=m-1;else if(t>=sg[m].b)lo=m+1;else return sg[m]}return sg[Math.max(0,Math.min(sg.length-1,lo))]};
  G.segAt=segAt;

  // Sens d'attaque : on change de côté à chaque période
  G.attackDir=(side,t)=>{const per=Math.min(Math.floor(t/1200)+1,G.nPer);const hd=per%2===0?-1:1;return side==="home"?hd:-hd};
  // Tirs de chaque joueur, trame de jeu (possession, passes, mises au jeu, hors-jeu, dégagements refusés) et mises en échec : js/jeu.js
  // Événements et arrêts connus d'avance (buts, pénalités, fins de période, gardiens)
  G.goals.forEach(g=>{G.events.push({t:g.t,type:"goal",g});G.stops.push({t:g.t,type:"goal",g})});
  G.pens.forEach(p=>{G.events.push({t:p.t,type:"pen",p});G.stops.push({t:p.t,type:"pen",p})});
  for(let k=1;k*1200<G.T;k++){G.events.push({t:k*1200,type:"end",per:k});G.stops.push({t:k*1200,type:"end",per:k})}
  const at=t=>{const per=Math.min(Math.floor(t/1200)+1,G.nPer);return {per,sec:t-(per-1)*1200}};
  G.pulls.forEach(p=>{const ev={t:p.a,type:"pull",side:p.side,...at(p.a)};G.events.push(ev);G.stops.push(ev)});
  SIDES.forEach(s=>{const t=G.goalieSwap[s];if(t===undefined)return;const ev={t,type:"goalie",side:s,out:G.goalies[s][0],in:G.goalies[s][1],...at(t)};G.events.push(ev);G.stops.push(ev)});
  G.events.push({t:G.T,type:"final"});
  // à temps égal : l'événement, puis la fin de période, puis le final
  const rank=e=>e.type==="final"?2:e.type==="end"?1:0;
  G.events.sort((a,b)=>a.t-b.t||rank(a)-rank(b));
  const base=G.stops.slice();
  // coups de sifflet de la trame (au fur et à mesure du calcul) : arrêt de jeu puis mise au jeu
  G.onAdvance=()=>{
    G.stops=base.concat(G.stopsList.filter(s=>s.cause!=="period"&&s.cause!=="goal"&&s.cause!=="end").map(s=>({t:s.t,type:"whistle",cause:s.cause,x:s.x,y:s.y,side:s.side,g:s.g,pens:s.pens})));
    G.stops.sort((a,b)=>a.t-b.t);
  };
  // Tirs de chaque joueur, trame de jeu (possession, passes, mises au jeu, hors-jeu, dégagements refusés) et mises en échec : js/jeu.js
  buildPlay(G,R,mulberry32(hashStr((seedText||"x")+"|mises")),!!(opts&&opts.lazy));
  G.onAdvance();
  return G;
}
