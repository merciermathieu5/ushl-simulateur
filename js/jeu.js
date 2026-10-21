"use strict";

/* ---------- Trame de jeu : le match simulé ----------
   Le match est simulé dixième de seconde par dixième de seconde. Chaque joueur patine avec son élan
   (vitesse de pointe et accélération selon sa cote de vitesse), décide lui-même où aller selon la
   situation et change d'idée à son propre rythme : sortie de zone, montée en zone neutre, cycle le long
   de la bande et derrière le filet, échec avant, repli, couverture en zone défensive, bataille dans les
   coins. Les joueurs ne bougent donc pas en bloc.
   La rondelle a sa propre physique : portée au bâton, passée vers l'endroit où le receveur arrivera,
   libre, elle glisse, ricoche sur la bande et la contourne derrière le filet.
   Un réalisateur fait respecter la feuille de match : chaque tir au but arrive au filet à la seconde
   prévue, lancé par le bon joueur (pour un but, après les passes décisives dans l'ordre), chaque pénalité
   est sifflée au bon moment et chaque joueur fait ses mises en échec. Entre ces moments, le jeu est libre :
   revirements, sorties de zone, replis, dégagements, tirs bloqués ou ratés, hors-jeu et dégagements
   refusés arrivent d'eux-mêmes.
   Les attaquants et les défenseurs changent chacun à leur rythme (js/game.js prévoit une fenêtre pour
   chaque changement) : à un arrêt de jeu, ou à la volée quand le jeu le permet; un changement raté laisse
   parfois un adversaire seul devant le filet.
   Le match simulé est enregistré (position de chaque joueur et de la rondelle à chaque dixième de seconde) :
   l'animation le rejoue, fluide à toutes les vitesses.

   Arrêts de jeu et mises au jeu suivent les règles (LNH, règles 76, 81 et 83) :
   - début de période et après un but : point central;
   - gardien qui immobilise la rondelle : zone de son équipe, du côté du tir;
   - pénalité : zone de l'équipe pénalisée;
   - dégagement refusé : zone de l'équipe fautive, qui ne peut pas changer de joueurs;
   - hors-jeu : point de la zone neutre devant la zone où il y a eu hors-jeu, du côté où la rondelle a franchi la ligne;
   - rondelle envoyée hors de la patinoire par l'équipe en attaque dans sa zone offensive : zone neutre;
   - pénalités coïncidentes : point le plus proche de l'arrêt de jeu.
   Au moment de la mise au jeu, seuls les deux centres sont dans le cercle; les ailiers sont sur les
   lignes de mise au jeu et les défenseurs derrière.

   Coordonnées en pieds : centre (0,0), lignes des buts à x = ±89, lignes bleues à ±25,
   points de mise au jeu à (±69, ±22) en zone, (±20, ±22) en zone neutre.
   Dans le repère d'une équipe, u avance vers le filet qu'elle attaque et w < 0 est sa gauche. */

const RK={GOAL:89,BLUE:25,EZX:69,NZX:20,DOTY:22,HALFW:42.5,HALFL:100,CORNER:28};
const DT=0.1;
// Fréquences du jeu libre, réglées pour donner les moyennes d'un match de la LNH : une cinquantaine de
// mises au jeu, 6 à 10 dégagements refusés, 4 à 8 hors-jeu, une ou deux rondelles hors de la patinoire.
const PJ={steal:0.014,intercept:0.42,bobble:0.03,fly:0.2,tagFail:0.2,out:0.012,freeze:0.5,logTake:0.35,logGive:0.5,attempt:0.6};
const isDrole=r=>r==="LD"||r==="RD";
const otherSide=s=>s==="home"?"away":"home";
// les huit points de mise au jeu hors du centre
const DOTS=[[-RK.EZX,-RK.DOTY],[-RK.EZX,RK.DOTY],[-RK.NZX,-RK.DOTY],[-RK.NZX,RK.DOTY],[RK.NZX,-RK.DOTY],[RK.NZX,RK.DOTY],[RK.EZX,-RK.DOTY],[RK.EZX,RK.DOTY]];
// portes du banc des joueurs (BENCH, js/util.js) et du banc des pénalités, de l'autre côté de la patinoire
const DOOR={away:{x:BENCH.away.x,y:-41},home:{x:BENCH.home.x,y:-41}};
const BOXDOOR={away:{x:20,y:41},home:{x:-20,y:41}};
// Math.hypot est lent : la simulation en fait des millions
const hyp=(a,b)=>Math.sqrt(a*a+b*b);

function inRink(x,y,m){
  m=m===undefined?2:m;
  const hx=RK.HALFL-m, hy=RK.HALFW-m; x=clamp(x,-hx,hx); y=clamp(y,-hy,hy);
  const cx=RK.HALFL-RK.CORNER, cy=RK.HALFW-RK.CORNER, r=RK.CORNER-m, ax=Math.abs(x), ay=Math.abs(y);
  if(ax>cx&&ay>cy){const dx=ax-cx,dy=ay-cy,d=hyp(dx,dy);if(d>r){x=Math.sign(x)*(cx+dx/d*r);y=Math.sign(y)*(cy+dy/d*r)}}
  return {x,y};
}
// Point hors de la glace (marge m) : point le plus proche sur la bande et normale vers l'intérieur
function boardsHit(x,y,m){
  const hx=RK.HALFL-m, hy=RK.HALFW-m, cx=RK.HALFL-RK.CORNER, cy=RK.HALFW-RK.CORNER, r=RK.CORNER-m;
  const ax=Math.abs(x), ay=Math.abs(y), sx=x<0?-1:1, sy=y<0?-1:1;
  if(ax>cx&&ay>cy){
    const dx=ax-cx, dy=ay-cy, d=hyp(dx,dy);
    if(d<=r) return null;
    const nx=dx/d, ny=dy/d;
    return {x:sx*(cx+nx*r),y:sy*(cy+ny*r),nx:-sx*nx,ny:-sy*ny};
  }
  if(ax>hx) return {x:sx*hx,y,nx:-sx,ny:0};
  if(ay>hy) return {x,y:sy*hy,nx:0,ny:-sy};
  return null;
}
// distance à la bande la plus proche
function boardDist(x,y){
  const cx=RK.HALFL-RK.CORNER, cy=RK.HALFW-RK.CORNER, ax=Math.abs(x), ay=Math.abs(y);
  if(ax>cx&&ay>cy) return RK.CORNER-hyp(ax-cx,ay-cy);
  return Math.min(RK.HALFL-ax,RK.HALFW-ay);
}
// distance du point (px,py) au segment (a,b)
function segDist(px,py,ax,ay,bx,by){
  const vx=bx-ax, vy=by-ay, L=vx*vx+vy*vy; let k=L>0?((px-ax)*vx+(py-ay)*vy)/L:0; k=clamp(k,0,1);
  return hyp(px-(ax+vx*k),py-(ay+vy*k));
}

