"use strict";
/* ---------- Données des équipes ---------- */
const TEAM_INFO = {
  NEWJERSEY:["New Jersey","NJ","#C8102E","#111111"], NYRANGERS:["NY Rangers","NYR","#0038A8","#CE1126"],
  ISLANDERS:["Islanders","NYI","#00539B","#F47D30"], PITTSBURGH:["Pittsburgh","PIT","#1A1A1A","#FCB514"],
  BOSTON:["Boston","BOS","#1A1A1A","#FFB81C"], OTTAWA:["Ottawa","OTT","#C52032","#1A1A1A"],
  MONTREAL:["Montréal","MTL","#AF1E2D","#192168"], BUFFALO:["Buffalo","BUF","#003087","#FFB81C"],
  TORONTO:["Toronto","TOR","#00205B","#FFFFFF"], TAMPABAY:["Tampa Bay","TB","#002868","#FFFFFF"],
  FLORIDE:["Floride","FLA","#C8102E","#041E42"], CAROLINA:["Caroline","CAR","#CE1126","#1A1A1A"],
  WASHINGTON:["Washington","WSH","#041E42","#C8102E"], DETROIT:["Détroit","DET","#CE1126","#FFFFFF"],
  "ST.LOUIS":["St. Louis","STL","#002F87","#FCB514"], NASHVILLE:["Nashville","NSH","#FFB81C","#041E42"],
  COLUMBUS:["Columbus","CBJ","#002654","#CE1126"], CHICAGO:["Chicago","CHI","#CF0A2C","#1A1A1A"],
  COLORADO:["Colorado","COL","#6F263D","#236192"], VANCOUVER:["Vancouver","VAN","#00205B","#00843D"],
  CALGARY:["Calgary","CGY","#C8102E","#F1BE48"], EDMONTON:["Edmonton","EDM","#041E42","#FF4C00"],
  MINNESOTA:["Minnesota","MIN","#154734","#A6192E"], LOSANGELES:["Los Angeles","LA","#1A1A1A","#A2AAAD"],
  SANJOSE:["San Jose","SJ","#006D75","#EA7200"], ANAHEIM:["Anaheim","ANA","#F47A38","#1A1A1A"],
  DALLAS:["Dallas","DAL","#006847","#8F8F8C"], UTAH:["Utah","UTA","#6CACE4","#1A1A1A"],
  PHILLY:["Philadelphie","PHI","#F74902","#1A1A1A"], WINNIPEG:["Winnipeg","WPG","#041E42","#AC162C"],
  VEGAS:["Vegas","VGK","#B4975A","#333F42"], SEATTLE:["Seattle","SEA","#001628","#99D9D9"]
};
const FALLBACK_COLORS = ["#7A1F5C","#0B6E4F","#8C3B00","#2F3E9E","#5B5F00","#7B2D26","#00586B","#4A2A7A"];
const SIDES = ["away","home"];
const PER_NAMES = ["1re période","2e période","3e période","Prolongation"];
const PER_SHORT = ["1re","2e","3e","Prol."];
// En saison : une prolongation. En séries : autant qu'il faut, numérotées.
const ordFr = n => n===1?"1re":n+"e";
function perName(per,nPer){return per<=3||nPer<=4?PER_NAMES[Math.min(per,4)-1]:ordFr(per-3)+" prolongation"}
function perShort(per,nPer){return per<=3||nPer<=4?PER_SHORT[Math.min(per,4)-1]:ordFr(per-3)+" prol."}
const ROLE_FR = {C:"C",LW:"AG",RW:"AD",W:"A",LD:"D",RD:"D",G:"G"};
const INFR = [[/GOALIE\s*INTER/i,"Obstruction sur le gardien"],[/ELBOW/i,"Coup de coude"],[/ROUGH/i,"Rudesse"],[/CHARG/i,"Charge"],
  [/HOOK/i,"Accrochage"],[/TRIP/i,"Faire trébucher"],[/SLASH/i,"Cinglage"],[/HIGH.?STICK/i,"Bâton élevé"],[/CROSS.?CHECK/i,"Double-échec"],
  [/FROM BEHIND/i,"Mise en échec par derrière"],[/BOARD/i,"Mise en échec contre la bande"],[/HOLDING THE STICK/i,"Retenir le bâton"],[/HOLD/i,"Retenue"],
  [/INTERF/i,"Obstruction"],[/FIGHT/i,"Bagarre"],[/TOO MANY/i,"Trop de joueurs sur la glace"],[/DELAY/i,"Retarder le match"],
  [/UNSPORT/i,"Conduite antisportive"],[/KNEE/i,"Coup de genou"],[/SPEAR/i,"Darder"],[/BUTT/i,"Six pouces"],[/DIVING|EMBELL/i,"Simulation"],
  [/INSTIGAT/i,"Instigateur"],[/HEAD/i,"Coup à la tête"],[/CLIPP/i,"Coup bas"],[/MISCONDUCT/i,"Inconduite"]];

/* ---------- Utilitaires ---------- */
function mulberry32(a){return function(){a|=0;a=a+0x6D2B79F5|0;let t=Math.imul(a^a>>>15,1|a);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296}}
function hashStr(s){let h=2166136261>>>0;for(let i=0;i<s.length;i++){h^=s.charCodeAt(i);h=Math.imul(h,16777619)}return h>>>0}
const norm = s => (s||"").normalize("NFD").replace(/[\u0300-\u036f]/g,"").toUpperCase().replace(/[^A-Z]/g,"");
function titleCase(s){return (s||"").toLowerCase().replace(/(^|[\s\-'.])(\p{L})/gu,(m,a,b)=>a+b.toUpperCase())}
function lastName(n){const parts=n.trim().split(/\s+/);return parts.length>1?parts.slice(1).join(" "):parts[0]}
function fmt(sec){sec=Math.max(0,Math.round(sec));return String(Math.floor(sec/60)).padStart(2,"0")+":"+String(sec%60).padStart(2,"0")}
function fmtClock(sec){sec=Math.max(0,Math.ceil(sec-1e-6));return Math.floor(sec/60)+":"+String(sec%60).padStart(2,"0")}
function clamp(v,a,b){return v<a?a:v>b?b:v}
function lerp(a,b,k){return a+(b-a)*k}
function subseq(abbr,name){if(!abbr||!name||abbr[0]!==name[0])return false;let i=0;for(const c of name){if(c===abbr[i])i++;if(i===abbr.length)return true}return false}
function esc(s){return s.replace(/[.*+?^${}()|[\]\\]/g,"\\$&")}
function teamInfo(key){
  const t=TEAM_INFO[key];
  if(t) return {key,name:t[0],abbr:t[1],c1:t[2],c2:t[3]};
  return {key,name:titleCase(key),abbr:key.slice(0,3),c1:FALLBACK_COLORS[hashStr(key)%FALLBACK_COLORS.length],c2:"#FFFFFF"};
}
function luminance(hex){const m=hex.replace("#","");const v=[0,2,4].map(i=>parseInt(m.substr(i,2),16)/255).map(c=>c<=0.03928?c/12.92:Math.pow((c+0.055)/1.055,2.4));return 0.2126*v[0]+0.7152*v[1]+0.0722*v[2]}
function infrFr(s){for(const [re,fr] of INFR) if(re.test(s)) return fr; return titleCase(s)}
