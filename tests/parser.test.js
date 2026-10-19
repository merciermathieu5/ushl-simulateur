"use strict";
const test=require("node:test"), assert=require("node:assert");
const {load,fixture}=require("./load");
const api=load();
// les objets viennent d'un autre contexte vm : on compare leur forme JSON
const plain=x=>JSON.parse(JSON.stringify(x));

test("le sommaire HTML et sa version texte donnent la même analyse",()=>{
  const a=api.parseSummary(api.SAMPLE_SUMMARY), b=api.parseSummary(fixture("base.txt"));
  assert.deepStrictEqual(plain(b),plain(a));
});

test("analyse du sommaire d'exemple",()=>{
  const S=api.parseSummary(api.SAMPLE_SUMMARY);
  assert.strictEqual(S.away,"NEWJERSEY"); assert.strictEqual(S.home,"TORONTO");
  assert.deepStrictEqual(plain(S.goals.map(g=>[g.per,g.sec,g.teamRaw,g.scorer])),[[2,187,"NEWJERSEY","GREIG"],[2,420,"TORONTO","RODRIGUES"],[4,621,"TORONTO","ZADINA"]]);
  assert.deepStrictEqual(plain(S.goals[0].assists),["LYUBUSHKIN","STRUBLE"]);
  assert.strictEqual(S.pens.length,5);
  assert.deepStrictEqual(plain(S.pens[0]),{per:1,sec:521,t:521,name:"D. NURSE",abbr:"TOR",inf:"ELBOWING",kind:"Minor"});
  assert.strictEqual(S.goalies.length,2);
  assert.strictEqual(S.players.away.length,18); assert.strictEqual(S.players.home.length,18);
  assert.strictEqual(S.stars[0].name,"Chris Gibson");
  assert.strictEqual(S.attendance,"16989");
});

test("un sommaire incomplet donne un message clair",()=>{
  assert.throws(()=>api.parseSummary("bonjour"),/ÉQUIPE at ÉQUIPE/);
  const noStats=fixture("base.txt").replace(/Player Statistics[\s\S]*/,"");
  assert.throws(()=>api.parseSummary(noStats),/Player Statistics/);
});

test("analyse de la page des trios",()=>{
  const L=api.parseLines(api.LINES_SNAPSHOT);
  assert.strictEqual(Object.keys(L.teams).length,32);
  const t=L.teams.TORONTO;
  assert.deepStrictEqual(plain(t.es[0]),["Mathew Barzal","Connor Bedard","Matvei Michkov","Ryan Merkley","Chris Bigras"]);
  assert.strictEqual(t.pp.length,2); assert.strictEqual(t.pk.length,2);
  assert.strictEqual(t.goalie,"Chris Gibson");
  assert.strictEqual(L.pos.CONNORBEDARD,"LW");
  // la version texte de la page donne le même résultat
  assert.deepStrictEqual(plain(api.parseLines(api.htmlToText(api.LINES_SNAPSHOT))),plain(L));
});

test("date « As of » de la page des trios",()=>{
  const d=api.linesDate(api.LINES_SNAPSHOT);
  assert.strictEqual(new Date(d).toDateString(),"Sun Oct 18 2026");
  assert.ok(api.linesDate("As of Monday, Nov 2, 2026")>d);
  assert.strictEqual(new Date(api.linesDate("As of mardi, juil 7 2026")).getMonth(),6);
  assert.strictEqual(api.linesDate("pas de date"),null);
});

test("en-têtes de prolongation",()=>{
  const base=fixture("double-ot.txt");
  for(const h of ["Overtime 2","2nd Overtime","Double Overtime","Overtime"]){
    const S=api.parseSummary(base.replace(" Overtime 2\n"," "+h+"\n"));
    assert.strictEqual(S.goals[2].per,5,h);
  }
});