/* ---------- Placement pour une mise au jeu ---------- */
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
      if(zone==="D") {if(boards){u=fu-16;w=fw+fs*6}else{u=-79;w=fw*0.15}}   // un derrière le cercle, l'autre devant le filet
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
const onPlan=(G,side,p,t)=>["F","D"].some(g=>G.plan[side][g].some(x=>x.a<=t&&t<x.b&&x.members.some(m=>m.p===p)));
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
    // Moments sûrs de chaque joueur (cœur de ses présences, quel que soit le moment exact des changements),
    // pondérés par la situation (plus de tirs en avantage numérique)
    const W=new Map(), inter=new Map();
    RS.forEach(p=>{W.set(p,periods.map(()=>0));inter.set(p,periods.map(()=>[]))});
    G.cores.forEach((list,p)=>{
      if(!W.has(p)) return;
      list.forEach(c=>{
        const per=c.per, m=c.kind==="PP"?2.2:c.kind==="PK"?0.3:1;
        const a=Math.max(c.a,(per-1)*1200+8), b=Math.min(c.b,perEnd(per)-1.5);
        if(b-a<0.4) return;
        const wt=(b-a)*m*(isDrole(c.role)?0.8:1);
        W.get(p)[per-1]+=wt; inter.get(p)[per-1].push({a,b,wt});
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
    // joueur sans présence prévue (absent des trios) : ses tirs tombent au cœur d'une présence de son groupe,
    // où il sera placé sur la glace
    const slotCores=(per,grp)=>{
      const tr=G.plan[side][grp], out=[];
      tr.forEach((x,i)=>{const pv=tr[i-1], a=Math.max((pv?pv.w1:x.a)+3,(per-1)*1200+8), b=Math.min(x.fixedB?x.b-0.3:x.w0,perEnd(per)-1.5);if(b-a>=4&&x.kind!=="PK")out.push({a,b,wt:b-a})});
      return out;
    };
    list.forEach(({p,per})=>{
      let iv=inter.get(p)[per-1];
      if(!iv.length) iv=slotCores(per,p.grp==="D"?"D":"F");
      const a0=(per-1)*1200+8, b0=perEnd(per)-1.5;
      const tryT=()=>{
        if(iv.length){const tot=iv.reduce((a,v)=>a+v.wt,0);let r=R()*tot;for(const v of iv){r-=v.wt;if(r<=0)return v.a+R()*(v.b-v.a)}const v=iv[iv.length-1];return v.a+R()*(v.b-v.a)}
        return a0+R()*Math.max(0,b0-a0);
      };
      // écarts minimaux : même équipe, autre équipe, après un but, autour d'une pénalité
      // (entre deux tirs des deux équipes, de quoi sortir de sa zone et y entrer, si les présences le permettent)
      const levels=[[2.6,11,8,3],[2.3,8.5,7.5,2.8],[2,5.5,7,2.5],[1.5,4,5,1.8],[1,2.5,3,1]];
      let placed=null;
      for(const [gs,go,ga,gp] of levels){
        for(let k=0;k<70&&placed===null;k++){
          const tt=tryT();
          if(G.pulledAt(otherSide(side),tt)) continue;          // pas de tir au but contre un filet désert
          if(G.boxedAt(side,tt).has(p)) continue;
          if(pens.some(x=>Math.abs(x-tt)<gp)) continue;
          if(shots.some(o=>{const dt=Math.abs(o.t-tt);if(o.goal&&tt>o.t&&tt-o.t<ga)return true;return o.side===side?dt<gs:dt<go})) continue;
          // joueur absent des présences à ce moment : il y est placé (impossible si tous y sont obligés)
          if(G.ensureOnIce&&!onPlan(G,side,p,tt)&&!G.ensureOnIce(side,p,tt)) continue;
          placed=tt;
        }
        if(placed!==null) break;
      }
      if(placed===null){let best=null,bd=-1;for(let k=0;k<60;k++){const tt=tryT();if(G.pulledAt(otherSide(side),tt))continue;const md=Math.min(99,...shots.map(o=>Math.abs(o.t-tt)));if(md>bd){bd=md;best=tt}}placed=best!==null?best:tryT()}
      // joueur sans présence à ce moment (données incomplètes) : il est placé sur la glace
      // le tireur reste dans cette présence (un autre joueur placé plus tard ne prendra pas sa place)
      if(G.ensureOnIce) G.ensureOnIce(side,p,placed);
      shots.push({t:placed,side,p,goal:null,per});
    });
  });
  shots.sort((a,b)=>a.t-b.t);
  return shots;
}
// Fenêtres de changement : un joueur qui sort ne part pas avant son dernier tir, celui qui arrive est sur la glace avant le sien.
function fitWindows(G){
  SIDES.forEach(side=>["F","D"].forEach(g=>{
    const tr=G.plan[side][g];
    tr.forEach((x,i)=>{
      const nx=tr[i+1]; if(x.fixedB||!nx) return;
      const inX=p=>x.members.some(m=>m.p===p), inN=p=>nx.members.some(m=>m.p===p);
      G.shots.forEach(s=>{
        if(s.side!==side||s.t<x.a||s.t>=nx.b) return;
        if(inX(s.p)&&!inN(s.p)) x.w0=Math.max(x.w0,s.t+0.5);
        if(inN(s.p)&&!inX(s.p)) x.w1=Math.min(x.w1,s.t-4);
      });
      if(x.w0>x.w1){x.w0=x.w1=clamp(x.b,x.w1,x.w0)}
    });
  }));
  SIDES.forEach(side=>G.plan[side].F.forEach(x=>{if(!x.pair||x.fixedB)return;const w0=Math.max(x.w0,x.pair.w0),w1=Math.min(x.w1,x.pair.w1);if(w0<=w1){x.w0=x.pair.w0=w0;x.w1=x.pair.w1=w1}else{x.w0=x.w1=x.pair.w0=x.pair.w1=x.b}}));
}

/* ---------- Mises en échec (colonne MÉ) : un moment visé pour chacune, pendant les présences du joueur ---------- */
function planHits(G,R){
  const out=[], busy=[...G.shots.map(s=>s.t),...G.pens.map(p=>p.t)];
  SIDES.forEach(side=>G.roster[side].forEach(p=>{
    if(!(p.ht>0)) return;
    let cores=(G.cores.get(p)||[]).filter(c=>c.b-c.a>4);
    // présences trop courtes pour avoir un cœur : on prend les présences prévues
    if(!cores.length) cores=["F","D"].flatMap(g=>G.plan[side][g].filter(x=>x.members.some(m=>m.p===p)&&x.b-x.a>4).map(x=>({a:x.a,b:x.b})));
    // joueur sans présence (absent des trios) mais avec des mises en échec : il joue une présence à forces égales
    if(!cores.length&&G.ensureOnIce){
      const tr=G.plan[side][p.grp==="D"?"D":"F"].filter(x=>x.kind==="ES"&&x.b-x.a>20&&x.b%1200<1185);
      for(let k=0;k<12&&!cores.length&&tr.length;k++){const x=tr[Math.floor(R()*tr.length)];if(G.ensureOnIce(side,p,(x.a+x.b)/2)&&x.members.some(m=>m.p===p))cores=[{a:x.a+2,b:x.b-2}]}
    }
    if(!cores.length) return;
    // pas dans les 15 dernières secondes d'une période : une mise en échec ratée peut encore être retentée
    const endOf=c=>{const per=c.per||Math.min(Math.floor(c.a/1200)+1,G.nPer);return Math.min(per*1200,G.T)-15};
    const cl=cores.map(c=>({a:c.a,b:Math.min(c.b,endOf(c))})).filter(c=>c.b-c.a>3);
    if(cl.length) cores=cl;
    // dernière présence du joueur : pas dans ses dernières secondes (il ne resterait plus de temps pour une seconde chance)
    const lastA=Math.max(...cores.map(c=>c.a));
    const cl2=cores.map(c=>c.a===lastA?{a:c.a,b:Math.min(c.b,c.a+Math.max(2,(c.b-c.a)*0.5))}:c).filter(c=>c.b-c.a>1.5);
    if(cl2.length) cores=cl2;
    const tot=cores.reduce((a,c)=>a+c.b-c.a,0);
    for(let i=0;i<p.ht;i++){
      let t=null;
      // toujours un moment : les contraintes (tirs, pénalités, autres mises en échec) s'assouplissent au besoin
      for(let k=0;k<90&&t===null;k++){
        let r=R()*tot, c=cores[cores.length-1];
        for(const x of cores){r-=x.b-x.a;if(r<=0){c=x;break}}
        const tt=c.a+Math.min(1.5,(c.b-c.a)/3)+R()*Math.max(0,c.b-c.a-3), relax=k>60?0:k>25?0.4:1;
        if(relax&&(busy.some(x=>Math.abs(x-tt)<2.5*relax)||out.some(h=>h.side===side&&Math.abs(h.t-tt)<4*relax))) continue;
        t=tt;
      }
      if(t!==null) out.push({p,side,t,done:false,tries:0});
    }
  }));
  out.sort((a,b)=>a.t-b.t);
  return out;
}

/* ---------- La simulation ---------- */
// Intention d'un joueur. Toutes ont la même forme (le moteur JavaScript les traite alors bien plus vite).
function ItC(k){this.k=k;this.u=0;this.w=0;this.spd=0.8;this.amp=0;this.until=Infinity;this.q=null;this.gap=0;this.lead=0;this.dep=0;this.du=0;this.dw=0;this.x=0;this.y=0;this.tArr=-1;this.toward=false;this.inside=false;this.keep=false;this.abs=false;this.build=false;this.safe=false;this.ms=0;this.pf=0;this.pu0=0;this.pw0=0}
function It(k,o){const r=new ItC(k);for(const key in o)r[key]=o[key];return r}
// La simulation avance par morceaux (générateur) : la page peut montrer le début du match pendant que la
// suite se calcule. L reçoit au fur et à mesure la trame, les arrêts, les jeux et l'enregistrement.
function* simGen(G,R,Rh,L){
  const items=L.items, stops=L.stops, plays=L.plays, offs=L.offs, late=L.late, hits=L.hits, pres=L.pres;
  const rt=L.rt, rpx=L.rpx, rpy=L.rpy, stints=L.stints, bucket=L.bucket;
  const stat=Object.assign(L.stat,{fly:0,whistleCh:0,forced:0,breakaways:0,entries:0,exits:0,dumps:0,attempts:0});
  const ents=new Map();
  const SK={away:[],home:[]};          // patineurs sur la glace
  const vis=new Set();                  // entités dont la position est enregistrée
  const GK={away:null,home:null};
  const dirS={away:1,home:-1};
  let t=0, pa=0, pb=0;
  const puck={x:0,y:0,vx:0,vy:0,st:"dead",car:null,from:null,to:null,last:null,lastE:null,rel:null,tArr:0,tx:0,ty:0,hold:0,seq:false,shot:null,yieldT:-1};
  let item=null, pending=null;
  let st=null;                          // situation (forces) au début du dixième de seconde
  const hitPlan=planHits(G,Rh);
  let hitIdx=0, hitDirty=false;

  function mkEnt(p,side,isG){
    const h=hashStr(p.id||p.name||"x"), sp=p.sp||70;
    return {p,side,isG:!!isG,grp:isG?"G":(p.grp==="D"?"D":"F"),role:isG?"G":null,trk:null,
      x:0,y:0,vx:0,vy:0,hx:1,hy:0,mode:"off",leaving:false,
      vmax:isG?15:22+clamp(sp-50,0,50)*0.16, acc:isG?40:12.5+clamp(sp-50,0,50)*0.07,
      pc:p.pc||70, str:p.st||70, ex:p.ex||60,
      aggr:((h>>>3)%100)/100, creat:((h>>>11)%100)/100, ph:((h>>>17)%628)/100, react:0.15+((h>>>7)%45)/100,
      it:null, thinkAt:0, slot:null, cmd:null, hunt:null, stun:0, fly:0,
      stint:null, pres:null, inZone:Infinity, atDoor:false, shiftT:0, carT:0, lastU:0, tpx:0, tpy:0,
      tgx:0, tgy:0, tgs:0, tga:-1, mv:false, lane:undefined, slot:null, mistake:0, gone:false, sepx:0, sepy:0, eng:false, u0:0};
  }
  const entOf=p=>{if(!p)return null;let e=ents.get(p);if(!e){e=mkEnt(p,p.side,p.grp==="G");ents.set(p,e)}return e};

  /* enregistrement */
  function closeStint(e){const s=e.stint;if(!s)return;e.stint=null;s.k1=s.k0+s.n-1;s.xs=s.xs.slice(0,s.n);s.ys=s.ys.slice(0,s.n)}
  function show(e){vis.add(e)}
  function hide(e){if(vis.has(e)){vis.delete(e);closeStint(e)}}
  // Trajectoires : un morceau par passage sur la glace, indexé par tranche de 10 secondes
  let nS=0, lastB=-1;
  function sample(){
    rt.push(t); rpx.push(puck.x); rpy.push(puck.y);
    const k=nS++, b=Math.floor(t/10), nb=b!==lastB;
    if(nb){lastB=b;if(!bucket[b])bucket[b]=[]}
    for(const e of vis){
      let s=e.stint;
      if(!s){s=e.stint={p:e.p,side:e.side,g:e.isG,k0:k,k1:k,n:0,xs:new Float32Array(256),ys:new Float32Array(256),off:Infinity,ix:stints.length};stints.push(s);bucket[b].push(s.ix)}
      else if(nb) bucket[b].push(s.ix);
      if(s.n===s.xs.length){const nx=new Float32Array(s.n*2),ny=new Float32Array(s.n*2);nx.set(s.xs);ny.set(s.ys);s.xs=nx;s.ys=ny}
      s.xs[s.n]=e.x; s.ys[s.n]=e.y; s.k1=s.k0+s.n; s.n++;
    }
  }
  // pour la lecture pendant le calcul : morceau de trame en cours, présences en cours
  L.openItem=()=>item;
  L.openPres=()=>{const out=[];ents.forEach(e=>{if(e.pres)out.push({p:e.pres.p,side:e.pres.side,role:e.pres.role,a:e.pres.a,b:t})});return out};
  /* présences sur la glace (elles donnent les lignes affichées et le temps de glace) */
  function presOn(e,role){e.pres={p:e.p,side:e.side,role,a:t}}
  function presOff(e){if(e.pres){e.pres.b=t;if(e.pres.b-e.pres.a>1e-6)pres.push(e.pres);e.pres=null}}
  function setRole(e,role){if(e.role===role)return;presOff(e);e.role=role;presOn(e,role)}
  function onIce(e,role,trk){
    e.mode="ice";e.role=role;e.trk=trk;e.leaving=false;e.cmd=null;dropHunt(e);e.it=null;e.thinkAt=t;e.shiftT=t;e.fly=0;e.inZone=Infinity;
    if(!SK[e.side].includes(e)) SK[e.side].push(e);
    show(e); presOn(e,role);
  }
  function offIce(e,transit){
    const L=SK[e.side], i=L.indexOf(e); if(i>=0) L.splice(i,1);
    if(puck.st==="pass"&&puck.to===e){
      const t0=t; t=t0-0.002; puck.st="free"; puck.to=null; openItem({k:"loose",last:puck.last,kind:"pass"}); item.t0=t; t=t0;
    } else {
      // passe vers lui (ou rondelle portée par lui) terminée à l'instant même : elle finit pendant qu'il est encore sur la glace
      const n=items.length, pv=items[n-1];
      if(item&&pv&&((pv.k==="pass"&&pv.to===e.p)||(pv.k==="carry"&&pv.p===e.p))&&pv.t1>t-0.0015){
        const tc=t-0.002; pv.t1=tc; if(pv.t0>tc){pv.t0=tc;const pp=items[n-2];if(pp&&pp.t1>tc)pp.t1=Math.max(pp.t0,tc)}
        if(item.t0>pv.t1)item.t0=pv.t1;
      }
    }
    presOff(e);
    if(puck.car===e) loosePuck(0,0,"drop");
    e.cmd=null;dropHunt(e);e.leaving=false;
    if(transit){e.mode="transit";if(e.stint)e.stint.off=t}
    else{e.mode="off";hide(e)}
  }

  /* trame de la rondelle */
  function openItem(o){closeItem();item=Object.assign({t0:t,x0:puck.x,y0:puck.y},o)}
  function closeItem(){if(!item)return;item.t1=Math.max(item.t0,t);item.x1=puck.x;item.y1=puck.y;items.push(item);item=null}

  /* repères */
  const U=(s,x)=>dirS[s]*x, Wf=(s,y)=>dirS[s]*y;
  const toXY=(s,u,w,m)=>inRink(dirS[s]*u,dirS[s]*w,m===undefined?2.5:m);
  const zoneOf=u=>u<-RK.BLUE?"D":u>RK.BLUE?"O":"N";
  const possSide=()=>puck.st==="car"?puck.car.side:puck.st==="pass"&&puck.from?puck.from.side:puck.st==="shot"?puck.shot.side:null;
  const nPlayers=s=>st[s].n;
  const shortOf=s=>st[s].n<st[otherSide(s)].n, ppOf=s=>st[s].n>st[otherSide(s)].n;
  function nearestOf(list,x,y,skip){let q=null,d=1e9;for(const e of list){if(e===skip)continue;const dd=hyp(e.x-x,e.y-y);if(dd<d){d=dd;q=e}}return {q,d}}
  const mates=e=>SK[e.side].filter(q=>q!==e&&!q.leaving);
  const opps=e=>SK[otherSide(e.side)];
  const laneMin=(ax,ay,bx,by,list)=>{let m=99;for(const q of list){const d=segDist(q.x,q.y,ax,ay,bx,by);if(d<m)m=d}return m};

  /* ---------- réalisateur ---------- */
  const DR={protect:{away:false,home:false},want:null,soft:null,noWhistle:false,quietSide:null,noAttempt:false,seq:null,shot:null,build:false,actors:new Set()};
  // pas de coup de sifflet causé par cette équipe (hors-jeu, dégagement refusé, rondelle hors de la patinoire)
  const quiet=s=>DR.noWhistle||DR.quietSide===s;
  let shotsP=[], sIdx=0, pensP=[], pIdx=0, freezeAt=Infinity, freezeInfo=null;
  const isActor=e=>DR.actors.has(e);

  /* ---------- lignes ---------- */
  const PI={away:{F:0,D:0},home:{F:0,D:0}};
  const chg={away:{F:null,D:null},home:{F:null,D:null}};
  const shiftOf=(s,g)=>G.plan[s][g][PI[s][g]];
  const nextOf=(s,g)=>G.plan[s][g][PI[s][g]+1];
  const doorOf=(e)=>DOOR[e.side];
  function wanted(s){const out=[];["F","D"].forEach(g=>{const x=shiftOf(s,g);if(x)x.members.forEach(m=>out.push({p:m.p,role:m.role,trk:g}))});return out}
  // l'alignement prévu devient celui sur la glace, tout de suite (arrêt de jeu ou frontière fixe en plein jeu)
  function applyNow(s,how){
    // un joueur qui change de groupe ne peut être dans les deux présences en cours : le groupe en retard avance
    for(let guard=0;guard<6;guard++){
      const f=shiftOf(s,"F"), d=shiftOf(s,"D"); if(!f||!d) break;
      if(!f.members.some(m=>d.members.some(n=>n.p===m.p))) break;
      const g=f.a<=d.a?"F":"D"; if(PI[s][g]>=G.plan[s][g].length-1) break;
      PI[s][g]++;
    }
    const W=wanted(s), want=new Set(W.map(m=>m.p));
    [...SK[s]].forEach(e=>{if(!want.has(e.p)) offIce(e,how==="play")});
    W.forEach(m=>{
      const e=entOf(m.p);
      if(e.mode==="ice"){setRole(e,m.role);e.trk=m.trk;e.leaving=false;return}
      if(e.mode==="transit") hide(e);
      const box=G.boxedAt(s,t-0.001).has(m.p), dr=box?BOXDOOR[s]:DOOR[s];
      e.x=box?dr.x+(R()-0.5)*3:benchX(s); e.y=dr.y; e.vx=0; e.vy=box?-6:6;
      onIce(e,m.role,m.trk);
    });
    chg[s].F=chg[s].D=null;
  }
  // Le banc est long : chacun en sort et y rentre à sa place, pas tous par le même point.
  const exitX=e=>DOOR[e.side].x+(e.ph/6.283-0.5)*12;
  function benchX(s){
    const dr=DOOR[s]; let bx=dr.x, bd=-1;
    for(let k=0;k<5;k++){const x=dr.x+(R()-0.5)*14;let m=99;for(const q of SK[s]){const dd=hyp(q.x-x,q.y-dr.y);if(dd<m)m=dd}if(m>bd){bd=m;bx=x}}
    return bx;
  }
  const etaDoor=e=>{const dr=doorOf(e);return hyp(e.x-dr.x,e.y-dr.y)/(e.vmax*0.85)+0.8};
  function startChange(s,g,forced){
    const cur=shiftOf(s,g), nx=nextOf(s,g);
    const keep=new Set(nx.members.map(m=>m.p));
    const out=SK[s].filter(e=>e.trk===g&&!keep.has(e.p));
    const inn=nx.members.filter(m=>entOf(m.p).mode!=="ice");
    out.forEach(e=>{e.leaving=true;e.cmd=null;dropHunt(e);e.it=null;e.thinkAt=t});
    chg[s][g]={to:PI[s][g]+1,out,inn:[...inn],due:dueOf(s,inn)};
    if(forced) stat.forced++;
  }
  // remplaçants qui attendent au banc (calculé au moment voulu : un joueur peut avoir changé de groupe entre-temps)
  function innNow(s,g,c){
    const L=c.joint?[...G.plan[s].F[c.to].members.map(m=>({p:m.p,role:m.role,trk:"F"})),...G.plan[s].D[c.toD].members.map(m=>({p:m.p,role:m.role,trk:"D"}))]
      :G.plan[s][g][c.to].members.map(m=>({p:m.p,role:m.role,trk:g}));
    return L.filter(m=>{const e=entOf(m.p);return e.mode!=="ice"&&!G.boxedAt(s,t).has(m.p)});
  }
  function finishChange(s,g){
    const c=chg[s][g]; if(!c) return;
    innNow(s,g,c).forEach(m=>{const q=entOf(m.p);if(q.mode==="transit")hide(q);const dr=DOOR[s];q.x=benchX(s);q.y=dr.y;q.vx=0;q.vy=6;onIce(q,m.role,m.trk)});
    if(c.joint){PI[s].F=c.to;PI[s].D=c.toD;chg[s].F=chg[s].D=null}
    else{PI[s][g]=c.to;chg[s][g]=null}
    const ks=c.joint?["F","D"]:[g];
    ks.forEach(k=>shiftOf(s,k).members.forEach(m=>{
      const e=entOf(m.p); if(e.mode!=="ice") return;
      // joueur qui change de groupe et que l'autre changement envoyait au banc : il reste sur la glace
      if(e.leaving){const og=k==="F"?"D":"F", oc=chg[s][og];if(oc&&!oc.joint){const i=oc.out.indexOf(e);if(i>=0)oc.out.splice(i,1)}e.leaving=false;e.it=null;e.thinkAt=t}
      const was=e.trk; setRole(e,m.role); e.trk=k;
      // il quitte l'autre groupe : sa place y est prise tout de suite par un joueur de la présence suivante
      if(!c.joint&&was&&was!==k) fillSlot(s,was);
    }));
  }
  function fillSlot(s,og){
    if(chg[s][og]) return;
    const cur=shiftOf(s,og), nx=nextOf(s,og); if(!cur||!nx) return;
    const on=SK[s].filter(e=>e.trk===og&&!e.leaving).length;
    if(on>=cur.members.length) return;
    const m=nx.members.find(q=>{const e=entOf(q.p);return e.mode!=="ice"&&!G.boxedAt(s,t).has(q.p)}); if(!m) return;
    const q=entOf(m.p); if(q.mode==="transit")hide(q); const dr=DOOR[s]; q.x=benchX(s); q.y=dr.y; q.vx=0; q.vy=6; onIce(q,m.role,og); stat.fill=(stat.fill||0)+1;
  }
  function startJoint(s,forced){
    const nF=nextOf(s,"F"), nD=nextOf(s,"D");
    const nw=[...nF.members.map(m=>({p:m.p,role:m.role,trk:"F"})),...nD.members.map(m=>({p:m.p,role:m.role,trk:"D"}))];
    const keep=new Set(nw.map(m=>m.p));
    const out=SK[s].filter(e=>!keep.has(e.p)), inn=nw.filter(m=>entOf(m.p).mode!=="ice");
    out.forEach(e=>{e.leaving=true;e.cmd=null;dropHunt(e);e.it=null;e.thinkAt=t});
    chg[s].F=chg[s].D={to:PI[s].F+1,toD:PI[s].D+1,out,inn,joint:true,due:dueOf(s,inn)};
    if(forced) stat.forced++;
  }
  // moment où les remplaçants doivent être sur la glace : un peu avant le premier tir de l'un d'eux
  function dueOf(s,inn){
    let d=Infinity;
    for(const x of shotsP) if(!x.done&&x.side===s&&x.t>t&&x.t-3.5<d&&inn.some(m=>m.p===x.p)) d=x.t-3.5;
    return d;
  }
  function stepChange(s,g){
    const c=chg[s][g]; if(!c) return;
    c.out.forEach(e=>{
      if(e.mode!=="ice") return;
      const dr=DOOR[s];
      if((hyp(e.x-exitX(e),e.y-dr.y)<4.5||hyp(e.x-dr.x,e.y-dr.y)<5)&&puck.car!==e&&!(puck.st==="pass"&&puck.to===e)){
        // il arrive au banc : son remplaçant saute sur la glace
        offIce(e,true);
        const pool=innNow(s,g,c);
        let k=pool.findIndex(m=>m.role===e.role); if(k<0) k=0;
        const m=pool[k];
        if(m){const q=entOf(m.p);if(q.mode==="transit")hide(q);q.x=lerp(e.x,benchX(s),0.5);q.y=dr.y+0.5;q.vx=(R()-0.5)*5;q.vy=8;onIce(q,m.role,m.trk);q.thinkAt=t+0.15}
      }
    });
    if(c.out.every(e=>e.mode!=="ice")) finishChange(s,g);
  }
  // mauvais moment pour changer : l'adversaire a la rondelle de notre côté, ou elle est libre (ou à nous) au fond de notre zone
  function badChange(s){
    const pu=dirS[s]*puck.x, ps=possSide();
    if(ps&&ps!==s) return pu<25;
    if(!ps) return pu<-15;
    return pu<-50;
  }
  // limite d'un changement retardé : les remplaçants doivent arriver à temps pour leurs tirs et pour un but ou une pénalité
  function holdLimit(s,cur,nx){
    let lim=cur.w1+7;
    nx.must.forEach(m=>{lim=Math.min(lim,m-6)});
    const inn=nx.members.filter(m=>entOf(m.p).mode!=="ice");
    for(const x of shotsP) if(!x.done&&x.side===s&&x.t>t&&inn.some(m=>m.p===x.p)){lim=Math.min(lim,x.t-5);break}
    return lim;
  }
  // bon moment pour changer : le jeu s'éloigne de notre filet
  function goodChange(s,g,outs){
    if(DR.soft===s||DR.protect[s]||DR.want===s) return false;
    // l'attaquant qui va changer a la rondelle en zone neutre : il la lance au fond et file au banc
    if(g==="F"&&puck.st==="car"&&outs.includes(puck.car)&&!outs.some(e=>isActor(e))){
      const pu=dirS[s]*puck.x;
      return pu>-8&&pu<RK.BLUE-2&&R()<0.3;
    }
    if(outs.some(e=>e===puck.car||isActor(e)||(puck.st==="pass"&&puck.to===e))) return false;
    const d=dirS[s], pu=d*puck.x, ps=possSide(), own=ps===s, opp=ps===otherSide(s), free=!ps;
    const rel=puck.rel;
    if(opp&&pu<15) return false;
    if(free&&pu<-20) return false;
    if(shortOf(s)&&free&&pu>30&&rel&&rel.side===s) return true;            // désavantage : rondelle dégagée, on change
    if(ppOf(s)&&free&&pu<-30&&rel&&rel.side!==s) return true;              // avantage : l'adversaire a dégagé, nouvelle unité
    if(g==="F"){
      if(own&&pu<10&&puck.car&&puck.car.trk==="D"&&pu>-80) return true;      // le défenseur relance : les attaquants changent
      if(own&&pu>-20&&pu<15&&puck.car&&!outs.includes(puck.car)&&R()<0.25) return true;   // en zone neutre avec la rondelle
      if(free&&pu>35&&rel&&rel.side===s) return true;                       // rondelle lancée au fond de la zone adverse
      if(opp&&pu>48) return true;                                           // l'adversaire repart de loin
      return false;
    }
    if(own&&pu>36) return true;                                             // attaque installée : les défenseurs changent
    if(free&&pu>40&&rel&&rel.side===s) return true;
    if(opp&&pu>55) return true;
    return false;
  }
  function changeTick(s,g){
    if(chg[s][g]&&chg[s][g].joint&&g==="D") return;
    if(chg[s][g]){
      const cur=shiftOf(s,g), c=chg[s][g];
      // changement trop long (joueur loin du banc) : les remplaçants sautent sur la glace sans attendre
      if(cur&&t>=Math.min(cur.w1+1.5,c.due)){
        const car=c.out.find(e=>e===puck.car||(puck.st==="pass"&&puck.to===e));
        // le joueur qui sort avec la rondelle s'en débarrasse d'abord
        if(car){if(car===puck.car&&car.cmd){car.cmd=null;car.thinkAt=t}}
        else{c.out.forEach(e=>{if(e.mode==="ice")offIce(e,true)});finishChange(s,g);return}
      }
      stepChange(s,g);return;
    }
    const cur=shiftOf(s,g);
    if(!cur||cur.fixedB||t<cur.w0-1e-9) return;
    const nx=nextOf(s,g); if(!nx) return;
    if(cur._chkAt!==undefined&&t<cur._chkAt) return;
    cur._chkAt=t+0.25;
    if(cur.pair){
      // unité spéciale : les défenseurs changent avec les attaquants
      if(g==="D") return;
      const curD=shiftOf(s,"D"), nxD=nextOf(s,"D");
      if(curD===cur.pair&&nxD&&nx.pair===nxD&&!curD.fixedB){
        const keep=new Set([...nx.members,...nxD.members].map(m=>m.p)), outs=SK[s].filter(e=>!keep.has(e.p));
        if(!outs.length){finishChange(s,"F");chg[s].F=chg[s].D={to:PI[s].F+1,toD:PI[s].D+1,out:[],inn:[...nx.members.map(m=>({p:m.p,role:m.role,trk:"F"})),...nxD.members.map(m=>({p:m.p,role:m.role,trk:"D"}))].filter(m=>entOf(m.p).mode!=="ice"),joint:true};finishChange(s,"F");return}
        const due=outs.some(e=>t>=cur.w1-etaDoor(e)-0.85), good=goodChange(s,"F",outs)&&goodChange(s,"D",outs);
        const forced=due&&(!badChange(s)||outs.some(e=>t>=Math.min(holdLimit(s,cur,nx),holdLimit(s,curD,nxD))-etaDoor(e)-0.85));
        if(forced||good) startJoint(s,forced&&!good);
        return;
      }
    }
    const outs=SK[s].filter(e=>e.trk===g&&!nx.members.some(m=>m.p===e.p));
    if(!outs.length){PI[s][g]++;shiftOf(s,g).members.forEach(m=>{const e=entOf(m.p);if(e.mode==="ice"){setRole(e,m.role);e.trk=g}});return}
    const due=outs.some(e=>t>=cur.w1-etaDoor(e)-0.85), good=goodChange(s,g,outs);
    // changement dû pendant que l'adversaire attaque : on attend que le jeu sorte de notre zone (jusqu'à une limite)
    const forced=due&&(!badChange(s)||outs.some(e=>t>=holdLimit(s,cur,nx)-etaDoor(e)-0.85));
    if(forced||good) startChange(s,g,forced&&!good);
  }
  // à un arrêt de jeu : changements terminés, prévus ou permis
  function whistleChanges(s,noChange){
    const c0=chg[s].F;
    if(c0&&c0.joint){PI[s].F=c0.to;PI[s].D=c0.toD;chg[s].F=chg[s].D=null}
    const before={F:PI[s].F,D:PI[s].D};
    ["F","D"].forEach(g=>{
      const tr=G.plan[s][g];
      if(chg[s][g]){PI[s][g]=chg[s][g].to;chg[s][g]=null}
      for(let guard=0;guard<50&&PI[s][g]<tr.length-1;guard++){
        const cur=tr[PI[s][g]];
        if(cur.fixedB){if(cur.b<=t+0.15){PI[s][g]++;continue}break}
        if(noChange) break;
        // changement prévu dans la fenêtre, ou un peu plus tôt si les joueurs qui sortent n'ont plus rien à faire
        const nx=tr[PI[s][g]+1], outP=cur.members.map(m=>m.p).filter(p=>!nx.members.some(m=>m.p===p));
        // (une présence déjà longue change volontiers à la mise au jeu)
        const early=(t>=cur.b-12||(t>=cur.b-18&&t-cur.a>=(g==="F"?28:32)))&&!G.shots.some(x=>x.side===s&&outP.includes(x.p)&&x.t>=t-0.01&&x.t<=cur.w0+0.5)&&!cur.must.some(m=>m>t-0.5);
        if(t>=cur.w0||early){PI[s][g]++;stat.whistleCh++}
        break;
      }
    });
    // unité spéciale : si l'un des deux groupes a changé, l'autre aussi
    const f0=G.plan[s].F[before.F], d0=G.plan[s].D[before.D];
    if(f0&&f0.pair===d0&&!f0.fixedB){
      const mvF=PI[s].F!==before.F, mvD=PI[s].D!==before.D;
      // l'autre groupe change aussi, sauf si l'un de ses joueurs doit encore tirer : alors personne ne change
      const canGo=(g,i)=>{const tr=G.plan[s][g],cur=tr[i],nx=tr[i+1];if(!nx)return false;if(t>=cur.w0)return true;
        const outP=cur.members.map(m=>m.p).filter(p=>!nx.members.some(m=>m.p===p));
        return !G.shots.some(x=>x.side===s&&outP.includes(x.p)&&x.t>=t-0.01&&x.t<=cur.w0+0.5)&&!cur.must.some(m=>m>t-0.5)};
      if(mvF&&!mvD){if(canGo("D",before.D))PI[s].D++;else PI[s].F=before.F}
      if(mvD&&!mvF){if(canGo("F",before.F))PI[s].F++;else PI[s].D=before.D}
    }
  }
  function midBoundaries(){
    SIDES.forEach(s=>{
      let moved=false;
      ["F","D"].forEach(g=>{
        const tr=G.plan[s][g];
        while(PI[s][g]<tr.length-1){const cur=tr[PI[s][g]];if(cur.fixedB&&cur.b<=t+1e-6){if(chg[s][g])chg[s][g]=null;PI[s][g]++;moved=true}else break}
      });
      if(moved) applyNow(s,"play");
    });
  }

  /* ---------- gardiens ---------- */
  function placeGoalie(s){
    const g=GK[s]; if(!g) return;
    if(G.pulledAt(s,t+0.06)){g.mode="gbench";g.x=BENCH[s].x+11;g.y=BENCH[s].y;g.vx=g.vy=0;return}
    g.mode="ice"; g.atDoor=false; g.x=-dirS[s]*(RK.GOAL-2.5); g.y=0; g.vx=g.vy=0;
  }
  function goalieTick(s,dt){
    const g=GK[s]; if(!g) return;
    if(g.mode==="gbench") return;
    if(g.mode==="gleave"){
      const dr=DOOR[s];
      if(hyp(g.x-dr.x,g.y-dr.y)<3) g.atDoor=true;
      const tgt=g.atDoor?{x:BENCH[s].x+11,y:BENCH[s].y}:dr;
      const dx=tgt.x-g.x, dy=tgt.y-g.y, dd=hyp(dx,dy);
      if(dd<0.8){g.mode="gbench";g.x=tgt.x;g.y=tgt.y;return}
      const sp=Math.min(17,dd*3);g.vx=dx/dd*sp;g.vy=dy/dd*sp;g.x+=g.vx*dt;g.y+=g.vy*dt;return;
    }
    const d=dirS[s], nx=-d*RK.GOAL;
    let px=puck.x, py=puck.y;
    if(puck.st==="shot"&&puck.shot&&puck.shot.side!==s){px=puck.tx;py=puck.ty}
    let gx,gy;
    if(puck.st==="held"&&puck.gk===g){gx=g.x;gy=g.y}
    else if(d*(px-nx)<0.5){gx=nx+d*0.9;gy=py>0?2.6:-2.6}                       // rondelle derrière la ligne : collé au poteau
    else{
      const vx=px-nx, vy=py, n=hyp(vx,vy)||1, depth=clamp(n/14,1.2,3.4);
      gx=nx+vx/n*depth; gy=clamp(vy/n*depth,-3.3,3.3);
      if(d*(gx-nx)<0.8) gx=nx+d*0.8;
    }
    const dx=gx-g.x, dy=gy-g.y, dd=hyp(dx,dy), sp=Math.min(g.vmax,dd*6);
    const tvx=dd>1e-3?dx/dd*sp:0, tvy=dd>1e-3?dy/dd*sp:0;
    let ax=tvx-g.vx, ay=tvy-g.vy; const am=hyp(ax,ay), lim=g.acc*dt; if(am>lim){ax*=lim/am;ay*=lim/am}
    g.vx+=ax; g.vy+=ay; g.x+=g.vx*dt; g.y+=g.vy*dt;
  }

  /* ---------- rondelle ---------- */
  function stickPos(e){
    const k=Math.sin(t*6.5+e.ph)*0.45;
    return inRink(e.x+e.hx*1.8-e.hy*k,e.y+e.hy*1.8+e.hx*k,0.8);
  }
  function gain(e,kind){
    if(puck.rel&&puck.rel.side!==e.side) puck.rel=null;
    const wasOut=dirS[e.side]*puck.x<=RK.BLUE;
    puck.st="car";puck.car=e;puck.from=null;puck.to=null;puck.seq=false;puck.last=e.side;puck.lastE=e;puck.rel=null;
    let sp=stickPos(e);
    if(wasOut&&dirS[e.side]*sp.x>RK.BLUE-0.1&&!mayEnter(e)) sp={x:dirS[e.side]*(RK.BLUE-0.1),y:sp.y};
    puck.x=sp.x; puck.y=sp.y; puck.vx=e.vx; puck.vy=e.vy;
    openItem(It("carry",{side:e.side,p:e.p,kind:kind||""}));
    e.carT=t; e.thinkAt=Math.min(e.thinkAt,t+0.12+R()*0.2); e.it=null; e.cmd=e.cmd&&e.cmd.keep?e.cmd:null;
    if(e.hunt&&!e.hunt.pen) dropHunt(e);
  }
  function loosePuck(vx,vy,kind){
    const from=puck.car;
    puck.st="free";puck.car=null;puck.to=null;puck.seq=false;puck.vx=vx;puck.vy=vy;puck.hold=t+0.25;
    if(from){puck.lastE=from;puck.last=from.side}
    openItem({k:"loose",last:puck.last,kind:kind||""});
  }
  function passTo(e,m,P,v,kind,seq){
    const dx=P.x-puck.x, dy=P.y-puck.y, dd=hyp(dx,dy)||1;
    puck.st="pass";puck.car=null;puck.from=e;puck.to=m;puck.vx=dx/dd*v;puck.vy=dy/dd*v;puck.tArr=t+dd/v;puck.tx=P.x;puck.ty=P.y;puck.seq=!!seq;
    puck.last=e.side;puck.lastE=e;puck.hold=t+0.2;
    puck.rel={side:e.side,u:U(e.side,puck.x),y0:puck.y,t,kind:"pass",sh:shortOf(e.side)};
    // seq : passe d'une séquence de tir prévue; prot : l'équipe doit garder la rondelle pour un tir prévu
    openItem({k:"pass",side:e.side,from:e.p,to:m.p,kind:kind||"",seq:!!seq,prot:!!DR.protect[e.side]});
    if(!seq) m.it=It("recv",{x:P.x,y:P.y,tArr:puck.tArr,until:puck.tArr+0.6});
    m.thinkAt=puck.tArr+0.3;
    e.thinkAt=t+0.4+R()*0.4; e.it=null;
  }
  function dumpTo(e,P,v,kind){
    const dx=P.x-puck.x, dy=P.y-puck.y, dd=hyp(dx,dy)||1;
    puck.st="free";puck.car=null;puck.from=e;puck.to=null;puck.seq=false;puck.vx=dx/dd*v;puck.vy=dy/dd*v;
    puck.last=e.side;puck.lastE=e;puck.hold=t+0.45;
    puck.rel={side:e.side,u:U(e.side,puck.x),y0:puck.y,t,kind:kind==="clear"||kind==="dump"||kind==="rim"||kind==="chip"?(kind==="rim"||kind==="chip"?"rim":kind):"pass",sh:shortOf(e.side),dk:kind};
    openItem({k:"dump",side:e.side,from:e.p,kind});
    e.thinkAt=t+0.3+R()*0.3; e.it=null;
    if(kind==="dump") stat.dumps++;
  }
  // tir hors cadre ou bloqué (jeu libre : il ne compte pas comme tir au but)
  function attempt(e){
    const s=e.side, d=dirS[s], nx=d*RK.GOAL;
    stat.attempts++;
    const blk=opps(e).filter(q=>segDist(q.x,q.y,puck.x,puck.y,nx,0)<2.6&&hyp(q.x-puck.x,q.y-puck.y)<hyp(nx-puck.x,puck.y)*0.8&&hyp(q.x-puck.x,q.y-puck.y)>3)[0];
    const block=!!blk&&R()<0.7;
    const ty=block?blk.y:(R()<0.5?-1:1)*(4+R()*7), tx=block?blk.x:d*(RK.GOAL+2), dx=tx-puck.x, dy=ty-puck.y, n=hyp(dx,dy)||1, v=72+R()*20;
    puck.st="free";puck.car=null;puck.vx=dx/n*v;puck.vy=dy/n*v;puck.hold=t+0.3;puck.lastE=e;puck.last=s;puck.rel={side:s,u:U(s,puck.x),y0:puck.y,t,kind:"miss",sh:false};
    puck.blocker=block?blk:null; puck.shooter=e;
    if(!block) plays.push({t,type:"miss",side:s,p:e.p});
    openItem({k:"loose",last:s,kind:block?"block":"miss",from:e.p});
    e.thinkAt=t+0.4; e.it=null;
  }
  function freePhysics(dt){
    const sp=hyp(puck.vx,puck.vy);
    if(DR.seq&&DR.seq.redir){
      const a1=DR.seq.actors[DR.seq.k];
      if(a1){const dx=a1.x-puck.x, dy=a1.y-puck.y, dd=hyp(dx,dy)||1, v=Math.max(sp,25);puck.vx=lerp(puck.vx,dx/dd*v,0.35);puck.vy=lerp(puck.vy,dy/dd*v,0.35)}
    }
    else if(sp>0){
      const dec=(4+0.32*sp)*dt, ns=Math.max(0,sp-dec);
      puck.vx*=ns/sp; puck.vy*=ns/sp;
    }
    puck.x+=puck.vx*dt; puck.y+=puck.vy*dt;
    const h=boardsHit(puck.x,puck.y,0.6);
    if(h){
      puck.x=h.x; puck.y=h.y;
      const vn=puck.vx*h.nx+puck.vy*h.ny;
      if(vn<0){
        const v=hyp(puck.vx,puck.vy)||1;
        // angle rasant : la rondelle longe la bande (et la contourne derrière le filet); sinon elle rebondit
        if(-vn<0.42*v){puck.vx-=vn*h.nx;puck.vy-=vn*h.ny;puck.vx*=0.985;puck.vy*=0.985}
        else{puck.vx-=1.55*vn*h.nx;puck.vy-=1.55*vn*h.ny;puck.vx*=0.8;puck.vy*=0.8}
      }
    }
    // filets : la rondelle libre n'entre jamais (le gardien la repousse) et rebondit sur la cage
    [-1,1].forEach(sx=>{
      const ax=sx*puck.x;
      if(ax>RK.GOAL-1.2&&ax<RK.GOAL+3.6&&Math.abs(puck.y)<3.6){
        const front=ax<RK.GOAL+0.3&&sx*puck.vx>0;
        if(front){puck.x=sx*(RK.GOAL-1.3);puck.vx=-puck.vx*0.35+(R()-0.5)*4;puck.vy=(puck.y>=0?1:-1)*(6+R()*10)}
        else if(ax>RK.GOAL+3.2){puck.x=sx*(RK.GOAL+3.7);puck.vx=Math.abs(puck.vx)*0.5*sx}
        else{puck.y=(puck.y>=0?1:-1)*3.7;puck.vy=-puck.vy*0.5}
      }
    });
  }
  function mayEnter(e){
    const s=e.side, d=dirS[s], off=SK[s].filter(q=>q!==e&&(d*q.x>RK.BLUE||q.u0>RK.BLUE));
    if(!off.length) return true;
    const slip=!quiet(s)&&!DR.protect[s]&&outSince[s]<=t-0.45&&e.mistake>t;
    return slip&&off.every(q=>q.inZone<=t-0.35);
  }
  function puckTick(dt){
    if(puck.st==="car"){
      const e=puck.car, s=e.side, d=dirS[s]; let sp=stickPos(e);
      if(d*puck.x<=RK.BLUE&&d*sp.x>RK.BLUE-0.1&&!mayEnter(e)){
        // il attend à la ligne bleue : la rondelle reste dehors, le porteur aussi
        const back=d*sp.x-(RK.BLUE-0.1); sp={x:sp.x-d*back,y:sp.y}; e.x-=d*back; if(d*e.vx>0)e.vx=0;
      }
      puck.vx=(sp.x-puck.x)/dt;puck.vy=(sp.y-puck.y)/dt;puck.x=sp.x;puck.y=sp.y;return;
    }
    if(puck.st==="pass"){
      // passe prévue (séquence de tir) ou passe sûre (équipe protégée) : la rondelle s'ajuste un peu vers le receveur
      const m=puck.to;
      if(m&&(puck.seq||DR.protect[puck.last])&&m.mode==="ice"){
        const sp=hyp(puck.vx,puck.vy)||1, dx=m.x-puck.x, dy=m.y-puck.y, dd=hyp(dx,dy);
        if(dd>2&&(dx*puck.vx+dy*puck.vy)>0){
          const a0=Math.atan2(puck.vy,puck.vx), a1=Math.atan2(dy,dx);
          let da=a1-a0; while(da>Math.PI)da-=2*Math.PI; while(da<-Math.PI)da+=2*Math.PI;
          const a2=a0+clamp(da,-0.09,0.09);
          let v=sp; if(puck.seq){const left=puck.tArr-t;if(left>0.08)v=clamp(dd/left,Math.max(25,sp*0.8),Math.min(95,sp*1.2))}
          puck.vx=Math.cos(a2)*v; puck.vy=Math.sin(a2)*v;
        }
      }
      puck.x+=puck.vx*dt; puck.y+=puck.vy*dt;
      const bh=boardsHit(puck.x,puck.y,0.6);
      if(bh){if(puck.seq){puck.x=bh.x;puck.y=bh.y;const vn=puck.vx*bh.nx+puck.vy*bh.ny;if(vn<0){puck.vx-=vn*bh.nx;puck.vy-=vn*bh.ny}}else{puck.st="free";openItem({k:"loose",last:puck.last,kind:"pass"});freePhysics(0)}}
      return;
    }
    if(puck.st==="shot"){
      const f=clamp((t+dt-puck.t0)/Math.max(1e-6,puck.tArr-puck.t0),0,1);
      const nx=lerp(puck.sx,puck.tx,f), ny=lerp(puck.sy,puck.ty,f);
      puck.vx=(nx-puck.x)/dt; puck.vy=(ny-puck.y)/dt; puck.x=nx; puck.y=ny; return;
    }
    if(puck.st==="held"){const g=puck.gk;puck.x=g.x+dirS[g.side]*0.8;puck.y=g.y+0.6;puck.vx=puck.vy=0;return}
    if(puck.st==="free") freePhysics(dt);
  }

  /* ---------- arrêts de jeu ---------- */
  const sideY=v=>(v>0?1:v<0?-1:(R()<0.5?-1:1))*RK.DOTY;
  function dotNear(px,py){let best=DOTS[0],bd=1e9;DOTS.forEach(o=>{const dd=hyp(o[0]-px,o[1]-py);if(dd<bd){bd=dd;best=o}});return {x:best[0],y:best[1]}}
  function faceDot(cause,info){
    switch(cause){
      case "period": case "goal": return {x:0,y:0};
      case "freeze": return {x:-dirS[info.side]*RK.EZX,y:sideY(info.y)};
      case "penalty": return {x:-dirS[info.side]*RK.EZX,y:sideY(puck.y)};
      case "icing": return {x:-dirS[info.side]*RK.EZX,y:sideY(info.y0)};
      case "offside": return {x:dirS[info.side]*RK.NZX,y:sideY(info.yc)};
      case "out": return {x:dirS[info.side]*RK.NZX,y:sideY(info.y)};
      default: return dotNear(puck.x,puck.y);
    }
  }
  function blow(cause,info){if(!pending)pending={cause,info:info||{}}}
  function doWhistle(){
    const {cause,info}=pending; pending=null;
    const dot=faceDot(cause,info);
    stops.push({t,cause,x:dot.x,y:dot.y,wx:puck.x,wy:puck.y,side:info.side||null,g:info.g||null,pens:info.pens||null});
    // le morceau de trame en cours s'arrête juste avant le coup de sifflet (les joueurs qui sortent y sont encore)
    if(item){
      const t0=t, tc=t0-0.0005, pv=items[items.length-1];
      // morceau ouvert à l'instant même du coup de sifflet : lui et le précédent finissent juste avant
      if(item.t0>tc&&pv&&pv.t1>tc){pv.t1=Math.max(pv.t0,tc);item.t0=pv.t1}
      t=Math.max(item.t0,tc);closeItem();t=t0;
    }
    puck.st="dead"; puck.car=null; puck.to=null;
    const dead={k:"dead",t0:t,x:puck.x,y:puck.y,face:{x:dot.x,y:dot.y},cause};
    // changements : présences terminées, changements prévus (pas pour l'équipe qui a dégagé illégalement)
    SIDES.forEach(s=>whistleChanges(s,cause==="icing"&&info.side===s));
    let tDrop=t+0.02; st=G.stateAt(t+0.03);
    SIDES.forEach(s=>["F","D"].forEach(g=>{const tr=G.plan[s][g];for(let i=Math.max(0,PI[s][g]-3);i<PI[s][g];i++){const x=tr[i];if(x.fixedB&&x.b>t&&x.b<=t+0.15)tDrop=Math.max(tDrop,x.b+0.01)}}));
    [...vis].forEach(e=>{if(e.mode==="transit")hide(e)});
    SIDES.forEach(s=>applyNow(s,"whistle"));
    // gardiens : remplacement, retour au filet
    SIDES.forEach(s=>{
      const gp=G.goalieAt(s,tDrop+0.001);
      if(!GK[s]||GK[s].p!==gp){if(GK[s])hide(GK[s]);GK[s]=entOf(gp);show(GK[s])}
      placeGoalie(s);
    });
    // chacun à sa place pour la mise au jeu
    SIDES.forEach(s=>{
      const m=new Map(); faceSpots(G,t,s,SK[s].map(e=>({p:e.p,role:e.role})),dot,m);
      SK[s].forEach(e=>{const v=m.get(e.p);if(v){e.x=v.x;e.y=v.y}e.vx=e.vy=0;e.hx=dirS[s];e.hy=0;e.it=null;e.cmd=null;dropHunt(e);e.fly=0;e.thinkAt=tDrop+e.react;e.inZone=Infinity;e.stun=0});
    });
    puck.x=dot.x;puck.y=dot.y;puck.vx=puck.vy=0;puck.st="dead";puck.car=null;puck.rel=null;puck.to=null;
    sample();
    t=+tDrop.toFixed(6);
    midBoundaries();
    sample();
    dead.t1=t; items.push(dead);
    SIDES.forEach(s=>{prevPU[s]=dirS[s]*dot.x;outSince[s]=dirS[s]*dot.x<=RK.BLUE?t:Infinity});
    // le tir à venir sera préparé à partir des nouvelles positions
    if(DR.seq) endSeq();
    shotsP.forEach(x=>{if(!x.done){x._spots=null}});
    faceoff(dot);
  }
  function faceoff(dot){
    const cs={};
    SIDES.forEach(s=>{const L=SK[s];cs[s]=L.find(e=>e.role==="C")||L.find(e=>e.trk==="F")||L[0]||null});
    // gagnant : l'équipe qui tire dans les secondes qui suivent, sinon selon les cotes des deux centres
    const nxS=shotsP.find(x=>!x.done&&x.t>t);
    let win=nxS&&nxS.t-t<7?nxS.side:null;
    if(!win){
      const r=e=>e?((e.pc||72)+(e.str||72)+(e.ex||72))/3:72;
      win=R()<clamp(0.5+(r(cs.away)-r(cs.home))*0.008,0.35,0.65)?"away":"home";
    }
    const lose=otherSide(win), d=dirS[win], fu=d*dot.x, fw=d*dot.y;
    const zone=dot.x===0&&dot.y===0?"C":fu>RK.BLUE?"O":fu<-RK.BLUE?"D":"N";
    const c=cs[win];
    plays.push({t,type:"face",side:win,p:c?c.p:null,q:cs[lose]?cs[lose].p:null,x:dot.x,y:dot.y,zone});
    if(!c){loosePuck(0,0,"face");return}
    // le centre ramène la rondelle vers un coéquipier derrière lui (le premier acteur d'une séquence prévue, s'il est tout près)
    const Dm=SK[win].filter(e=>e!==c&&e.trk==="D");
    const same=Dm.find(e=>(e.role==="LD"?-1:1)*(fw>=0?1:-1)>0);
    let to=same||Dm[0]||SK[win].find(e=>e!==c);
    if(DR.seq&&DR.seq.A===win){const a0=DR.seq.actors[DR.seq.k];if(a0&&a0!==c&&hyp(a0.x-dot.x,a0.y-dot.y)<26)to=a0}
    if(!to){gain(c,"face");return}
    puck.x=dot.x; puck.y=dot.y;
    passTo(c,to,{x:lerp(to.x,dot.x,0.15),y:lerp(to.y,dot.y,0.15)},26+R()*8,"face",!!(DR.seq&&DR.seq.A===win));
    // l'autre centre accroche le gagnant
    if(cs[lose]) cs[lose].thinkAt=t+0.35;
  }

  /* ---------- intentions des joueurs ---------- */
  const lanes=[-27,0,27];
  function hover(e,amp){return {dx:Math.sin(t*0.63+e.ph)*amp,dy:Math.cos(t*0.81+e.ph*1.7)*amp}}
  // place libre en zone offensive : chaque attaquant choisit la sienne, à son rythme, en gardant ses distances
  const OZS=[
    {n:"net",u:81.5,w:1.5,C:0.7,W:1},{n:"door",u:82,w:-8,C:0.4,W:0.8},{n:"slot",u:72,w:3,C:1,W:0.6},{n:"high",u:57,w:-3,C:1,W:0.5},
    {n:"wallS",u:63,w:34,C:0.5,W:1},{n:"wallW",u:61,w:-32,C:0.3,W:0.9},{n:"cornS",u:87,w:30,C:0.6,W:0.8},{n:"behind",u:95,w:4,C:0.5,W:0.5},
    {n:"lowW",u:84,w:-21,C:0.4,W:0.7},{n:"circW",u:66,w:-21,C:0.6,W:0.8},{n:"circS",u:69,w:20,C:0.6,W:0.6}];
  function ozSlot(e,car,pu,pw){
    const s=e.side, sg=pw>=0?1:-1, M=SK[s].filter(q=>q!==e&&!q.leaving);
    const isW=e.role!=="C";
    let best=null,bs=-1e9;
    const cu=car?U(s,car.x):pu, cw=car?Wf(s,car.y):pw;
    const supported=M.some(q=>q!==car&&q.slot&&hyp(q.slot.u-cu,q.slot.w-cw)<22);
    OZS.forEach(o=>{
      const u=o.u, w=o.w*sg;
      let sc=(isW?o.W:o.C)+R()*0.8*(0.5+e.creat);
      // un ailier préfère son côté
      if(e.role==="LW"&&w>12) sc-=0.4; if(e.role==="RW"&&w<-12) sc-=0.4;
      const dc=hyp(u-cu,w-cw);
      if(dc<8) sc-=2; else if(!supported&&dc<24) sc+=1.4;
      M.forEach(q=>{const qu=q.slot?q.slot.u:U(s,q.x),qw=q.slot?q.slot.w:Wf(s,q.y);const dd=hyp(u-qu,w-qw);if(dd<15)sc-=1.6*(15-dd)/15});
      sc-=hyp(u-U(s,e.x),w-Wf(s,e.y))*0.018;
      if(e.slot&&e.slot.n===o.n) sc+=0.5;
      if(sc>bs){bs=sc;best={n:o.n,u,w}}
    });
    return best;
  }
  // avantage numérique en 1-3-1 : pointe, deux demi-murs, enclave, devant le filet
  function ppSpot(e,pw){
    const sg=pw>=0?1:-1;
    const P={LD:[37,pw*0.25],RD:[58,28],LW:[58,-28],C:[67,sg*3],RW:[81.5,sg*2],W:[58,28],X:[72,-sg*9]};
    return P[e.role]||[72,-sg*9];
  }
  function attackPlan(e){
    const s=e.side, d=dirS[s], car=puck.st==="car"?puck.car:null, pu=U(s,puck.x), pw=Wf(s,puck.y), sg=pw>=0?1:-1;
    const zone=zoneOf(pu), isD=e.trk==="D", mu=U(s,e.x), mw=Wf(s,e.y);
    const strong=sg<0?"LW":"RW";
    if(zone==="O"){
      if(ppOf(s)&&SK[s].length>=5){const sp=ppSpot(e,pw);return It("spot",{u:sp[0],w:sp[1],spd:0.7,amp:2.4,until:t+1.5+R()*2})}
      if(isD){
        const mySide=e.role==="LD"?-1:1, partner=SK[s].some(q=>q!==e&&q.trk==="D");
        // le défenseur du côté de la rondelle descend parfois le long de la bande
        if(mySide===sg&&pu>48&&pu<80&&Math.abs(pw)>24&&R()<0.15+e.aggr*0.3) return It("spot",{u:52+R()*8,w:sg*35,spd:0.9,amp:1.5,until:t+1.2+R()*1.5});
        let w=partner?(mySide===sg?sg*(Math.abs(pw)>22?24:18):mySide*5+sg*3):pw*0.4;
        if(car&&car!==e&&car.trk==="D") w=mySide*22;
        return It("spot",{u:35+R()*4,w,spd:0.7,amp:2.2,until:t+1+R()*1.6});
      }
      const sl=ozSlot(e,car,pu,pw); e.slot=sl;
      return It("spot",{u:sl.u,w:sl.w,spd:0.75,amp:2.6,until:t+1.4+R()*2.2});
    }
    if(zone==="N"&&mu>RK.BLUE-0.5&&pu<=RK.BLUE) return It("spot",{u:RK.BLUE-3,w:clamp(mw,-34,34),spd:1,amp:0,until:t+0.5});
    if(zone==="N"){
      if(isD){
        const lft=e.role==="LD";
        if(car&&car.trk==="D"&&car!==e) return It("rel",{du:-4,dw:-sg*16,abs:true,spd:0.75,until:t+0.8+R()});
        const other=SK[s].find(q=>q!==e&&q.trk==="D"), join=e.aggr>(other?other.aggr:0)&&pu>-5;
        return It("spot",{u:clamp(pu-(join?11:24)-e.aggr*4,-62,12),w:(join?pw*0.3:(lft?-12:12)+pw*0.2),spd:join?0.92:0.75,amp:1.5,until:t+0.7+R()*0.8});
      }
      // attaquants : chacun son couloir, à sa profondeur (un devant, un au milieu, un en retrait),
      // jamais en zone avant la rondelle; parfois deux attaquants se croisent
      let lane=e.lane;
      if(lane===undefined||R()<0.3){
        const taken=SK[s].filter(q=>q!==e&&q.trk==="F"&&q.lane!==undefined).map(q=>q.lane);
        const order=[...lanes].sort((a,b)=>Math.abs(a-mw)-Math.abs(b-mw));
        lane=order.find(l=>!taken.includes(l));
        if(lane===undefined) lane=order[0];
        if(R()<0.12+e.creat*0.15){const o=lanes.filter(l=>l!==lane&&Math.sign(l)!==Math.sign(lane));if(o.length)lane=o[Math.floor(R()*o.length)]}
        e.lane=lane;
      }
      if(car&&car.trk==="D"&&pu<0&&e.aggr>0.55&&R()<0.5) return It("spot",{u:21,w:lane||sg*24,spd:1,amp:1,until:t+1+R()});   // passe d'envergure
      const Fs=SK[s].filter(q=>q.trk==="F"&&q!==car&&!q.leaving).sort((a,b)=>U(s,b.x)-U(s,a.x)), rank=Fs.indexOf(e);
      const lead=rank===0?12+e.aggr*8:rank===1?3+e.aggr*6:-9+e.aggr*6;
      return It("lane",{lead,dep:Math.max(0,rank)*4.5+R()*2.5,w:lane,spd:0.78+e.aggr*0.2+R()*0.06,until:t+0.6+R()*0.9});
    }
    // zone défensive : sortie de zone
    if(isD){
      if(car&&car.trk==="D"&&car!==e) return It("spot",{u:-81,w:-sg*10,spd:0.7,amp:1,until:t+0.8+R()});       // option derrière le filet
      return It("spot",{u:clamp(pu-8,-82,-60),w:(e.role==="LD"?-14:14),spd:0.7,amp:1.5,until:t+0.8+R()});
    }
    const cu=car?U(s,car.x):pu;
    if(e.role===strong||(e.role==="W"&&!isD)){
      if(cu>-55) return It("spot",{u:clamp(cu+22,-40,-8),w:sg*33,spd:0.95,amp:1,until:t+0.8+R()});
      return It("spot",{u:-58,w:sg*36,spd:0.85,amp:1.2,until:t+0.8+R()});
    }
    if(e.role==="C"||e.role==="X"){
      if(cu<-70) return It("spot",{u:-72,w:sg*7,spd:0.8,amp:1.5,until:t+0.6+R()*0.8});
      return It("rel",{du:14,dw:-sg*10,spd:0.95,until:t+0.6+R()*0.8});
    }
    if(e.aggr>0.62) return It("spot",{u:-6,w:-sg*25,spd:1,amp:1,until:t+1+R()});
    return It("spot",{u:-42,w:-sg*31,spd:0.85,amp:1.5,until:t+0.8+R()});
  }
  // Joueur qui presse le porteur : selon l'endroit de la rondelle, pour garder la structure
  // (le défenseur du côté de la rondelle dans le coin, l'ailier sur la bande ou à la pointe, le centre devant le filet)
  const prCache={away:{t:-1,e:null},home:{t:-1,e:null}};
  function presserOf(s,car,zone,pu,pw){
    const c=prCache[s]; if(c.t===t) return c.e;
    let best=null;
    if(car&&DR.want===s){const M=SK[s].filter(q=>!q.leaving&&q.stun<=t);best=nearestOf(M,car.x,car.y).q}
    else if(car){
      const M=SK[s].filter(q=>!q.leaving&&q.stun<=t), sg=pw>=0?1:-1, short=shortOf(s);
      const dist=q=>hyp(q.x-car.x,q.y-car.y);
      const side=q=>q.role==="LD"||q.role==="LW"?-1:q.role==="RD"||q.role==="RW"?1:(Wf(s,q.y)>=0?1:-1);
      const near=list=>{let b=null,bd=1e9;list.forEach(q=>{const d=dist(q)-(q===c.e?6:0);if(d<bd){bd=d;b=q}});return b};
      const F=M.filter(q=>q.trk==="F"), D=M.filter(q=>q.trk==="D");
      if(zone==="D"){
        if(pu<-62&&Math.abs(pw)<12&&pu>-84) best=near(M.filter(q=>q.role==="C"))||near(D);           // devant le filet
        else if(pu<-62) best=near(D.filter(q=>side(q)===sg))||near(D);                                 // coin, derrière le filet
        else if(Math.abs(pw)>=18) best=near(F.filter(q=>q.role!=="C"&&side(q)===sg))||near(D.filter(q=>side(q)===sg))||near(F);   // le long de la bande
        else best=near(F.filter(q=>q.role!=="C"&&side(q)===sg))||near(F);                               // pointe
        if(best&&dist(best)>45) best=near(M);
      } else if(zone==="N"){
        best=near(F);
        if(!best||dist(best)>30) best=pu<-12?near(D):null;
        if(short&&best&&dist(best)>22) best=null;
      } else {
        // échec avant : sur le porteur au fond de sa zone ou le long de la bande; en désavantage, seulement tout au fond
        const deep=pu>(short?72:52)||boardDist(car.x,car.y)<8;
        best=deep?near(F):null;
        if(best&&dist(best)>(short?28:45)) best=null;
      }
    }
    c.t=t; c.e=best; return best;
  }
  function defendPlan(e){
    const s=e.side, A=otherSide(s);
    const car=puck.st==="car"&&puck.car.side===A?puck.car:puck.st==="pass"&&puck.from&&puck.from.side===A?puck.to:null;
    const pu=U(s,puck.x), pw=Wf(s,puck.y), sg=pw>=0?1:-1, zone=zoneOf(pu), isD=e.trk==="D", short=shortOf(s);
    const M=SK[s].filter(q=>!q.leaving), AT=SK[A].filter(q=>q!==car);
    const pr=presserOf(s,car,zone,pu,pw);
    if(pr===e&&car) return It("press",{q:car,spd:zone==="D"?1:zone==="N"?0.92:0.95,until:t+0.4+R()*0.4});
    const mySide=e.role==="LD"||e.role==="LW"?-1:e.role==="RD"||e.role==="RW"?1:(Wf(s,e.y)>=0?1:-1);
    const toNet=q=>hyp(U(s,q.x)+RK.GOAL,Wf(s,q.y));
    const taken=q=>M.some(o=>o!==e&&o.it&&o.it.q===q);
    if(zone==="D"){
      // couverture en boîte : défenseurs devant le filet, centre dans l'enclave, ailiers vers les pointes
      if(isD){
        const cands=AT.filter(q=>toNet(q)<30&&!taken(q)).sort((a,b)=>toNet(a)-toNet(b));
        const mine=cands.find(q=>(Wf(s,q.y)>=0?1:-1)===mySide)||cands[0];
        if(mine) return It("mark",{q:mine,gap:2.8,spd:0.9,until:t+0.7+R()*0.5});
        return It("spot",{u:-78,w:mySide*(mySide===sg?9:6),spd:0.8,amp:1.8,until:t+0.7+R()*0.6,pf:0.15,pu0:pu,pw0:pw});
      }
      if(short){
        // désavantage numérique : le haut de la boîte, déplacé vers la rondelle
        const L=M.filter(q=>q.trk==="F").sort((a,b)=>Wf(s,a.y)-Wf(s,b.y)), k=L.indexOf(e), side2=L.length>1?(k===0?-1:1):sg;
        return It("spot",{u:-60+(Math.abs(pw)<15?3:0),w:side2*14+sg*4,spd:0.85,amp:1.8,until:t+0.5+R()*0.5,pf:0.3,pu0:pu,pw0:pw});
      }
      if(e.role==="C"){
        const sl=AT.filter(q=>U(s,q.x)<-52&&Math.abs(Wf(s,q.y))<20&&!taken(q)).sort((a,b)=>toNet(a)-toNet(b))[0];
        if(sl) return It("mark",{q:sl,gap:3.2,spd:0.9,until:t+0.7+R()*0.5});
        return It("spot",{u:-68,w:sg*6,spd:0.8,amp:2,until:t+0.7+R()*0.6,pf:0.25,pu0:pu,pw0:pw});
      }
      // ailier : la pointe de son côté, plus près de l'enclave quand la rondelle est de l'autre côté
      const pt=AT.filter(q=>(Wf(s,q.y)>=0?1:-1)===mySide&&U(s,q.x)>-48).sort((a,b)=>U(s,b.x)-U(s,a.x))[0];
      if(mySide!==sg&&pu<-45) return It("spot",{u:-55,w:mySide*13,spd:0.8,amp:2,until:t+0.7+R()*0.6,pf:0.3,pu0:pu,pw0:pw});
      if(pt) return It("mark",{q:pt,gap:9,toward:true,spd:0.85,until:t+0.7+R()*0.6});
      return It("spot",{u:-50,w:mySide*20,spd:0.8,amp:2.2,until:t+0.8+R()*0.6,pf:0.3,pu0:pu,pw0:pw});
    }
    if(zone==="N"){
      if(isD){
        // écart avec le porteur : entre lui et notre filet, de plus en plus serré près de la ligne bleue
        const gap=11+(1-e.aggr)*8+(pu>5?6:0)+(short?6:0);
        return It("spot",{u:clamp(pu-gap,-64,short?-12:8),w:pw*0.4+mySide*12,spd:0.95,amp:0.5,until:t+0.4+R()*0.4,safe:true,ms:mySide});
      }
      // repli : chaque attaquant suit un attaquant adverse, du côté intérieur
      let best=null,bd=1e9;
      AT.filter(q=>q.trk==="F").forEach(q=>{if(taken(q))return;const dd=hyp(q.x-e.x,q.y-e.y)+(Math.sign(Wf(s,q.y))===mySide?0:12);if(dd<bd){bd=dd;best=q}});
      if(best&&bd<70) return It("mark",{q:best,gap:4.5,inside:true,spd:0.8+e.aggr*0.18,until:t+0.7+R()*0.6});
      return It("spot",{u:clamp(pu-12,-50,8),w:mySide*14+pw*0.2,spd:0.88,amp:1.5,until:t+0.7+R()*0.5});
    }
    // échec avant (rondelle dans la zone adverse)
    if(short){
      // désavantage numérique : on attend en zone neutre
      if(isD) return It("spot",{u:-8+R()*4,w:mySide*15,spd:0.75,amp:1.5,until:t+0.8+R()*0.6,safe:true,ms:mySide});
      return It("spot",{u:14+R()*6,w:mySide*10+pw*0.2,spd:0.8,amp:2,until:t+0.8+R()*0.6});
    }
    if(isD){
      const cu=car?U(s,car.x):pu, cw=car?Wf(s,car.y):pw;
      // le défenseur du côté de la rondelle descend sur le porteur le long de la bande, près de la ligne bleue
      if(car&&mySide===sg&&cu<50&&cu>29&&Math.abs(cw)>23&&e.aggr>0.4) return It("press",{q:car,spd:1,until:t+0.6});
      return It("spot",{u:30+R()*4,w:mySide*17+pw*0.15,spd:0.8,amp:1.5,until:t+0.8+R()*0.6,safe:true,ms:mySide});
    }
    const F=M.filter(q=>q.trk==="F"&&q!==pr).sort((a,b)=>hyp(a.x-puck.x,a.y-puck.y)-hyp(b.x-puck.x,b.y-puck.y));
    if(F[0]===e) return It("spot",{u:clamp(pu-14,40,70),w:sg*32,spd:0.9,amp:1.5,until:t+0.8+R()*0.6});
    // l'autre en retrait, au centre de la patinoire, du côté opposé à la rondelle
    if(F[1]===e) return It("spot",{u:36+R()*6,w:-sg*10,spd:0.85,amp:2,until:t+0.8+R()*0.6,safe:true,ms:-sg});
    return It("spot",{u:46+R()*6,w:mySide*16,spd:0.85,amp:2,until:t+0.8+R()*0.6});
  }
  // rondelle libre : le plus près de chaque équipe s'élance, un second le soutient
  function chasers(s){
    const L=SK[s].filter(e=>!e.leaving&&e.stun<=t);
    const tt=e=>{const dd=hyp(e.x-puck.x,e.y-puck.y);return dd/e.vmax};
    return L.sort((a,b)=>tt(a)-tt(b));
  }
  function think(e){
    if(e.leaving) return e.it&&e.it.k==="door"?e.it:It("door",{until:Infinity});
    if(e.cmd) return e.cmd;
    if(e.hunt) return e.it&&e.it.k==="hunt"&&e.it.q===e.hunt.q?e.it:It("hunt",{q:e.hunt.q,until:Infinity});
    const s=e.side, ps=possSide();
    if(puck.st==="pass"&&puck.to===e&&e.it&&e.it.k==="recv") return e.it;
    if(puck.st==="free"||puck.st==="held"){
      const c=chasers(s);
      if(puck.st==="free"&&c[0]===e) return It("chase",{spd:1,until:t+0.3});
      if(puck.st==="free"&&c[1]===e&&hyp(puck.x-e.x,puck.y-e.y)<35){
        // soutien : un peu en retrait de la rondelle, du côté de son filet (jamais derrière sa propre ligne des buts :
        // rondelle dans son coin, il se place devant le filet)
        const pu0=U(s,puck.x), su=pu0<-68?-74:pu0-12, sw=pu0<-68?clamp(Wf(s,puck.y)*0.3,-8,8):Wf(s,puck.y)*0.6+(Wf(s,e.y)>=Wf(s,puck.y)?6:-6);
        const q=toXY(s,su,sw);
        return It("spot",{u:U(s,q.x),w:Wf(s,q.y),spd:0.9,amp:0.5,until:t+0.4});
      }
      const last=puck.last||s;
      return last===s?attackPlan(e):defendPlan(e);
    }
    if(ps===s) return attackPlan(e);
    return defendPlan(e);
  }
  // point visé, recalculé à chaque dixième de seconde à partir de l'intention (écrit dans e.tgx, e.tgy, e.tgs, e.tga)
  const tmp={x:0,y:0};
  function rinkTo(x,y,m){
    const hx=RK.HALFL-m, hy=RK.HALFW-m; x=x<-hx?-hx:x>hx?hx:x; y=y<-hy?-hy:y>hy?hy:y;
    const cx=RK.HALFL-RK.CORNER, cy=RK.HALFW-RK.CORNER, r=RK.CORNER-m, ax=x<0?-x:x, ay=y<0?-y:y;
    if(ax>cx&&ay>cy){const dx=ax-cx,dy=ay-cy,d=Math.sqrt(dx*dx+dy*dy);if(d>r){x=(x<0?-1:1)*(cx+dx/d*r);y=(y<0?-1:1)*(cy+dy/d*r)}}
    tmp.x=x;tmp.y=y;return tmp;
  }
  // L'attaquant adverse le plus avancé de mon côté de la patinoire (ou au centre), là où il sera dans une
  // demi-seconde : un défenseur ne le laisse jamais filer derrière lui (pas d'échappée gratuite).
  const SAFE=8;
  function deepThreat(e,ms){
    const s=e.side, d=dirS[s]; let best=null, bu=Infinity;
    for(const q of SK[otherSide(s)]){
      if(q.leaving) continue;
      const qw=d*q.y; if(qw*ms<-9) continue;
      const qu=d*(q.x+q.vx*0.5);
      if(qu<bu){bu=qu;best={u:qu,w:d*(q.y+q.vy*0.5)}}
    }
    return best;
  }
  function setT(e,x,y,spd,tArr){e.tgx=x;e.tgy=y;e.tgs=spd;e.tga=tArr===undefined?-1:tArr}
  // receveur d'une passe : il va là où il peut couper la trajectoire de la rondelle le plus tôt
  function meet(e){
    let bx=puck.x+puck.vx*1.4, by=puck.y+puck.vy*1.4, bt=t+1.4;
    for(let k=1;k<=14;k++){
      const tau=k*0.1, px=puck.x+puck.vx*tau, py=puck.y+puck.vy*tau, dx=px-e.x, dy=py-e.y, dd=Math.sqrt(dx*dx+dy*dy);
      if(dd<1.5||dd<=reach(e,dx/dd,dy/dd,tau)+1.2){bx=px;by=py;bt=t+tau;break}
    }
    const q=rinkTo(bx,by,1.5); setT(e,q.x,q.y,1,bt);
  }
  function targetOf(e){
    const it=e.it, s=e.side, d=dirS[s];
    if(!it){setT(e,e.x+e.vx*0.6,e.y+e.vy*0.6,Math.max(0.25,hyp(e.vx,e.vy)/e.vmax));return}
    switch(it.k){
      case "door":{const dr=DOOR[s];setT(e,exitX(e),dr.y-1,1);return}
      case "spot":{
        const a=it.amp; let u=it.u, w=it.w, sp=it.spd;
        // place qui suit la rondelle en partie (couverture en zone défensive)
        if(it.pf){u+=(d*puck.x-it.pu0)*it.pf;w+=(d*puck.y-it.pw0)*it.pf}
        if(it.safe){const th=deepThreat(e,it.ms);if(th&&th.u-SAFE<u){u=Math.max(-84,th.u-SAFE);w=lerp(w,th.w,0.55);sp=Math.max(sp,0.95)}}
        const q=rinkTo(d*(u+Math.sin(t*0.63+e.ph)*a),d*(w+Math.cos(t*0.81+e.ph*1.7)*a),2.5);
        setT(e,q.x,q.y,sp);return;
      }
      case "lane":{
        // devant la ligne bleue, la rondelle encore en zone neutre : chacun à sa profondeur, en tournant
        // (on ne s'aligne pas tous sur la ligne en attendant le porteur)
        const pu=d*puck.x; let u=pu+it.lead, w=it.w+Math.sin(t*0.5+e.ph)*3, sp=it.spd;
        if(pu<=RK.BLUE){const lim=RK.BLUE-1.6-it.dep;if(u>lim){u=lim-Math.abs(Math.sin(t*0.8+e.ph))*3;w+=Math.sin(t*0.6+e.ph*1.3)*8;sp=Math.min(sp,0.7)}}
        const q=rinkTo(d*u,d*w,2.5);setT(e,q.x,q.y,sp);return;
      }
      case "rel":{
        const c=puck.st==="car"?puck.car:null, bx=c?c.x:puck.x, by=c?c.y:puck.y;
        const q=rinkTo(bx+d*it.du,by+d*it.dw,2.5);setT(e,q.x,q.y,it.spd);return;
      }
      case "recv":{
        if(puck.st==="pass"&&puck.to===e){meet(e);return}
        setT(e,it.x,it.y,0.8);return;
      }
      case "press":{
        const q=it.q; if(!q||q.mode!=="ice"){setT(e,e.x,e.y,0.3);return}
        // côté filet du porteur, bâton sur la rondelle
        const nx=-d*RK.GOAL, vx=nx-q.x, vy=-q.y, n=hyp(vx,vy)||1, ddx=q.x-e.x, ddy=q.y-e.y, k=ddx*ddx+ddy*ddy<36?3:3.8;
        setT(e,q.x+q.vx*0.25+vx/n*k,q.y+q.vy*0.25+vy/n*k,it.spd);return;
      }
      case "mark":{
        const q=it.q; if(!q||q.mode!=="ice"){setT(e,e.x,e.y,0.3);return}
        const nx=-d*RK.GOAL, vx=nx-q.x, vy=-q.y, n=hyp(vx,vy)||1;
        let g=it.gap; if(it.toward) g=Math.min(g,n*0.4);
        let y=q.y+vy/n*g; if(it.inside) y=y*0.88;
        let x=q.x+vx/n*g;
        // attaquant planté devant le filet : on se bat pour la place à côté de lui, pas dans le demi-cercle sur son gardien
        if(-d*x>RK.GOAL-7&&Math.abs(y)<6){x=-d*(RK.GOAL-7);y=q.y+(q.y>=puck.y?-1:1)*2.4}
        setT(e,x,y,it.spd);return;
      }
      case "chase":{
        const dd=hyp(puck.x-e.x,puck.y-e.y), lead=Math.min(1.2,dd/Math.max(10,e.vmax));
        const q=rinkTo(puck.x+puck.vx*lead*0.7,puck.y+puck.vy*lead*0.7,1.5);setT(e,q.x,q.y,1);return;
      }
      case "hunt":{
        const q=it.q; if(!q||q.mode!=="ice"){setT(e,e.x,e.y,0.5);return}
        // trajectoire d'interception : là où il sera quand on y arrivera
        const dd=hyp(q.x-e.x,q.y-e.y), tau=Math.min(1.2,dd/Math.max(8,e.vmax));
        setT(e,q.x+q.vx*tau,q.y+q.vy*tau,1);return;
      }
      case "cmd": if(puck.st==="pass"&&puck.to===e){meet(e);return} setT(e,it.x,it.y,it.spd,it.tArr>=0?it.tArr:undefined);return;
      case "carry": setT(e,it.x,it.y,it.spd);return;
    }
    setT(e,e.x,e.y,0.3);
  }

  /* ---------- le porteur ---------- */
  function passSpeed(dd){return clamp(30+dd*0.55,36,82)}
  function lead(e,m,v){
    let P={x:m.x,y:m.y};
    for(let i=0;i<2;i++){const tau=Math.min(1.1,hyp(P.x-puck.x,P.y-puck.y)/v);P=inRink(m.x+m.vx*tau*0.85,m.y+m.vy*tau*0.85,3)}
    return P;
  }
  // coéquipiers qui seraient hors-jeu si la rondelle entrait en zone maintenant
  const offsideMates=(e)=>SK[e.side].filter(q=>q!==e&&U(e.side,q.x)>RK.BLUE);
  function passOptions(e){
    const s=e.side, O=opps(e), res=[], eu=U(s,puck.x);
    const offM=offsideMates(e);
    // personne entre la rondelle et le filet, et pas d'adversaire sur le dos : avancer plutôt que revenir
    const nx=dirS[s]*RK.GOAL, dn=hyp(nx-puck.x,puck.y);
    const clear=eu>0&&nearestOf(O,e.x,e.y).d>7&&!O.some(q=>hyp(nx-q.x,q.y)<dn-1&&segDist(q.x,q.y,puck.x,puck.y,nx,0)<10);
    mates(e).forEach(m=>{
      if(m.stun>t) return;
      const v0=passSpeed(hyp(m.x-puck.x,m.y-puck.y)), P=onsideAim(m,lead(e,m,v0)), dd=hyp(P.x-puck.x,P.y-puck.y);
      if(dd<7||dd>120) return;
      const pu=U(s,P.x), pw=Wf(s,P.y);
      // passe qui entre en zone : personne d'autre ne doit y être déjà
      if(eu<=RK.BLUE&&pu>RK.BLUE&&(offM.some(q=>q!==m)||U(s,m.x)>RK.BLUE)) return;
      const lane=laneMin(puck.x,puck.y,P.x,P.y,O), open=nearestOf(O,P.x,P.y).d;
      const du=pu-eu;
      let sc=Math.min(1,lane/7)*0.65+Math.min(1,open/11)*0.45+clamp(du/45,-0.45,0.6)-dd/240;
      if(lane<3) sc-=0.8;
      if(pu<-60&&Math.abs(pw)<14&&eu<-50) sc-=0.5;                 // jamais à travers l'enclave devant son filet
      if(eu>RK.BLUE&&pu<=RK.BLUE+1&&offM.some(q=>q!==m)) sc-=0.7;     // ressortir la rondelle de la zone : les attaquants devront en sortir
      if(zoneOf(eu)==="O"&&pu>65&&Math.abs(pw)<12) sc+=0.25;       // passe vers l'enclave
      if(clear&&hyp(nx-P.x,P.y)>dn+6) sc-=0.6;                      // champ libre : pas de passe vers l'arrière
      res.push({m,P,v:passSpeed(dd),sc,lane,open,du,dd});
    });
    res.sort((a,b)=>b.sc-a.sc);
    return res;
  }
  // porteur : où patiner (quelques directions autour de la cible, la plus libre l'emporte)
  function carryChoice(e,goalU,goalW,spd,dur){
    const s=e.side, O=opps(e), eu=U(s,e.x), ew=Wf(s,e.y);
    const base=Math.atan2(goalW-ew,goalU-eu), Rr=12+R()*8;
    let best=null,bs=-1e9;
    const inZ=eu>RK.BLUE&&U(s,puck.x)>RK.BLUE;
    for(const a of [-1.1,-0.65,-0.3,0,0.3,0.65,1.1]){
      let u=eu+Math.cos(base+a)*Rr; if(inZ&&u<RK.BLUE+3) u=RK.BLUE+3;
      const w=ew+Math.sin(base+a)*Rr, q=toXY(s,u,w,3);
      const open=Math.min(nearestOf(O,q.x,q.y).d,laneMin(e.x,e.y,q.x,q.y,O)+2);
      let sc=Math.min(open,16)/16-Math.abs(a)*0.25+R()*0.35*(0.5+e.creat);
      // pas dans le filet
      if(Math.abs(Math.abs(q.x)-RK.GOAL-1.5)<3.5&&Math.abs(q.y)<5) sc-=1;
      if(sc>bs){bs=sc;best=q}
    }
    return It("carry",{x:best.x,y:best.y,spd,until:t+(dur||0.7+R()*0.6)});
  }
  const carryTo=(e,u,w,spd,dur)=>{if(U(e.side,e.x)>RK.BLUE&&U(e.side,puck.x)>RK.BLUE&&u<RK.BLUE+3)u=RK.BLUE+3;const q=toXY(e.side,u,w,3);return It("carry",{x:q.x,y:q.y,spd,until:t+(dur||0.8+R()*0.6)})};
  function pick(opts){
    const tot=opts.reduce((a,o)=>a+Math.max(0,o.w),0); if(tot<=0) return null;
    let r=R()*tot; for(const o of opts){r-=Math.max(0,o.w);if(r<=0)return o}
    return opts[opts.length-1];
  }
  function carrierThink(e){
    const s=e.side, A=otherSide(s), d=dirS[s], eu=U(s,e.x), ew=Wf(s,e.y), sg=ew>=0?1:-1;
    const zone=zoneOf(eu), O=opps(e), pr=nearestOf(O,e.x,e.y), press=pr.d;
    if(DR.want===otherSide(s)&&!e.leaving){
      const q=boardsHit(e.x,e.y,12)?{x:e.x,y:e.y}:toXY(s,eu,sg*36,3);
      e.it=It("carry",{x:lerp(e.x,q.x,0.4),y:lerp(e.y,q.y,0.4),spd:0.45,until:t+0.6});e.thinkAt=t+0.6;return;
    }
    const yield_=DR.want===otherSide(s)||DR.soft===otherSide(s);   // le réalisateur veut que l'adversaire reprenne la rondelle
    const prot=DR.protect[s]||yield_||DR.soft===s, short=shortOf(s), pp=ppOf(s);
    const P=prot?passOptions(e).filter(o=>o.dd<60&&o.lane>5):passOptions(e), best=P[0];
    const held=t-e.carT, patient=press>11&&held<0.5+e.pc/100+e.creat*0.6, pk=patient?0.3:1;
    const offM=offsideMates(e);
    const ahead=O.filter(q=>U(s,q.x)>eu-2&&hyp(q.x-e.x,q.y-e.y)<14).length;
    const allowAttempt=!DR.noAttempt&&!prot&&!DR.build;
    const allowWhistle=!quiet(s)&&!prot;
    const opts=[];
    const add=(w,f)=>{if(w>0)opts.push({w,f})};
    const doPass=o=>()=>{passTo(e,o.m,o.P,o.v);if(zone==="D"&&U(s,o.P.x)>-RK.BLUE)stat.exits++};
    if(e.leaving){
      // seul devant le filet : il tire avant d'aller changer (plutôt que de remettre la rondelle derrière lui)
      const dn=hyp(d*RK.GOAL-e.x,e.y);
      if(eu>RK.BLUE&&dn<40&&aloneOf(e)){
        if(allowAttempt) return attempt(e);
        if(!prot&&dn<26&&GK[A]&&GK[A].mode==="ice") return goaliePoke(e);
      }
      // il va changer : il se débarrasse de la rondelle (une passe à un coéquipier si son équipe doit la garder)
      const Q=DR.seq&&DR.seq.A===s?DR.seq.actors[DR.seq.k]:null;
      if(Q&&Q!==e&&Q.mode==="ice"){const P0=onsideAim(Q,lead(e,Q,70)), dd=hyp(P0.x-puck.x,P0.y-puck.y);passTo(e,Q,P0,clamp(dd/0.6,35,85),"",true);Q.cmd=It("cmd",{x:P0.x,y:P0.y,tArr:puck.tArr,spd:1,keep:true});return}
      if(best&&(best.sc>0||prot)) return doPass(best)();
      if(prot){const all=passOptions(e);if(all.length)return doPass(all[0])()}
      if(yield_) return dumpTo(e,toXY(s,clamp(eu+16,-30,20),ew*0.7,3),30+R()*5,"chip");
      return dumpTo(e,toXY(s,94,sg*28,1),66,"dump");
    }
    if(zone==="D"){
      if(best) add((best.sc>0.55?1.7:0.7)*best.sc*(held<0.35?0.4:1)*pk,doPass(best));
      if(P[1]&&P[1].sc>0.5) add(0.5*P[1].sc*pk,doPass(P[1]));
      add(press>14?1.2:0.35,()=>{e.it=carryChoice(e,eu+30,ew*0.6+sg*8,0.92)});
      // dégagement le long de la bande vers l'ailier, ou par la vitre
      if(!prot) add(press<9?0.3:0.05,()=>{dumpTo(e,toXY(s,-42+R()*10,sg*41,0.8),52+R()*8,"rim")});
      if(!prot&&eu>-55) add(press<10?0.45:0.08,()=>{dumpTo(e,toXY(s,2+R()*12,sg*38,1),44+R()*8,"chip");stat.exits++});
      // dégagement refusé possible (permis en désavantage numérique)
      if(!prot&&(allowWhistle||short)) add(short?(press<12?1.2:0.4):(press<7?0.07:0.01),()=>{dumpTo(e,toXY(s,97,(R()-0.5)*50,1),82+R()*12,"clear");stat.exits++});
      if(press<7) add(0.45,()=>{e.it=eu<-78?carryTo(e,-95,-sg*7,0.85,1):carryChoice(e,eu+6,ew+sg*12,0.8,0.6)});
    } else if(zone==="N"){
      if(best) add((best.du>8?1.5:0.8)*Math.max(0,best.sc)*pk,doPass(best));
      const nearLine=eu>8;
      const gapOpen=ahead===0;
      if(nearLine){
        // à la ligne bleue : entrer avec la rondelle, la lancer au fond, attendre ou revenir
        if(offM.length){
          if(allowWhistle&&R()<PJ.tagFail) add(0.6,()=>{e.mistake=t+2;e.it=carryTo(e,RK.BLUE+10,ew,0.9,1)});
          add(1.4,()=>{e.it=carryTo(e,RK.BLUE-6,ew+sg*4,0.5,0.6)});
          const back=P.find(o=>o.du<-8); if(back) add(0.8,doPass(back));
        } else {
          add(gapOpen?2.2:0.5,()=>{stat.entries++;flyCheck(e);e.it=carryChoice(e,RK.BLUE+16,ew+(R()-0.5)*14,0.95,0.9)});
          if(!prot) add(gapOpen?0.2:0.95,()=>{stat.entries++;dumpTo(e,toXY(s,93,(ew>=0?1:-1)*(25+R()*8),1),60+R()*12,"dump")});
          const back=P.find(o=>o.du<-10&&o.m.trk==="D"); if(back&&!gapOpen) add(0.45,()=>{doPass(back)();regroup(s)});
          add(0.3,()=>{e.it=carryTo(e,eu-2,ew+sg*10,0.6,0.7)});
        }
      } else {
        add(1.2,()=>{e.it=carryChoice(e,eu+25,ew*0.7,0.95)});
        if(ahead>=2){const back=P.find(o=>o.du<-6);if(back)add(0.5,()=>{doPass(back)();regroup(s)})}
      }
    } else {
      // zone offensive : cycle, passes, échappée vers le filet, protection le long de la bande
      const boards=boardDist(e.x,e.y)<7, behind=eu>RK.GOAL-1;
      if(best) add((pp?1.6:1.15)*Math.max(0,best.sc)*(held<0.3?0.5:1)*pk,doPass(best));
      if(P[1]&&P[1].sc>0.4) add(0.45*P[1].sc*pk,doPass(P[1]));
      if(e.trk==="D"&&eu<45){
        add(0.9,()=>{e.it=carryTo(e,36+R()*3,-ew*0.3+(R()-0.5)*10,0.55,0.8+R()*0.6)});   // se promène le long de la ligne bleue
        if(allowAttempt) add(0.22*PJ.attempt,()=>attempt(e));
        if(!prot) add(press<6?0.4:0.05,()=>dumpTo(e,toXY(s,92,sg*27,1),50,"rim"));
      } else {
        if(behind) add(0.8,()=>{e.it=carryTo(e,93,-sg*10,0.75,1.1)});                      // derrière le filet, vers l'autre côté
        else if(boards) add(0.9,()=>{e.it=eu>74?carryTo(e,95,sg*6,0.75,1):carryTo(e,clamp(eu+16,40,88),sg*33,0.7,1)});
        else add(0.6,()=>{e.it=carryChoice(e,clamp(eu+10,40,92),sg*30,0.75)});
        // l'enclave : seulement si elle est libre
        const lane=laneMin(e.x,e.y,d*76,0,O);
        if(lane>6) add(0.35,()=>{e.it=carryTo(e,74,sg*4,0.85,0.7)});
        if(press<5) add(0.6,()=>{e.it=carryChoice(e,eu-8,sg*36,0.6,0.7)});
        const dist=hyp(d*RK.GOAL-e.x,e.y);
        if(allowAttempt&&dist<62&&Math.abs(ew)<30&&!behind&&held>0.4) add((dist<30?0.3:0.12)*PJ.attempt,()=>attempt(e));
        if(!prot&&eu>60) add(0.08,()=>dumpTo(e,toXY(s,95,-sg*22,1),55,"rim"));
      }
      // rondelle déviée hors de la patinoire
      if(allowWhistle&&boards) add(PJ.out,()=>{const yb=puck.y;loosePuck(0,(puck.y>=0?1:-1)*40,"out");plays.push({t,type:"out",side:s});blow("out",{side:s,y:yb})});
    }
    // échappée (aucun adversaire plus près du filet) : il fonce au filet et tire; une passe seulement vers l'avant
    const dNet=hyp(d*RK.GOAL-e.x,e.y);
    if(!e.leaving&&eu>-12&&eu<RK.GOAL-4&&dNet<85&&aloneOf(e)&&!(zone!=="O"&&offM.length)){
      opts.length=0; stat.breakaways++;
      const fwd=P.find(o=>hyp(d*RK.GOAL-o.P.x,o.P.y)<dNet-4&&o.lane>6);
      if(fwd) add(0.35*Math.max(0.2,fwd.sc),doPass(fwd));
      add(3,()=>{e.it=carryTo(e,Math.min(eu+20,80),ew*0.45,1,0.45)});
      const gk=GK[A];
      if(allowAttempt&&dNet<32) add(dNet<20?2.6:1.1,()=>attempt(e));
      else if(!allowAttempt&&dNet<12&&gk&&gk.mode==="ice"&&!prot) add(1.4,()=>goaliePoke(e));
    }
    const o=pick(opts);
    if(o) o.f(); else e.it=carryChoice(e,eu+15,ew,0.8);
    e.thinkAt=t+(e.it&&e.it.k==="carry"?Math.min(0.9,e.it.until-t):0.35)+R()*0.25;
  }
  // aucun patineur adverse plus près du filet que lui
  function aloneOf(e){const nx=dirS[e.side]*RK.GOAL, dn=hyp(nx-e.x,e.y);for(const q of opps(e)){if(!q.leaving&&hyp(nx-q.x,q.y)<dn+2)return false}return true}
  // seul devant le gardien sans pouvoir tirer (la feuille de match ne compte pas ce tir) : le gardien sort son bâton
  function goaliePoke(e){
    const sy=e.y>=0?1:-1;
    loosePuck(-dirS[e.side]*(7+R()*6),sy*(12+R()*8),"poke");
    e.stun=t+0.35;
  }
  // un attaquant devance parfois la rondelle en zone : hors-jeu
  function flyCheck(e){
    if(quiet(e.side)||DR.protect[e.side]||R()>=PJ.fly) return;
    const s=e.side, eu=U(s,e.x);
    const f=SK[s].filter(q=>q!==e&&q.trk==="F"&&!q.leaving&&!q.cmd&&U(s,q.x)>eu-1&&U(s,q.x)>10);
    // le porteur ne le voit pas et entre quand même
    if(f.length){const q=f[Math.floor(R()*f.length)];q.fly=t+2.2;q.it=It("spot",{u:RK.BLUE+9,w:Wf(s,q.y),spd:1,amp:0.5,until:t+2});q.thinkAt=t+2;e.mistake=t+2.2;stat.fly++}
  }
  function regroup(s){SK[s].forEach(q=>{if(q.trk==="F"&&!q.leaving&&!q.cmd){q.it=It("spot",{u:-14+R()*8,w:(q.lane!==undefined?q.lane:0)*1.1,spd:0.85,amp:1,until:t+1.6+R()});q.thinkAt=t+1.6+R()}})}

  /* ---------- mouvement ---------- */
  // chacun garde ses distances : plus avec un coéquipier, moins avec l'adversaire qu'on presse
  const ALL=[];
  function separation(){
    ALL.length=0; for(const e of SK.away) ALL.push(e); for(const e of SK.home) ALL.push(e);
    for(const e of ALL){e.sepx=0;e.sepy=0;const k=e.it?e.it.k:"";e.eng=k==="press"||k==="hunt"||k==="chase"||k==="recv"||e===puck.car}
    for(let gi=0;gi<2;gi++){const g=GK[SIDES[gi]];if(!g||g.mode!=="ice")continue;
      for(const e of ALL){const dx=e.x-g.x, dy=e.y-g.y; if(dx>3.8||dx<-3.8||dy>3.8||dy<-3.8) continue;
        const dd=Math.sqrt(dx*dx+dy*dy); if(dd<1e-4||dd>=3.8) continue; const k=(3.8-dd)/3.8*20; e.sepx+=dx/dd*k; e.sepy+=dy/dd*k}}
    for(let i=0;i<ALL.length;i++){const e=ALL[i];for(let j=i+1;j<ALL.length;j++){
      const q=ALL[j], ddx=e.x-q.x, ddy=e.y-q.y; if(ddx>5.5||ddx<-5.5||ddy>5.5||ddy<-5.5) continue;
      const mine=q.side===e.side, dd=Math.sqrt(ddx*ddx+ddy*ddy);
      if(dd<1e-4) continue;
      const R0=mine?5.5:((e.eng||q.eng)?2.6:3.2); if(dd>=R0) continue;
      const k=(R0-dd)/R0*(mine?15:7), ux=ddx/dd*k, uy=ddy/dd*k;
      e.sepx+=ux; e.sepy+=uy; q.sepx-=ux; q.sepy-=uy;
    }}
  }
  // Deux coéquipiers ne visent pas le même point : celui qui a le rôle le plus souple s'écarte
  // (le porteur, le receveur, celui qui court après la rondelle, presse, marque ou suit le réalisateur garde sa cible).
  const FIXK={cmd:1,recv:1,chase:1,press:1,hunt:1,door:1,mark:1};
  const fixedT=e=>e===puck.car||(e.it&&FIXK[e.it.k]===1);
  function spreadTargets(){
    const MIN=6;
    for(let si=0;si<2;si++){const L=SK[SIDES[si]];
      for(let i=0;i<L.length;i++)for(let j=i+1;j<L.length;j++){
        const a=L[i], b=L[j]; if(a.leaving||b.leaving) continue;
        const fa=fixedT(a), fb=fixedT(b); if(fa&&fb) continue;
        // le porteur : sa position compte, pas seulement sa cible
        const ax=a===puck.car?a.x:a.tgx, ay=a===puck.car?a.y:a.tgy, bx=b===puck.car?b.x:b.tgx, by=b===puck.car?b.y:b.tgy;
        let dx=ax-bx, dy=ay-by, dd=Math.sqrt(dx*dx+dy*dy); if(dd>=MIN) continue;
        if(dd<0.3){dx=a.x-b.x;dy=a.y-b.y;dd=Math.sqrt(dx*dx+dy*dy);if(dd<0.3){dx=0;dy=1;dd=1}}
        const k=(MIN-Math.min(dd,MIN))/dd, px=dx*k, py=dy*k;
        if(fb){a.tgx+=px;a.tgy+=py;a.mv=true}else if(fa){b.tgx-=px;b.tgy-=py;b.mv=true}else{a.tgx+=px/2;a.tgy+=py/2;b.tgx-=px/2;b.tgy-=py/2;a.mv=b.mv=true}
      }
      for(const e of L) if(e.mv){e.mv=false;const q=rinkTo(e.tgx,e.tgy,2.5);e.tgx=q.x;e.tgy=q.y}
    }
  }
  function steer(e,dt){
    if(e.mode==="transit"){
      const dr=DOOR[e.side], dx=exitX(e)-e.x, dy=dr.y-1.5-e.y, dd=hyp(dx,dy);
      if(dd<1.6){e.gone=true;return}
      const sp=Math.min(e.vmax*0.8,dd*3);e.vx=lerp(e.vx,dx/dd*sp,0.3);e.vy=lerp(e.vy,dy/dd*sp,0.3);e.x+=e.vx*dt;e.y+=e.vy*dt;return;
    }
    let tx=e.tgx, ty=e.tgy;
    // contourner le filet
    const ax0=e.x<0?-e.x:e.x;
    if(ax0>80&&e.y<9&&e.y>-9&&ty<9&&ty>-9){
      const sx=e.x<0?-1:1, ax=sx*e.x, bx=sx*tx;
      if((ax<RK.GOAL&&bx>RK.GOAL+1)||(ax>RK.GOAL+2&&bx<RK.GOAL-1)){const side=(e.y+ty)>=0?1:-1; tx=sx*(RK.GOAL+1.5); ty=side*7.5}
    }
    const dx=tx-e.x, dy=ty-e.y, dist=Math.sqrt(dx*dx+dy*dy);
    const car=puck.car===e;
    let vmax=e.vmax*(e.tgs||0.8)*(car?0.88:1)*(e.stun>t?0.45:1);
    // fatigue en fin de présence
    vmax*=1-Math.min(0.08,(t-e.shiftT)/700);
    let sp=Math.min(vmax,Math.sqrt(40*Math.max(0,dist-0.3)));
    if(e.tga>=0){const left=e.tga-t;if(left>0.05)sp=Math.min(e.vmax*1.02,Math.max(Math.min(sp,dist/left*1.15),dist/left))}
    let dvx=dist>0.05?dx/dist*sp:0, dvy=dist>0.05?dy/dist*sp:0;
    // garder ses distances (calculé une fois par paire, voir separation())
    dvx+=e.sepx; dvy+=e.sepy;
    // accélération limitée (freiner et tourner se fait plus vite qu'accélérer)
    let ax=dvx-e.vx, ay=dvy-e.vy;
    const v=hyp(e.vx,e.vy);
    let lim=e.acc*(e.stun>t?0.5:1);
    if(v>2){const along=(ax*e.vx+ay*e.vy)/v;if(along<0)lim=Math.max(lim,23)}
    const am=hyp(ax,ay), mx=lim*dt; if(am>mx){ax*=mx/am;ay*=mx/am}
    e.vx+=ax; e.vy+=ay;
    const nv=hyp(e.vx,e.vy), cap=e.vmax*1.04; if(nv>cap){e.vx*=cap/nv;e.vy*=cap/nv}
    let nx=e.x+e.vx*dt, ny=e.y+e.vy*dt;
    // hors-jeu : un attaquant n'entre pas en zone avant la rondelle (sauf erreur)
    const s=e.side, d=dirS[s], pu=d*puck.x;
    const slip=!quiet(s)&&!DR.protect[s]&&outSince[s]<=t-0.45;   // erreur de hors-jeu permise
    if(pu<=RK.BLUE&&!car&&!(e.fly>t&&slip)){
      const lim2=RK.BLUE-0.3;
      if(d*e.x<=lim2&&d*nx>lim2){nx=d*lim2;if(d*e.vx>0)e.vx=0}
    }
    e.x=nx; e.y=ny;
    const h=boardsHit(e.x,e.y,1.4);
    if(h){e.x=h.x;e.y=h.y;const vn=e.vx*h.nx+e.vy*h.ny;if(vn<0){e.vx-=vn*h.nx;e.vy-=vn*h.ny}}
    // la cage
    if((e.x>RK.GOAL-0.9||e.x<-RK.GOAL+0.9)&&e.y<4.6&&e.y>-4.6){
      const sx=e.x<0?-1:1, ax2=sx*e.x;
      if(ax2<RK.GOAL+4.6){
        const dF=ax2-(RK.GOAL-0.9), dB=RK.GOAL+4.6-ax2, dS=4.6-Math.abs(e.y);
        if(dS<dF&&dS<dB){e.y=(e.y>=0?1:-1)*4.6;e.vy=0}
        else if(dF<dB){e.x=sx*(RK.GOAL-0.9);if(sx*e.vx>0)e.vx=0}
        else{e.x=sx*(RK.GOAL+4.6);if(sx*e.vx<0)e.vx=0}
      }
    }
    // direction du bâton
    const v2=hyp(e.vx,e.vy);
    if(v2>3){e.hx=lerp(e.hx,e.vx/v2,0.35);e.hy=lerp(e.hy,e.vy/v2,0.35)}
    else if(car){const gx=d*RK.GOAL-e.x,gy=-e.y,gn=hyp(gx,gy)||1;e.hx=lerp(e.hx,gx/gn,0.1);e.hy=lerp(e.hy,gy/gn,0.1)}
    const hn=hyp(e.hx,e.hy)||1; e.hx/=hn; e.hy/=hn;
  }

  /* ---------- contacts : réceptions, interceptions, rondelles libres, vols, mises en échec ---------- */
  function receive(m){
    if(puck.rel) puck.rel.kind="pass";
    gain(m,"recv");
  }
  function interactions(){
    if(puck.st==="pass"){
      const A=puck.from.side, m=puck.to;
      for(const q of SK[otherSide(A)]){
        if(q.stun>t||q.leaving) continue;
        const dq=hyp(q.x-puck.x,q.y-puck.y);
        if(dq<2.3){
          // passe protégée (la feuille de match l'exige) : le défenseur sur sa route s'écarte (bâton levé), elle ne le traverse pas
          if(DR.protect[A]||puck.seq){
            const sp=hyp(puck.vx,puck.vy)||1, nx=-puck.vy/sp, ny=puck.vx/sp, side=(q.x-puck.x)*nx+(q.y-puck.y)*ny>=0?1:-1, push=Math.max(0,2.4-dq);
            q.x+=nx*side*push; q.y+=ny*side*push; continue;
          }
          // la rondelle qui arrive sur le corps est presque toujours arrêtée; au bout du bâton, une fois sur deux
          if(R()<(DR.want===q.side?1:dq<1.4?0.85:PJ.intercept)){
            const passer=puck.from;
            if(R()<PJ.logGive) plays.push({t,type:"giveaway",side:A,p:passer.p});
            gain(q,"intercept"); return;
          }
        }
      }
      if(m&&m.mode==="ice"){
        const dd=hyp(m.x-puck.x,m.y-puck.y);
        if(dd<2.8||(puck.seq&&t>=puck.tArr-0.05&&dd<8)){
          if(!DR.protect[A]&&!puck.seq&&R()<PJ.bobble){loosePuck(puck.vx*0.3+(R()-0.5)*8,puck.vy*0.3+(R()-0.5)*8,"bobble");return}
          receive(m); return;
        }
      }
      if(t>puck.tArr+0.45||!m||m.mode!=="ice"){puck.st="free";openItem({k:"loose",last:puck.last,kind:"pass"})}
      return;
    }
    if(puck.st==="free"){
      const sp=hyp(puck.vx,puck.vy);
      // tir qui frappe le joueur qui le bloque
      const bq=puck.blocker;
      if(bq){
        if(bq.mode==="ice"&&hyp(bq.x-puck.x,bq.y-puck.y)<2.6){
          plays.push({t,type:"block",side:bq.side,p:bq.p,q:puck.shooter?puck.shooter.p:null});
          const vx=puck.vx/(sp||1), vy=puck.vy/(sp||1);
          puck.vx=-vx*7+(R()-0.5)*14; puck.vy=-vy*7+(R()-0.5)*14; puck.blocker=null; puck.lastE=bq; puck.last=bq.side; puck.hold=t+0.2; puck.rel=null;
          return;
        }
        // le joueur s'est déplacé : le tir passe à côté
        const ahead=(bq.x-puck.x)*puck.vx+(bq.y-puck.y)*puck.vy;
        if(ahead<0||bq.mode!=="ice"){puck.blocker=null;plays.push({t,type:"miss",side:puck.last,p:puck.shooter?puck.shooter.p:null})}
        else return;
      }
      if(DR.want&&DR.seq&&DR.seq.redir){
        const a1=DR.seq.actors[DR.seq.k];
        if(a1&&a1.mode==="ice"&&segDist(a1.x,a1.y,puck.x-puck.vx*0.1,puck.y-puck.vy*0.1,puck.x,puck.y)<4){DR.seq.redir=false;gain(a1,"recover")}
        return;
      }
      if(sp>48){
        if(DR.want) for(const e of SK[DR.want]){if(e.stun>t||e.leaving||(e===puck.lastE&&t<puck.hold))continue;if(segDist(e.x,e.y,puck.x-puck.vx*0.1,puck.y-puck.vy*0.1,puck.x,puck.y)<2.4){gain(e,"recover");return}}
        return;
      }
      const cand={};
      SIDES.forEach(s=>{
        let best=null,bd=2.5;
        SK[s].forEach(e=>{if(e.stun>t||e.leaving||(e===puck.lastE&&t<puck.hold))return;const dd=hyp(e.x-puck.x,e.y-puck.y);if(dd<bd){bd=dd;best=e}});
        cand[s]=best;
      });
      if(DR.want){
        if(cand[DR.want]){gain(cand[DR.want],"recover");return}
        const o=cand[otherSide(DR.want)];
        if(o&&t>puck.yieldT&&nearestOf(SK[DR.want],puck.x,puck.y).d>14&&R()<0.15) gain(o,"recover");
        return}
      const a=cand.away, h=cand.home;
      if(a&&h){
        // bataille pour la rondelle
        const pa=(a.str+a.pc)/((a.str+a.pc)+(h.str+h.pc));
        if(R()<0.35) gain(R()<pa?a:h,"battle");
      } else if(a||h) gain(a||h,"recover");
      return;
    }
    if(puck.st==="car"){
      const e=puck.car, A=e.side;
      if(DR.protect[A]||isActor(e)) return;
      for(const q of SK[otherSide(A)]){
        if(q.stun>t||q.leaving) continue;
        const dq=hyp(q.x-e.x,q.y-e.y);
        if(dq<4.3){
          const k=q.it?q.it.k:"", wall=boardDist(e.x,e.y)<6;
          if(k!=="press"&&k!=="hunt"&&!(wall&&dq<3.2)&&DR.want!==q.side) continue;
          let p=PJ.steal*(1+((q.str||70)-(e.pc||70))/60)*(wall?1.4:1);
          if(DR.want===q.side) p=1;
          if(R()<p){
            if(R()<0.55){if(R()<PJ.logTake)plays.push({t,type:"takeaway",side:q.side,p:q.p});gain(q,"steal")}
            else loosePuck((q.x-e.x)*-3+(R()-0.5)*10,(q.y-e.y)*-3+(R()-0.5)*10,"poke");
            return;
          }
        }
      }
    }
  }
  // mise en échec abandonnée (changement, arrêt de jeu, rondelle reçue...) : elle sera tentée plus tard
  function dropHunt(e){
    const hu=e.hunt; e.hunt=null; if(!hu||hu.pen||!hu.h||hu.h.done) return;
    hu.h.active=false; hu.h.t=t+3+Rh()*6; hitDirty=true;
  }
  // prochain moment pour retenter une mise en échec : un peu plus tard dans la présence, sinon à la suivante
  function retryHit(h,delay){
    h.active=false; h.tries++; hitDirty=true; if(h.tries>60){h.done=true;h.gaveUp=true;return}
    const c=(G.cores.get(h.p)||[]).find(x=>x.b>t+delay+2);
    // dans la prochaine présence, assez tôt pour qu'elle ne finisse pas avant (une courte présence compte aussi)
    h.t=c?Math.min(Math.max(t+delay,c.a+2)+Rh()*4,Math.max(t+0.5,c.a+1,c.b-4)):t+delay+Rh()*2;
    // fin du match toute proche (sirène ou but en prolongation, connus d'avance) : on réessaie tout de suite
    if(G.T-t<45) h.t=Math.min(h.t,t+0.5+Rh());
  }
  let lastRel={e:null,t:-9};
  function hitsTick(){
    // Les mises en échec de chaque joueur se font à la première bonne occasion autour du moment prévu :
    // de préférence sur le porteur (ou celui qui vient de lâcher la rondelle) le long de la bande.
    if(hitDirty){hitPlan.sort((a,b)=>a.t-b.t);hitDirty=false;hitIdx=0}
    while(hitIdx<hitPlan.length&&hitPlan[hitIdx].done) hitIdx++;
    if(puck.st!=="car"&&puck.lastE&&puck.lastE!==lastRel.e){lastRel={e:puck.lastE,t}}
    for(let i=hitIdx;i<hitPlan.length;i++){
      const h=hitPlan[i]; if(h.t-8>t) break; if(h.done||h.active) continue;
      const e=ents.get(h.p);
      if(!e||e.mode!=="ice"||e.leaving||isActor(e)||e.hunt||e===puck.car||puck.st==="dead"){if(t>h.t+8)retryHit(h,4);continue}
      // dernière présence prévue du joueur : il saisit la première occasion
      const lastChance=!(G.cores.get(h.p)||[]).some(c=>c.a>t+1)||G.T-t<45;
      const late=t>h.t+6||(h.tries>=4&&t>=h.t)||(lastChance&&t>=h.t-4), reachD=lastChance?45:32;
      let best=null,bs=-1e9;
      SK[otherSide(e.side)].forEach(q=>{
        if(isActor(q)||q.stun>t) return;
        const dd=hyp(q.x-e.x,q.y-e.y), wall=boardDist(q.x,q.y)<8, play=q===puck.car||(q===lastRel.e&&t-lastRel.t<1.2);
        // de préférence contre la bande : le porteur (ou celui qui vient de lâcher la rondelle), sinon un joueur tout près
        if(!late&&!(wall&&((play&&dd<24)||dd<14))) return;
        if(dd>reachD) return;
        // temps pour le rejoindre : il s'éloigne ou vient vers nous
        const away=dd>0.1?(q.vx*(q.x-e.x)+q.vy*(q.y-e.y))/dd:0, eta=dd/Math.max(5,e.vmax*0.95-away);
        if(eta>(lastChance?4:3)) return;
        const sc=-eta*9+(play?16:0)+(wall?12:0);
        if(sc>bs){bs=sc;best=q}
      });
      if(!best){if(t>h.t+8)retryHit(h,6);continue}
      h.active=true; e.hunt={h,q:best,until:t+3.5}; e.it=null; e.thinkAt=t;
    }
    SIDES.forEach(s=>SK[s].forEach(e=>{
      const hu=e.hunt; if(!hu) return;
      const q=hu.q;
      if(hu.pen){if(t>hu.until){e.hunt=null;e.thinkAt=t}return}
      if(!q||q.mode!=="ice"||isActor(q)||t>hu.until){retryHit(hu.h,3);e.hunt=null;e.thinkAt=t;return}
      if(hyp(q.x-e.x,q.y-e.y)<3.1){
        hits.push({t,side:s,p:e.p,victim:q.p}); plays.push({t,type:"hit",side:s,p:e.p,q:q.p});
        hu.h.done=true; e.hunt=null; e.thinkAt=t+0.4;
        // la victime est plaquée contre la bande (ou repoussée), le frappeur perd son élan
        const hb=boardsHit(q.x,q.y,9), ix=q.x-e.x, iy=q.y-e.y, n=hyp(ix,iy)||1;
        if(hb){q.vx=q.vx*0.2-hb.nx*6;q.vy=q.vy*0.2-hb.ny*6}
        else{q.vx=q.vx*0.25+ix/n*8;q.vy=q.vy*0.25+iy/n*8}
        q.stun=t+0.7+Rh()*0.6; e.vx*=0.4; e.vy*=0.4; e.stun=t+0.25;
        if(puck.car===q&&!DR.protect[q.side]&&Rh()<0.45) loosePuck(-iy/n*6+(Rh()-0.5)*6,ix/n*6+(Rh()-0.5)*6,"hit");
      }
    }));
  }
  // zones : hors-jeu au moment où la rondelle entre en zone, dégagement refusé quand elle franchit la ligne des buts
  let prevPU={away:0,home:0}; const sitKey={away:"",home:""}, outSince={away:Infinity,home:Infinity};
  function linesTick(){
    SIDES.forEach(s=>{
      const d=dirS[s], pu=d*puck.x, was=prevPU[s]; prevPU[s]=pu;
      // joueurs en zone (au début ou à la fin du dixième de seconde), avant la mise à jour
      const inside=SK[s].filter(e=>(d*e.x>RK.BLUE||e.u0>RK.BLUE)&&e.inZone<=t-0.3);
      SK[s].forEach(e=>{const u=d*e.x;if(u>RK.BLUE){if(e.inZone===Infinity)e.inZone=t}else e.inZone=Infinity});
      if(pu<=RK.BLUE){if(outSince[s]===Infinity)outSince[s]=t}
      if(was<=RK.BLUE&&pu>RK.BLUE){
        const longOut=outSince[s]<=t-0.4; outSince[s]=Infinity;
        const ps=possSide(), own=ps===s||(puck.st==="free"&&puck.rel&&puck.rel.side===s&&t-puck.rel.t<2.5);
        if(!own||!longOut) return;
        const car=puck.st==="car"?puck.car:null;
        const off=inside.filter(e=>e!==car);
        if(off.length&&!quiet(s)&&!pending){
          const o=off.sort((a,b)=>a.inZone-b.inZone)[0];
          offs.push({t0:o.inZone,t1:t,p:o.p,side:s});
          plays.push({t,type:"offside",side:s,p:o.p});
          blow("offside",{side:s,yc:puck.y});
        }
      }
      // dégagement refusé
      const r=puck.rel;
      if(puck.st==="free"&&r&&r.side===s&&r.kind==="clear"&&r.u<0&&!r.sh&&pu>RK.GOAL+0.6&&Math.abs(puck.y)>3.4&&!pending){
        if(quiet(s)){puck.rel=null;return}
        plays.push({t,type:"icing",side:s});
        blow("icing",{side:s,y0:r.y0});
      }
    });
  }

  /* ---------- réalisateur : séquences de tir ---------- */
  const flightOf=(x0,y0,x1,y1,v)=>hyp(x1-x0,y1-y0)/v;
  // vitesse de la rondelle (pi/s) : un lancer du poignet de la LNH dépasse 100 pi/s (70 mi/h)
  function shotSpeed(kind){return {wrist:100,snap:106,slap:114,back:80,tip:86,wrap:50,one:110}[kind]||100}
  function chooseKind(e,dist,oneT){
    if(dist<=11) return R()<0.55?"tip":"wrap";
    if(oneT) return "one";
    if(e.trk==="D"&&dist>40) return R()<0.55?"slap":"wrist";
    const r=R();return r<0.55?"wrist":r<0.8?"snap":r<0.92?"back":"slap";
  }
  function spotFor(sh,e,role){
    const s=sh.side, eu=U(s,e.x), ew=Wf(s,e.y), sg=ew>=0?1:-1, goal=sh.goal;
    let u,w;
    if(G.pulledAt(otherSide(s),sh.t)){u=clamp(eu+10,-5,55);w=clamp(ew,-25,25)}
    else if(role==="shoot"){
      if(e.trk==="D"){u=34+R()*9;w=(e.role==="LD"?-1:1)*(5+R()*15)}
      else if(goal&&R()<0.6){u=73+R()*11;w=(R()-0.5)*16}
      else if(R()<0.3){u=58+R()*12;w=sg*(14+R()*9)}
      else{u=66+R()*16;w=sg*(3+R()*14)}
    } else {
      // passeur : près de l'endroit où il est, dans la zone
      if(e.trk==="D"){u=36+R()*4;w=clamp(ew,-22,22)}
      else if(eu>RK.BLUE+5){u=clamp(eu,55,94);w=clamp(ew,-34,34);if(Math.abs(w)<10&&u<84)w=sg*(18+R()*12)}
      else{const r=R();if(r<0.4){u=62+R()*6;w=sg*33}else if(r<0.7){u=88+R()*5;w=sg*(10+R()*16)}else{u=60+R()*8;w=sg*(16+R()*8)}}
    }
    return toXY(s,u,w,3);
  }
  function planSeq(sh){
    const s=sh.side, P=entOf(sh.p);
    if(!P||P.mode!=="ice") return null;
    if(!sh._chain){
      let ch=[];
      if(sh.goal) ch=sh.goal.assists.slice().reverse().filter(p=>p&&p!==sh.p);
      else if(R()<0.62){
        // passeur : un coéquipier qui ne change pas, pas loin derrière la rondelle (pas de longue passe vers l'arrière)
        const pu=U(s,puck.x), m=SK[s].filter(q=>q!==P&&!q.leaving&&q.role!=="X"&&U(s,q.x)>Math.min(pu,40)-18&&!G.shots.some(x=>x.p===q.p&&Math.abs(x.t-sh.t)<0.01));
        if(m.length){const c=puck.st==="car"&&puck.car.side===s&&puck.car!==P&&m.includes(puck.car)&&R()<0.5?puck.car:m[Math.floor(R()*m.length)];ch=[c.p]}
      }
      sh._chain=ch;
    }
    const actors=[...sh._chain.map(entOf).filter(q=>q&&q.mode==="ice"&&(sh.goal||!q.leaving)),P];
    if(!sh._spots) sh._spots=new Map();
    actors.forEach((q,i)=>{if(!sh._spots.has(q))sh._spots.set(q,spotFor(sh,q,i===actors.length-1?"shoot":"pass"))});
    const spots=actors.map(q=>sh._spots.get(q));
    const d=dirS[s], goal=!!sh.goal;
    const last=actors.length-1;
    if(!sh._rnd) sh._rnd={oneT:R()<0.3,hS:0.18+R()*0.3,holds:[R(),R(),R(),R()].map(x=>0.3+x*0.35)};
    const rnd=sh._rnd, oneT=last>0&&rnd.oneT;
    const dist=hyp(d*RK.GOAL-spots[last].x,spots[last].y);
    if(!sh._kind) sh._kind=chooseKind(P,dist,oneT);
    const kind=sh._kind, vS=shotSpeed(kind)*0.82;
    const hS=kind==="one"||kind==="tip"?0.06:rnd.hS;
    const rels=[], ins=[];
    const sched=()=>{
      rels[last]=sh.t-flightOf(spots[last].x,spots[last].y,d*RK.GOAL,0,vS); ins[last]=rels[last]-hS;
      for(let i=last-1;i>=0;i--){const pf=clamp(flightOf(spots[i].x,spots[i].y,spots[i+1].x,spots[i+1].y,1)/62,0.2,1.3);rels[i]=ins[i+1]-pf;ins[i]=rels[i]-rnd.holds[i%4]}
    };
    sched();
    // chacun vise une place qu'il peut atteindre à temps (en zone neutre, avant la ligne bleue si la rondelle n'y est pas)
    for(let i=0;i<=last;i++) spots[i]=onsideAim(actors[i],towards(actors[i],spots[i],Math.max(0,ins[i]-t-0.15)));
    sched();
    // le porteur actuel doit faire parvenir la rondelle au premier acteur
    const c=puck.st==="car"?puck.car:null;
    let start=ins[0];
    if(c&&c.side===s){
      if(c===actors[0]) start=ins[0]-Math.min(2,hyp(spots[0].x-c.x,spots[0].y-c.y)/(c.vmax*0.8));
      else start=ins[0]-clamp(hyp(spots[0].x-puck.x,spots[0].y-puck.y)/62,0.25,1.6)-0.2;
    } else start=ins[0]-1.6;
    return {sh,A:s,actors,spots,ins,rels,kind,vS,k:0,start,goal};
  }
  function startSeq(pl){
    DR.seq=pl; DR.actors=new Set(pl.actors);
    const c=puck.st==="car"?puck.car:null;
    if(c&&c.side===pl.A&&!pl.actors.includes(c)&&!c.leaving) c.cmd=It("cmd",{x:c.x+c.vx*0.4,y:c.y+c.vy*0.4,spd:0.5,keep:true});
    pl.actors.forEach((a,i)=>{dropHunt(a);a.cmd=It("cmd",{x:pl.spots[i].x,y:pl.spots[i].y,tArr:pl.ins[i],spd:1,keep:true})});
  }
  function endSeq(){
    if(DR.seq) DR.seq.actors.forEach(a=>{a.cmd=null;a.thinkAt=t});
    if(puck.car&&puck.car.cmd){puck.car.cmd=null;puck.car.thinkAt=t}
    DR.seq=null; DR.actors=new Set();
  }
  // la rondelle va au tireur, au bon endroit, au bon moment, après les passes décisives
  function runSeq(){
    const S=DR.seq, s=S.A, sh=S.sh, d=dirS[s];
    if(puck.st==="shot") return;
    const k=S.k, a=S.actors[k], last=S.actors.length-1;
    if(!a||a.mode!=="ice"){endSeq();return}
    // un passeur facultatif s'en va changer : la séquence se fait sans lui
    if(!S.goal&&last>0&&S.actors.some((q,i)=>i<last&&q.leaving)){shortSeq(S);return runSeq()}
    if(puck.st==="car"&&puck.car===a){
      if(k===last){
        // le tireur : il avance un peu, puis lance pour que la rondelle arrive au filet à la seconde prévue
        const tgtGoal=S.goal?{x:d*(RK.GOAL+1.6),y:(R()-0.5)*3.4}:null;
        const net=tgtGoal||{x:GK[otherSide(s)]&&GK[otherSide(s)].mode==="ice"?GK[otherSide(s)].x:d*(RK.GOAL-1.2),y:GK[otherSide(s)]&&GK[otherSide(s)].mode==="ice"?GK[otherSide(s)].y:0};
        const fl=Math.max(0.14,flightOf(puck.x,puck.y,net.x,net.y,shotSpeed(S.kind)));
        if(t>=sh.t-fl-0.1||sh.t-t<0.25){fire(a,sh,net,S.kind);return}
        const sp=S.spots[k], far=hyp(sp.x-a.x,sp.y-a.y), close=hyp(d*RK.GOAL-a.x,a.y)<18;
        if(far>5&&sh.t-fl-t>0.5) a.cmd=It("cmd",{x:sp.x,y:sp.y,tArr:sh.t-fl,spd:1,keep:true});
        else a.cmd=close?It("cmd",{x:a.x+a.vx*0.2,y:a.y+a.vy*0.2,spd:0.25,keep:true}):It("cmd",{x:lerp(a.x,d*RK.GOAL,0.06),y:lerp(a.y,0,0.06),spd:0.4,keep:true});
        return;
      }
      if(!S.goal&&k+1<last&&seqETA(S,a,k+1)>sh.t+0.02){shortSeq(S);return runSeq()}
      const nx=S.actors[k+1];
      let tin=S.ins[k+1], left=Math.max(0.15,tin-t), pred=onsideAim(nx,towards(nx,S.spots[k+1],left));
      const lat=latestIn(S,k+1,pred);
      if(lat<tin){tin=lat;left=Math.max(0.15,tin-t);pred=onsideAim(nx,towards(nx,S.spots[k+1],left))}
      const dd=hyp(pred.x-puck.x,pred.y-puck.y), fl=clamp(dd/62,0.2,1.3);
      if(t>=tin-fl-0.05||t>=S.rels[k]){
        const v=clamp(dd/left,28,92);
        passTo(a,nx,pred,v,k+1===last?"set":"",true); S.k=k+1;
        nx.cmd=It("cmd",{x:pred.x,y:pred.y,tArr:t+dd/v,spd:1,keep:true});
        a.cmd=null; a.thinkAt=t+0.3;
        return;
      }
      a.cmd=It("cmd",{x:lerp(a.x,S.spots[k].x,0.3),y:lerp(a.y,S.spots[k].y,0.3),spd:0.5,keep:true});
      return;
    }
    if(puck.st==="pass"&&puck.to===a) return;
    if(puck.st==="car"&&puck.car.side===s){
      const c=puck.car, j=S.actors.indexOf(c);
      // un acteur a la rondelle : la chaîne reprend à lui (un but garde ses passes dans l'ordre)
      if(j>=0&&(j===0||!S.goal)){S.k=j;return}
      if(k!==0){S.k=0;}
      // trop tard pour la passe préparatoire et les passes prévues : la rondelle va directement au tireur
      if(!S.goal&&S.actors.length>1&&seqETA(S,c,0)>sh.t+0.02) {shortSeq(S);return runSeq()}
      // passe préparatoire du porteur au premier acteur
      const a0=S.actors[0];
      let tin=S.ins[0], left=Math.max(0.2,tin-t), pred=onsideAim(a0,towards(a0,S.spots[0],left));
      const lat=latestIn(S,0,pred);
      if(lat<tin){tin=lat;left=Math.max(0.2,tin-t);pred=onsideAim(a0,towards(a0,S.spots[0],left))}
      const dd=hyp(pred.x-puck.x,pred.y-puck.y), fl=clamp(dd/62,0.22,1.6);
      if(t>=tin-fl-0.05||c.leaving){
        const v=clamp(dd/left,30,90);passTo(c,a0,pred,v,"",true);a0.cmd=It("cmd",{x:pred.x,y:pred.y,tArr:t+dd/v,spd:1,keep:true});
        if(!isActor(c)){c.cmd=null;c.thinkAt=t+0.2}
      } else if(!isActor(c)&&!c.leaving) {
        // le porteur garde la rondelle en attendant le moment de la passe
        const q=toXY(s,clamp(U(s,c.x)+4,-80,70),Wf(s,c.y)*0.95,4);
        c.cmd=It("cmd",{x:q.x,y:q.y,spd:0.55,keep:true});
      }
      return;
    }
    // rondelle libre ou à l'adversaire : elle revient à l'équipe qui doit tirer
    DR.want=s;
    const relays=S.actors.length-1-S.k, urgent=sh.t-t<1.7+0.75*relays;
    if(urgent&&!S.redir){
      if(puck.st==="car"&&puck.car.side!==s){
        const c=puck.car, q=nearestOf(SK[s],c.x,c.y).q;
        if(q&&hyp(q.x-c.x,q.y-c.y)<3.5){gain(q,"steal");return}
        loosePuck(c.vx*0.3,c.vy*0.3,"poke");
      } else if(puck.st==="pass"&&puck.from&&puck.from.side!==s){puck.st="free";puck.to=null;puck.seq=false;openItem({k:"loose",last:puck.last,kind:"pass"})}
    }
    // le temps presse : la rondelle libre file vers le prochain acteur (un rebond chanceux), qui la reprend
    if(puck.st==="free"&&urgent&&!S.redir){
      const a1=S.actors[S.k], left=Math.max(0.35,sh.t-t-0.45-0.65*relays), P=onsideAim(a1,towards(a1,S.spots[S.k],left*0.5));
      const dx=P.x-puck.x, dy=P.y-puck.y, dd=hyp(dx,dy), v=clamp(dd/(left*0.6),25,95);
      if(dd>1){puck.vx=dx/dd*v;puck.vy=dy/dd*v}
      a1.cmd=It("cmd",{x:P.x,y:P.y,tArr:t+dd/v,spd:1,keep:true});
      S.redir=true; stat.redir=(stat.redir||0)+1;
    }
  }
  // moment où le tir arriverait au filet si la rondelle partait maintenant du porteur c vers l'acteur i, puis
  // de passe en passe jusqu'au tireur (passes rapides, sans attente)
  function seqETA(S,c,i){
    const d=dirS[S.A]; let tt=t, px=puck.x, py=puck.y;
    for(let k=i;k<S.actors.length;k++){
      const q=S.actors[k]; if(q===c&&k===i) continue;
      const P=onsideAim(q,towards(q,S.spots[k],Math.max(0.15,S.ins[k]-t))), dd=hyp(P.x-px,P.y-py);
      tt+=dd/clamp(dd/0.45,45,90)+0.1; px=P.x; py=P.y;
    }
    return tt+hyp(d*RK.GOAL-px,py)/shotSpeed(S.kind);
  }
  // dernier moment où l'acteur i peut recevoir la rondelle en P pour que le tir arrive à temps
  function latestIn(S,i,P){
    const d=dirS[S.A]; let tt=0, px=P.x, py=P.y;
    for(let k=i+1;k<S.actors.length;k++){
      const q=S.actors[k], Q=onsideAim(q,towards(q,S.spots[k],Math.max(0.15,S.ins[k]-t))), dd=hyp(Q.x-px,Q.y-py);
      tt+=0.15+dd/clamp(dd/0.45,45,90); px=Q.x; py=Q.y;
    }
    tt+=(S.kind==="one"||S.kind==="tip"?0.08:0.16)+hyp(d*RK.GOAL-px,py)/shotSpeed(S.kind);
    return S.sh.t-tt-0.04;
  }
  // séquence raccourcie : seul le tireur reste
  function shortSeq(S){
    const L=S.actors.length-1, P=S.actors[L];
    S.actors.slice(0,L).forEach(a=>{if(a!==puck.car){a.cmd=null;a.thinkAt=t}});
    S.actors=[P]; S.spots=[S.spots[L]]; S.ins=[S.ins[L]]; S.rels=[S.rels[L]]; S.k=0; S.sh._chain=[];
    DR.actors=new Set(S.actors); stat.shortSeq=(stat.shortSeq||0)+1;
  }
  function reach(e,ux,uy,left){
    if(left<=0) return 0;
    const v0=Math.max(0,e.vx*ux+e.vy*uy), vm=e.vmax*0.95, a=e.acc*0.85, tv=Math.max(0,(vm-v0)/a);
    return 0.92*(left<=tv?v0*left+0.5*a*left*left:v0*tv+0.5*a*tv*tv+vm*(left-tv));
  }
  function onsideAim(e,P){
    const s=e.side, d=dirS[s];
    if(d*puck.x<=RK.BLUE&&d*e.x<=RK.BLUE&&d*P.x>RK.BLUE-1) return inRink(d*(RK.BLUE-1.5),P.y,3);
    return P;
  }
  function towards(e,spot,left){
    const dx=spot.x-e.x, dy=spot.y-e.y, dd=hyp(dx,dy), reach_=dd>0.01?reach(e,dx/dd,dy/dd,left):0, reach0=reach_;
    const reach1=reach0;
    if(dd<=reach1||dd<0.5) return {x:spot.x,y:spot.y};
    return inRink(e.x+dx/dd*reach1,e.y+dy/dd*reach1,3);
  }
  function fire(a,sh,net,kind){
    const s=a.side, d=dirS[s];
    const t1=sh.t, dist=Math.round(hyp(d*RK.GOAL-puck.x,puck.y));
    const need=Math.max(0.06,hyp(net.x-puck.x,net.y-puck.y)/118);
    if(t+need-t1>0.05) late.push({t:sh.t,side:s,by:+(t+need-t1).toFixed(2)});
    const kd=dist<=11&&kind!=="tip"&&kind!=="wrap"?(R()<0.5?"tip":"wrap"):kind;
    puck.st="shot";puck.car=null;puck.sx=puck.x;puck.sy=puck.y;puck.t0=t;puck.tArr=Math.max(t1,t+need);puck.tx=net.x;puck.ty=net.y;puck.shot=sh;puck.last=s;puck.lastE=a;puck.rel=null;
    openItem({k:"shot",side:s,p:a.p,goal:!!sh.goal,kind:kd});
    sh.x=+puck.x.toFixed(1); sh.y=+puck.y.toFixed(1); sh.dist=dist; sh.kind=kd; if(sh.goal) sh.goal.shot=sh;
    a.cmd=null; a.thinkAt=t+0.25;
  }
  function shotArrives(){
    const sh=puck.shot, s=sh.side, d=dirS[s], gs=otherSide(s);
    sh.done=true;
    const ex=puck.x, ey=puck.y;
    endSeq();
    if(sh.goal){
      closeItem();
      if(t<pb-0.05) blow("goal",{side:s,g:sh.goal});
      else items.push({k:"dead",t0:t,t1:t,x:ex,y:ey,face:null,cause:"goal"});
      puck.st="dead";
      return;
    }
    const gk=G.goalieAt(gs,t);
    plays.push({t,type:"shot",side:s,p:sh.p,dist:sh.dist,kind:sh.kind,g:gk});
    // arrêt : rondelle immobilisée (mise au jeu en zone) ou rebond
    const nxS=shotsP.find(x=>!x.done&&x.t>t+0.01), nxP=pensP.find(p=>!p.done);
    const gapS=nxS?nxS.t-t:Infinity, gap=Math.min(gapS,nxP?nxP.t-t:Infinity);
    const sameSoon=nxS&&nxS.side===s&&gapS<6, oppSoon=nxS&&nxS.side!==s&&gapS<14;
    const G0=GK[gs];
    if(!sameSoon&&!oppSoon&&gap>3&&pb-t>1.6&&R()<PJ.freeze&&G0&&G0.mode==="ice"){
      closeItem(); puck.st="held"; puck.gk=G0;
      openItem({k:"held",x:puck.x,y:puck.y,g:gk,side:gs});
      plays.push({t,type:"freeze",side:gs,g:gk});
      freezeAt=+(t+0.45+R()*0.4).toFixed(6); freezeInfo={side:gs,y:sh.y,g:gk};
      return;
    }
    // rebond vers l'enclave ou le coin
    const sg=sh.y>=0?1:-1;
    const rb=sameSoon&&nxS?{x:lerp(puck.x,entOf(nxS.p).x,0.6),y:lerp(puck.y,entOf(nxS.p).y,0.6)}:R()<0.5?{x:d*(77+R()*7),y:(R()-0.5)*16}:{x:d*(86+R()*4),y:sg*(16+R()*12)};
    const dx=rb.x-puck.x, dy=rb.y-puck.y, n=hyp(dx,dy)||1, v=clamp(n*1.6,12,30);
    puck.x=d*(RK.GOAL-2.2);
    loosePuck(dx/n*v,dy/n*v,"rebound"); puck.hold=0;
    if(sameSoon) DR.want=s; else if(oppSoon) DR.want=gs;
  }
  // temps qu'il faut à une équipe pour être en position de tir
  function leadNeeded(sh){
    const s=sh.side, ps=possSide();
    // rondelle libre : là où elle s'arrêtera (une rondelle dégagée peut traverser la patinoire)
    let px=puck.x, py=puck.y;
    if(puck.st==="free"||puck.st==="pass"){const sp=hyp(puck.vx,puck.vy), k=Math.min(2,sp/22);const q=inRink(px+puck.vx*k,py+puck.vy*k,2);px=q.x;py=q.y}
    const pu=U(s,px);
    let L=2.6+(sh.goal?1.5+sh.goal.assists.length*1.2:0.9);
    if(ps!==s){
      const q=nearestOf(SK[s],px,py);
      L+=(puck.st==="free"?0.6:1.8)+(q.q?q.d/(q.q.vmax*0.7):3);
    }
    L+=Math.max(0,34-pu)/18;
    if(pu<-RK.BLUE) L+=1.4;
    const P=entOf(sh.p);
    if(P&&P.mode==="ice"){const want=P.trk==="D"?36:58, gap=Math.max(0,want-U(s,P.x));L=Math.max(L,gap/(P.vmax*0.75)+2.2)}
    return L+1.2;
  }
  function directorTick(){
    DR.protect.away=DR.protect.home=false; DR.want=null; DR.soft=null; DR.noWhistle=false; DR.quietSide=null; DR.noAttempt=false; DR.build=false;
    // dernière seconde de la période : pas de coup de sifflet (la mise au jeu tomberait après la sirène)
    if(pb-t<1.2) DR.noWhistle=true;
    while(sIdx<shotsP.length&&shotsP[sIdx].done) sIdx++;
    while(sIdx<shotsP.length&&shotsP[sIdx].t<t-0.2&&puck.st!=="shot"){const x=shotsP[sIdx];x.done=true;late.push({t:x.t,side:x.side,by:99,missed:true});stat.missed=(stat.missed||0)+1;if(DR.seq&&DR.seq.sh===x)endSeq();sIdx++}
    const sh=shotsP[sIdx], np=pensP.find(p=>!p.done);
    if(np&&np.t-t<4) DR.noWhistle=true;
    if(freezeAt<Infinity) DR.noWhistle=true;
    // pénalité : le joueur fautif s'approche d'un adversaire
    if(np&&np.t-t<3.2) np.list.forEach(pn=>{const e=ents.get(pn.p);if(e&&e.mode==="ice"&&!e.hunt&&!isActor(e)){const q=puck.car&&puck.car.side!==e.side?puck.car:nearestOf(SK[otherSide(e.side)],e.x,e.y).q;if(q){e.hunt={pen:true,q,until:np.t+0.2};e.thinkAt=t}}});
    if(!sh) return;
    if(sh.t-t<6.5) DR.noWhistle=true;
    if(sh.t-t<5) DR.noAttempt=true;
    const s=sh.side;
    if(DR.seq){
      DR.build=true; DR.noWhistle=true; DR.noAttempt=true;
      if(possSide()===s||puck.st==="shot") DR.protect[s]=true; else DR.want=s;
      runSeq();
      return;
    }
    if(puck.st==="dead"||puck.st==="held") return;
    const need=leadNeeded(sh)+(sh.extra===undefined?(sh.extra=R()<0.25?R()*2:R()<0.67?2+R()*4:6+R()*7):sh.extra);
    // Avant la montée : jeu plus prudent (personne ne lance la rondelle au loin), pour que l'équipe qui doit tirer
    // ne se retrouve pas à l'autre bout de la patinoire au mauvais moment
    if(sh.t-t>need){if(sh.t-t<Math.max(need+9,22)){DR.soft=s;DR.noAttempt=true}return}
    // montée vers le tir : l'équipe qui doit tirer ne cause pas d'arrêt de jeu (l'adversaire, lui, peut être hors-jeu)
    DR.build=true; DR.quietSide=s; DR.noAttempt=true;
    if(possSide()===s) DR.protect[s]=true; else DR.want=s;
    // l'adversaire perd la rondelle si le temps presse
    if(puck.st==="car"&&puck.car.side!==s&&(sh.t-t<leadNeeded(sh)-0.8||sh.t-t<3+(sh.goal?sh.goal.assists.length*0.7:0))){
      const c=puck.car, q=nearestOf(SK[s],c.x,c.y).q;
      if(q&&hyp(q.x-c.x,q.y-c.y)<4) gain(q,"steal");
      else if(q&&(hyp(q.x-c.x,q.y-c.y)<20||sh.t-t<2.2)){
        // passe ratée ou rondelle harponnée : elle glisse vers un joueur de l'autre équipe, tout près, qui la reprend
        const dx=q.x+q.vx*0.5-c.x, dy=q.y+q.vy*0.5-c.y, n=hyp(dx,dy)||1, v=clamp((n*1.15+8)/1.6,12,36);
        loosePuck(dx/n*v+(R()-0.5)*3,dy/n*v+(R()-0.5)*3,"poke"); puck.yieldT=t+0.9;
      }
      // personne de l'autre équipe tout près et un peu de temps : la rondelle lui échappe devant lui (elle ne file pas seule vers un adversaire loin)
      else if(q) loosePuck(c.vx*0.6+(R()-0.5)*6,c.vy*0.6+(R()-0.5)*6,"bobble");
      else loosePuck(c.vx*0.5+(R()-0.5)*8,c.vy*0.5+(R()-0.5)*8,"poke");
    }
    if(puck.st==="free"&&!puck.blocker&&sh.t-t<leadNeeded(sh)-0.5&&t>=(sh._bounceAt||0)){
      const q=nearestOf(SK[s].filter(e=>!e.leaving),puck.x,puck.y).q;
      if(q){
        const dx=q.x+q.vx*0.4-puck.x, dy=q.y+q.vy*0.4-puck.y, n=hyp(dx,dy)||1, sp=hyp(puck.vx,puck.vy);
        const toward=sp>1&&(dx*puck.vx+dy*puck.vy)/(n*sp)>0.7;
        // rebond vers lui : sur la bande (ricochet), ou n'importe où si le tir doit partir très bientôt
        const carom=boardDist(puck.x,puck.y)<3.5||sh.t-t<3.2;
        if(n>9&&!toward&&carom){const v=clamp((n*1.15+8)/1.6,14,42);puck.vx=dx/n*v;puck.vy=dy/n*v;puck.yieldT=t+0.9;sh._bounceAt=t+1.6;stat.bounce=(stat.bounce||0)+1}
      }
    }
    const cpu=U(s,puck.x);
    if(puck.st==="car"&&puck.car.side===s&&cpu<28&&!puck.car.leaving){
      const c=puck.car, wait=cpu<=RK.BLUE&&cpu>-RK.BLUE&&offsideMates(c).length>0;
      const q=toXY(s,wait?Math.min(cpu+4,RK.BLUE-5):Math.min(cpu+22,40),clamp(Wf(s,c.y)*0.85,-30,30),4);
      c.cmd=It("cmd",{x:q.x,y:q.y,spd:wait?0.55:0.97,keep:true,build:true});
    } else if(puck.car&&puck.car.cmd&&puck.car.cmd.build) {puck.car.cmd=null;puck.car.thinkAt=t}
    if(sh._planAt!==undefined&&t<sh._planAt&&sh.t-t>2.4) return;
    sh._planAt=t+0.25;
    const pl=planSeq(sh);
    const ok=possSide()===s||(puck.st==="free"&&sh.t-t<2.4+(sh.goal?sh.goal.assists.length*0.7:0));
    // rondelle sortie de la zone : on attend que tous en soient sortis (pas de passe hors-jeu)
    const tag=cpu<=RK.BLUE&&SK[s].some(q=>q!==puck.car&&U(s,q.x)>RK.BLUE-0.3);
    if(pl&&ok&&(!tag||sh.t-t<2.6)&&(t>=pl.start-0.3||sh.t-t<2.2)&&(cpu>27||t>=pl.start-0.05||sh.t-t<3.2)){if(puck.car&&puck.car.cmd&&puck.car.cmd.build)puck.car.cmd=null;startSeq(pl)}
  }

  /* ---------- déroulement d'une période ---------- */
  function setupPeriod(per){
    pa=(per-1)*1200; pb=Math.min(per*1200,G.T);
    SIDES.forEach(s=>{dirS[s]=G.attackDir(s,pa+1)});
    t=pa; st=G.stateAt(pa+1e-4);
    closeItem(); puck.st="dead"; puck.car=null; puck.to=null; puck.rel=null;
    // alignements du début de période
    SIDES.forEach(s=>{
      [...SK[s]].forEach(e=>offIce(e,false));
      ["F","D"].forEach(g=>{const tr=G.plan[s][g];let i=tr.findIndex(x=>x.a<=pa+1e-6&&pa+1e-6<x.b);PI[s][g]=Math.max(0,i);chg[s][g]=null});
      if(GK[s]) hide(GK[s]);
      GK[s]=entOf(G.goalieAt(s,pa+0.02)); show(GK[s]);
    });
    shotsP=G.shots.filter(x=>x.t>=pa&&x.t<=pb); sIdx=0;
    // pénalités sifflées (à la mise au jeu, pendant un but ou à la sirène : pas de coup de sifflet de plus)
    const groups=[];
    G.pens.forEach(p=>{
      if(p.t<pa+0.5||p.t>=pb-0.5) return;
      if(G.goals.some(g=>p.t>=g.t-0.6&&p.t<=g.t+0.06)) return;
      const gr=groups.find(q=>Math.abs(q.t-p.t)<0.6); if(gr) gr.list.push(p); else groups.push({t:p.t,list:[p]});
    });
    pensP=groups.sort((a,b)=>a.t-b.t);
    freezeAt=Infinity; pending=null; DR.seq=null; DR.actors=new Set();
    prevPU={away:0,home:0};
    // début de période : mise au jeu au centre
    puck.x=0;puck.y=0;puck.st="dead";puck.car=null;
    stops.push({t:pa,cause:"period",x:0,y:0});
    SIDES.forEach(s=>applyNow(s,"whistle"));
    SIDES.forEach(s=>{
      placeGoalie(s);
      const m=new Map(); faceSpots(G,t,s,SK[s].map(e=>({p:e.p,role:e.role})),{x:0,y:0},m);
      SK[s].forEach(e=>{const v=m.get(e.p);if(v){e.x=v.x;e.y=v.y}e.vx=e.vy=0;e.hx=dirS[s];e.hy=0;e.thinkAt=pa+0.02+e.react});
    });
    sample();
    t=pa+0.02; sample();
    items.push({k:"dead",t0:pa,t1:t,x:0,y:0,face:{x:0,y:0},cause:"period"});
    faceoff({x:0,y:0});
  }
  // moments exacts : arrivée d'un tir, pénalité, fin de pénalité, retrait du gardien, sirène
  function exactTimes(){
    const ex=new Set([pb]);
    G.pens.forEach(p=>{[p.t,p.end,p.boxEnd].forEach(x=>{if(x>pa&&x<pb)ex.add(x)})});
    G.pulls.forEach(p=>{[p.a,p.b].forEach(x=>{if(x>pa&&x<pb)ex.add(x)})});
    shotsP.forEach(x=>ex.add(x.t));
    return [...ex].sort((a,b)=>a-b);
  }
  let nTick=0;
  function* runPeriod(per){
    setupPeriod(per);
    const EX=exactTimes(); let ei=0;
    let guard=0;
    while(t<pb-1e-9&&guard++<40000){
      if(++nTick%60===0) yield t;
      while(ei<EX.length&&EX[ei]<=t+1e-9) ei++;
      let tn=Math.min(t+DT,EX[ei]!==undefined?EX[ei]:pb,pb);
      if(freezeAt<tn) tn=Math.max(t+1e-3,freezeAt);
      if(puck.st==="shot"&&puck.tArr<tn) tn=Math.max(t+1e-3,puck.tArr);
      const regular=tn===t+DT, dt=tn-t;
      st=G.stateAt(t+1e-4);
      directorTick();
      // rondelle libre : le plus rapide à l'atteindre de chaque équipe y va tout de suite (sans attendre de changer d'idée)
      if(puck.st==="free") for(let si=0;si<2;si++){
        let c0=null, bt=Infinity;
        for(const e of SK[SIDES[si]]){if(e.leaving||e.stun>t)continue;const tt=hyp(e.x-puck.x,e.y-puck.y)/e.vmax;if(tt<bt){bt=tt;c0=e}}
        if(c0&&!c0.cmd&&!c0.hunt&&(!c0.it||c0.it.k!=="chase"))c0.thinkAt=t;
      }
      // décisions, puis mouvement
      for(let si=0;si<2;si++){const L=SK[SIDES[si]];for(let j=0;j<L.length;j++){
        const e=L[j];
        if(e===puck.car){
          if(e.cmd) e.it=e.cmd;
          else if(t>=e.thinkAt||(e.it&&e.it.k==="carry"&&t>=e.it.until)) carrierThink(e);
          continue;
        }
        if(e.cmd){e.it=e.cmd;continue}
        if(t>=e.thinkAt||!e.it||t>=e.it.until||e.hunt||e.leaving){
          const it=think(e);e.tpx=puck.x;e.tpy=puck.y;
          if(it!==e.it){e.it=it;e.thinkAt=it.until!==undefined?it.until:t+0.5}
        } else {
          const dx=puck.x-e.tpx, dy=puck.y-e.tpy;
          if(dx*dx+dy*dy>576) e.thinkAt=t;
        }
      }}
      for(let si=0;si<2;si++){const L=SK[SIDES[si]],d=dirS[SIDES[si]];for(let j=0;j<L.length;j++)L[j].u0=d*L[j].x}
      separation();
      for(let si=0;si<2;si++){const L=SK[SIDES[si]];for(let j=0;j<L.length;j++) targetOf(L[j])}
      spreadTargets();
      for(let si=0;si<2;si++){const L=SK[SIDES[si]];for(let j=0;j<L.length;j++) steer(L[j],dt)}
      vis.forEach(e=>{if(e.mode==="transit")steer(e,dt)});
      vis.forEach(e=>{if(e.gone){e.gone=false;e.mode="off";hide(e)}});
      SIDES.forEach(s=>goalieTick(s,dt));
      puckTick(dt);
      t=regular?+tn.toFixed(6):tn;
      // pénalité au moment prévu, fin de pénalité, retrait du gardien, arrivée d'un tir
      if(puck.st==="shot"&&t>=puck.tArr-1e-9) shotArrives();
      if(freezeAt<=t+1e-9){freezeAt=Infinity;closeItem();blow("freeze",freezeInfo)}
      const pg=pensP.find(p=>!p.done&&p.t<=t+1e-9);
      if(pg&&!pending){pg.done=true;const ps=[...new Set(pg.list.map(p=>p.side))];blow(ps.length>1?"both":"penalty",{side:ps[0],pens:pg.list})}
      G.pulls.forEach(p=>{if(Math.abs(p.a-t)<1e-6&&GK[p.side]){GK[p.side].mode="gleave"}});
      // la sirène : plus rien ne se passe
      if(t>=pb-1e-9){sample();pending=null;break}
      // frontière fixe (fin de pénalité...) : les joueurs remplacés quittent la glace avant de toucher la rondelle
      if(!pending) midBoundaries();
      if(!pending){interactions();hitsTick();linesTick()}
      SIDES.forEach(s=>{
        const ps=possSide(), key=(ps===s?"o":ps?"d":"f")+zoneOf(U(s,puck.x));
        if(key!==sitKey[s]){sitKey[s]=key;SK[s].forEach(e=>{if(e!==puck.car)e.thinkAt=Math.min(e.thinkAt,t+e.react+R()*0.15)})}
      });
      if(!pending) SIDES.forEach(s=>["F","D"].forEach(g=>changeTick(s,g)));
      sample();
      if(pending&&t<pb-1e-9) doWhistle();
      else if(pending){pending=null}
    }
    // le morceau de trame en cours s'arrête juste avant la sirène (les joueurs de la période y sont encore)
    if(item){t=Math.max(item.t0,pb-0.0005);closeItem();t=pb}
    stops.push({t:pb,cause:"end",x:puck.x,y:puck.y});
  }
  for(let per=1;per<=G.nPer;per++) yield* runPeriod(per);
  // fin du match : tout le monde quitte la glace
  SIDES.forEach(s=>{[...SK[s]].forEach(e=>offIce(e,false));if(GK[s])hide(GK[s])});
  [...vis].forEach(e=>hide(e));
  stat.hitsLeft=hitPlan.filter(h=>!h.done||h.gaveUp).map(h=>({p:h.p.name,t:+h.t.toFixed(1),tries:h.tries}));
  stat.hitsPlanned=hitPlan.length;
}

/* ---------- Lignes réellement sur la glace (présences de la simulation) ---------- */
function realSegs(G,pres){
  const cuts=new Set([0,G.T]); pres.forEach(p=>{cuts.add(p.a);cuts.add(p.b)});
  const ts=[...cuts].filter(x=>x>=0&&x<=G.T).sort((a,b)=>a-b);
  const byA=[...pres].sort((a,b)=>a.a-b.a);
  const ord={C:0,LW:1,RW:2,W:2,X:3,LD:4,RD:5};
  const act=new Set(); let ia=0; const segs=[];
  for(let i=0;i<ts.length-1;i++){
    const a=ts[i], b=ts[i+1]; if(b-a<1e-7) continue;
    while(ia<byA.length&&byA[ia].a<=a+1e-9){act.add(byA[ia]);ia++}
    act.forEach(p=>{if(p.b<=a+1e-9)act.delete(p)});
    const line={away:[],home:[]};
    act.forEach(p=>line[p.side].push({p:p.p,role:p.role}));
    SIDES.forEach(s=>line[s].sort((u,v)=>ord[u.role]-ord[v.role]));
    const prev=segs[segs.length-1];
    const same=prev&&prev.b===a&&SIDES.every(s=>prev.line[s].length===line[s].length&&prev.line[s].every((x,k)=>x.p===line[s][k].p&&x.role===line[s][k].role));
    const state=G.stateAt(a+0.0005);
    if(same&&SIDES.every(s=>prev.state[s].kind===state[s].kind&&prev.state[s].n===state[s].n&&prev.state[s].pulled===state[s].pulled)){prev.b=b;continue}
    segs.push({a,b,line,state,forced:{away:new Set(),home:new Set()}});
  }
  // joueurs placés de force par l'alignement prévu (marqueur ou fautif absent des données)
  SIDES.forEach(s=>["F","D"].forEach(g=>G.plan[s][g].forEach(x=>{if(!x.forced)return;segs.forEach(sg=>{if(sg.a<x.b&&sg.b>x.a)x.forced.forEach(p=>sg.forced[s].add(p))})})));
  return segs;
}

/* ---------- Point d'entrée : appelé par buildGame une fois les présences prévues ----------
   lazy : la page reçoit le match tout de suite et en calcule la suite au besoin (G.advance), morceau par morceau. */
function buildPlay(G,R,Rh,lazy){
  G.shots=scheduleShots(G,R);
  fitWindows(G);
  const L={items:[],stops:[],plays:[],offs:[],late:[],hits:[],pres:[],rt:[],rpx:[],rpy:[],stints:[],bucket:[],stat:{}};
  const gen=simGen(G,R,Rh,L);
  G.script=L.items; G.stopsList=L.stops; G.plays=L.plays; G.offsides=L.offs; G.late=L.late; G.hits=L.hits; G.simStat=L.stat;
  G.segsPlan=G.segs;
  // enregistrement : temps, rondelle et trajectoires de chaque joueur
  G.rec={t:L.rt,px:L.rpx,py:L.rpy,stints:L.stints,bucket:L.bucket};
  G.simT=0; G.simDone=false;
  const starts=[];
  // morceau de trame en cours à l'instant t
  G.itemAt=t=>{
    const op=G.simDone?null:L.openItem();
    if(op&&t>=op.t0) return op;
    const n=starts.length; if(!n) return op||null;
    if(t<=starts[0]) return G.script[0];
    let lo=0,hi=n-1;
    while(lo<hi){const m=(lo+hi+1)>>1;if(starts[m]<=t)lo=m;else hi=m-1}
    return G.script[lo];
  };
  // calcule le match jusqu'à l'instant voulu (ou jusqu'au bout)
  G.advance=until=>{
    if(G.simDone) return;
    while(G.simT<until){const r=gen.next();if(r.done){G.simDone=true;G.simT=G.T;break}G.simT=r.value}
    for(let i=starts.length;i<L.items.length;i++) starts.push(L.items[i].t0);
    G.segs=realSegs(G,G.simDone?L.pres:L.pres.concat(L.openPres()));
    if(G.simDone){
      G.kfs=G.script.map(it=>[it.k,+it.t0.toFixed(3),+it.t1.toFixed(3),+(it.x1!==undefined?it.x1:it.x).toFixed(2),+(it.y1!==undefined?it.y1:it.y).toFixed(2)]);
      G.plays.sort((a,b)=>a.t-b.t);
    }
    if(G.onAdvance) G.onAdvance();
  };
  if(!lazy) G.advance(Infinity);
}

/* ---------- Lecture de l'enregistrement ---------- */
// indice du dernier échantillon à l'instant t ou avant (après un coup de sifflet : l'alignement de la mise au jeu)
function recIndex(G,t){
  const T=G.rec.t; let lo=0,hi=T.length-1;
  if(t<=T[0]) return 0;
  while(lo<hi){const m=(lo+hi+1)>>1;if(T[m]<=t)lo=m;else hi=m-1}
  return lo;
}
// position d'une trajectoire à l'instant t (courbe d'Hermite entre deux échantillons)
function stintPos(G,s,k,t){
  const T=G.rec.t, i=k-s.k0, n=s.k1-s.k0+1;
  if(i>=n-1||i<0){const j=clamp(i,0,n-1);return {x:s.xs[j],y:s.ys[j]}}
  const t0=T[k], t1=T[k+1], h=t1-t0;
  if(h<1e-9) return {x:s.xs[i+1],y:s.ys[i+1]};
  const u=clamp((t-t0)/h,0,1);
  const x0=s.xs[i],y0=s.ys[i],x1=s.xs[i+1],y1=s.ys[i+1];
  // pentes aux deux bouts (une seule différence au bord d'un morceau ou d'un coup de sifflet)
  const tan=(j,kk)=>{
    const a=j>0&&T[kk]-T[kk-1]>1e-9?j-1:j, b=j<n-1&&T[kk+1]-T[kk]>1e-9?j+1:j;
    const ka=kk-(j-a), kb=kk+(b-j), dt=T[kb]-T[ka];
    return dt>1e-9?{x:(s.xs[b]-s.xs[a])/dt*h,y:(s.ys[b]-s.ys[a])/dt*h}:{x:0,y:0};
  };
  const m0=tan(i,k), m1=tan(i+1,k+1);
  const u2=u*u,u3=u2*u, h00=2*u3-3*u2+1,h10=u3-2*u2+u,h01=-2*u3+3*u2,h11=u3-u2;
  return {x:h00*x0+h10*m0.x+h01*x1+h11*m1.x,y:h00*y0+h10*m0.y+h01*y1+h11*m1.y};
}
function puckAt(G,t){
  if(!G.rec) return {x:0,y:0,side:null,item:null};
  const it=G.itemAt?G.itemAt(t):null, k=recIndex(G,t), T=G.rec.t;
  let x=G.rec.px[k], y=G.rec.py[k];
  if(k<T.length-1&&T[k+1]-T[k]>1e-9){const u=clamp((t-T[k])/(T[k+1]-T[k]),0,1);x=lerp(x,G.rec.px[k+1],u);y=lerp(y,G.rec.py[k+1],u)}
  return {x,y,side:it&&it.k!=="loose"&&it.k!=="dead"&&it.k!=="held"?it.side||null:null,item:it,carrier:it&&it.k==="carry"?it.p:null};
}

/* ---------- Place de chaque joueur à un instant ---------- */
function targetsAt(G,t){
  const pk=puckAt(G,t), it=pk.item, seg=G.segAt(t), out=[], transit=[];
  const k=recIndex(G,t), T=G.rec.t, b=G.rec.bucket[Math.floor(T[k]/10)]||[];
  const role=new Map(); SIDES.forEach(s=>seg.line[s].forEach(e=>role.set(e.p,e.role)));
  const off=(G.offsides||[]).find(o=>t>=o.t0&&t<=o.t1);
  const car=it&&it.k==="carry"?it.p:null, rec=it&&it.k==="pass"?it.to:null;
  const face=it&&it.k==="dead"?it.face||null:null;
  const seen=new Set();
  b.forEach(i=>{
    const s=G.rec.stints[i]; if(k<s.k0||k>s.k1||seen.has(s.p)) return;
    seen.add(s.p);
    const q=stintPos(G,s,k,t);
    if(s.g){out.push({p:s.p,role:"G",side:s.side,x:q.x,y:q.y});return}
    if(role.has(s.p)) out.push({p:s.p,role:role.get(s.p),side:s.side,x:q.x,y:q.y,carrier:s.p===car,receiver:s.p===rec,offside:!!(off&&off.p===s.p&&it&&it.k!=="dead"),fresh:t-T[s.k0]<1.5});
    else transit.push({p:s.p,role:s.p.grp==="D"?"LD":"C",side:s.side,x:q.x,y:q.y,leaving:true});
  });
  return {list:out,transit,puck:pk,seg,item:it,face};
}
