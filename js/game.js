"use strict";

/* ---------- Construction du match ---------- */
function buildGame(S,L,seedText){
  const rng=mulberry32(hashStr(seedText||"x"));
  const R=()=>rng();
  const G={S,team:{},roster:{},goalie:{},goalies:{},goalieSwap:{},pulls:[],hits:[],units:{},grp:{},diag:{},goals:[],pens:[],shots:[],segs:[],kfs:[],events:[],stops:[]};
  let pid=0;
  SIDES.forEach(side=>{
    G.team[side]=teamInfo(S[side]);
    G.roster[side]=S.players[side].map(p=>({...p,id:"p"+(pid++),side,last:lastName(p.name),pos:L.pos[norm(p.name)]||null}));
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
    const p={name:titleCase(raw.replace(/^[A-Za-z]\.\s*/,"")),g:0,a:0,p:0,pm:0,pim:0,s:0,ht:0,it:10,id:"p"+(pid++),side,last:titleCase(last),pos:null,ghost:true};
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
  // Pénalités
  S.pens.forEach(p=>{
    const side=sideOf(p.abbr,p.name); if(!side) return;
    const k=p.kind.toLowerCase();
    let dur=120, label="2 min";
    if(/double/.test(k)){dur=240;label="4 min"}
    else if(/game misconduct|match/.test(k)){dur=/match/.test(k)?300:0;label=/match/.test(k)?"pénalité de match":"inconduite de partie"}
    else if(/misconduct/.test(k)){dur=0;label="10 min, inconduite"}
    else if(/major/.test(k)){dur=300;label="5 min"}
    G.pens.push({t:p.t,per:p.per,sec:p.sec,side,p:findPlayer(side,p.name),inf:infrFr(p.inf),label,dur,strength:dur>0,misc:dur===0});
  });
  G.pens.sort((a,b)=>a.t-b.t);
  // Gardiens
  const gl={away:[],home:[]}; const unassigned=[];
  S.goalies.forEach(g=>{const s=sideOf(g.abbr,null); if(s) gl[s].push(g); else unassigned.push(g)});
  SIDES.forEach(s=>{if(!gl[s].length&&unassigned.length) gl[s].push(unassigned.shift())});
  SIDES.forEach(s=>{
    const mk=(g,id)=>({id,side:s,name:g?g.name:"Gardien",last:g?lastName(g.name):"Gardien",grp:"G",stat:g||null});
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
    T.es.slice(0,4).forEach((row,i)=>{if(i>=nF)return;["C","LW","RW"].forEach((r,k)=>{const p=byName(row[k]);if(p&&p.grp==="F"&&!used.has(p)){fl[i][r]=p;used.add(p);placed.add(p)}})});
    const poolF=()=>F.filter(p=>!used.has(p));
    fl.forEach(line=>["C","LW","RW"].forEach(r=>{if(line[r])return;const p=poolF().find(q=>q.pos===r);if(p){line[r]=p;used.add(p)}}));
    fl.forEach(line=>["C","LW","RW"].forEach(r=>{if(line[r])return;const p=poolF()[0];if(p){line[r]=p;used.add(p)}}));
    const nD=Math.max(1,Math.min(3,Math.floor(D.length/2)));
    const dp=[...Array(nD)].map(()=>[null,null]); const usedD=new Set();
    T.es.slice(0,3).forEach((row,i)=>{if(i>=nD)return;[3,4].forEach((k,j)=>{const p=byName(row[k]);if(p&&p.grp==="D"&&!usedD.has(p)){dp[i][j]=p;usedD.add(p);placed.add(p)}})});
    dp.forEach(pr=>[0,1].forEach(j=>{if(pr[j])return;const p=D.find(q=>!usedD.has(q));if(p){pr[j]=p;usedD.add(p)}}));
    const mkUnit=(row,roles,nf,nd,avoid)=>{
      const u={F:[],D:[]};
      if(row) row.forEach((n,k)=>{const p=byName(n);if(!p)return;const isD=roles[k]==="D";
        if(isD&&p.grp==="D"&&u.D.length<nd&&!u.D.includes(p)){u.D.push(p);placed.add(p)}
        else if(!isD&&p.grp==="F"&&u.F.length<nf&&!u.F.includes(p)){u.F.push(p);placed.add(p)}});
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
  function lineup(side,st,c,boxed){
    const U=G.units[side]; let Lr;
    if(st.kind==="PP"){const u=U.PP[c.pp%U.PP.length];Lr=[{p:u.F[0],role:"C"},{p:u.F[1],role:"LW"},{p:u.F[2],role:"RW"},{p:u.D[0],role:"LD"},{p:u.D[1],role:"RD"}];if(st.n===4)Lr.splice(2,1);if(st.n===3)Lr.splice(1,2)}
    else if(st.kind==="PK"){const u=U.PK[c.pk%U.PK.length];Lr=[{p:u.F[0],role:"C"},{p:u.F[1],role:"W"},{p:u.D[0],role:"LD"},{p:u.D[1],role:"RD"}];if(st.n===3)Lr.splice(1,1)}
    else{const f=U.F[c.f%U.F.length],d=U.D[c.d%U.D.length];Lr=[{p:f.C,role:"C"},{p:f.LW,role:"LW"},{p:f.RW,role:"RW"},{p:d[0],role:"LD"},{p:d[1],role:"RD"}];if(st.n===4)Lr.splice(2,1);if(st.n===3)Lr.splice(1,2)}
    const inL=new Set(); const gl=G.grp[side];
    const out=Lr.map(e=>{
      let p=e.p;
      if(!p||boxed.has(p)||inL.has(p)){
        const isD=e.role==="LD"||e.role==="RD";
        const list=(isD?gl.D:gl.F).concat(isD?gl.F:gl.D);
        p=list.find(q=>!boxed.has(q)&&!inL.has(q)&&!Lr.some(x=>x.p===q))||null;
      }
      if(p) inL.add(p);
      return {p,role:e.role};
    }).filter(e=>e.p);
    // gardien retiré : un attaquant de plus
    if(st.pulled){const x=gl.F.concat(gl.D).find(q=>!boxed.has(q)&&!inL.has(q));if(x)out.push({p:x,role:"X"})}
    return out;
  }
  const pickNext=(last,n,w,excl)=>{if(n<=1)return 0;const ws=w.slice(0,n).map((x,i)=>excl&&i===last?0:x);const tot=ws.reduce((a,b)=>a+b,0);let r=R()*tot;for(let i=0;i<n;i++){r-=ws[i];if(r<=0)return i}return n-1};
  const B=new Set([0,G.T]); for(let x=1200;x<G.T;x+=1200) B.add(x);
  G.pens.forEach(p=>{if(p.t<G.T)B.add(p.t);if(p.end<G.T)B.add(p.end);if(p.boxEnd<G.T)B.add(p.boxEnd)});
  G.pulls.forEach(p=>{if(p.a<G.T)B.add(p.a);if(p.b<G.T)B.add(p.b)});
  G.goals.forEach(g=>{if(g.t+0.05<G.T)B.add(g.t+0.05)});
  const bs=[...B].sort((a,b)=>a-b);
  const ctx={away:{f:0,d:0,pp:0,pk:0,ppStart:0,last:null},home:{f:0,d:0,pp:0,pk:0,ppStart:0,last:null}};
  const perStarts=new Set([...Array(G.nPer)].map((_,i)=>i*1200));
  for(let i=0;i<bs.length-1;i++){
    const a=bs[i],b=bs[i+1]; if(b-a<0.001) continue;
    const st=stateAt(a+0.0005); let cur=a;
    while(cur<b-0.001){
      const special=st.away.kind!=="ES";
      const len=special?42+R()*20:34+R()*22;
      let e=Math.min(b,cur+len); if(b-e<14) e=b;
      const seg={a:cur,b:e,line:{},state:st,forced:{away:new Set(),home:new Set()}};
      SIDES.forEach(side=>{
        const c=ctx[side],k=st[side].kind;
        if(k==="ES"){
          if(perStarts.has(cur)){c.f=0;c.d=0}
          else{c.f=pickNext(c.f,G.units[side].F.length,[1,.82,.6,.38],c.last==="ES");
               if(R()<0.72||c.last!=="ES") c.d=pickNext(c.d,G.units[side].D.length,[1,.85,.62],c.last==="ES")}
        } else if(k==="PP"){if(c.last!=="PP")c.ppStart=cur;c.pp=(cur-c.ppStart)<62?0:1}
        else{c.pk=c.last==="PK"?c.pk+1:0}
        c.last=k;
        seg.line[side]=lineup(side,st[side],c,G.boxedAt(side,cur+0.0005));
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
  const perStart=t=>Math.min(Math.floor(t/1200),G.nPer-1)*1200;
  G.goals.forEach(g=>{const tt=Math.max(perStart(g.t-0.001),g.t-0.3);[g.scorer,...g.assists].forEach(p=>ensureOnIce(g.side,p,tt))});
  G.pens.forEach(p=>{const tt=Math.max(perStart(p.t-0.001),p.t-0.3);const box=G.boxedAt(p.side,tt);if(!box.has(p.p))ensureOnIce(p.side,p.p,tt)});

  // Tirs
  const periods=[...Array(G.nPer)].map((_,i)=>i+1);
  const perEnd=per=>Math.min(per*1200,G.T);
  // Tirs de prolongation : une colonne par prolongation, sinon le total « OT » réparti selon la durée.
  const otDur=per=>perEnd(per)-(per-1)*1200, otAll=periods.filter(p=>p>3).reduce((a,p)=>a+otDur(p),0);
  const otCum=per=>periods.filter(p=>p>3&&p<=per).reduce((a,p)=>a+otDur(p),0);
  const otShare=(total,per)=>Math.round(total*otCum(per)/otAll)-Math.round(total*(otCum(per)-otDur(per))/otAll);
  const anchors=[...G.goals.map(g=>g.t),...G.pens.map(p=>p.t)];
  G.goals.forEach(g=>G.shots.push({t:g.t,side:g.side,p:g.scorer,goal:g}));
  const fallbackTotal=s=>G.roster[s].reduce((a,p)=>a+p.s,0);
  periods.forEach(per=>{
    const a=(per-1)*1200, b=perEnd(per);
    SIDES.forEach(side=>{
      const row=S.shotRows[side][0];
      let total;
      if(!row||row.length<4) total=per<=3?Math.round(fallbackTotal(side)/3):0;
      else if(per<=3) total=row[per-1]||0;
      else if(row.length===4) total=0;
      else if(G.nPer>4&&row.length===G.nPer+1) total=row[per-1]||0;
      else total=otShare(row[3]||0,per);
      const gc=G.goals.filter(g=>g.side===side&&g.per===per).length;
      const n=Math.max(0,total-gc);
      for(let i=0;i<n;i++){
        let placed=false;
        for(let tries=0;tries<60&&!placed;tries++){
          const span=b-a; const t=span>14?a+8+R()*(span-11):a+R()*span;
          const ss=stateAt(t)[side], kind=ss.kind; const acc=ss.pulled||kind==="PP"?1:kind==="PK"?0.3:0.65;
          if(tries<45&&R()>acc) continue;
          if(G.shots.some(s=>Math.abs(s.t-t)<2.6)) continue;
          if(G.pulledAt(other(side),t)) continue; // pas de tir au but contre un filet désert
          if(anchors.some(x=>Math.abs(x-t)<4)) continue;
          G.shots.push({t,side,p:null,goal:null}); placed=true;
        }
      }
    });
  });
  G.shots.sort((a,b)=>a.t-b.t);
  const rem=new Map(); SIDES.forEach(s=>G.roster[s].forEach(p=>rem.set(p,p.s)));
  G.goals.forEach(g=>{if(g.scorer)rem.set(g.scorer,Math.max(0,(rem.get(g.scorer)||0)-1))});
  const wpick=(list,wf)=>{const tot=list.reduce((a,p)=>a+wf(p),0);if(tot<=0)return list[Math.floor(R()*list.length)];let r=R()*tot;for(const p of list){r-=wf(p);if(r<=0)return p}return list[list.length-1]};
  G.shots.forEach(s=>{
    if(s.goal) return;
    const seg=segAt(s.t); const on=seg.line[s.side].map(e=>e.p);
    let c=on.filter(p=>(rem.get(p)||0)>0), p;
    if(c.length) p=wpick(c,q=>rem.get(q));
    else{
      const boxed=G.boxedAt(s.side,s.t);
      const g=G.roster[s.side].filter(q=>q.active&&(rem.get(q)||0)>0&&!boxed.has(q));
      if(g.length){p=wpick(g,q=>rem.get(q));ensureOnIce(s.side,p,s.t)}
      else p=wpick(on,q=>q.s+1);
    }
    s.p=p; rem.set(p,Math.max(0,(rem.get(p)||0)-1));
  });

  // Trajectoire de la rondelle
  G.attackDir=(side,t)=>{const per=Math.min(Math.floor(t/1200)+1,G.nPer);const hd=per%2===0?-1:1;return side==="home"?hd:-hd};
  const roleOf=(side,p,t)=>{const e=segAt(t).line[side].find(x=>x.p===p);return e?e.role:"C"};
  const kfs=G.kfs;
  const clampR=(x,y)=>{x=clamp(x,-96,96);y=clamp(y,-39.5,39.5);const ax=Math.abs(x),ay=Math.abs(y);if(ax>72&&ay>14.5){const cx=Math.sign(x)*72,cy=Math.sign(y)*14.5;const dx=x-cx,dy=y-cy;const d=Math.hypot(dx,dy);if(d>25){x=cx+dx/d*25;y=cy+dy/d*25}}return {x,y}};
  const push=(t,x,y,side,kind,owner)=>{const p=clampR(x,y);kfs.push({t,x:p.x,y:p.y,side:side||null,kind,owner:owner||null})};
  let st={x:0,y:0,side:null};
  const fill=(from,to)=>{
    let t=from;
    while(true){
      const step=2.2+R()*2.6; if(t+step>to-0.7) break; t+=step;
      if(!st.side||R()<0.33) st.side=R()<0.5?"home":"away";
      const dir=G.attackDir(st.side,t); const up=dir*st.x;
      const u=clamp(up-22+R()*55,-80,82); const v=clamp(st.y*0.3-30+R()*60,-36,36);
      push(t,dir*u,v,st.side,"play"); st.x=kfs[kfs.length-1].x; st.y=kfs[kfs.length-1].y;
    }
  };
  const face=(t0,x,y,hold)=>{push(t0,x,y,null,"face");push(t0+hold,x,y,null,"face");st={x,y,side:null}};
  periods.forEach(per=>{
    const a=(per-1)*1200, b=perEnd(per);
    face(a,0,0,1.5); let cursor=a+1.5;
    const an=[...G.shots.filter(s=>s.t>a&&s.t<=b).map(s=>({type:"shot",t:s.t,s})),
              ...G.pens.filter(p=>p.t>=a&&p.t<b).map(p=>({type:"pen",t:p.t,p}))].sort((x,y)=>x.t-y.t);
    an.forEach(ev=>{
      if(ev.type==="pen"){
        if(G.shots.some(s=>Math.abs(s.t-ev.t)<1.2)) return;
        if(ev.t<=cursor+0.2) return;
        fill(cursor,ev.t); push(ev.t,st.x,st.y,null,"whistle");
        const dP=G.attackDir(ev.p.side,ev.t); const fy=R()<0.5?-22:22;
        face(ev.t+0.05,-dP*69,fy,1.4); cursor=ev.t+1.45; return;
      }
      const s=ev.s, dir=G.attackDir(s.side,s.t);
      const plan=[[s.t-8,-12+R()*22,-20+R()*40,null],[s.t-4.5,26+R()*8,-25+R()*50,null],[s.t-2,50+R()*24,-28+R()*56,s.goal&&s.goal.assists[0]||null]];
      const role=roleOf(s.side,s.p,s.t); const isD=role==="LD"||role==="RD";
      const sv=isD?(R()<0.5?-1:1)*(10+R()*12):-17+R()*34;
      plan.push([s.t-0.6,isD?55+R()*7:64+R()*15,sv,s.p]);
      const firstT=plan.find(q=>q[0]>cursor+0.5);
      if(firstT) fill(cursor,firstT[0]);
      plan.forEach(([t,u,v,ow])=>{if(t>cursor+0.4){push(t,dir*u,v,s.side,"play",ow);cursor=t}});
      const ny=-2.5+R()*5;
      if(s.goal){
        push(s.t,dir*91.2,ny*0.6,s.side,"goal",s.p);
        if(s.t<b-0.5){face(s.t+0.06,0,0,1.6);cursor=s.t+1.66}else cursor=s.t;
      } else {
        push(s.t,dir*87.6,ny,s.side,"shot",s.p);
        if(R()<0.45&&s.t+2<b){push(s.t+0.35,dir*86,ny*0.5,null,"save");face(s.t+0.4,dir*69,R()<0.5?-22:22,1.4);cursor=s.t+1.8}
        else{push(s.t+0.6,dir*(70+R()*14),-28+R()*56,null,"loose");st={x:kfs[kfs.length-1].x,y:kfs[kfs.length-1].y,side:other(s.side)};cursor=s.t+0.6}
      }
    });
    if(cursor<b-0.8) fill(cursor,b);
    if(!(otGoal&&per===G.nPer)) push(b,st.x,st.y,null,"end");
  });
  kfs.sort((a,b)=>a.t-b.t);

  // Mises en échec (colonne HT) : quand le joueur est sur la glace et que l'adversaire a la rondelle
  const Rh=mulberry32(hashStr((seedText||"x")+"|mises"));
  const busy=[...G.shots.map(s=>s.t),...G.pens.map(p=>p.t),...periods.map(p=>(p-1)*1200),G.T];
  SIDES.forEach(side=>G.roster[side].forEach(p=>{
    if(!p.ht) return;
    const segs=G.segs.filter(sg=>sg.b-sg.a>6&&sg.line[side].some(e=>e.p===p));
    const tot=segs.reduce((a,sg)=>a+sg.b-sg.a,0);
    for(let i=0;i<p.ht&&segs.length;i++){
      for(let tries=0;tries<40;tries++){
        let r=Rh()*tot, sg=segs[segs.length-1];
        for(const x of segs){r-=x.b-x.a;if(r<=0){sg=x;break}}
        const t=sg.a+2+Rh()*(sg.b-sg.a-4);
        if(busy.some(x=>Math.abs(x-t)<3)||G.hits.some(h=>Math.abs(h.t-t)<4)) continue;
        if(tries<30&&puckAt(G,t).side!==other(side)) continue;
        G.hits.push({t,side,p}); break;
      }
    }
  }));
  G.hits.sort((a,b)=>a.t-b.t);

  // Événements et arrêts
  G.goals.forEach(g=>{G.events.push({t:g.t,type:"goal",g});G.stops.push({t:g.t,type:"goal",g})});
  G.pens.forEach(p=>{G.events.push({t:p.t,type:"pen",p});G.stops.push({t:p.t,type:"pen",p})});
  for(let k=1;k*1200<G.T;k++){G.events.push({t:k*1200,type:"end",per:k});G.stops.push({t:k*1200,type:"end",per:k})}
  const at=t=>{const per=Math.min(Math.floor(t/1200)+1,G.nPer);return {per,sec:t-(per-1)*1200}};
  G.pulls.forEach(p=>{const ev={t:p.a,type:"pull",side:p.side,...at(p.a)};G.events.push(ev);G.stops.push(ev)});
  SIDES.forEach(s=>{const t=G.goalieSwap[s];if(t===undefined)return;const ev={t,type:"goalie",side:s,out:G.goalies[s][0],in:G.goalies[s][1],...at(t)};G.events.push(ev);G.stops.push(ev)});
  G.events.push({t:G.T,type:"final"});
  // à temps égal : l'événement, puis la fin de période, puis le final
  const rank=e=>e.type==="final"?2:e.type==="end"?1:0;
  G.events.sort((a,b)=>a.t-b.t||rank(a)-rank(b)); G.stops.sort((a,b)=>a.t-b.t);
  return G;
}

/* ---------- Position de la rondelle et des joueurs ---------- */
function puckAt(G,t){
  const k=G.kfs; if(!k.length) return {x:0,y:0,side:null,prev:null,next:null};
  let lo=0,hi=k.length-1;
  if(t<=k[0].t) return {x:k[0].x,y:k[0].y,side:k[0].side,prev:k[0],next:k[0]};
  if(t>=k[hi].t) return {x:k[hi].x,y:k[hi].y,side:k[hi].side,prev:k[hi],next:k[hi]};
  while(hi-lo>1){const m=(lo+hi)>>1;if(k[m].t<=t)lo=m;else hi=m}
  const a=k[lo],b=k[hi]; let f=(t-a.t)/Math.max(1e-6,b.t-a.t);
  if(b.kind==="play"||b.kind==="loose") f=f*f*(3-2*f);
  if(a.kind==="goal"||a.kind==="whistle"||a.kind==="end") f=0;
  return {x:lerp(a.x,b.x,f),y:lerp(a.y,b.y,f),side:b.side||a.side,prev:a,next:b};
}
function targetsAt(G,t){
  const pk=puckAt(G,t), seg=G.segAt(t), out=[];
  const faceMode=pk.prev&&pk.next&&pk.prev.kind==="face"&&pk.next.kind==="face";
  const ownerNext=pk.next&&pk.next.owner&&(pk.next.t-t)<2.6?pk.next.owner:null;
  SIDES.forEach(side=>{
    const dir=G.attackDir(side,t); const Ln=seg.line[side]; const off=pk.side===side; const ph0=side==="home"?0:1.7;
    const arr=[];
    Ln.forEach((e,i)=>{
      let x,y; const r=e.role;
      if(faceMode){
        const fx=pk.x,fy=pk.y;
        if(r==="C"){x=fx-dir*2.4;y=fy}
        else if(r==="LW"||r==="W"){x=fx-dir*4;y=fy-dir*13}
        else if(r==="RW"){x=fx-dir*4;y=fy+dir*13}
        else if(r==="X"){x=fx-dir*7;y=fy}
        else if(r==="LD"){x=fx-dir*19;y=fy-dir*9}
        else {x=fx-dir*19;y=fy+dir*9}
      } else if(off){
        const pu=dir*pk.x,pv=pk.y; let u,v;
        if(r==="C"){u=pu-8;v=pv*0.45}
        else if(r==="LW"){u=pu+2;v=lerp(pv,-dir*22,0.65)}
        else if(r==="RW"||r==="W"){u=pu+2;v=lerp(pv,dir*22,0.65)}
        else if(r==="X"){u=Math.min(pu+14,80);v=pv*0.2}
        else if(r==="LD"){u=clamp(pu-35,-78,34);v=lerp(pv*0.3,-dir*16,0.7)}
        else {u=clamp(pu-35,-78,34);v=lerp(pv*0.3,dir*16,0.7)}
        x=dir*u;y=v;
      } else {
        const dd=-dir; const du=dd*pk.x, pv=pk.y; let u,v;
        if(r==="C"){u=du-6;v=pv*0.6}
        else if(r==="LW"||r==="W"){u=du<-25?Math.max(du+28,-55):du-12;v=lerp(pv,-dd*18,0.55)}
        else if(r==="RW"){u=du<-25?Math.max(du+28,-55):du-12;v=lerp(pv,dd*18,0.55)}
        else if(r==="X"){u=du-14;v=pv*0.3}
        else if(r==="LD"){u=clamp(du-20,-84,10);v=lerp(pv*0.5,-dd*10,0.5)}
        else {u=clamp(du-20,-84,10);v=lerp(pv*0.5,dd*10,0.5)}
        x=dd*u;y=v;
      }
      if(!faceMode){const ph=hashStr(e.p.id)%628/100+ph0;x+=Math.sin(t*0.9+ph)*1.8;y+=Math.cos(t*1.13+ph*1.7)*1.8}
      arr.push({p:e.p,role:r,side,x,y});
    });
    if(off&&!faceMode&&arr.length){
      let car=ownerNext&&arr.find(o=>o.p===ownerNext);
      if(!car){let best=1e9;arr.forEach(o=>{const d=Math.hypot(o.x-pk.x,o.y-pk.y)+((o.role==="LD"||o.role==="RD")&&dir*pk.x>20?25:0);if(d<best){best=d;car=o}})}
      if(car){car.x=pk.x-dir*1.9;car.y=pk.y+0.9;car.carrier=true}
    }
    arr.forEach(o=>{const c=clampPos(o.x,o.y);o.x=c.x;o.y=c.y;out.push(o)});
    const g=G.goalieAt(side,t);
    if(G.pulledAt(side,t)) out.push({p:g,role:"G",side,x:BENCH[side].x+11,y:BENCH[side].y});
    else out.push({p:g,role:"G",side,x:-dir*85.6,y:clamp(pk.y*0.12,-3,3)});
  });
  // le joueur qui frappe rejoint le porteur de la rondelle adverse
  const HW=1.6;
  G.hits.forEach(h=>{
    const dt=t-h.t; if(dt<-HW||dt>HW) return;
    const me=out.find(o=>o.p===h.p); if(!me) return;
    const opp=out.filter(o=>o.side!==h.side&&o.role!=="G"); if(!opp.length) return;
    const tg=opp.find(o=>o.carrier)||opp.reduce((a,o)=>Math.hypot(o.x-pk.x,o.y-pk.y)<Math.hypot(a.x-pk.x,a.y-pk.y)?o:a);
    const w=1-Math.abs(dt)/HW, dir=G.attackDir(h.side,t);
    me.x=lerp(me.x,tg.x-dir*2.4,w); me.y=lerp(me.y,tg.y,w);
  });
  return {list:out,puck:pk,seg};
}
function clampPos(x,y){x=clamp(x,-97,97);y=clamp(y,-40,40);const ax=Math.abs(x),ay=Math.abs(y);if(ax>72&&ay>14.5){const cx=Math.sign(x)*72,cy=Math.sign(y)*14.5;const dx=x-cx,dy=y-cy;const d=Math.hypot(dx,dy);if(d>25.5){x=cx+dx/d*25.5;y=cy+dy/d*25.5}}return {x,y}}
