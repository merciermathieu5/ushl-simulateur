"use strict";
// Empreinte du match d'exemple. Si un changement voulu modifie la simulation,
// régénérez avec : UPDATE_GOLDEN=1 node --test
const test=require("node:test"), assert=require("node:assert");
const fs=require("fs"), path=require("path"), crypto=require("crypto");
const {load,digest}=require("./load");
const FILE=path.join(__dirname,"golden.json");

test("le match d'exemple est reproduit à l'identique",()=>{
  const api=load();
  const G=api.buildGame(api.parseSummary(api.SAMPLE_SUMMARY),api.parseLines(api.LINES_SNAPSHOT),api.SAMPLE_SUMMARY);
  const sha=crypto.createHash("sha256").update(digest(api,G)).digest("hex");
  if(process.env.UPDATE_GOLDEN){fs.writeFileSync(FILE,JSON.stringify({sample:sha},null,2)+"\n");return}
  assert.strictEqual(sha,JSON.parse(fs.readFileSync(FILE,"utf8")).sample);
});
