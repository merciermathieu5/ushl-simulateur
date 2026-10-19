"use strict";
const test=require("node:test"), assert=require("node:assert");
const {load,fixture}=require("./load");
const api=load();
// les objets viennent d'un autre contexte vm : on compare leur forme JSON
const eq=(a,b,m)=>assert.deepStrictEqual(JSON.parse(JSON.stringify(a)),b,m);
const L=api.parseLines(api.LINES_SNAPSHOT);
const build=raw=>api.buildGame(api.parseSummary(raw),L,raw);
const score=G=>{const o={away:0,home:0};G.goals.forEach(g=>o[g.side]++);return o};

test("la simulation est déterministe",()=>{
  const a=build(api.SAMPLE_SUMMARY), b=build(api.SAMPLE_SUMMARY);
  eq(a.kfs,JSON.parse(JSON.stringify(b.kfs)));
  assert.strictEqual(a.segs.length,b.segs.length);
});

test("match d'exemple : durée, pointage et tirs",()=>{
  const G=build(api.SAMPLE_SUMMARY);
  assert.strictEqual(G.T,3600+621);
  eq(score(G),{away:1,home:2});
  const sh={away:0,home:0}; G.shots.forEach(s=>sh[s.side]++);
  eq(sh,{away:24,home:35});
  // cinq patineurs et un gardien par équipe à forces égales
  const t=targetsAt(G,500);
  assert.strictEqual(t.list.filter(o=>o.side==="away").length,6);
  function targetsAt(G,t){return api.targetsAt(G,t)}
});

test("chaque joueur est seul sur la glace et jamais en même temps au banc des pénalités",()=>{
  for(const f of ["base.txt","five-on-three.txt"]){
    const G=build(fixture(f));
    G.segs.forEach(sg=>["away","home"].forEach(side=>{
      const ids=sg.line[side].map(e=>e.p.id);
      assert.strictEqual(new Set(ids).size,ids.length,f+" doublon");
      const boxed=G.boxedAt(side,(sg.a+sg.b)/2);
      sg.line[side].forEach(e=>assert.ok(!boxed.has(e.p)||sg.forced[side].has(e.p),f+" pénalisé sur la glace"));
    }));
  }
});

test("5 contre 3 et fin de pénalité sur un but en avantage numérique",()=>{
  const G=build(fixture("five-on-three.txt"));
  const st=G.stateAt(580);
  eq([st.away.kind,st.away.n,st.home.n],["PP",5,3]);
  const first=G.pens.find(p=>p.sec===521);
  assert.strictEqual(first.end,600);
  assert.ok(G.goals[0].ppGoal);
  assert.strictEqual(G.stateAt(605).home.n,4);
});

test("saison : une seule prolongation et match nul possible",()=>{
  const G=build(fixture("tie.txt"));
  assert.strictEqual(G.nPer,4); assert.strictEqual(G.T,4800);
  eq(score(G),{away:1,home:1});
  eq(G.events.filter(e=>e.type==="end").map(e=>e.per),[1,2,3]);
  const ot={away:0,home:0}; G.shots.filter(s=>s.t>=3600).forEach(s=>ot[s.side]++);
  eq(ot,{away:3,home:6});
});

test("séries : prolongations multiples jusqu'au but",()=>{
  const G=build(fixture("double-ot.txt"));
  assert.strictEqual(G.nPer,5); assert.strictEqual(G.T,4800+261);
  assert.strictEqual(G.goals[2].per,5);
  eq(G.events.filter(e=>e.type==="end").map(e=>e.per),[1,2,3,4]);
  // le total « OT » est réparti entre les deux prolongations
  const ot={away:0,home:0}; G.shots.filter(s=>s.t>=3600).forEach(s=>ot[s.side]++);
  eq(ot,{away:9,home:12});
  // le sens d'attaque change à chaque période
  assert.strictEqual(G.attackDir("home",4000),-G.attackDir("home",5000));
  assert.strictEqual(api.perName(5,5),"2e prolongation"); assert.strictEqual(api.perName(4,4),"Prolongation");
});

