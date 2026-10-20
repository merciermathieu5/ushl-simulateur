"use strict";

/* ---------- Trame de jeu ----------
   Les données du match (buts, pénalités, présences calibrées sur le temps de glace, tirs de chaque
   joueur) deviennent une trame de jeu suivie, comme dans les suivis de match en ligne : la rondelle
   passe de joueur en joueur, une équipe sort de sa zone, traverse la zone neutre, entre en zone
   adverse et tire au moment prévu, avec les passes décisives de la feuille de match.

   Arrêts de jeu et mises au jeu suivent les règles (LNH, règles 76, 81 et 83) :
   - début de période et après un but : point central;
   - gardien qui immobilise la rondelle : zone de son équipe, du côté du tir;
   - pénalité : zone de l'équipe pénalisée;
   - dégagement refusé : zone de l'équipe fautive;
   - hors-jeu : point de la zone neutre devant la zone où il y a eu hors-jeu, du côté où la rondelle a franchi la ligne;
   - rondelle envoyée hors de la patinoire par l'équipe en attaque dans sa zone offensive : zone neutre;
   - pénalités coïncidentes : point le plus proche de l'arrêt de jeu.
   Au moment de la mise au jeu, seuls les deux centres sont dans le cercle; les ailiers sont sur les
   lignes de mise au jeu et les défenseurs derrière.

   Coordonnées en pieds : centre (0,0), lignes des buts à x = ±89, lignes bleues à ±25,
   points de mise au jeu à (±69, ±22) en zone, (±20, ±22) en zone neutre.
   Dans le repère d'une équipe, u avance vers le filet qu'elle attaque et w < 0 est sa gauche. */

const RK={GOAL:89,BLUE:25,EZX:69,NZX:20,DOTY:22,HALFW:42.5,HALFL:100,CORNER:28};
const SPD={pass:62,shot:88,dump:68};
// Fréquences du jeu libre (par décision du porteur), réglées pour donner les moyennes d'un match de la LNH :
// une cinquantaine de mises au jeu, 6 à 10 dégagements refusés, 4 à 8 hors-jeu par match.
const PJ={turnD:0.08,icing:0.085,turnN:0.08,offside:0.085,controlled:0.5,turnO:0.22,out:0.07,freeze:0.5,logTurn:0.45};
const isDrole=r=>r==="LD"||r==="RD";
const otherSide=s=>s==="home"?"away":"home";
// les huit points de mise au jeu hors du centre
const DOTS=[[-RK.EZX,-RK.DOTY],[-RK.EZX,RK.DOTY],[-RK.NZX,-RK.DOTY],[-RK.NZX,RK.DOTY],[RK.NZX,-RK.DOTY],[RK.NZX,RK.DOTY],[RK.EZX,-RK.DOTY],[RK.EZX,RK.DOTY]];

function inRink(x,y,m){
  m=m===undefined?2:m;
  const hx=RK.HALFL-m, hy=RK.HALFW-m; x=clamp(x,-hx,hx); y=clamp(y,-hy,hy);
  const cx=RK.HALFL-RK.CORNER, cy=RK.HALFW-RK.CORNER, r=RK.CORNER-m, ax=Math.abs(x), ay=Math.abs(y);
  if(ax>cx&&ay>cy){const dx=ax-cx,dy=ay-cy,d=Math.hypot(dx,dy);if(d>r){x=Math.sign(x)*(cx+dx/d*r);y=Math.sign(y)*(cy+dy/d*r)}}
  return {x,y};
}
function clampPos(x,y){return inRink(x,y,1.5)}
// vitesse de patinage avec la rondelle (pieds/s) selon la cote de vitesse (SP) de la page des alignements
const carrySpeed=p=>18+clamp(((p&&p.sp)||72)-50,0,50)*0.12;

/* ---------- Placement tactique ----------
   Une seule fonction place chaque joueur selon la rondelle, la possession et la zone : elle sert à
   bâtir la trame (où aller porter une passe) et à animer les joueurs (targetsAt). */
function formation(G,t,c){
  // c : {x,y rondelle, poss équipe en possession, last dernière équipe à l'avoir touchée, car porteur,
  //      rec {p,x,y} receveur d'une passe, off {p} joueur hors-jeu, face {x,y} mise au jeu, held rondelle immobilisée}
  const out={away:new Map(),home:new Map()};
  const seg=G.segAt(t);
  if(c.face){SIDES.forEach(s=>faceSpots(G,t,s,seg.line[s],c.face,out[s]));return out}
  const att=c.poss||c.last||"home", def=otherSide(att);
  attackSpots(G,t,att,seg.line[att],c,out[att]);
  defendSpots(G,t,def,seg.line[def],c,out[att],out[def]);
  // rondelle libre : le joueur le plus proche de chaque équipe se lance dessus
  if(!c.poss&&!c.held) SIDES.forEach(s=>{
    let best=null,bd=1e9;
    out[s].forEach((v,p)=>{const dd=Math.hypot(v.x-c.x,v.y-c.y);if(dd<bd){bd=dd;best=p}});
    if(best){const v=out[s].get(best), d=G.attackDir(s,t);v.x=c.x-d*1.3;v.y=c.y;v.chase=true}
  });
  return out;
}
function put(out,G,t,s,e,u,w){const d=G.attackDir(s,t);const q=inRink(d*u,d*w,2.2);out.set(e.p,{x:q.x,y:q.y,role:e.role})}

function attackSpots(G,t,s,line,c,out){
  const d=G.attackDir(s,t), pu=d*c.x, pw=d*c.y, sg=pw>=0?1:-1;
  const st=G.stateAt(t), pp=st[s].n>st[otherSide(s)].n;
  const zone=pu<-RK.BLUE?"D":pu>RK.BLUE?"O":"N";
  const Ds=line.filter(e=>isDrole(e.role)), Fs=line.filter(e=>!isDrole(e.role));
  const car=c.car, carIsD=!!car&&Ds.some(e=>e.p===car);
  const strongW=sg<0?"LW":"RW", weakW=sg<0?"RW":"LW";
  const rank=e=>e.role===strongW?0:e.role==="C"?1:e.role==="W"?1.5:e.role===weakW?2:3;
  const prefF=[...Fs].sort((a,b)=>rank(a)-rank(b));
  if(zone==="O"){
    if(pp&&line.length>=5){
      // avantage numérique en 1-3-1 : pointe, deux demi-murs, enclave, devant le filet (places fixes par rôle)
      const PPS={LD:[36,pw*0.25],RD:[57,27],LW:[57,-27],C:[64,sg*2],RW:[83,sg*1.5],W:[57,27],X:[70,-sg*8]};
      const used=new Set();
      line.forEach(e=>{let sp=PPS[e.role]||[70,-sg*8];if(used.has(e.role==="W"?"RD":e.role))sp=[70,-sg*8];used.add(e.role);put(out,G,t,s,e,sp[0],sp[1])});
    } else {
      // défenseurs à la pointe : celui du côté de la rondelle glisse vers la bande, l'autre vers le centre
      Ds.forEach(e=>{
        const mySide=e.role==="LD"?-1:1;
        let u=35,w=mySide*18;
        if(Ds.length===1){w=pw*0.4}
        else if(mySide===sg){w=sg*(pu<62?25:20);u=pu<62?37:34}
        else w=mySide*6+sg*2;
        put(out,G,t,s,e,u,w);
      });
      // attaquants : soutien près de la rondelle, devant le filet, enclave haute
      const low=pu>72;
      const support=low?[pu-13,pw-sg*9]:[Math.min(pu+15,86),pw+sg*(Math.abs(pw)>24?-6:4)];
      const spots=[support,[81,-sg*3],[63,-sg*11],[70,sg*8]];
      let k=0;
      prefF.forEach(e=>{if(e.p===car)return;const sp=spots[Math.min(k++,spots.length-1)];put(out,G,t,s,e,sp[0],sp[1])});
    }
  } else if(zone==="N"){
    // transition : ailiers larges et devant la rondelle mais jamais en zone avant elle (même avec le léger
    // mouvement des joueurs), centre au milieu, défenseurs derrière
    const lim=RK.BLUE-2.8;
    line.forEach(e=>{
      if(e.p===car) return;
      if(isDrole(e.role)){const lft=e.role==="LD";put(out,G,t,s,e,clamp(pu-24,-62,8),(lft?-13:13)+pw*0.15)}
      else if(e.role==="LW"||(e.role==="W"&&sg>0)) put(out,G,t,s,e,Math.min(pu+12,lim),-29);
      else if(e.role==="RW"||e.role==="W") put(out,G,t,s,e,Math.min(pu+12,lim),29);
      else if(e.role==="X") put(out,G,t,s,e,Math.min(pu+8,lim),-sg*10);
      else put(out,G,t,s,e,Math.min(pu+6,lim),-sg*7);
    });
  } else {
    // sortie de zone : le partenaire du défenseur porteur reste devant le filet, l'ailier du côté fort
    // attend la passe le long de la bande, le centre vient en soutien bas, l'ailier opposé reste haut
    line.forEach(e=>{
      if(e.p===car) return;
      if(isDrole(e.role)){
        if(carIsD) put(out,G,t,s,e,-80,-sg*13);
        else put(out,G,t,s,e,Math.max(pu-16,-80),(e.role==="LD"?-1:1)*13);
      }
      else if(e.role===strongW||(e.role==="W"&&!carIsD)) put(out,G,t,s,e,clamp(pu+18,-62,-35),sg*33);
      else if(e.role===weakW||e.role==="W") put(out,G,t,s,e,clamp(pu+40,-38,-8),-sg*29);
      else if(e.role==="X") put(out,G,t,s,e,clamp(pu+30,-45,-10),0);
      else put(out,G,t,s,e,clamp(pu+16,-64,-40),sg*5);
    });
  }
  // porteur sur la rondelle, receveur au bout de la passe, joueur hors-jeu déjà en zone
  const has=p=>line.some(e=>e.p===p), roleOf=p=>(line.find(e=>e.p===p)||{}).role;
  if(car&&has(car)) out.set(car,{x:c.x,y:c.y,role:roleOf(car),carrier:true});
  if(c.rec&&has(c.rec.p)) out.set(c.rec.p,{x:c.rec.x,y:c.rec.y,role:roleOf(c.rec.p),receiver:true});
  if(c.off&&has(c.off.p)){const q=inRink(d*Math.max(28,pu+6),d*(pw+sg*6),3);out.set(c.off.p,{x:q.x,y:q.y,role:roleOf(c.off.p),offside:true})}
}

