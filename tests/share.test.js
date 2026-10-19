"use strict";
const test=require("node:test"), assert=require("node:assert");
const {load,fixture,digest}=require("./load");
const api=load();
const L=api.parseLines(api.LINES_SNAPSHOT);

test("un lien de partage rejoue exactement le même match",async()=>{
  for(const raw of [api.SAMPLE_SUMMARY,fixture("empty-net.txt")]){
    const S=api.parseSummary(raw);
    const code=await api.packShare(raw,api.linesSubset(L,S));
    assert.match(code,/^[A-Za-z0-9_-]+$/);
    assert.ok(code.length<6000,"lien de "+code.length+" caractères");
    const back=await api.unpackShare(code);
    assert.strictEqual(back.raw,raw);
    const a=api.buildGame(S,L,raw), b=api.buildGame(api.parseSummary(back.raw),back.L,back.raw);
    assert.strictEqual(digest(api,b),digest(api,a));
  }
});

test("un lien abîmé est refusé",async()=>{
  const code=await api.packShare("x",{teams:{},pos:{}});
  await assert.rejects(api.unpackShare(code.slice(0,-4)));
  await assert.rejects(api.unpackShare("abc"));
});

test("plusieurs sommaires collés à la suite",()=>{
  const one=fixture("base.txt");
  assert.strictEqual(api.splitGames(one).length,1);
  assert.strictEqual(api.splitGames(one)[0],one);
  assert.strictEqual(api.splitGames(api.SAMPLE_SUMMARY)[0],api.SAMPLE_SUMMARY);
  const parts=api.splitGames("Ligue USHL\n"+one+"\n"+fixture("tie.txt")+"\n"+fixture("double-ot.txt"));
  assert.strictEqual(parts.length,3);
  parts.forEach(p=>assert.strictEqual(api.parseSummary(p).away,"NEWJERSEY"));
  assert.strictEqual(api.parseSummary(parts[1]).goals.length,2);
  const html=api.splitGames(api.SAMPLE_SUMMARY+api.SAMPLE_SUMMARY);
  assert.strictEqual(html.length,2);
  assert.strictEqual(api.parseSummary(html[1]).goals.length,3);
});