test("gardien retiré en fin de match et but dans un filet désert",()=>{
  const G=build(fixture("empty-net.txt"));
  // NJ perd 3-2 après le but de 12:00 en 3e : le gardien sort avant le but EN de 19:12
  const en=G.goals.find(g=>/EN/.test(g.tag));
  assert.strictEqual(en.side,"home");
  const p=G.pulls.find(x=>x.side==="away");
  assert.ok(p&&p.a<en.t&&en.t<p.b,"retrait couvrant le but EN");
  assert.ok(p.a>2400+720,"retiré après le but de 12:00");
  const t=(p.a+en.t)/2;
  assert.ok(G.stateAt(t).away.pulled);
  const on=G.segAt(t).line.away;
  assert.strictEqual(on.length,6); assert.ok(on.some(e=>e.role==="X"));
  // le gardien est au banc, aucun tir au but contre le filet désert sauf le but
  const gk=api.targetsAt(G,t).list.find(o=>o.side==="away"&&o.role==="G");
  assert.ok(gk.y<-45);
  assert.ok(!G.shots.some(s=>s.side==="home"&&s.t>p.a&&s.t<p.b&&!s.goal));
  // le gardien revient après le but
  assert.ok(!G.pulledAt("away",en.t+1));
  // l'équipe qui mène ne retire jamais son gardien
  assert.ok(!G.pulls.some(x=>x.side==="home"));
});

test("pas de gardien retiré quand le match est égal",()=>{
  for(const f of ["base.txt","tie.txt","double-ot.txt"]) assert.strictEqual(build(fixture(f)).pulls.length,0,f);
});

test("changement de gardien après le dernier but accordé par le partant",()=>{
  const G=build(fixture("empty-net.txt"));
  // Markstrom accorde 3 buts : remplacé après le 3e but de TOR (9:30 en 2e)
  assert.strictEqual(G.goalies.away.length,2);
  assert.strictEqual(G.goalieAt("away",100).name,"Jacob Markstrom");
  assert.strictEqual(G.goalieSwap.away,1200+570+0.05);
  assert.strictEqual(G.goalieAt("away",2000).name,"Jake Allen");
  assert.ok(G.events.some(e=>e.type==="goalie"&&e.side==="away"));
  assert.strictEqual(G.goalies.home.length,1);
});

test("changement de gardien à l'entracte quand le partant n'a rien accordé",()=>{
  const raw=fixture("empty-net.txt").replace("Jacob Markstrom (NJ ), 12 saves out of 15 shots","Jacob Markstrom (NJ ), 12 saves out of 12 shots")
    .replace("Jake Allen (NJ ), 20 saves out of 20 shots","Jake Allen (NJ ), 20 saves out of 23 shots");
  const G=build(raw);
  assert.strictEqual(G.goalieSwap.away,1200.01);
});

test("mises en échec : une par point de la colonne HT, joueur sur la glace",()=>{
  const G=build(api.SAMPLE_SUMMARY);
  const want=["away","home"].reduce((a,s)=>a+G.roster[s].reduce((b,p)=>b+p.ht,0),0);
  assert.ok(G.hits.length>=want*0.95&&G.hits.length<=want,G.hits.length+" sur "+want);
  G.hits.forEach(h=>assert.ok(G.segAt(h.t).line[h.side].some(e=>e.p===h.p)));
  // le frappeur rejoint un adversaire au moment de la mise en échec
  const h=G.hits[5], list=api.targetsAt(G,h.t).list;
  const me=list.find(o=>o.p===h.p);
  const d=Math.min(...list.filter(o=>o.side!==h.side).map(o=>Math.hypot(o.x-me.x,o.y-me.y)));
  assert.ok(d<4,"distance "+d);
});