function defendSpots(G,t,s,line,c,attMap,out){
  const att=otherSide(s), d=G.attackDir(att,t), pu=d*c.x, pw=d*c.y, sg=pw>=0?1:-1;
  const zone=pu<-RK.BLUE?"D":pu>RK.BLUE?"O":"N";   // zone dans le repère de l'équipe en attaque
  const putA=(e,u,w)=>{const q=inRink(d*u,d*w,2.2);out.set(e.p,{x:q.x,y:q.y,role:e.role})};
  const A=[...attMap.entries()].map(([p,v])=>({p,u:d*v.x,w:d*v.y,carrier:!!v.carrier}));
  const st=G.stateAt(t), short=st[s].n<st[att].n;
  if(zone==="O"&&short&&line.length>=3&&line.length<=4){
    // désavantage numérique : boîte (ou triangle à 3) resserrée devant le filet, déplacée vers la rondelle
    const F=line.filter(e=>!isDrole(e.role));
    line.forEach(e=>{
      if(isDrole(e.role)) putA(e,79,(e.role==="LD"?1:-1)*9.5+sg*3);
      else if(F.length===1) putA(e,62,sg*5);
      else putA(e,60,(e.role==="C"?-sg:sg)*15+sg*4);
    });
    // l'attaquant le plus près presse le passeur à la pointe
    if(pu<46&&F.length){
      const dist=e=>{const v=out.get(e.p);return v?Math.hypot(d*v.x-pu,d*v.y-pw):99};
      const f=[...F].sort((a,b)=>dist(a)-dist(b))[0];putA(f,pu+5,pw*0.9);
    }
    return;
  }
  // ancrages selon la zone; les défenseurs protègent leur filet, en u = +89 dans ce repère
  const anchor=e=>{
    const r=e.role, mirror=(r==="LD"||r==="LW")?1:(r==="RD"||r==="RW")?-1:0;   // la gauche du défenseur est la droite de l'attaque
    if(zone==="O") return isDrole(r)?[80,mirror*9]:r==="C"?[70,0]:[46,mirror*17||sg*12];
    if(zone==="N") return isDrole(r)?[clamp(pu+20,30,70),mirror*12]:[pu+8,mirror*20];
    return isDrole(r)?[-30,mirror*18]:r==="C"?[pu+6,pw*0.5]:[-52,mirror*27];
  };
  // le porteur est pressé par le joueur le plus proche, puis chacun prend l'attaquant le plus près de son ancrage
  const free=new Set(A), pairs=[];
  const carA=A.find(a=>a.carrier);
  if(carA){
    let bi=null,bd=1e9;
    line.forEach(e=>{const an=anchor(e);const dd=Math.hypot(an[0]-carA.u,an[1]-carA.w)+(zone==="N"&&isDrole(e.role)?30:0);if(dd<bd){bd=dd;bi=e}});
    if(bi){pairs.push([bi,carA]);free.delete(carA)}
  }
  [...line].sort((a,b)=>(isDrole(a.role)?1:0)-(isDrole(b.role)?1:0)).forEach(e=>{
    if(pairs.some(x=>x[0]===e)) return;
    let ba=null,bd=1e9;
    free.forEach(a=>{const an=anchor(e);const dd=Math.hypot(an[0]-a.u,an[1]-a.w);if(dd<bd){bd=dd;ba=a}});
    if(ba){pairs.push([e,ba]);free.delete(ba)}else pairs.push([e,null]);
  });
  const k=zone==="O"?0.22:zone==="N"?0.13:0.08;
  const spare=[[75,sg*4],[62,-sg*8],[45,0]]; let ns=0;
  pairs.forEach(([e,a])=>{
    if(!a){const sp=spare[Math.min(ns++,spare.length-1)];putA(e,sp[0],sp[1]);return}
    let u,w;
    const vx=89-a.u, vy=-a.w, n=Math.hypot(vx,vy)||1;
    if(a.carrier){
      // pression sur le porteur, du côté du filet
      if(zone==="D"){u=a.u+5;w=a.w*0.9}
      else{const g=zone==="O"?5:7;u=a.u+vx/n*g;w=a.w+vy/n*g}
    } else {
      u=a.u+(89-a.u)*k;w=a.w*(1-k);
      // un peu d'espace entre le défenseur et l'attaquant qu'il couvre, toujours du côté du filet
      if(Math.hypot(u-a.u,w-a.w)<5){u=a.u+vx/n*5;w=a.w+vy/n*5}
    }
    // en zone neutre, les défenseurs gardent leur écart avec la rondelle
    if(zone==="N"&&isDrole(e.role)&&!a.carrier) u=Math.max(u,clamp(pu+16,28,70));
    // hors de l'enceinte du gardien
    if(u>84&&Math.abs(w)<7) u=84;
    putA(e,u,w);
  });
}

function faceSpots(G,t,s,line,face,out){
  const d=G.attackDir(s,t), fu=d*face.x, fw=d*face.y, fs=fw>=0?1:-1;
  const zone=fu<-RK.BLUE?"D":fu>RK.BLUE?"O":"N";
  line.forEach(e=>{
    const r=e.role;
    let u,w;
    // seuls les centres entrent dans le cercle : les autres restent à 15 pieds (4,5 m) du point
    if(r==="C"){u=fu-3;w=fw}                          // au point de mise au jeu, face à l'autre centre
    else if(r==="LW"){u=fu-4;w=fw-15.5}               // sur les lignes du cercle
    else if(r==="RW"){u=fu-4;w=fw+15.5}
    else if(r==="W"){u=fu-4;w=fw-fs*15.5}
    else if(r==="X"){u=fu-16;w=fw*0.5+(fw===0?6:0)}
    else{
      const sd=r==="LD"?-1:1, boards=sd===fs;
      if(zone==="D") {if(boards){u=fu-16;w=fw+fs*6}else{u=-82;w=fw*0.15}}   // un derrière le cercle, l'autre devant le filet
      else if(zone==="O"){u=36;w=sd*16+fw*0.3}        // à la pointe
      else{u=fu-16;w=fw*0.3+sd*12}
    }
    const q=inRink(d*u,d*w,2.2);out.set(e.p,{x:q.x,y:q.y,role:r});
  });
}

