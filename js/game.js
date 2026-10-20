"use strict";

/* ---------- Construction du match ---------- */
function buildGame(S,L,seedText){
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

  // Présences (segments)
  function lineup(side,st,c,boxed,must){
    const U=G.units[side]; let Lr;
    if(st.kind==="PP"){const u=U.PP[c.pp%U.PP.length];Lr=[{p:u.F[0],role:"C"},{p:u.F[1],role:"LW"},{p:u.F[2],role:"RW"},{p:u.D[0],role:"LD"},{p:u.D[1],role:"RD"}];if(st.n===4)Lr.splice(2,1);if(st.n===3)Lr.splice(1,2)}
    else if(st.kind==="PK"){const u=U.PK[c.pk%U.PK.length];Lr=[{p:u.F[0],role:"C"},{p:u.F[1],role:"W"},{p:u.D[0],role:"LD"},{p:u.D[1],role:"RD"}];if(st.n===3)Lr.splice(1,1)}
    else{const f=U.F[c.f%U.F.length],d=U.D[c.d%U.D.length];Lr=[{p:f.C,role:"C"},{p:f.LW,role:"LW"},{p:f.RW,role:"RW"},{p:d[0],role:"LD"},{p:d[1],role:"RD"}];if(st.n===4)Lr.splice(2,1);if(st.n===3)Lr.splice(1,2)}
    const inL=new Set(); const gl=G.grp[side];
    const free=q=>!boxed.has(q)&&!inL.has(q)&&!Lr.some(x=>x.p===q);
    const neediest=list=>{let best=null;list.forEach(q=>{if(free(q)&&(!best||need(q)>need(best)))best=q});return best};
    const out=Lr.map(e=>{
      let p=e.p; const isD=e.role==="LD"||e.role==="RD";
      // Joueur déjà au-delà de son temps de glace (blessé en cours de match, peu utilisé) :
      // remplacé par le joueur de la même position qui en manque le plus.
      if(p&&!boxed.has(p)&&!inL.has(p)&&need(p)<-Math.max(20,0.05*(want.get(p)||0))){
        const q=neediest(isD?gl.D:gl.F); if(q&&need(q)>0) p=q;
      }
      if(!p||boxed.has(p)||inL.has(p)) p=neediest(isD?gl.D:gl.F)||neediest(isD?gl.F:gl.D);
      if(p) inL.add(p);
      return {p,role:e.role};
    }).filter(e=>e.p);
    // gardien retiré : un attaquant de plus
    if(st.pulled){const x=neediest(gl.F)||neediest(gl.D);if(x)out.push({p:x,role:"X"})}
    // Marqueur, passeurs et joueur pénalisé sont sur la glace au moment de l'action : ils prennent
    // la place du joueur de leur position qui a le moins besoin de temps de glace.
    (must||[]).forEach(m=>{
      if(!m||boxed.has(m)||out.some(x=>x.p===m)) return;
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
  const ctx={away:{f:0,d:0,pp:0,pk:0,ppStart:0,last:null},home:{f:0,d:0,pp:0,pk:0,ppStart:0,last:null}};
  const perStarts=new Set([...Array(G.nPer)].map((_,i)=>i*1200));
  for(let i=0;i<bs.length-1;i++){
    const a=bs[i],b=bs[i+1]; if(b-a<0.001) continue;
    const st=stateAt(a+0.0005); let cur=a;
    while(cur<b-0.001){
      const special=st.away.kind!=="ES";
      const len=special?42+R()*20:34+R()*22;
      let e=Math.min(b,cur+len); if(b-e<14) e=b;
      // pas de changement de trio dans les 6 secondes qui précèdent un but : le but et ses passes se jouent sur une même présence
      if(e<b&&G.goals.some(g=>g.t>e&&g.t-e<6&&g.t<=b+0.06)) e=b;
      const seg={a:cur,b:e,line:{},state:st,forced:{away:new Set(),home:new Set()},free:e<b};   // free : changement de trio ordinaire, sans arrêt de jeu imposé
      SIDES.forEach(side=>{
        const c=ctx[side],k=st[side].kind;
        if(k==="ES"){
          const U=G.units[side];
          if(perStarts.has(cur)){c.f=0;c.d=0}
          else{c.f=pickUnit(U.F,c.f,c.last==="ES",f=>[f.C,f.LW,f.RW]);
               c.d=pickUnit(U.D,c.d,c.last==="ES",d=>d)}
        } else if(k==="PP"){if(c.last!=="PP")c.ppStart=cur;c.pp=(cur-c.ppStart)<62?0:1}
        else{c.pk=c.last==="PK"?c.pk+1:0}
        c.last=k;
        const must=[];
        G.goals.forEach(g=>{const tt=Math.max(perStart(g.t-0.001),g.t-0.3);if(g.side===side&&tt>=cur&&tt<e)must.push(g.scorer,...g.assists)});
        G.pens.forEach(p=>{const tt=Math.max(perStart(p.t-0.001),p.t-0.3);if(p.side===side&&p.p&&tt>=cur&&tt<e&&!G.boxedAt(side,tt).has(p.p))must.push(p.p)});
        seg.line[side]=lineup(side,st[side],c,G.boxedAt(side,cur+0.0005),must.filter(Boolean));
        seg.line[side].forEach(x=>toi.set(x.p,(toi.get(x.p)||0)+(e-cur)));
      });
      G.segs.push(seg); cur=e;
    }
  }
  const segAt=t=>{const sg=G.segs;let lo=0,hi=sg.length-1;if(t>=G.T)return sg[hi];while(lo<=hi){const m=(lo+hi)>>1;if(t<sg[m].a)hi=m-1;else if(t>=sg[m].b)lo=m+1;else return sg[m]}return sg[Math.max(0,Math.min(sg.length-1,lo))]};
  G.segAt=segAt;
  function ensureOnIce(side,p,t){
    if(!p) return; const seg=segAt(t); if(!seg) return; const Ln=seg.line[side]; const F=seg.forced[side];
    if(Ln.some(e=>e.p===p)){F.add(p);return}
    const isDrole=r=>r==="LD"||r==="RD";
    let idx=Ln.findIndex(e=>!F.has(e.p)&&(isDrole(e.role)===(p.grp==="D")));
    if(idx<0) idx=Ln.findIndex(e=>!F.has(e.p));
    if(idx<0) return;
    Ln[idx]={p,role:Ln[idx].role}; F.add(p);
  }
  G.goals.forEach(g=>{const tt=Math.max(perStart(g.t-0.001),g.t-0.3);[g.scorer,...g.assists].forEach(p=>ensureOnIce(g.side,p,tt))});
  G.pens.forEach(p=>{const tt=Math.max(perStart(p.t-0.001),p.t-0.3);const box=G.boxedAt(p.side,tt);if(!box.has(p.p))ensureOnIce(p.side,p.p,tt)});
  G.ensureOnIce=ensureOnIce;

  // Sens d'attaque : on change de côté à chaque période
  G.attackDir=(side,t)=>{const per=Math.min(Math.floor(t/1200)+1,G.nPer);const hd=per%2===0?-1:1;return side==="home"?hd:-hd};
  // Tirs de chaque joueur, trame de jeu (possession, passes, mises au jeu, hors-jeu, dégagements refusés) et mises en échec : js/jeu.js
  buildPlay(G,R,mulberry32(hashStr((seedText||"x")+"|mises")));

  // Événements et arrêts
  G.goals.forEach(g=>{G.events.push({t:g.t,type:"goal",g});G.stops.push({t:g.t,type:"goal",g})});
  G.pens.forEach(p=>{G.events.push({t:p.t,type:"pen",p});G.stops.push({t:p.t,type:"pen",p})});
  for(let k=1;k*1200<G.T;k++){G.events.push({t:k*1200,type:"end",per:k});G.stops.push({t:k*1200,type:"end",per:k})}
  const at=t=>{const per=Math.min(Math.floor(t/1200)+1,G.nPer);return {per,sec:t-(per-1)*1200}};
  G.pulls.forEach(p=>{const ev={t:p.a,type:"pull",side:p.side,...at(p.a)};G.events.push(ev);G.stops.push(ev)});
  SIDES.forEach(s=>{const t=G.goalieSwap[s];if(t===undefined)return;const ev={t,type:"goalie",side:s,out:G.goalies[s][0],in:G.goalies[s][1],...at(t)};G.events.push(ev);G.stops.push(ev)});
  // coups de sifflet de la trame : arrêt de jeu puis mise au jeu (début de période, buts et fins de période sont déjà là)
  G.stopsList.forEach(s=>{if(s.cause!=="period"&&s.cause!=="goal"&&s.cause!=="end")G.stops.push({t:s.t,type:"whistle",cause:s.cause,x:s.x,y:s.y,side:s.side,g:s.g,pens:s.pens})});
  G.events.push({t:G.T,type:"final"});
  // à temps égal : l'événement, puis la fin de période, puis le final
  const rank=e=>e.type==="final"?2:e.type==="end"?1:0;
  G.events.sort((a,b)=>a.t-b.t||rank(a)-rank(b)); G.stops.sort((a,b)=>a.t-b.t);
  return G;
}
