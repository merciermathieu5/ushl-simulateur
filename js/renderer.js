"use strict";

/* ---------- Rendu de la patinoire (canvas) ---------- */
const BENCH={away:{x:24,y:-50},home:{x:-24,y:-50}};
const PBX={away:{x:20,y:50},home:{x:-20,y:50}};
const WORLD={w:210,h:112};

function dotColor(G,side){
  const tm=G.team[side];
  if(side==="home") return tm.c1;
  return luminance(tm.c1)>0.45?"#5A4A1A":tm.c1;
}

/* view : {G, g, posMap, current, freezeUntil, showNames} */
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
    const c=ctx; c.setTransform(dpr,0,0,dpr,0,0); c.clearRect(0,0,W,H);
    // bancs et bancs des pénalités
    const bw=30*scale, bh=7*scale;
    const sideBox=(x,y,label,col)=>{c.fillStyle="rgba(127,140,155,.14)";c.strokeStyle="rgba(127,140,155,.5)";c.lineWidth=1;roundRect(X(x)-bw/2,Y(y)-bh/2,bw,bh,4);c.fill();c.stroke();
      c.fillStyle=mutedColor;c.font=`600 ${Math.max(8,2.6*scale)}px Barlow, sans-serif`;c.textAlign="center";c.textBaseline="middle";c.fillText(label,X(x),Y(y)+0.5)};
    SIDES.forEach(s=>sideBox(BENCH[s].x,BENCH[s].y,"Banc "+G.team[s].abbr));
    SIDES.forEach(s=>sideBox(PBX[s].x,PBX[s].y,"Pénalités "+G.team[s].abbr));
    drawRink(c);
    // lumière du but
    G.goals.forEach(gg=>{ if(Math.abs(g-gg.t)<0.05&&performance.now()<view.freezeUntil){ const dir=G.attackDir(gg.side,gg.t); const gx=X(dir*92.5),gy=Y(0); const rg=c.createRadialGradient(gx,gy,0,gx,gy,14*scale); rg.addColorStop(0,"rgba(255,40,40,.75)"); rg.addColorStop(1,"rgba(255,40,40,0)"); c.fillStyle=rg; c.beginPath(); c.arc(gx,gy,14*scale,0,Math.PI*2); c.fill(); }});
    // joueurs
    const showNames=view.showNames;
    const items=[...view.posMap.values()].sort((a,b)=>a.y-b.y);
    items.forEach(it=>drawPlayer(c,it.x,it.y,it.o,showNames));
    // pénalisés
    SIDES.forEach(s=>{const bx=[...G.boxedAt(s,g)];bx.forEach((p,i)=>drawPlayer(c,PBX[s].x-(bx.length-1)*3.5+i*7,PBX[s].y,{p,side:s,role:p.grp==="D"?"LD":"C"},showNames,true))});
    // rondelle
    const pk=current.puck; const pr=Math.max(3,0.95*scale);
    c.beginPath();c.arc(X(pk.x),Y(pk.y),pr+1.2,0,Math.PI*2);c.fillStyle="#FFFFFF";c.fill();
    c.beginPath();c.arc(X(pk.x),Y(pk.y),pr,0,Math.PI*2);c.fillStyle="#0A0A0A";c.fill();
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
    [-69,69].forEach(x=>[-22,22].forEach(y=>{circ(x,y,15,"#D23B3B");dot(x,y,1,"#D23B3B")}));
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
  function drawPlayer(c,x,y,o,showNames,boxed){
    const side=o.side, tm=G.team[side], r=Math.max(6.5,2.7*scale);
    const home=side==="home";
    const fill=home?tm.c1:"#FFFFFF";
    const stroke=home?(luminance(tm.c1)<0.03&&tm.c2!=="#FFFFFF"?tm.c2:"#FFFFFF"):dotColor(G,"away");
    const txt=home?(luminance(tm.c1)>0.45?"#111":"#FFF"):dotColor(G,"away");
    const px=X(x),py=Y(y);
    c.globalAlpha=boxed?0.8:1;
    if(o.carrier){c.beginPath();c.arc(px,py,r+3,0,Math.PI*2);c.fillStyle="rgba(255,196,60,.55)";c.fill()}
    c.beginPath();c.arc(px,py,r,0,Math.PI*2);c.fillStyle=fill;c.fill();
    c.lineWidth=home?1.5:2.4;c.strokeStyle=home?stroke:stroke;c.stroke();
    if(home){c.lineWidth=1;c.strokeStyle="rgba(0,0,0,.35)";c.beginPath();c.arc(px,py,r+1.2,0,Math.PI*2);c.stroke()}
    c.fillStyle=txt;c.font=`700 ${Math.max(7,r*0.9)}px "Barlow Condensed", Barlow, sans-serif`;c.textAlign="center";c.textBaseline="middle";
    c.fillText(ROLE_FR[o.role]||"",px,py+0.5);
    if(showNames){
      const name=o.p.last; c.font=`600 ${Math.max(9,2.5*scale)}px Barlow, sans-serif`;
      const ny=boxed?py-r-6:py+r+7;
      const onIce=!boxed;
      c.lineWidth=3;c.strokeStyle=onIce?"rgba(244,248,251,.9)":"transparent";if(onIce)c.strokeText(name,px,ny);
      c.fillStyle=onIce?"#1B2733":inkColor;c.fillText(name,px,ny);
    }
    c.globalAlpha=1;
  }
  return {resize,readTheme,draw};
}