/* ---------- Tirs : le compte de chaque joueur, pendant ses présences ---------- */
// partage d'un entier n selon des poids, au plus fort reste
function share(n,w){
  if(n<=0||!w.length) return w.map(()=>0);
  const tot=w.reduce((a,b)=>a+Math.max(0,b),0), f=w.map(v=>tot>0?Math.max(0,v)*n/tot:n/w.length), r=f.map(Math.floor);
  let left=n-r.reduce((a,b)=>a+b,0);
  f.map((v,i)=>[v-Math.floor(v),i]).sort((a,b)=>b[0]-a[0]).forEach(([,i])=>{if(left>0){r[i]++;left--}});
  return r;
}
function scheduleShots(G,R){
  const S=G.S, shots=[], periods=[...Array(G.nPer)].map((_,i)=>i+1);
  const perEnd=per=>Math.min(per*1200,G.T);
  const dur=per=>perEnd(per)-(per-1)*1200, otAll=periods.filter(p=>p>3).reduce((a,p)=>a+dur(p),0);
  const otCum=per=>periods.filter(p=>p>3&&p<=per).reduce((a,p)=>a+dur(p),0);
  const otShare=(total,per)=>Math.round(total*otCum(per)/otAll)-Math.round(total*(otCum(per)-dur(per))/otAll);
  G.goals.forEach(g=>shots.push({t:g.t,side:g.side,p:g.scorer,goal:g,per:g.per}));
  const pens=G.pens.map(p=>p.t);
  SIDES.forEach(side=>{
    const row=S.shotRows[side][0], RS=G.roster[side];
    const goalsBy=new Map(); G.goals.forEach(g=>{if(g.side===side&&g.scorer)goalsBy.set(g.scorer,(goalsBy.get(g.scorer)||0)+1)});
    const need=new Map(); RS.forEach(p=>need.set(p,Math.max(0,(p.s||0)-(goalsBy.get(p)||0))));
    // tirs de l'équipe par période (sommaire), moins les buts
    let N=periods.map(per=>{
      let total;
      if(!row||row.length<4) total=0;
      else if(per<=3) total=row[per-1]||0;
      else if(row.length===4) total=0;
      else if(G.nPer>4&&row.length===G.nPer+1) total=row[per-1]||0;
      else total=otShare(row[3]||0,per);
      return Math.max(0,total-G.goals.filter(g=>g.side===side&&g.per===per).length);
    });
    // présences de chaque joueur par période, pondérées par la situation (plus de tirs en avantage numérique);
    // les premières secondes d'une présence servent à arriver dans le jeu
    const W=new Map(), inter=new Map();
    RS.forEach(p=>{W.set(p,periods.map(()=>0));inter.set(p,periods.map(()=>[]))});
    G.segs.forEach(sg=>{
      const per=Math.min(Math.floor(sg.a/1200)+1,G.nPer), k=sg.state[side].kind;
      const m=k==="PP"?2.2:k==="PK"?0.3:1;
      const a=Math.max(sg.a+Math.min(3,(sg.b-sg.a)*0.4),(per-1)*1200+8), b=Math.min(sg.b-0.3,perEnd(per)-1.5);
      if(b-a<0.4) return;
      sg.line[side].forEach(e=>{
        if(!W.has(e.p)) return;
        const wt=(b-a)*m*(isDrole(e.role)?0.8:1);
        W.get(e.p)[per-1]+=wt; inter.get(e.p)[per-1].push({a,b,wt});
      });
    });
    // Sur une feuille FHL, les tirs des joueurs donnent exactement le total de l'équipe : chacun a ses tirs.
    // Feuille incohérente (modifiée à la main) : les totaux par période l'emportent, l'écart suit le temps de glace.
    const sumN=N.reduce((a,b)=>a+b,0), sumNeed=[...need.values()].reduce((a,b)=>a+b,0);
    if(!row||row.length<4) N=share(sumNeed,periods.map(dur));
    else if(sumN!==sumNeed){
      if(sumNeed<sumN){const add=share(sumN-sumNeed,RS.map(p=>W.get(p).reduce((a,b)=>a+b,0)));RS.forEach((p,i)=>need.set(p,need.get(p)+add[i]))}
      else{const keep=share(sumN,RS.map(p=>need.get(p)));RS.forEach((p,i)=>need.set(p,keep[i]))}
      (G.shotGaps=G.shotGaps||[]).push({side,joueurs:sumNeed,equipe:sumN});
    }
    // répartition joueur × période (ajustement proportionnel itératif, puis arrondi qui garde les totaux)
    const P=RS.filter(p=>need.get(p)>0);
    const M=P.map(p=>W.get(p).slice());
    P.forEach((p,i)=>{if(M[i].every(v=>v<=0)) M[i]=periods.map(per=>dur(per)>0?1e-3:0)});
    for(let it=0;it<40;it++){
      M.forEach((r,i)=>{const s=r.reduce((a,b)=>a+b,0);if(s>0)r.forEach((v,j)=>r[j]=v*need.get(P[i])/s)});
      periods.forEach((_,j)=>{const s=M.reduce((a,r)=>a+r[j],0);if(s>0)M.forEach(r=>r[j]=r[j]*N[j]/s)});
    }
    const I=M.map(r=>r.map(Math.floor));
    const rowLeft=P.map((p,i)=>need.get(p)-I[i].reduce((a,b)=>a+b,0)), colLeft=periods.map((_,j)=>N[j]-I.reduce((a,r)=>a+r[j],0));
    const cells=[];M.forEach((r,i)=>r.forEach((v,j)=>cells.push([v-Math.floor(v),i,j])));
    cells.sort((a,b)=>b[0]-a[0]).forEach(([,i,j])=>{if(rowLeft[i]>0&&colLeft[j]>0){I[i][j]++;rowLeft[i]--;colLeft[j]--}});
    P.forEach((p,i)=>{while(rowLeft[i]>0){let j=colLeft.findIndex(v=>v>0);if(j<0){const w=W.get(p);j=w.indexOf(Math.max(...w))}I[i][j]++;rowLeft[i]--;if(colLeft[j]>0)colLeft[j]--}});
    // moment de chaque tir, pendant une présence du tireur
    const list=[];P.forEach((p,i)=>I[i].forEach((n,j)=>{for(let k=0;k<n;k++)list.push({p,per:j+1})}));
    for(let i=list.length-1;i>0;i--){const j=Math.floor(R()*(i+1));[list[i],list[j]]=[list[j],list[i]]}
    list.forEach(({p,per})=>{
      const iv=inter.get(p)[per-1];
      const a0=(per-1)*1200+8, b0=perEnd(per)-1.5;
      const tryT=()=>{
        if(iv.length){const tot=iv.reduce((a,v)=>a+v.wt,0);let r=R()*tot;for(const v of iv){r-=v.wt;if(r<=0)return v.a+R()*(v.b-v.a)}const v=iv[iv.length-1];return v.a+R()*(v.b-v.a)}
        return a0+R()*Math.max(0,b0-a0);
      };
      // écarts minimaux : même équipe, autre équipe, après un but, autour d'une pénalité
      const levels=[[2.6,7,8,3],[2,5.5,7,2.5],[1.5,4,5,1.8],[1,2.5,3,1]];
      let placed=null;
      for(const [gs,go,ga,gp] of levels){
        for(let k=0;k<70&&placed===null;k++){
          const tt=tryT();
          if(G.pulledAt(otherSide(side),tt)) continue;          // pas de tir au but contre un filet désert
          if(G.boxedAt(side,tt).has(p)) continue;
          if(pens.some(x=>Math.abs(x-tt)<gp)) continue;
          if(shots.some(o=>{const dt=Math.abs(o.t-tt);if(o.goal&&tt>o.t&&tt-o.t<ga)return true;return o.side===side?dt<gs:dt<go})) continue;
          placed=tt;
        }
        if(placed!==null) break;
      }
      if(placed===null){let best=null,bd=-1;for(let k=0;k<60;k++){const tt=tryT();if(G.pulledAt(otherSide(side),tt))continue;const md=Math.min(99,...shots.map(o=>Math.abs(o.t-tt)));if(md>bd){bd=md;best=tt}}placed=best!==null?best:tryT()}
      // joueur sans présence dans cette période (données incomplètes) : il est placé sur la glace
      if(G.ensureOnIce&&!G.segAt(placed).line[side].some(e=>e.p===p)) G.ensureOnIce(side,p,placed);
      shots.push({t:placed,side,p,goal:null,per});
    });
  });
  shots.sort((a,b)=>a.t-b.t);
  return shots;
}

