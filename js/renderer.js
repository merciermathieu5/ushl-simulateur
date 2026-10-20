"use strict";

/* ---------- Rendu de la patinoire (canvas) ---------- */
const PBX={away:{x:20,y:50},home:{x:-20,y:50}};
const WORLD={w:210,h:112};

function dotColor(G,side){
  const tm=G.team[side];
  if(side==="home") return tm.c1;
  return luminance(tm.c1)>0.45?"#5A4A1A":tm.c1;
}

/* view : {G, g, posMap, current, puck, trail, mark, freezeUntil, hitFx, showNames} */
function createRenderer(canvas){
  const ctx=canvas.getContext("2d");
  let W=0,H=0,dpr=1,scale=1,ox=0,oy=0;
  let G=null;
  function resize(){
    const r=canvas.parentElement.getBoundingClientRect(); const cw=Math.max(280,r.width-(r.width<820?8:20));
    dpr=Math.min(2.5,window.devicePixelRatio||1); W=cw; H=Math.round(cw*WORLD.h/WORLD.w);
    canvas.width=Math.round(W*dpr); canvas.height=Math.round(H*dpr); canvas.style.height=H+"px";
    scale=W/WORLD.w; ox=W/2; oy=H/2;
  }
  const X=x=>ox+x*scale, Y=y=>oy+y*scale;
  let inkColor="#14212E", mutedColor="#566778";
  function readTheme(){const cs=getComputedStyle(document.documentElement);inkColor=cs.getPropertyValue("--ink").trim()||inkColor;mutedColor=cs.getPropertyValue("--muted").trim()||mutedColor}

  function draw(view){
    G=view.G; const g=view.g, current=view.current;
    if(!G||!current) return;
    const c=ctx, now=performance.now(); c.setTransform(dpr,0,0,dpr,0,0); c.clearRect(0,0,W,H);
    // bancs et bancs des pénalités
    const bw=30*scale, bh=7*scale;
    const sideBox=(x,y,label)=>{c.fillStyle="rgba(127,140,155,.14)";c.strokeStyle="rgba(127,140,155,.5)";c.lineWidth=1;roundRect(X(x)-bw/2,Y(y)-bh/2,bw,bh,4);c.fill();c.stroke();
      c.fillStyle=mutedColor;c.font=`600 ${Math.max(8,2.6*scale)}px Barlow, sans-serif`;c.textAlign="center";c.textBaseline="middle";c.fillText(label,X(x),Y(y)+0.5)};
    SIDES.forEach(s=>sideBox(BENCH[s].x,BENCH[s].y,"Banc "+G.team[s].abbr));
    SIDES.forEach(s=>sideBox(PBX[s].x,PBX[s].y,"Pénalités "+G.team[s].abbr));
    drawRink(c);
    // arrêt de jeu : point de la mise au jeu, ligne bleue du hors-jeu, ligne des buts du dégagement refusé
    if(view.mark) drawMark(c,view.mark,now);
    // trajectoire récente de la rondelle et passe ou tir en cours
    drawTrail(c,view.trail);
    const it=current.item;
    if(it&&(it.k==="pass"||it.k==="shot")&&g>=it.t0&&g<=it.t1){
      c.save();c.globalAlpha=it.k==="shot"?0.55:0.4;c.strokeStyle=dotColor(G,it.side);c.lineWidth=Math.max(1,0.35*scale);c.setLineDash([3*scale/2,2.2*scale/2]);
      c.beginPath();c.moveTo(X(it.x0),Y(it.y0));c.lineTo(X(it.x1),Y(it.y1));c.stroke();c.restore();
    }
    // lumière du but
    G.goals.forEach(gg=>{ if(Math.abs(g-gg.t)<0.05&&now<view.freezeUntil){ const dir=G.attackDir(gg.side,gg.t); const gx=X(dir*92.5),gy=Y(0); const rg=c.createRadialGradient(gx,gy,0,gx,gy,14*scale); rg.addColorStop(0,"rgba(255,40,40,.75)"); rg.addColorStop(1,"rgba(255,40,40,0)"); c.fillStyle=rg; c.beginPath(); c.arc(gx,gy,14*scale,0,Math.PI*2); c.fill(); }});
    // joueurs (ceux qui retournent au banc s'effacent)
    const showNames=view.showNames;
    const items=[...view.posMap.values()].sort((a,b)=>a.y-b.y);
    items.forEach(it2=>drawPlayer(c,it2.x,it2.y,it2.o,showNames,false,it2.alpha));
    // pénalisés
    SIDES.forEach(s=>{const bx=[...G.boxedAt(s,g)];bx.forEach((p,i)=>drawPlayer(c,PBX[s].x-(bx.length-1)*3.5+i*7,PBX[s].y,{p,side:s,role:p.grp==="D"?"LD":"C"},showNames,true))});
    // mises en échec
    (view.hitFx||[]).forEach(f=>{
      const k=(f.until-now)/700, pos=view.posMap.get(f.h.p.id); if(k<=0||!pos) return;
      const px=X(pos.x),py=Y(pos.y),r0=Math.max(10,3.8*scale)*(1.9-k);
      c.save();c.globalAlpha=k;c.strokeStyle="#FFB020";c.lineWidth=3;
      for(let i=0;i<8;i++){const a=i*Math.PI/4+0.3;c.beginPath();c.moveTo(px+Math.cos(a)*r0*0.75,py+Math.sin(a)*r0*0.75);c.lineTo(px+Math.cos(a)*r0*1.25,py+Math.sin(a)*r0*1.25);c.stroke()}
      c.restore();
    });
    // rondelle
    const pk=view.puck||current.puck; const pr=Math.max(3,0.95*scale);
    c.beginPath();c.arc(X(pk.x),Y(pk.y),pr+1.2,0,Math.PI*2);c.fillStyle="#FFFFFF";c.fill();
    c.beginPath();c.arc(X(pk.x),Y(pk.y),pr,0,Math.PI*2);c.fillStyle="#0A0A0A";c.fill();
  }
  function drawTrail(c,trail){
    if(!trail||trail.length<2) return;
    c.save();c.lineCap="round";c.strokeStyle="#0A0A0A";
    for(let i=1;i<trail.length;i++){
      const a=trail[i-1],b=trail[i];if(b.cut)continue;
      c.globalAlpha=0.28*i/trail.length;c.lineWidth=Math.max(1,0.55*scale*i/trail.length);
      c.beginPath();c.moveTo(X(a.x),Y(a.y));c.lineTo(X(b.x),Y(b.y));c.stroke();
    }
    c.restore();
  }
  function drawMark(c,m,now){
    const k=0.55+0.45*Math.sin(now/170);
    c.save();
    if(m.line!==undefined){
      // ligne en cause (bleue pour un hors-jeu, des buts pour un dégagement refusé)
      c.globalAlpha=0.35+0.4*k;c.fillStyle=m.kind==="offside"?"#2B5FB3":"#D23B3B";
      const w=(m.kind==="offside"?2.6:1.6)*scale;c.fillRect(X(m.line)-w/2,Y(-41),w,82*scale);
    }
    if(m.dot){
      // point de la mise au jeu
      c.globalAlpha=0.5+0.4*k;c.strokeStyle="#FFB020";c.lineWidth=Math.max(2,0.6*scale);
      c.beginPath();c.arc(X(m.dot.x),Y(m.dot.y),(2.2+1.2*k)*scale,0,Math.PI*2);c.stroke();
    }
    c.restore();
  }
  function roundRect(x,y,w,h,r){const c=ctx;c.beginPath();c.moveTo(x+r,y);c.arcTo(x+w,y,x+w,y+h,r);c.arcTo(x+w,y+h,x,y+h,r);c.arcTo(x,y+h,x,y,r);c.arcTo(x,y,x+w,y,r);c.closePath()}
  function rinkPath(c){const r=28*scale;roundRect(X(-100),Y(-42.5),200*scale,85*scale,r)}
  function drawRink(c){
    c.save(); rinkPath(c); c.fillStyle="#F4F8FB"; c.fill(); c.clip();
    const vline=(x,col,w)=>{c.fillStyle=col;c.fillRect(X(x)-w*scale/2,Y(-43),w*scale,86*scale)};
    vline(0,"#D23B3B",1); vline(25,"#2B5FB3",1); vline(-25,"#2B5FB3",1); vline(89,"#D23B3B",0.3); vline(-89,"#D23B3B",0.3);
    c.lineWidth=Math.max(1,0.25*scale);
    const circ=(x,y,r,col)=>{c.beginPath();c.arc(X(x),Y(y),r*scale,0,Math.PI*2);c.strokeStyle=col;c.stroke()};
    const dot=(x,y,r,col)=>{c.beginPath();c.arc(X(x),Y(y),r*scale,0,Math.PI*2);c.fillStyle=col;c.fill()};
    circ(0,0,15,"#2B5FB3"); dot(0,0,0.6,"#2B5FB3");
    [-69,69].forEach(x=>[-22,22].forEach(y=>{
      circ(x,y,15,"#D23B3B");dot(x,y,1,"#D23B3B");
      // lignes de mise au jeu (« hash marks ») de chaque côté du cercle
      c.strokeStyle="#D23B3B";[-1,1].forEach(sy=>[-1,1].forEach(sx=>{c.beginPath();c.moveTo(X(x+sx*2.9),Y(y+sy*14.8));c.lineTo(X(x+sx*2.9),Y(y+sy*17.8));c.stroke()}));
    }));
    [-20,20].forEach(x=>[-22,22].forEach(y=>dot(x,y,1,"#D23B3B")));
    [-1,1].forEach(s=>{
      c.beginPath();c.moveTo(X(s*89),Y(-4));c.arc(X(s*89),Y(0),6*scale,s>0?Math.PI*0.5:-Math.PI*0.5,s>0?Math.PI*1.5:Math.PI*0.5,false);c.closePath();
      c.fillStyle="#C9DFF3";c.fill();c.strokeStyle="#D23B3B";c.stroke();
      c.fillStyle="rgba(210,59,59,.12)";c.strokeStyle="#9A2A2A";c.lineWidth=Math.max(1,0.4*scale);
      c.beginPath();c.rect(s>0?X(89):X(-92.4),Y(-3),3.4*scale,6*scale);c.fill();c.stroke();c.lineWidth=Math.max(1,0.25*scale);
    });
    c.restore();
    rinkPath(c); c.lineWidth=Math.max(2,1.1*scale); c.strokeStyle="#7E8C99"; c.stroke();
  }
  function drawPlayer(c,x,y,o,showNames,boxed,alpha){
    const side=o.side, tm=G.team[side], r=Math.max(6.5,2.7*scale);
    const home=side==="home";
    const fill=home?tm.c1:"#FFFFFF";
    const stroke=home?(luminance(tm.c1)<0.03&&tm.c2!=="#FFFFFF"?tm.c2:"#FFFFFF"):dotColor(G,"away");
    const txt=home?(luminance(tm.c1)>0.45?"#111":"#FFF"):dotColor(G,"away");
    const px=X(x),py=Y(y);
    c.globalAlpha=(boxed?0.8:1)*(alpha===undefined?1:alpha);
    if(o.carrier){c.beginPath();c.arc(px,py,r+3,0,Math.PI*2);c.fillStyle="rgba(255,196,60,.55)";c.fill()}
    if(o.offside){c.beginPath();c.arc(px,py,r+3.5,0,Math.PI*2);c.strokeStyle="#2B5FB3";c.lineWidth=2.5;c.stroke()}
    c.beginPath();c.arc(px,py,r,0,Math.PI*2);c.fillStyle=fill;c.fill();
    c.lineWidth=home?1.5:2.4;c.strokeStyle=stroke;c.stroke();
    if(home){c.lineWidth=1;c.strokeStyle="rgba(0,0,0,.35)";c.beginPath();c.arc(px,py,r+1.2,0,Math.PI*2);c.stroke()}
    // numéro de chandail (page des alignements), sinon la position
    const num=o.p&&o.p.num!=null&&o.p.num!==""?String(o.p.num):null;
    const lab=num||(o.role==="G"?"G":ROLE_FR[o.role]||"");
    c.fillStyle=txt;c.font=`700 ${Math.max(7,r*(lab.length>2?0.78:0.92))}px "Barlow Condensed", Barlow, sans-serif`;c.textAlign="center";c.textBaseline="middle";
    c.fillText(lab,px,py+0.5);
    if(showNames){
      const name=o.p.last; c.font=`600 ${Math.max(9,2.5*scale)}px Barlow, sans-serif`;
      // noms des joueurs locaux au-dessus, des visiteurs en dessous : lisibles quand ils se font face
      const ny=boxed||home?py-r-7:py+r+7;
      const onIce=!boxed;
      c.lineWidth=3;c.strokeStyle=onIce?"rgba(244,248,251,.9)":"transparent";if(onIce)c.strokeText(name,px,ny);
      c.fillStyle=onIce?"#1B2733":inkColor;c.fillText(name,px,ny);
    }
    c.globalAlpha=1;
  }
  return {resize,readTheme,draw};
}
