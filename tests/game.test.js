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