/* ---------- Trame : possession, passes, entrées de zone, tirs, arrêts de jeu ---------- */
function buildScript(G,R){
  const items=[], stops=[], plays=[], offs=[], late=[];
  const segB=G.segs.map(sg=>sg.b);
  const whistled=G.goals.map(g=>g.t+0.05);
  for(let per=1;per<=G.nPer;per++) buildPeriod(per);
  return {items,stops,plays,offs,late};

  function buildPeriod(per){
    const a=(per-1)*1200, b=Math.min(per*1200,G.T);
    const dirOf=s=>G.attackDir(s,a+1);
    const ct=tt=>Math.min(Math.max(tt,a),b-1e-3);
    let t=a, x=0, y=0, side=null, car=null, last=null;

    // moments imposés par la feuille de match : tirs (dont les buts) et pénalités sifflées
    const anchors=[];
    G.shots.forEach(s=>{if(s.t>=a&&s.t<=b)anchors.push({t:s.t,type:"shot",s})});
    const groups=[];
    G.pens.forEach(p=>{
      if(p.t<=a+2||p.t>=b-0.5) return;                          // début ou fin de période : mise au jeu au centre
      if(G.goals.some(g=>p.t>=g.t-0.6&&p.t<=g.t+3)) return;     // pénalité après un but : mise au jeu au centre
      const g=groups.find(q=>Math.abs(q.t-p.t)<0.6); if(g) g.list.push(p); else groups.push({t:p.t,list:[p]});
    });
    groups.forEach(g=>{anchors.push({t:g.t,type:"pen",g});whistled.push(g.t)});
    anchors.sort((p,q)=>p.t-q.t||(p.type==="pen"?-1:1));

    const U=(s,px)=>dirOf(s)*px, Wl=(s,py)=>dirOf(s)*py;
    const zoneU=u=>u<-RK.BLUE?"D":u>RK.BLUE?"O":"N";
    const line=(s,tt)=>G.segAt(ct(tt)).line[s];
    const onIce=(p,s,tt)=>!!p&&line(s,tt).some(e=>e.p===p);
    const roleOf=(s,p,tt)=>{const e=line(s,tt).find(q=>q.p===p);return e?e.role:null};
    const mates=(s,tt,ex)=>line(s,tt).filter(e=>e.p!==ex);
    const shortOf=(s,tt)=>{const st=G.stateAt(tt);return st[s].n<st[otherSide(s)].n};
    // rien ne déborde de la période : un geste commencé avant la sirène s'arrête avec elle
    const add=it=>{
      if(it.t1<it.t0) it.t1=it.t0;
      if(it.t0>=b){t=it.t1;return}
      if(it.t1>b&&it.x1!==undefined){const f=(b-it.t0)/Math.max(1e-6,it.t1-it.t0);it.x1=lerp(it.x0,it.x1,f);it.y1=lerp(it.y0,it.y1,f);it.t1=b}
      items.push(it);t=it.t1;
    };
    const ctx=extra=>Object.assign({x,y,poss:side,last,car},extra||{});
    const spotOf=(s,p,tt,extra)=>formation(G,ct(tt),ctx(extra))[s].get(p)||null;
    function nearest(s,tt,px,py){
      const m=formation(G,ct(tt),ctx({x:px,y:py,poss:null,car:null,last:last||s}))[s];
      let best=null,bd=1e9;
      m.forEach((v,p)=>{const dd=Math.hypot(v.x-px,v.y-py);if(dd<bd){bd=dd;best=p}});
      return best||((line(s,tt)[0]||{}).p)||null;
    }
    const nextChange=()=>{let lo=0,hi=segB.length-1,ans=Infinity;while(lo<=hi){const m=(lo+hi)>>1;if(segB[m]>t+0.01){ans=segB[m];hi=m-1}else lo=m+1}return ans};
    const isWhistle=tc=>tc>=b-0.01||whistled.some(w=>Math.abs(w-tc)<0.15);

    /* gestes de base */
    function carry(nx,ny,maxT,spd){
      const q=inRink(nx,ny,2.5), dd=Math.hypot(q.x-x,q.y-y);
      let dur=dd/(spd||carrySpeed(car));
      const tc=nextChange();
      if(t+dur>tc&&!onIce(car,side,tc+0.01)) maxT=maxT===undefined?tc:Math.min(maxT,tc);
      if(maxT!==undefined&&t+dur>maxT){const f=Math.max(0,(maxT-t)/(dur||1));q.x=x+(q.x-x)*f;q.y=y+(q.y-y)*f;dur=Math.max(0,maxT-t)}
      if(dur<=0.02) return;
      add({k:"carry",t0:t,t1:t+dur,side,p:car,x0:x,y0:y,x1:q.x,y1:q.y});x=q.x;y=q.y;
    }
    function hold(dur){
      if(dur<=0.02) return;
      const end=t+dur, tc=nextChange();
      if(end>tc+0.02&&!onIce(car,side,tc+0.01)){
        // le porteur sort au changement de trio : le joueur qui arrive prend la rondelle
        if(tc-t>0.02) add({k:"carry",t0:t,t1:tc,side,p:car,x0:x,y0:y,x1:x,y1:y});
        const q=nearest(side,tc+0.01,x,y); if(q) car=q;
        if(end-t>0.02) add({k:"carry",t0:t,t1:end,side,p:car,x0:x,y0:y,x1:x,y1:y});
        return;
      }
      add({k:"carry",t0:t,t1:end,side,p:car,x0:x,y0:y,x1:x,y1:y});
    }
    function pass(q,nx,ny,maxT,kind,minDur){
      const P=inRink(nx,ny,2.5), dd=Math.hypot(P.x-x,P.y-y);
      let dur=clamp(dd/SPD.pass,minDur||0.22,2.4);
      if(maxT!==undefined&&t+dur>maxT) dur=Math.max(0.1,maxT-t);
      add({k:"pass",t0:t,t1:t+dur,side,from:car,to:q,x0:x,y0:y,x1:P.x,y1:P.y,kind:kind||""});
      x=P.x;y=P.y;car=q;last=side;
    }
    function passTo(q,maxT){
      let sp=spotOf(side,q,t,{car:null}); if(!sp) return false;
      const arr=t+clamp(Math.hypot(sp.x-x,sp.y-y)/SPD.pass,0.22,2.4);
      if(!onIce(q,side,arr)){
        const alt=mates(side,arr,car).find(e=>onIce(e.p,side,t));
        if(!alt) return false;
        q=alt.p; sp=spotOf(side,q,t,{car:null}); if(!sp) return false;
      }
      pass(q,sp.x,sp.y,maxT);return true;
    }
    function loose(nx,ny,dur,kind){
      const P=inRink(nx,ny,2);
      add({k:"loose",t0:t,t1:t+dur,last,x0:x,y0:y,x1:P.x,y1:P.y,kind:kind||""});
      x=P.x;y=P.y;side=null;car=null;
    }
    function gain(s,p){side=s;car=p;last=s}

    /* arrêts de jeu et mises au jeu */
    const sideY=v=>(v>0?1:v<0?-1:(R()<0.5?-1:1))*RK.DOTY;
    function dotNear(px,py){let best=DOTS[0],bd=1e9;DOTS.forEach(o=>{const dd=Math.hypot(o[0]-px,o[1]-py);if(dd<bd){bd=dd;best=o}});return {x:best[0],y:best[1]}}
    function faceDot(cause,info){
      switch(cause){
        case "period": case "goal": return {x:0,y:0};
        case "freeze": return {x:-dirOf(info.side)*RK.EZX,y:sideY(info.y)};     // zone de l'équipe du gardien, côté du tir
        case "penalty": return {x:-dirOf(info.side)*RK.EZX,y:sideY(y)};         // zone de l'équipe pénalisée
        case "icing": return {x:-dirOf(info.side)*RK.EZX,y:sideY(info.y0)};     // zone de l'équipe fautive
        case "offside": return {x:dirOf(info.side)*RK.NZX,y:sideY(info.yc)};    // zone neutre, devant la zone du hors-jeu
        case "out": return {x:dirOf(info.side)*RK.NZX,y:sideY(info.y)};         // arrêt causé par l'attaque dans sa zone offensive
        default: return dotNear(x,y);                                            // pénalités coïncidentes
      }
    }
    function whistle(cause,info){
      info=info||{};
      const dot=faceDot(cause,info);
      stops.push({t,cause,x:dot.x,y:dot.y,wx:x,wy:y,side:info.side||null,g:info.g||null,pens:info.pens||null});
      // Les changements de trio se font pendant les arrêts de jeu : un changement prévu dans les secondes
      // qui suivent le coup de sifflet est avancé à l'arrêt, et la mise au jeu se fait avec les nouveaux joueurs.
      let tc=nextChange();
      if(tc-t<4&&tc<b-0.5){
        const k=G.segs.findIndex(sg=>Math.abs(sg.b-tc)<1e-9), nx=G.segs[k+1];
        if(k>=0&&G.segs[k].free&&nx&&!anchors.some(an=>an.t>t-0.05&&an.t<=tc+0.3)&&G.segs[k].a<t-0.5){
          G.segs[k].b=nx.a=t+0.01; segB[k]=t+0.01; tc=t+0.01;
        }
      }
      add({k:"dead",t0:t,t1:t+(tc-t<0.15?tc-t+0.01:0.02),x,y,face:{x:dot.x,y:dot.y},cause});
      faceoff(dot);
    }
    function faceoff(dot){
      x=dot.x;y=dot.y;side=null;car=null;
      const tt=t, cs={};
      SIDES.forEach(s=>{const L=line(s,tt);const c=L.find(e=>e.role==="C")||L.find(e=>!isDrole(e.role))||L[0];cs[s]=c?c.p:null});
      // gagnant : l'équipe qui tire dans les secondes qui suivent, sinon selon les cotes des deux centres
      const next=anchors.find(an=>an.t>tt+0.05);
      let win=next&&next.type==="shot"&&next.t-tt<7?next.s.side:null;
      if(!win){
        const r=p=>p?((p.pc||72)+(p.st||72)+(p.ex||72))/3:72;
        win=R()<clamp(0.5+(r(cs.away)-r(cs.home))*0.008,0.35,0.65)?"away":"home";
      }
      const lose=otherSide(win), d=dirOf(win), fu=d*dot.x, fw=d*dot.y;
      const zone=dot.x===0&&dot.y===0?"C":fu>RK.BLUE?"O":fu<-RK.BLUE?"D":"N";
      plays.push({t:tt,type:"face",side:win,p:cs[win],q:cs[lose],x:dot.x,y:dot.y,zone});
      gain(win,cs[win]);
      // le centre ramène la rondelle vers un défenseur, derrière lui
      const Dm=mates(win,tt,cs[win]).filter(e=>isDrole(e.role));
      const same=Dm.find(e=>(e.role==="LD"?-1:1)*(fw>=0?1:-1)>0);
      const to=(same||Dm[0]||mates(win,tt,cs[win])[0]||{}).p;
      if(!to){hold(0.4);return}
      const fs=formation(G,ct(tt),{x:dot.x,y:dot.y,face:dot})[win].get(to);
      pass(to,fs?lerp(fs.x,dot.x,0.25):dot.x-d*10,fs?lerp(fs.y,dot.y,0.25):dot.y,undefined,"face");
    }

    /* possession */
    // Le porteur doit être sur la glace (changements de trio) : sinon la rondelle va au coéquipier le plus proche.
    function ensureCarrier(){
      if(!side) return;
      if(car&&onIce(car,side,t+0.01)) return;
      const q=nearest(side,t+0.01,x,y);
      if(!q){side=null;car=null;return}
      car=q;hold(0.15);
    }
    // rondelle libre récupérée par l'une ou l'autre équipe
    function recover(prefer,maxDur){
      let s=prefer||null;
      if(!s){const z=last?zoneU(U(last,x)):"N";const keep=z==="O"?0.42:z==="D"?0.6:0.5;s=last&&R()<keep?last:otherSide(last||(R()<0.5?"home":"away"))}
      const p=nearest(s,t+0.01,x,y);
      gain(s,p);hold(Math.min(0.25+R()*0.35,maxDur===undefined?9:Math.max(0.05,maxDur)));
    }
    // revirement : l'équipe s subtilise la rondelle (ou l'autre la perd)
    function takeaway(s){
      if(!side){recover(s);return}
      const lost=car, from=side, t0=t, log=R()<PJ.logTurn, take=R()<0.5;
      loose(x+(R()-0.5)*6,y+(R()-0.5)*6,0.3+R()*0.25);
      // le joueur qui récupère la rondelle est sur la glace à ce moment (changement de trio possible entre-temps)
      const p=nearest(s,t+0.01,x,y);
      if(log){if(take)plays.push({t:t0,type:"takeaway",side:s,p});else if(lost)plays.push({t:t0,type:"giveaway",side:from,p:lost})}
      gain(s,p);hold(0.2);
    }
    // le porteur patine doucement jusqu'au moment tt, sans quitter sa zone
    function glide(tt){
      const s=side, d=dirOf(s), u=U(s,x), left=tt-t;
      const du=u>75?-1:u<-75?1:(zoneU(u)==="O"?-0.4:1), len=Math.min(12,left*7);
      carry(x+d*du*len,y*(u>75?0.9:1),tt,Math.max(6,len/Math.max(0.3,left)));
      if(t<tt) hold(tt-t);
    }
    // amène le jeu exactement au moment tt (pénalité, fin de période)
    function fillTo(tt){
      if(t>=tt-0.02) return;
      if(!side) recover(null,tt-t);
      ensureCarrier();
      if(t>=tt-0.02||!side) return;
      glide(tt);
    }

    /* changement de trio à la volée : dégagement en zone adverse, ou attente dans sa zone */
    function changeOnFly(tc,want){
      const s=side, d=dirOf(s);
      if(zoneU(U(s,x))==="D"){
        const q=inRink(-d*78,d*(Wl(s,y)>=0?10:-10),3);
        carry(q.x,q.y,tc);
        if(t<tc) hold(tc-t);
        ensureCarrier();
        hold(0.3);
        return;
      }
      dumpIn(tc,want===s?0.8:0.35);
    }
    function dumpIn(tc,pKeep){
      const s=side, d=dirOf(s), sg=Wl(s,y)>=0?1:-1;
      const target=inRink(d*92,d*sg*(26+R()*8),2.5), dd=Math.hypot(target.x-x,target.y-y);
      add({k:"dump",t0:t,t1:t+dd/SPD.dump,side:s,from:car,x0:x,y0:y,x1:target.x,y1:target.y,kind:"dump"});
      x=target.x;y=target.y;last=s;side=null;car=null;
      loose(x-d*5,y*0.85,Math.max(0.5+R()*0.4,(tc||0)+0.3-t),"rim");
      recover(R()<pKeep?s:otherSide(s));
    }

    /* jeu libre : sans tir (les tirs n'arrivent qu'aux moments de la feuille de match) */
    function free(tEnd,want){
      let guard=0;
      while(tEnd-t>1.2&&guard++<600){
        if(!side){recover(want&&tEnd-t<10?want:null,tEnd-t);continue}
        ensureCarrier(); if(!side) continue;
        const tc=nextChange();
        if(tc<tEnd&&tc-t<2.6&&!isWhistle(tc)){changeOnFly(tc,want);continue}
        const left=tEnd-t;
        if(want&&left<timeToAttack(want)+1.5){if(side!==want)takeaway(want);return}
        if(left<3){glide(tEnd);return}
        const zn=zoneU(U(side,x));
        if(zn==="D") breakout(left,tEnd,want);
        else if(zn==="N") transition(left,tEnd,want);
        else cycle(left,tEnd,want);
      }
    }
    // temps qu'il faut pour que l'équipe s ait la rondelle en zone adverse
    function timeToAttack(s){const u=U(s,x);return (side===s?0:1.2)+Math.max(0,RK.BLUE+4-u)/21+(u<-RK.BLUE?1.5:0)}
    // l'équipe s garde la rondelle et s'installe en zone adverse jusqu'à tEnd
    function approach(s,tEnd){
      let guard=0;
      while(tEnd-t>1.2&&guard++<300){
        if(side!==s){if(!side)recover(s,tEnd-t);else takeaway(s);continue}
        ensureCarrier(); if(side!==s) continue;
        const tc=nextChange();
        if(tc<tEnd&&tc-t<2.6&&!isWhistle(tc)){changeOnFly(tc,s);continue}
        const left=tEnd-t, zn=zoneU(U(s,x));
        if(left<3){glide(tEnd);return}
        if(zn==="O") cycle(left,tEnd,s);
        else if(zn==="N") transition(left,tEnd,s);
        else breakout(left,tEnd,s);
      }
    }

    function breakout(left,tEnd,want){
      const s=side, d=dirOf(s), u=U(s,x), sg=Wl(s,y)>=0?1:-1, safe=want===s;
      if(!safe&&R()<PJ.turnD&&left>6){takeaway(otherSide(s));return}
      if(!safe&&R()<PJ.icing&&left>8){icingTry();return}
      const M=mates(s,t,car), pick=role=>M.find(e=>e.role===role), r=R();
      if(isDrole(roleOf(s,car,t)||"")&&u>-72&&r<0.22){carry(-d*92,d*sg*5,Math.min(tEnd,t+2.2));return}   // derrière son filet
      const strong=sg<0?"LW":"RW";
      if(r<0.55){
        const q=pick(strong)||pick("W")||pick("C")||M[0];
        if(q&&passTo(q.p,tEnd)) carry(d*(-6+R()*10),y*0.9,tEnd);        // l'ailier remonte le long de la bande
        else hold(Math.min(1,left));
        return;
      }
      if(r<0.8){
        const q=pick("C")||M[0];
        if(q&&passTo(q.p,tEnd)) carry(d*(-4+R()*8),d*sg*(4+R()*8),tEnd); // le centre sort par le milieu
        else hold(Math.min(1,left));
        return;
      }
      if(r<0.93){carry(d*(-30+R()*6),d*sg*(30+R()*6),tEnd);return}
      // dégagement par la bande
      const rim=inRink(d*(5+R()*10),d*sg*(30+R()*8),2);
      loose(rim.x,rim.y,Math.max(0.9,Math.hypot(rim.x-x,rim.y-y)/55),"rim");
      recover(safe?s:null,tEnd-t);
    }
    // dégagement refusé : rondelle lancée de sa moitié de patinoire au-delà de la ligne des buts adverse
    function icingTry(){
      const s=side, d=dirOf(s), y0=y, x0=x;
      const target=inRink(d*97,d*((R()-0.5)*36),1.5), dd=Math.hypot(target.x-x,target.y-y);
      add({k:"dump",t0:t,t1:t+dd/SPD.dump,side:s,from:car,x0:x,y0:y,x1:target.x,y1:target.y,kind:"clear"});
      x=target.x;y=target.y;last=s;side=null;car=null;
      if(U(s,x0)<0&&!shortOf(s,t)){
        loose(x-d*3,y*0.8,1.1,"icing");
        plays.push({t,type:"icing",side:s});
        whistle("icing",{side:s,y0});
      } else {
        // permis en désavantage numérique : l'adversaire récupère derrière son filet
        loose(x-d*6,y*0.7,0.8,"clear");
        recover(otherSide(s));
      }
    }
    function transition(left,tEnd,want){
      const s=side, d=dirOf(s), u=U(s,x), w=Wl(s,y), safe=want===s;
      if(!safe&&R()<PJ.turnN&&left>5){takeaway(otherSide(s));return}
      if(u<5&&R()<0.35){
        const F=mates(s,t,car).filter(e=>!isDrole(e.role));
        if(F.length&&passTo(F[Math.floor(R()*F.length)].p,tEnd)) return;  // passe à un ailier lancé
      }
      // montée jusqu'à la ligne bleue adverse
      const lineU=RK.BLUE-1.5;
      carry(d*lineU,d*clamp(w+(R()-0.5)*18,-32,32),tEnd);
      if(tEnd-t<0.5||U(s,x)<lineU-0.5) return;
      entry(tEnd,want);
    }
    function entry(tEnd,want){
      const s=side, d=dirOf(s), w=Wl(s,y), sg=w>=0?1:-1, safe=want===s;
      if(!safe&&R()<PJ.offside&&tEnd-t>6){
        // hors-jeu : un attaquant franchit la ligne bleue avant la rondelle
        const F=mates(s,t,car).filter(e=>!isDrole(e.role));
        const p=F.length?F[Math.floor(R()*F.length)].p:null, t0=t;
        carry(d*(RK.BLUE+1.5),y,tEnd);
        if(p) offs.push({t0:Math.max(a,t0-3.5),t1:t,p,side:s});
        plays.push({t,type:"offside",side:s,p});
        whistle("offside",{side:s,yc:y});
        return;
      }
      if(safe||R()<PJ.controlled){carry(d*(RK.BLUE+12+R()*12),d*clamp(w+sg*6,-34,34),tEnd);return}   // entrée en contrôle
      dumpIn(null,0.4);                                                                               // dégagement et chasse
    }
    function cycle(left,tEnd,want){
      const s=side, d=dirOf(s), u=U(s,x), sg=Wl(s,y)>=0?1:-1, safe=want===s;
      if(!safe&&R()<PJ.turnO&&left>4){
        if(R()<PJ.out){
          // rondelle déviée par-dessus la baie vitrée
          const yb=y;
          loose(x+d*4,d*sg*44,0.5,"out");
          plays.push({t,type:"out",side:s});
          whistle("out",{side:s,y:yb});
          return;
        }
        takeaway(otherSide(s));return;
      }
      const M=mates(s,t,car), r=R();
      if(r<0.42&&M.length){
        // passe : à la pointe, le long de la bande ou derrière le filet
        const pool=M.filter(e=>e.role!=="X"), from=pool.length?pool:M, q=from[Math.floor(R()*from.length)];
        if(passTo(q.p,tEnd)) hold(Math.min(0.4+R()*0.8,Math.max(0,tEnd-t)));
        return;
      }
      if(r<0.75){
        // le porteur longe la bande ou descend derrière le filet
        const low=u>70, nu=low?clamp(u-18,40,70):clamp(u+16,40,88), nw=low?sg*(26+R()*8):sg*(18+R()*14);
        carry(d*nu,d*nw,Math.min(tEnd,t+2.6));
        return;
      }
      // retour à la pointe
      const q=M.find(e=>isDrole(e.role));
      if(q&&passTo(q.p,tEnd)) carry(d*36,d*clamp(-Wl(s,y)*0.5,-18,18),Math.min(tEnd,t+1.6));
      else hold(Math.min(0.8,left));
    }

    /* tir prévu : la rondelle va au tireur, au bon endroit, au bon moment, après les passes décisives */
    function shotSpot(s,p,tt,goal){
      const role=roleOf(s,p,tt)||"C", d=dirOf(s);
      let u,w;
      if(isDrole(role)){u=34+R()*10;w=(role==="LD"?-1:1)*(6+R()*16)}
      else if(goal&&R()<0.6){u=72+R()*12;w=(R()-0.5)*18}        // la plupart des buts viennent de l'enclave
      else{u=55+R()*28;w=(role==="LW"?-1:role==="RW"?1:(R()<0.5?-1:1))*(3+R()*20)}
      if(G.pulledAt(otherSide(s),tt)){u=-5+R()*55;w=(R()-0.5)*40} // filet désert : souvent de loin
      return inRink(d*u,d*w,4);
    }
    function shotKind(s,p,dist,tt,oneTimer){
      const role=roleOf(s,p,tt)||"C";
      if(dist<=10) return R()<0.55?"tip":"wrap";
      if(oneTimer) return "one";
      if(isDrole(role)&&dist>40) return R()<0.55?"slap":"wrist";
      const r=R();return r<0.55?"wrist":r<0.8?"snap":r<0.92?"back":"slap";
    }
    function shoot(an){
      const sh=an.s, s=sh.side, shooter=sh.p, ts=an.t, goal=sh.goal, d=dirOf(s);
      if(side!==s){if(!side)recover(s,Math.max(0.05,(ts-t)*0.2));else takeaway(s)}
      ensureCarrier(); if(side!==s) gain(s,shooter);
      let passers=[];
      if(goal) passers=goal.assists.slice().reverse().filter(p=>p&&p!==shooter);
      else if(R()<0.7){const m=mates(s,ts-1,shooter).filter(e=>e.role!=="X"&&onIce(e.p,s,ts-3));if(m.length)passers=[m[Math.floor(R()*m.length)].p]}
      let spot=shotSpot(s,shooter,ts,goal);
      const net={x:d*RK.GOAL,y:(R()-0.5)*4};
      const oneTimer=passers.length>0&&R()<0.3;
      const hS=oneTimer?0.06:0.15+R()*0.35, holds=passers.map(()=>0.3+R()*0.4);
      let PS=passers.map(p=>spotOf(s,p,ts-1.5,{x:spot.x,y:spot.y,car:null,poss:s,last:s})||{x:spot.x-d*12,y:-spot.y*0.6});
      // horaire à rebours depuis le tir : act[i].in reçoit, act[i].r lâche la rondelle
      const sched=k=>{
        const flight=clamp(Math.hypot(net.x-spot.x,net.y-spot.y)/SPD.shot,0.12,0.9);
        const act=[...passers.map((p,i)=>({p,x:PS[i].x,y:PS[i].y,h:Math.max(0.08,holds[i]*k)})),{p:shooter,x:spot.x,y:spot.y,h:Math.max(0.05,hS*k)}];
        act[act.length-1].r=ts-flight;
        for(let i=act.length-1;i>=0;i--){
          act[i].in=act[i].r-act[i].h;
          if(i>0){const pd=clamp(Math.hypot(act[i].x-act[i-1].x,act[i].y-act[i-1].y)/SPD.pass,0.18,1.4);act[i-1].r=act[i].in-pd}
        }
        return {act,rel:ts-flight};
      };
      const travel=A=>{const f=A[0], dd=Math.hypot(f.x-x,f.y-y);return car===f.p?dd/Math.max(carrySpeed(car),12):clamp(dd/SPD.pass,0.22,2.4)};
      let plan=sched(1);
      // temps libre avant la séquence : l'équipe garde la rondelle et s'installe en zone adverse
      for(let g=0;g<6;g++){
        const slack=plan.act[0].in-travel(plan.act)-t;
        if(slack<=2.4) break;
        const t0=t;
        approach(s,plan.act[0].in-Math.min(travel(plan.act),1.2)-0.6);
        if(side!==s){if(!side)recover(s,0.3);else takeaway(s)}
        ensureCarrier(); if(side!==s) gain(s,plan.act[0].p);
        if(t-t0<0.05) break;
      }
      // ajustement : temps de contrôle réduits, puis séquence sans passe (tir non marqué), sinon tout se resserre
      let fit=false;
      for(const k of [1,0.5,0.2,0]){plan=sched(k);if(plan.act[0].in-travel(plan.act)>=t-1e-6){fit=true;break}}
      if(!fit&&!goal&&passers.length){passers=[];PS=[];for(const k of [1,0.4,0]){plan=sched(k);if(plan.act[0].in-travel(plan.act)>=t-1e-6){fit=true;break}}}
      if(!fit&&passers.length===0){
        // le tir part de plus près de la rondelle
        const need=travel(plan.act), room=Math.max(0,plan.act[0].in-t);
        if(need>0){const f=clamp(room/need,0,1);spot={x:x+(spot.x-x)*f,y:y+(spot.y-y)*f};plan=sched(0)}
      }
      const A=plan.act;
      // première touche : le porteur va porter la rondelle à sa place, ou la passe au premier acteur
      const a0=A[0];
      if(car===a0.p){
        const dd=Math.hypot(a0.x-x,a0.y-y), room=a0.in-t;
        if(room>0.05) carry(a0.x,a0.y,a0.in,Math.max(carrySpeed(car),dd/room));
      } else {
        const dd=Math.hypot(a0.x-x,a0.y-y), pd=clamp(dd/SPD.pass,0.22,2.4), room=a0.in-t;
        if(room>pd+0.05) hold(room-pd);
        pass(a0.p,a0.x,a0.y,Math.max(t+0.1,a0.in),"",0.1);
      }
      if(t<a0.r) hold(a0.r-t);
      // passes décisives : chaque passe arrive au receveur, qui la contrôle puis la relaie
      for(let i=1;i<A.length;i++){
        const q=A[i];
        pass(q.p,q.x,q.y,Math.max(t+0.1,q.in),i===A.length-1?"set":"",0.1);
        if(t<q.r) hold(q.r-t);
      }
      car=shooter;
      // le tir
      const dist=Math.round(Math.hypot(net.x-x,net.y-y));
      const kind=shotKind(s,shooter,dist,ts,oneTimer);
      const t0=Math.min(Math.max(t,plan.rel),ts-0.06), t1=Math.max(ts,t0+0.06);
      if(Math.max(t,t0)+0.06>ts+0.05) late.push({t:ts,side:s,by:+(Math.max(t,t0)+0.06-ts).toFixed(2)});
      const ex=goal?d*(RK.GOAL+1.6):net.x-d*1.2;
      if(t0>t) hold(t0-t);
      add({k:"shot",t0:t,t1:Math.max(t1,t+0.06),side:s,p:shooter,x0:x,y0:y,x1:ex,y1:net.y,goal:!!goal,kind});
      sh.x=+x.toFixed(1);sh.y=+y.toFixed(1);sh.dist=dist;sh.kind=kind;
      x=ex;y=net.y;car=null;last=s;
      if(goal){
        side=null;
        if(ts<b-0.05) whistle("goal",{side:s});
        else add({k:"dead",t0:t,t1:t+0.02,x,y,face:null,cause:"goal"});
        return;
      }
      const gk=G.goalieAt(otherSide(s),ts);
      plays.push({t:ts,type:"shot",side:s,p:shooter,dist,kind,g:gk});
      // arrêt : rondelle immobilisée (mise au jeu en zone) ou rebond
      const next=anchors.find(z=>z.t>ts+0.01), gap=next?next.t-ts:Infinity;
      const sameSoon=next&&next.type==="shot"&&next.s.side===s&&gap<6;
      const oppSoon=next&&next.type==="shot"&&next.s.side!==s&&gap<14;
      if(!sameSoon&&!oppSoon&&gap>3&&R()<PJ.freeze){
        side=null;
        add({k:"held",t0:t,t1:t+0.6,x,y,g:gk,side:otherSide(s)});
        plays.push({t,type:"freeze",side:otherSide(s),g:gk});
        whistle("freeze",{side:otherSide(s),y:sh.y,g:gk});
        return;
      }
      // rebond vers l'enclave ou le coin
      const sgS=sh.y>=0?1:-1;
      const rb=R()<0.5?{u:78+R()*7,w:(R()-0.5)*16}:{u:84+R()*4,w:d*sgS*(16+R()*12)};
      side=null;
      loose(d*rb.u,d*rb.w,Math.min(0.45+R()*0.35,Math.max(0.15,gap*0.3)),"rebound");
      recover(sameSoon?s:oppSoon?otherSide(s):(R()<0.36?s:otherSide(s)),Math.max(0.05,gap*0.2));
    }

    /* ---------- déroulement de la période ---------- */
    stops.push({t:a,cause:"period",x:0,y:0});
    add({k:"dead",t0:a,t1:a+0.02,x:0,y:0,face:{x:0,y:0},cause:"period"});
    faceoff({x:0,y:0});
    for(const an of anchors){
      if(an.type==="shot"){
        const lead=7+R()*10;
        if(an.t-lead>t) free(an.t-lead,an.s.side);
        shoot(an);
      } else {
        // pénalité : le jeu s'arrête, mise au jeu dans la zone de l'équipe pénalisée
        if(an.t>t){free(an.t,null);fillTo(an.t)}
        const ps=[...new Set(an.g.list.map(p=>p.side))];
        if(ps.length>1) whistle("both",{pens:an.g.list});
        else whistle("penalty",{side:ps[0],pens:an.g.list});
      }
    }
    // fin de la période
    if(b>t){free(b,null);fillTo(b)}
    stops.push({t:b,cause:"end",x,y});
  }
}

