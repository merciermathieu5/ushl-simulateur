"use strict";
/* Lecture des pages publiées par FHL sur ushl.ca : calendrier, résultats du jour, trios et alignements.
   Fonctions pures, sans accès réseau, utilisées par scripts/recuperer.js et par les tests. */

const TEAM = "[A-Za-z][A-Za-z0-9.]*";

/* Calendrier (USHL22Schedule.html ou USHL22PLF-Round1-Schedule.html).
   Un match à venir :  « 1   NYRANGERS at NEWJERSEY<BR> »
   Un match joué    :  « <A HREF=USHL221.html> 1   NYRANGERS 3  NEWJERSEY 2 </A> », suivi au besoin de « (OT) ».
   Le pointage du lien suit l'ordre visiteur puis local, comme l'en-tête « VISITEUR at LOCAL » du sommaire. */
function parseSchedule(html) {
  const out = { title: "", days: [], games: [], played: [], upcoming: [] };
  if (!html) return out;
  const t = html.match(/<TITLE>([^<]*)<\/TITLE>/i);
  out.title = t ? t[1].trim() : "";
  const RE = new RegExp(
    "Day\\s+(\\d+)" +
    "|<A\\s+HREF\\s*=\\s*\"?([^\"\\s>]+)\"?\\s*>\\s*(\\d+)\\s+(" + TEAM + ")\\s+(\\d+)\\s+(" + TEAM + ")\\s+(\\d+)\\s*<\\/A>(?:\\s*\\(([^)<\\n]{1,16})\\))?" +
    "|(?:^|<BR>|\\n)[ \\t]*(\\d+)[ \\t]+(" + TEAM + ")[ \\t]+at[ \\t]+(" + TEAM + ")[ \\t]*(?=<BR>|\\n|$)",
    "gi");
  let day = null, m;
  while ((m = RE.exec(html))) {
    if (m[1] !== undefined) { day = { day: +m[1], games: [] }; out.days.push(day); continue; }
    if (!day) { day = { day: 0, games: [] }; out.days.push(day); }
    let g;
    if (m[2] !== undefined) {
      g = { no: +m[3], day: day.day, away: m[4].toUpperCase(), home: m[6].toUpperCase(),
            file: m[2], sa: +m[5], sh: +m[7], extra: (m[8] || "").trim().toUpperCase() };
      out.played.push(g);
    } else {
      g = { no: +m[9], day: day.day, away: m[10].toUpperCase(), home: m[11].toUpperCase(), file: null };
      out.upcoming.push(g);
    }
    day.games.push(g); out.games.push(g);
  }
  return out;
}

/* Page « Latest Results » (USHL22TodayGames.html) : date de la dernière soirée et ses sommaires. */
function parseTodayGames(html) {
  const out = { date: null, files: [] };
  if (!html) return out;
  const d = html.match(/Games of\s+([^<\n]+?)\s*<\/P>/i) || html.match(/Games of\s+([^<\n]+)/i);
  if (d) out.date = d[1].trim();
  for (const m of html.matchAll(/<A\s+HREF\s*=\s*"?([^"\s>]+)"?\s*>/gi)) out.files.push(m[1]);
  return out;
}

/* Page des trios (USHL22Lines.html) : en-tête (titre, « As of ») et un bloc par équipe. */
function splitLines(html) {
  const out = { header: "", asOf: null, teams: {}, order: [] };
  if (!html) return out;
  const re = /<H2>\s*<A\s+NAME\s*=\s*"?([^"\s>]+)"?\s*>[\s\S]*?<\/H2>/gi;
  const marks = [];
  let m;
  while ((m = re.exec(html))) marks.push({ team: m[1].toUpperCase(), at: m.index });
  out.header = marks.length ? html.slice(0, marks[0].at) : html;
  const a = html.match(/As of\s+([^)<\n]+)/i);
  out.asOf = a ? a[1].trim() : null;
  // le dernier bloc s'arrête avant la fermeture de la page
  const close = html.search(/<\/BODY>|<\/HTML>\s*$/i);
  marks.forEach((mk, i) => {
    const end = i + 1 < marks.length ? marks[i + 1].at : (close > mk.at ? close : html.length);
    out.teams[mk.team] = html.slice(mk.at, end);
    out.order.push(mk.team);
  });
  return out;
}

