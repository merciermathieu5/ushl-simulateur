"use strict";

/* ---------- Conversion HTML vers texte ---------- */
function decodeEntities(s){return s.replace(/&nbsp;/gi," ").replace(/&lt;/gi,"<").replace(/&gt;/gi,">").replace(/&quot;/gi,'"').replace(/&#39;|&apos;/gi,"'").replace(/&#(\d+);/g,(m,n)=>String.fromCharCode(+n)).replace(/&#x([0-9a-f]+);/gi,(m,n)=>String.fromCharCode(parseInt(n,16))).replace(/&amp;/gi,"&")}
function htmlToText(s){
  if(!/<\s*\/?\s*(br|td|tr|pre|table|p|b|font|h\d|html|i)\b/i.test(s)) return s;
  s=s.replace(/<!--[\s\S]*?-->/g,"").replace(/\r/g,"");
  s=s.replace(/(<\s*pre\b[^>]*>[\s\S]*?<\/\s*pre\s*>)|\n/gi,(m,pre)=>pre?pre:" ");
  return decodeEntities(s
    .replace(/<\s*title\b[^>]*>[\s\S]*?<\/\s*title\s*>/gi,"")
    .replace(/<\s*br\s*\/?>/gi,"\n")
    .replace(/<\/\s*(tr|p|h\d|div|li|table|pre)\s*>/gi,"\n")
    .replace(/<\s*(p|h\d|pre|table|div|tr)\b[^>]*>/gi,"\n")
    .replace(/<\/\s*td\s*>/gi,"\t")
    .replace(/<[^>]+>/g,""));
}

/* ---------- Analyse de la page des trios ---------- */
function parseLines(raw){
  const out={teams:{},pos:{}}; const pri={};
  if(!raw||!raw.trim()) return out;
  const text=htmlToText(raw).replace(/\r/g,"");
  const KEY=/^(EVEN STRENGTH|POWER PLAY|PENALTY KILL|STARTING GOALIE|SCRATCHES)/;
  const SEC={"EVEN STRENGTH":"es","POWER PLAY":"pp","PENALTY KILL":"pk","STARTING GOALIE":"g","SCRATCHES":"x"};
  const PRI={es:3,pp:2,pk:1};
  let team=null, sec=null;
  for(const rl of text.split("\n")){
    const line=rl.replace(/\u00a0/g," ").replace(/\t/g,"    ");
    const t=line.trim().replace(/^#+\s*/,"");
    if(!t||/^`+$/.test(t)) continue;
    const km=t.match(KEY);
    if(km){sec=SEC[km[1]];continue}
    if(/^[A-Z][A-Z.]{2,}$/.test(t)&&!/^(CENTER|DEFENCE|DEFENSE|WINGER)$/.test(t)){team=t;out.teams[team]={es:[],pp:[],pk:[],goalie:null};sec=null;continue}
    if(!team||!sec) continue;
    if(/^CENTER\b/.test(t)) continue;
    if(sec==="g"){if(!out.teams[team].goalie) out.teams[team].goalie=t;continue}
    if(sec==="x") continue;
    const m=line.match(/^\s*(\d)\s+(\S.*\S)\s*$/);
    if(!m) continue;
    const expect=sec==="pk"?4:5;
    let names=m[2].split(/\s{2,}/).map(s=>s.trim()).filter(Boolean);
    if(names.length!==expect){
      const start=line.indexOf(m[2]);const arr=[];
      for(let k=0;k<expect;k++) arr.push(line.slice(start+22*k,start+22*(k+1)).trim());
      if(arr.every(Boolean)) names=arr;
    }
    if(names.length!==expect) continue;
    out.teams[team][sec].push(names);
    const roles=sec==="pk"?["C","F","D","D"]:["C","LW","RW","D","D"];
    names.forEach((n,i)=>{const k=norm(n);const r=roles[i];
      if(r==="F"){ if(!out.pos[k]){out.pos[k]="F";pri[k]=0} return; }
      if(!out.pos[k]||(pri[k]||0)<PRI[sec]){out.pos[k]=r;pri[k]=PRI[sec]}});
  }
  return out;
}

/* ---------- Analyse du sommaire ---------- */
const GAME_HEADER=/^([A-Za-z][A-Za-z.]+)\s+(?:at|@|à|vs\.?)\s+([A-Za-z][A-Za-z.]+)$/;
// Plusieurs sommaires collés à la suite : un morceau par match (pages HTML ou en-têtes « ÉQUIPE at ÉQUIPE »).
function splitGames(raw){
  const html=[...raw.matchAll(/<HTML\b/gi)].map(m=>m.index);
  let parts;
  if(html.length>1) parts=html.map((p,i)=>raw.slice(i?p:0,html[i+1]));
  else{
    const lines=raw.split("\n"), idx=lines.map((l,i)=>GAME_HEADER.test(l.trim())?i:-1).filter(i=>i>=0);
    if(idx.length<2) return [raw];
    parts=idx.map((p,i)=>lines.slice(i?p:0,idx[i+1]).join("\n"));
  }
  return parts.filter(p=>p.trim());
}
function parseSummary(raw){
  const text=htmlToText(raw).replace(/\r/g,"").replace(/\u00a0/g," ");
  const lines=text.split("\n");
  const S={away:null,home:null,shotRows:{},goals:[],pens:[],goalies:[],players:{away:[],home:[]},stars:[],pp:{},attendance:null};
  for(const l of lines){const m=l.trim().match(GAME_HEADER);if(m){S.away=m[1].toUpperCase();S.home=m[2].toUpperCase();break}}
  if(!S.away) throw new Error("Je ne trouve pas la ligne « ÉQUIPE at ÉQUIPE » au début du sommaire. Vérifiez que tout le sommaire a été copié.");
  for(const side of SIDES){
    const re=new RegExp(esc(S[side])+"\\s+((?:\\d+\\s+){2,}\\d+)","g");const rows=[];
    for(const l of lines){re.lastIndex=0;let m;while((m=re.exec(l))) rows.push(m[1].trim().split(/\s+/).map(Number))}
    S.shotRows[side]=rows;
  }
  let sec=null, per=0, cur=null;
  for(const l of lines){
    const t=l.trim(); if(!t) continue;
    if(/^Scoring Summary/i.test(t)){sec="score";continue}
    if(/^Goalie Statistics/i.test(t)){sec="goalie";continue}
    if(/^Power Play Conv/i.test(t)){sec="pp";continue}
    if(/^Game Stars/i.test(t)){sec="stars";continue}
    if(/^Player Statistics/i.test(t)){sec="players";continue}
    if(/^Financial/i.test(t)){sec="fin";continue}
    if(/^Game Notes/i.test(t)){sec="notes";continue}
    const att=t.match(/^Attendance:\s*([\d\s,.]+)/i); if(att){S.attendance=att[1].trim();continue}
    const up=t.toUpperCase();
    if(up===S.away||up===S.home){cur=up===S.away?"away":"home";continue}
    if(sec==="score"){
      const pm=t.match(/^Period\s+(\d+)/i); if(pm){per=+pm[1];continue}
      // « Overtime », « Overtime 2 », « 2nd Overtime », « Double Overtime »... ou un nouvel en-tête « Overtime »
      const om=t.match(/^(?:(\d+)\s*(?:st|nd|rd|th|re|e)?\s+|(double|triple|quadruple)\s+)?(?:Overtime|OT\b|Prolongation)\s*#?(\d+)?/i);
      if(om){const n=om[1]||om[3]||(om[2]&&{double:2,triple:3,quadruple:4}[om[2].toLowerCase()]);per=n?3+(+n):Math.max(4,per+1);continue}
      if(/PENALT/i.test(t)){parsePens(t,per,S);continue}
      const gm=t.match(/^\d+\.\s*([^,]+?)\s*,\s*(.+)$/); if(gm) parseGoal(gm,per,S);
      continue;
    }
    if(sec==="goalie"){
      const m=t.match(/^(.+?)\s*\(\s*([A-Za-z.]{1,4})\s*\)\s*,\s*(\d+)\s+saves?\s+out\s+of\s+(\d+)\s+shots?(?:\s*,\s*([A-Z]))?/i);
      if(m) S.goalies.push({name:m[1].trim(),abbr:m[2].toUpperCase(),saves:+m[3],shots:+m[4],dec:m[5]||""});
      continue;
    }
    if(sec==="pp"){
      const m=t.match(/^([A-Za-z][A-Za-z.]+)\s+(\d+)\s+(?:for|en|sur)\s+(\d+)/i);
      if(m) S.pp[m[1].toUpperCase()]={g:+m[2],n:+m[3]};
      continue;
    }
    if(sec==="stars"){
      const m=t.match(/^(\d)\s*[-.)]\s*(.+?)\s*\(\s*([A-Za-z.]{1,4})\s*\)/);
      if(m) S.stars.push({n:+m[1],name:m[2].trim(),abbr:m[3].toUpperCase()});
      continue;
    }
    const pr=t.match(/^(.+?)\s+(-?\d+)\s+(-?\d+)\s+(-?\d+)\s+(Even|E|[+-]?\d+)\s+(\d+)\s+(\d+)\s+(\d+)\s+(\d+)$/i);
    if(pr&&cur&&(sec==="players"||sec===null)){
      S.players[cur].push({name:pr[1].trim(),g:+pr[2],a:+pr[3],p:+pr[4],pm:/^e/i.test(pr[5])?0:+pr[5],pim:+pr[6],s:+pr[7],ht:+pr[8],it:+pr[9]});
    }
  }
  if(!S.players.away.length||!S.players.home.length) throw new Error("Je ne trouve pas les statistiques des joueurs (section « Player Statistics ») pour les deux équipes.");
  return S;
}
function parseGoal(gm,per,S){
  const teamRaw=gm[1].trim().toUpperCase(); const rest=gm[2];
  const times=[...rest.matchAll(/(\d{1,2}):(\d{2})/g)]; if(!times.length) return;
  const tm=times[times.length-1]; const sec=(+tm[1])*60+(+tm[2]);
  let assists=[], tag="";
  for(const pa of rest.matchAll(/\(([^)]*)\)/g)){
    const inner=pa[1].trim();
    if(/^(PP|PPG|SH|SHG|EN|ENG|GW|GWG)$/i.test(inner)){tag+=" "+inner.toUpperCase();continue}
    if(/UNASSIST|AUCUNE/i.test(inner)) continue;
    assists=inner.split(/,|&/).map(s=>s.trim().replace(/\s+\d+$/,"")).filter(s=>s&&!/^\d+$/.test(s));
  }
  const outside=rest.replace(/\([^)]*\)/g," ");
  if(/\bPP\b/i.test(outside)) tag+=" PP"; if(/\bSH\b/i.test(outside)) tag+=" SH"; if(/\bEN\b/i.test(outside)) tag+=" EN";
  const scorer=rest.split(/[(,]/)[0].trim().replace(/\s+\d+$/,"");
  S.goals.push({per,sec,t:(per-1)*1200+sec,teamRaw,scorer,assists,tag:tag.trim()});
}
function parsePens(t,per,S){
  const s=t.replace(/^.*?PENALT\w*\s*:?/i,"");
  const re=/([^,]+?)\s+([A-Z]{1,4})\s*\(([^,()]+)(?:,\s*([^)]*))?\)\s*(\d{1,2}):(\d{2})/g; let m;
  while((m=re.exec(s))){
    const sec=(+m[5])*60+(+m[6]);
    S.pens.push({per,sec,t:(per-1)*1200+sec,name:m[1].trim(),abbr:m[2],inf:m[3].trim(),kind:(m[4]||"Minor").trim()});
  }
}

/* ---------- Date « As of » de la page des trios ---------- */
const MONTHS={JAN:0,FEB:1,FEV:1,MAR:2,APR:3,AVR:3,MAY:4,MAI:4,JUN:5,JUL:6,AUG:7,AOU:7,SEP:8,OCT:9,NOV:10,DEC:11};
function linesDate(raw){
  const m=(raw||"").match(/As of\s+(?:[^\s,()]+,\s*)?([^\s\d,()]+)\s+(\d{1,2}),?\s+(\d{4})/i);
  if(!m) return null;
  const mo=norm(m[1]); const i=mo.startsWith("JUI")?{N:5,L:6}[mo[3]]:MONTHS[mo.slice(0,3)];
  return i===undefined?null:new Date(+m[3],i,+m[2]).getTime();
}