/* ---------- Mises en échec (colonne MÉ) : sur le porteur adverse, par un joueur près de lui ---------- */
function placeHits(G,R){
  const hits=[];
  const carries=G.script.filter(it=>it.k==="carry"&&it.p&&it.t1-it.t0>0.6);
  const busy=[...G.shots.map(s=>s.t),...G.stopsList.map(s=>s.t)];
  SIDES.forEach(side=>G.roster[side].forEach(p=>{
    if(!p.ht) return;
    const cand=carries.filter(it=>it.side!==side&&G.segAt((it.t0+it.t1)/2).line[side].some(e=>e.p===p));
    for(let i=0;i<p.ht;i++){
      let best=null,bd=1e9;
      for(let k=0;k<30;k++){
        const it=cand.length?cand[Math.floor(R()*cand.length)]:null;
        let t;
        if(it) t=it.t0+0.25+R()*Math.max(0,it.t1-it.t0-0.5);
        else{const segs=G.segs.filter(sg=>sg.line[side].some(e=>e.p===p)&&sg.b-sg.a>6);if(!segs.length)break;const sg=segs[Math.floor(R()*segs.length)];t=sg.a+2+R()*(sg.b-sg.a-4)}
        if(busy.some(x=>Math.abs(x-t)<2)||hits.some(h=>Math.abs(h.t-t)<3)) continue;
        if(!G.segAt(t).line[side].some(e=>e.p===p)) continue;
        let dd=60;
        if(it){const tg=targetsAt(G,t,true).list, me=tg.find(o=>o.p===p), v=tg.find(o=>o.p===it.p);if(me&&v)dd=Math.hypot(me.x-v.x,me.y-v.y)}
        if(dd<bd){bd=dd;best={t,side,p,victim:it?it.p:null}}
        if(dd<14) break;
      }
      if(best) hits.push(best);
    }
  }));
  hits.sort((a,b)=>a.t-b.t);
  return hits;
}