/* Page des trios réduite aux équipes demandées, toujours lisible par parseLines() et linesDate(). */
function linesFor(split, teams) {
  const blocks = teams.map(t => split.teams[String(t).toUpperCase()]).filter(Boolean);
  if (!blocks.length) return null;
  return split.header + blocks.join("") + "\n</HTML>\n";
}

/* Page des alignements (USHL22Rosters.html) : pour chaque équipe, les joueurs de l'équipe pro
   avec leur numéro, leur position et leurs cotes. Une ligne :
   « 95 Steven Stamkos          C R  99    65 86 68 91 87 86 76 77 73 66 79 99 94 81 »
   colonnes  # Player PO HD CD IJ IT SP ST EN DU DI SK PA PC DF SC EX LD OV (CD et IJ parfois vides).
   L'équipe de la ligue mineure (« Farm Roster ») est ignorée. */
const RATINGS = ["it", "sp", "st", "en", "du", "di", "sk", "pa", "pc", "df", "sc", "ex", "ld", "ov"];
function parseRosters(html) {
  const out = {};
  if (!html) return out;
  const split = splitLines(html);
  for (const team of split.order) {
    const pro = split.teams[team].match(/Pro Roster[\s\S]*?<PRE>([\s\S]*?)<\/PRE>/i);
    if (!pro) continue;
    const players = [];
    for (const line of pro[1].split(/\r?\n/)) {
      const m = line.replace(/ /g, " ").match(/^\s*(\d{1,2})\s+(\S.*?)\s+(C|LW|RW|D|G)\s+([LR])\s+(.*)$/);
      if (!m) continue;
      const tail = m[5].trim().split(/\s+/);
      if (tail.length < RATINGS.length) continue;
      const p = { num: +m[1], name: m[2].trim(), pos: m[3] };
      tail.slice(-RATINGS.length).forEach((v, i) => { if (/^\d+$/.test(v)) p[RATINGS[i]] = +v; });
      players.push(p);
    }
    if (players.length) out[team] = players;
  }
  return out;
}
/* Alignements des deux équipes d'un match, en format compact : [numéro, nom, position, SP, ST, PC, EX]. */
function rostersFor(parsed, teams) {
  const out = {};
  for (const t of teams.map(x => String(x).toUpperCase())) {
    if (parsed[t]) out[t] = parsed[t].map(p => [p.num, p.name, p.pos, p.sp ?? null, p.st ?? null, p.pc ?? null, p.ex ?? null]);
  }
  return Object.keys(out).length ? out : null;
}

/* Équipes de l'en-tête « VISITEUR at LOCAL » d'un sommaire FHL. */
function summaryTeams(html) {
  if (!html) return null;
  const m = html.match(new RegExp("<H3>\\s*(" + TEAM + ")\\s+at\\s+(" + TEAM + ")\\s*<\\/H3>", "i")) ||
            html.match(new RegExp("^\\s*(" + TEAM + ")\\s+at\\s+(" + TEAM + ")\\s*$", "im"));
  return m ? { away: m[1].toUpperCase(), home: m[2].toUpperCase() } : null;
}
const isFHL = html => /Generated by FHL/i.test(html || "");

/* Identifiant stable d'un match : « USHL22-123 » en saison, « USHL22-S2-5 » pour le 5e match de la 2e ronde. */
function gameId(season, kind, round, no) {
  return kind === "series" ? `${season}-S${round}-${no}` : `${season}-${no}`;
}
function nextSeason(season) {
  const m = String(season).match(/^(.*?)(\d+)$/);
  return m ? m[1] + (+m[2] + 1) : null;
}

module.exports = { parseSchedule, parseTodayGames, splitLines, linesFor, parseRosters, rostersFor, summaryTeams, isFHL, gameId, nextSeason };