/* ---------- Point d'entrée : appelé par buildGame une fois les présences établies ---------- */
function buildPlay(G,R,Rh){
  G.shots=scheduleShots(G,R);
  const sc=buildScript(G,R);
  G.script=sc.items.sort((a,b)=>a.t0-b.t0||a.t1-b.t1);
  G.stopsList=sc.stops; G.plays=sc.plays; G.offsides=sc.offs; G.late=sc.late;
  G.kfs=G.script.map(it=>[it.k,+it.t0.toFixed(3),+it.t1.toFixed(3),+(it.x1!==undefined?it.x1:it.x).toFixed(2),+(it.y1!==undefined?it.y1:it.y).toFixed(2)]);
  const starts=G.script.map(it=>it.t0);
  // morceau de trame en cours à l'instant t
  G.itemAt=t=>{
    const n=starts.length; if(!n) return null;
    if(t<=starts[0]) return G.script[0];
    let lo=0,hi=n-1;
    while(lo<hi){const m=(lo+hi+1)>>1;if(starts[m]<=t)lo=m;else hi=m-1}
    return G.script[lo];
  };
  G.shots.forEach(s=>{if(s.goal)s.goal.shot=s});
  G.hits=placeHits(G,Rh);
  G.plays.push(...G.hits.map(h=>({t:h.t,type:"hit",side:h.side,p:h.p,q:h.victim})));
  G.plays.sort((a,b)=>a.t-b.t);
}

/* ---------- Position de la rondelle ---------- */
function puckAt(G,t){
  const it=G.itemAt?G.itemAt(t):null;
  if(!it) return {x:0,y:0,side:null,item:null};
  if(it.k==="dead"||it.k==="held") return {x:it.x,y:it.y,side:null,item:it};
  const span=Math.max(1e-6,it.t1-it.t0);let f=clamp((t-it.t0)/span,0,1);
  if(it.k==="loose") f=1-(1-f)*(1-f);            // rondelle qui ralentit
  else if(it.k==="carry") f=f*f*(3-2*f);         // départ et arrêt en douceur
  let px=lerp(it.x0,it.x1,f), py=lerp(it.y0,it.y1,f);
  if(it.k==="dump"&&Math.abs(it.y1)>12){const by=Math.sign(it.y1)*(RK.HALFW-3);py=lerp(py,by,Math.sin(Math.PI*f)*0.35)}   // le long de la bande
  const q=inRink(px,py,0.8);
  return {x:q.x,y:q.y,side:it.k==="loose"?null:it.side||null,item:it,carrier:it.k==="carry"?it.p:null};
}

/* ---------- Place de chaque joueur à un instant ---------- */
function targetsAt(G,t,noHits){
  const pk=puckAt(G,t), it=pk.item, seg=G.segAt(t), out=[];
  const c={x:pk.x,y:pk.y,poss:null,last:null,car:null,rec:null,face:null,held:false};
  if(it){
    if(it.k==="dead"){c.face=it.face||null;if(!it.face)c.held=true}
    else if(it.k==="held"){c.last=otherSide(it.side);c.held=true}
    else if(it.k==="loose") c.last=it.last||null;
    else{c.poss=it.side;c.last=it.side;if(it.k==="carry")c.car=it.p;if(it.k==="pass")c.rec={p:it.to,x:it.x1,y:it.y1}}
  }
  const off=(G.offsides||[]).find(o=>t>=o.t0&&t<=o.t1);
  if(off&&c.poss===off.side) c.off={p:off.p};
  const F=formation(G,t,c);
  SIDES.forEach(side=>{
    const m=F[side];
    seg.line[side].forEach(e=>{
      const v=m.get(e.p); if(!v) return;
      let x=v.x,y=v.y;
      if(!c.face&&!v.carrier&&!v.receiver&&!v.chase){const ph=hashStr(e.p.id)%628/100;x+=Math.sin(t*0.8+ph)*1.4;y+=Math.cos(t*1.07+ph*1.7)*1.4}
      const q=inRink(x,y,1.5);
      out.push({p:e.p,role:e.role,side,x:q.x,y:q.y,carrier:!!v.carrier,receiver:!!v.receiver,offside:!!v.offside});
    });
    const g=G.goalieAt(side,t), dir=G.attackDir(side,t);
    if(G.pulledAt(side,t)) out.push({p:g,role:"G",side,x:BENCH[side].x+11,y:BENCH[side].y});
    else {
      // le gardien se place entre la rondelle et le centre de son filet
      const nx=-dir*RK.GOAL, vx=pk.x-nx, vy=pk.y, n=Math.hypot(vx,vy)||1;
      const depth=it&&it.k==="held"&&it.side===side?1.2:3.2;
      let gx=nx+vx/n*depth; const gy=clamp(vy/n*depth,-3.2,3.2);
      if(dir*gx<-RK.GOAL+0.6) gx=-dir*(RK.GOAL-0.6);
      out.push({p:g,role:"G",side,x:gx,y:gy});
    }
  });
  // mise en échec : le frappeur rejoint le porteur adverse
  if(!noHits){
    const HW=1.6;
    (G.hits||[]).forEach(h=>{
      const dt=t-h.t; if(dt<-HW||dt>HW) return;
      const me=out.find(o=>o.p===h.p); if(!me) return;
      const opp=out.filter(o=>o.side!==h.side&&o.role!=="G"); if(!opp.length) return;
      const tg=opp.find(o=>o.p===h.victim)||opp.find(o=>o.carrier)||opp.reduce((a,o)=>Math.hypot(o.x-pk.x,o.y-pk.y)<Math.hypot(a.x-pk.x,a.y-pk.y)?o:a);
      const w=1-Math.abs(dt)/HW, dir=G.attackDir(h.side,t);
      me.x=lerp(me.x,tg.x-dir*2.4,w); me.y=lerp(me.y,tg.y,w);
    });
  }
  return {list:out,puck:pk,seg,item:it,face:c.face};
}
