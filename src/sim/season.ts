import { Rng, clamp } from './rng';
import type { Bracket, Game, GameKind, GameResult, World } from './types';
import { addStats, nextId, ovr, playerName } from './player';
import { simulateFull, type LiveGame, finishLiveGame } from './gamesim';
import { autoDepth, roster, teamInputs, teamStrength } from './team';
import { weeklyRecruiting, weeklyRecruitingPoints } from './recruiting';
import { weeklyDevelopment, weeklyPlayerUpkeep } from './development';
import { INJURIES } from './names';

// ---------------------------------------------------------------- schedule

function roundRobin(ids: string[]): [string, string][][] {
  const teams = [...ids];
  if (teams.length % 2) teams.push('BYE');
  const n = teams.length;
  const rounds: [string, string][][] = [];
  for (let r = 0; r < n - 1; r++) {
    const pairs: [string, string][] = [];
    for (let i = 0; i < n / 2; i++) {
      const a = teams[i];
      const b = teams[n - 1 - i];
      if (a !== 'BYE' && b !== 'BYE') pairs.push(r % 2 === 0 ? [a, b] : [b, a]);
    }
    rounds.push(pairs);
    teams.splice(1, 0, teams.pop()!);
  }
  return rounds;
}

export function buildSeasonSchedule(world: World) {
  const rng = new Rng(world.rng);
  world.games = [];
  const confs = Object.values(world.conferences);
  const multi = confs.length > 1;
  const short = world.settings.seasonLength === 'short';
  const nonconfWeeks = multi ? (short ? 4 : 8) : 0;
  let week = 1;
  const add = (homeId: string, awayId: string, kind: GameKind, wk: number, neutral = false, label?: string) => {
    const g: Game = { id: `g${world.season}_${nextId(world, '')}`, week: wk, homeId, awayId, neutral, kind, label, played: false, homePts: 0, awayPts: 0 };
    world.games.push(g);
    return g;
  };
  // Non-conference: random cross-conference pairings, stronger schools buy home games.
  const all = Object.keys(world.schools);
  for (let w = 0; w < nonconfWeeks; w++) {
    const pool = rng.shuffle([...all]);
    // Repair same-conference pairs by swapping.
    for (let i = 0; i + 1 < pool.length; i += 2) {
      if (world.schools[pool[i]].conferenceId === world.schools[pool[i + 1]].conferenceId) {
        for (let j = i + 2; j < pool.length; j++) {
          if (world.schools[pool[j]].conferenceId !== world.schools[pool[i]].conferenceId) {
            [pool[i + 1], pool[j]] = [pool[j], pool[i + 1]];
            break;
          }
        }
      }
    }
    for (let i = 0; i + 1 < pool.length; i += 2) {
      const a = world.schools[pool[i]];
      const b = world.schools[pool[i + 1]];
      const homeFirst = a.prestige + rng.range(-20, 20) > b.prestige;
      add(homeFirst ? a.id : b.id, homeFirst ? b.id : a.id, 'nonconf', week, rng.chance(0.08), undefined);
    }
    week++;
  }
  // Conference: single or double round robin.
  const confRounds: [string, string][][][] = confs.map((c) => {
    const rr = roundRobin(rng.shuffle([...c.schoolIds]));
    if (short) return rr;
    return [...rr, ...rr.map((round) => round.map(([h, a]) => [a, h] as [string, string]))];
  });
  const maxRounds = Math.max(...confRounds.map((r) => r.length));
  for (let r = 0; r < maxRounds; r++) {
    for (const rounds of confRounds) for (const [h, a] of rounds[r] ?? []) add(h, a, 'conf', week);
    week++;
  }
  world.regularWeeks = week - 1;
  world.brackets = { conf: {}, national: null };
  world.rng = rng.state();
}

// ---------------------------------------------------------------- standings

export interface StandingRow {
  schoolId: string;
  w: number;
  l: number;
  cw: number;
  cl: number;
  pf: number;
  pa: number;
  streak: string;
  last10: string;
  home: string;
  away: string;
}

export function standings(world: World, confId?: string): StandingRow[] {
  const rows: Record<string, StandingRow> = {};
  const ids = confId ? world.conferences[confId].schoolIds : Object.keys(world.schools);
  for (const id of ids) rows[id] = { schoolId: id, w: 0, l: 0, cw: 0, cl: 0, pf: 0, pa: 0, streak: '', last10: '', home: '0-0', away: '0-0' };
  const results: Record<string, boolean[]> = {};
  const hw: Record<string, [number, number, number, number]> = {};
  for (const g of world.games) {
    if (!g.played) continue;
    for (const [id, pts, opp, isHome] of [[g.homeId, g.homePts, g.awayPts, true], [g.awayId, g.awayPts, g.homePts, false]] as [string, number, number, boolean][]) {
      const r = rows[id];
      if (!r) continue;
      const win = pts > opp;
      if (win) r.w++;
      else r.l++;
      if (g.kind === 'conf') win ? r.cw++ : r.cl++;
      r.pf += pts;
      r.pa += opp;
      (results[id] ??= []).push(win);
      const h = (hw[id] ??= [0, 0, 0, 0]);
      if (!g.neutral) {
        if (isHome) win ? h[0]++ : h[1]++;
        else win ? h[2]++ : h[3]++;
      }
    }
  }
  for (const r of Object.values(rows)) {
    const res = results[r.schoolId] ?? [];
    if (res.length) {
      const last = res[res.length - 1];
      let n = 0;
      for (let i = res.length - 1; i >= 0 && res[i] === last; i--) n++;
      r.streak = `${last ? 'W' : 'L'}${n}`;
      const l10 = res.slice(-10);
      r.last10 = `${l10.filter(Boolean).length}-${l10.filter((x) => !x).length}`;
    }
    const h = hw[r.schoolId] ?? [0, 0, 0, 0];
    r.home = `${h[0]}-${h[1]}`;
    r.away = `${h[2]}-${h[3]}`;
  }
  return Object.values(rows).sort((a, b) => {
    const ca = a.cw / Math.max(1, a.cw + a.cl);
    const cb = b.cw / Math.max(1, b.cw + b.cl);
    if (confId && cb !== ca) return cb - ca;
    const wa = a.w / Math.max(1, a.w + a.l);
    const wb = b.w / Math.max(1, b.w + b.l);
    if (wb !== wa) return wb - wa;
    return b.pf - b.pa - (a.pf - a.pa);
  });
}

export function record(world: World, schoolId: string): { w: number; l: number; cw: number; cl: number } {
  let w = 0, l = 0, cw = 0, cl = 0;
  for (const g of world.games) {
    if (!g.played || (g.homeId !== schoolId && g.awayId !== schoolId)) continue;
    const win = g.homeId === schoolId ? g.homePts > g.awayPts : g.awayPts > g.homePts;
    if (win) w++;
    else l++;
    if (g.kind === 'conf') win ? cw++ : cl++;
  }
  return { w, l, cw, cl };
}

/** RPI-style résumé: 25% win pct, 50% opponents' win pct, 25% opponents' opponents. */
export function resume(world: World): Record<string, { wp: number; owp: number; oowp: number; rpi: number; q1: number; margin: number }> {
  const opps: Record<string, string[]> = {};
  const wins: Record<string, number> = {};
  const games: Record<string, number> = {};
  const margin: Record<string, number> = {};
  for (const id of Object.keys(world.schools)) {
    opps[id] = [];
    wins[id] = 0;
    games[id] = 0;
    margin[id] = 0;
  }
  for (const g of world.games) {
    if (!g.played) continue;
    opps[g.homeId].push(g.awayId);
    opps[g.awayId].push(g.homeId);
    games[g.homeId]++;
    games[g.awayId]++;
    if (g.homePts > g.awayPts) wins[g.homeId]++;
    else wins[g.awayId]++;
    margin[g.homeId] += g.homePts - g.awayPts;
    margin[g.awayId] += g.awayPts - g.homePts;
  }
  const wp: Record<string, number> = {};
  for (const id of Object.keys(world.schools)) wp[id] = games[id] ? wins[id] / games[id] : 0.5;
  const owp: Record<string, number> = {};
  for (const id of Object.keys(world.schools)) owp[id] = opps[id].length ? opps[id].reduce((s, o) => s + wp[o], 0) / opps[id].length : 0.5;
  // Quality wins (over teams at .600 or better), counted in one pass over the games.
  const q1: Record<string, number> = {};
  for (const id of Object.keys(world.schools)) q1[id] = 0;
  for (const g of world.games) {
    if (!g.played) continue;
    if (g.homePts > g.awayPts && wp[g.awayId] >= 0.6) q1[g.homeId]++;
    if (g.awayPts > g.homePts && wp[g.homeId] >= 0.6) q1[g.awayId]++;
  }
  const out: ReturnType<typeof resume> = {};
  for (const id of Object.keys(world.schools)) {
    const oowp = opps[id].length ? opps[id].reduce((s, o) => s + owp[o], 0) / opps[id].length : 0.5;
    const rpi = 0.25 * wp[id] + 0.5 * owp[id] + 0.25 * oowp;
    out[id] = { wp: wp[id], owp: owp[id], oowp, rpi, q1: q1[id], margin: games[id] ? margin[id] / games[id] : 0 };
  }
  return out;
}

/** Won-lost records for every school in one pass over the games. Same numbers as calling record() per school. */
export function allRecords(world: World): Record<string, { w: number; l: number; cw: number; cl: number }> {
  const out: Record<string, { w: number; l: number; cw: number; cl: number }> = {};
  for (const id of Object.keys(world.schools)) out[id] = { w: 0, l: 0, cw: 0, cl: 0 };
  for (const g of world.games) {
    if (!g.played) continue;
    const home = out[g.homeId];
    const away = out[g.awayId];
    const homeWon = g.homePts > g.awayPts;
    const awayWon = g.awayPts > g.homePts;
    if (home) {
      homeWon ? home.w++ : home.l++;
      if (g.kind === 'conf') homeWon ? home.cw++ : home.cl++;
    }
    if (away) {
      awayWon ? away.w++ : away.l++;
      if (g.kind === 'conf') awayWon ? away.cw++ : away.cl++;
    }
  }
  return out;
}

export function powerScores(world: World): Record<string, number> {
  const res = resume(world);
  const recs = allRecords(world);
  const out: Record<string, number> = {};
  for (const id of Object.keys(world.schools)) {
    const r = res[id];
    const g = recs[id];
    const n = g.w + g.l;
    const blend = clamp(n / 10, 0, 1);
    const str = teamStrength(world, id);
    out[id] = (1 - blend) * (str - 40) * 2 + blend * (r.rpi * 100 + r.margin * 0.8 + r.q1 * 1.5 + (str - 50) * 0.3);
  }
  return out;
}

export function updateRankings(world: World) {
  const ps = powerScores(world);
  const ids = Object.keys(world.schools).sort((a, b) => ps[b] - ps[a]);
  const n = Math.min(25, Math.max(5, Math.floor(ids.length / 4)));
  world.rankings.push({ week: world.week, ids: ids.slice(0, n) });
  if (world.rankings.length > 60) world.rankings.splice(0, world.rankings.length - 60);
}

export function currentRank(world: World, schoolId: string): number | null {
  const last = world.rankings[world.rankings.length - 1];
  if (!last) return null;
  const i = last.ids.indexOf(schoolId);
  return i >= 0 ? i + 1 : null;
}

// ---------------------------------------------------------------- results

export function applyResult(world: World, game: Game, result: GameResult, keepDetail: boolean) {
  game.played = true;
  game.homePts = result.home.pts;
  game.awayPts = result.away.pts;
  if (keepDetail) game.result = result;
  const rng = new Rng(world.rng);
  for (const box of [result.home, result.away]) {
    const school = world.schools[box.schoolId];
    const hard = school.practice.intensity === 'hard' ? 1.25 : school.practice.intensity === 'light' ? 0.8 : 1;
    for (const line of box.lines) {
      const p = world.players[line.playerId];
      if (!p) continue;
      addStats(p.stats, { ...line });
      p.fatigue = clamp(p.fatigue + line.min * 0.9 - 6, 0, 100);
      // Injuries scale with minutes, fatigue, and practice intensity.
      const risk = (line.min / 40) * 0.011 * (1 + p.fatigue / 120) * hard * (p.ratings.ath > 80 ? 1.1 : 1);
      if (line.min > 0 && rng.chance(risk)) {
        const inj = rng.pick(INJURIES);
        p.injury = { name: inj.name, weeks: rng.int(inj.min, inj.max) };
        world.transactions.push({ season: world.season, week: world.week, kind: 'injury', text: `${playerName(p)} (${school.abbr}): ${inj.name}, out ${p.injury.weeks} wk`, schoolId: school.id });
        if (world.coaches[world.userCoachId]?.contract?.schoolId === school.id) {
          world.inbox.unshift({ id: nextId(world, 'm'), week: world.week, season: world.season, title: `Injury: ${playerName(p)}`, body: `${playerName(p)} suffered a ${inj.name.toLowerCase()} and is expected to miss ${p.injury.weeks} week(s). Update your depth chart.`, kind: 'urgent', read: false });
        }
      }
    }
  }
  // Coaches' records
  for (const [sid, win] of [[game.homeId, game.homePts > game.awayPts], [game.awayId, game.awayPts > game.homePts]] as [string, boolean][]) {
    const hcId = world.schools[sid].headCoachId;
    const hc = hcId ? world.coaches[hcId] : null;
    if (hc) win ? hc.careerW++ : hc.careerL++;
    const user = world.coaches[world.userCoachId];
    if (user.contract?.schoolId === sid && user.contract.role !== 'head') {
      // assistants track the team record on their career stop
      const stop = user.history[user.history.length - 1];
      if (stop) win ? stop.w++ : stop.l++;
    }
  }
  const userCoach = world.coaches[world.userCoachId];
  if (userCoach.contract?.role === 'head') {
    const stop = userCoach.history[userCoach.history.length - 1];
    if (stop && stop.schoolId === userCoach.contract.schoolId && (game.homeId === stop.schoolId || game.awayId === stop.schoolId)) {
      const win = game.homeId === stop.schoolId ? game.homePts > game.awayPts : game.awayPts > game.homePts;
      win ? stop.w++ : stop.l++;
    }
  }
  world.rng = rng.state();
}

export function simulateGame(world: World, game: Game, detail: boolean): GameResult {
  const { result } = simulateFull(game, teamInputs(world, game.homeId), teamInputs(world, game.awayId), world, detail);
  applyResult(world, game, result, detail);
  return result;
}

export function finishUserLiveGame(world: World, game: Game, live: LiveGame) {
  const result = finishLiveGame(live, world.seed);
  applyResult(world, game, result, true);
  return result;
}

export function userGameThisWeek(world: World): Game | null {
  const sid = world.coaches[world.userCoachId]?.contract?.schoolId;
  if (!sid) return null;
  return world.games.find((g) => g.week === world.week && (g.homeId === sid || g.awayId === sid)) ?? null;
}

// ---------------------------------------------------------------- brackets

export function seedOrder(n: number): number[] {
  let order = [1, 2];
  while (order.length < n) {
    const m = order.length * 2;
    order = order.flatMap((s) => [s, m + 1 - s]);
  }
  return order;
}

function makeRound(world: World, b: Bracket, ids: string[], kind: GameKind, label: string): string[] {
  const out: string[] = [];
  for (let i = 0; i + 1 < ids.length; i += 2) {
    const a = ids[i];
    const c = ids[i + 1];
    const better = b.seeds[a] <= b.seeds[c] ? a : c;
    const worse = better === a ? c : a;
    const g: Game = { id: `g${world.season}_${nextId(world, '')}`, week: world.week + 1, homeId: better, awayId: worse, neutral: true, kind, label, played: false, homePts: 0, awayPts: 0 };
    world.games.push(g);
    out.push(g.id);
  }
  return out;
}

const ROUND_NAMES = (size: number, round: number) => {
  const left = size / Math.pow(2, round);
  if (left === 2) return 'Final';
  if (left === 4) return 'Semifinal';
  if (left === 8) return 'Quarterfinal';
  return `Round of ${left}`;
};

function startConferenceTournaments(world: World) {
  for (const conf of Object.values(world.conferences)) {
    const st = standings(world, conf.id);
    const size = st.length >= 8 ? 8 : st.length >= 4 ? 4 : 2;
    const field = st.slice(0, size).map((r) => r.schoolId);
    const seeds: Record<string, number> = {};
    field.forEach((id, i) => (seeds[id] = i + 1));
    const order = seedOrder(size).map((s) => field[s - 1]);
    const b: Bracket = { name: `${conf.abbr} Tournament`, rounds: [], seeds, championId: null, alive: [...field] };
    b.rounds.push(makeRound(world, b, order, 'confTourney', `${conf.abbr} Tournament ${ROUND_NAMES(size, 0)}`));
    world.brackets.conf[conf.id] = b;
  }
}

export interface FieldEntry { schoolId: string; seed: number; how: 'auto' | 'at-large'; score: number }

export function selectNationalField(world: World): FieldEntry[] {
  const size = nationalFieldSize(world);
  const res = resume(world);
  const ps = powerScores(world);
  const score = (id: string) => res[id].rpi * 100 + res[id].q1 * 1.2 + ps[id] * 0.05;
  const auto = Object.values(world.brackets.conf).map((b) => b.championId!).filter(Boolean);
  const atLarge = Object.keys(world.schools)
    .filter((id) => !auto.includes(id))
    .sort((a, b) => score(b) - score(a))
    .slice(0, size - auto.length);
  const field = [...auto, ...atLarge].sort((a, b) => score(b) - score(a));
  return field.map((id, i) => ({ schoolId: id, seed: i + 1, how: auto.includes(id) ? 'auto' : 'at-large', score: Math.round(score(id) * 10) / 10 }));
}

/** The 68-team field plays four First Four games for the last four spots (seeds 61-68). */
const FIRST_FOUR_FIELD = 68;

function startNational(world: World) {
  const field = selectNationalField(world);
  const size = field.length;
  const seeds: Record<string, number> = {};
  field.forEach((f, i) => (seeds[f.schoolId] = i + 1));
  const b: Bracket = { name: 'National Tournament', rounds: [], seeds, championId: null, alive: field.map((f) => f.schoolId), field };
  if (size === FIRST_FOUR_FIELD) {
    // 61v68, 62v67, 63v66, 64v65. makeRound pairs consecutive ids, so the order below yields those games.
    const order = [61, 68, 62, 67, 63, 66, 64, 65].map((s) => field[s - 1].schoolId);
    b.rounds.push(makeRound(world, b, order, 'national', 'National First Four'));
  } else {
    const order = seedOrder(size).map((s) => field[s - 1].schoolId);
    b.rounds.push(makeRound(world, b, order, 'national', `National ${ROUND_NAMES(size, 0)}`));
  }
  world.brackets.national = b;
  const user = world.coaches[world.userCoachId]?.contract?.schoolId;
  if (user) {
    const entry = field.find((f) => f.schoolId === user);
    world.inbox.unshift({
      id: nextId(world, 'm'),
      week: world.week,
      season: world.season,
      title: entry ? `Selected! You're the No. ${entry.seed} seed` : 'Left out of the National Tournament',
      body: entry
        ? `${world.schools[user].name} earned ${entry.how === 'auto' ? 'the automatic bid' : 'an at-large bid'} with a résumé score of ${entry.score}.`
        : `Your résumé score fell short of the at-large line. The last team in scored ${field[field.length - 1].score}.`,
      kind: entry ? 'urgent' : 'info',
      read: false,
    });
  }
}

function advanceBracket(world: World, b: Bracket, kind: GameKind) {
  const last = b.rounds[b.rounds.length - 1];
  const games = last.map((id) => world.games.find((g) => g.id === id)!);
  if (games.some((g) => !g.played)) return;
  const winners = games.map((g) => (g.homePts > g.awayPts ? g.homeId : g.awayId));
  b.alive = winners;
  const playIn = b.rounds.length === 1 && (b.field?.length ?? 0) === FIRST_FOUR_FIELD;
  if (playIn) {
    // First Four winners take the 16 lines, seeds 61-64, in game order. Then the 64-team bracket is built.
    const slots = b.field!.slice(0, 60).map((f) => f.schoolId);
    winners.forEach((id, i) => {
      b.seeds[id] = 61 + i;
      slots.push(id);
    });
    const order = seedOrder(64).map((s) => slots[s - 1]);
    b.rounds.push(makeRound(world, b, order, kind, `National ${ROUND_NAMES(64, 0)}`));
    return;
  }
  if (winners.length === 1) {
    b.championId = winners[0];
    return;
  }
  // A 68-team bracket's main draw is 64 teams, and its round index skips the First Four.
  const playInRounds = (b.field?.length ?? 0) === FIRST_FOUR_FIELD ? 1 : 0;
  const size = playInRounds ? 64 : Object.keys(b.seeds).length;
  const label = `${b.name.replace(' Tournament', '')} ${kind === 'national' ? '' : 'Tournament '}${ROUND_NAMES(size, b.rounds.length - playInRounds)}`.replace('  ', ' ');
  b.rounds.push(makeRound(world, b, winners, kind, label));
}

// ---------------------------------------------------------------- weekly advance

export interface AdvanceReport {
  userResult?: { gameId: string; text: string };
  messages: string[];
}

/** National field size: 68 for a full world (with play-ins), 32 for large, 16 otherwise. */
export function nationalFieldSize(world: World): number {
  const n = Object.keys(world.schools).length;
  return n >= 300 ? 68 : n >= 90 ? 32 : 16;
}

export function totalSeasonWeeks(world: World): number {
  const nationalWeeks = nationalFieldSize(world) === 68 ? 8 : 5;
  return world.regularWeeks + 3 + (Object.keys(world.conferences).length > 1 ? nationalWeeks : 0);
}

/** Play the current week's remaining games, then run the weekly world update. */
export function advanceWeek(world: World): AdvanceReport {
  const report: AdvanceReport = { messages: [] };
  const userSid = world.coaches[world.userCoachId]?.contract?.schoolId ?? null;
  if (world.phase === 'offseason') return report;

  if (world.phase === 'preseason') {
    world.phase = 'regular';
    world.week = 1;
    prepareWeek(world);
    updateRankings(world);
    return report;
  }

  // AI depth charts & user automation
  for (const s of Object.values(world.schools)) {
    const isUserHead = s.id === userSid && world.coaches[world.userCoachId].contract?.role === 'head';
    if (!isUserHead || world.settings.autoLineup) s.depth = autoDepth(world, s.id);
  }

  for (const g of world.games) {
    if (g.week !== world.week || g.played) continue;
    const isUser = g.homeId === userSid || g.awayId === userSid;
    const res = simulateGame(world, g, isUser);
    if (isUser && userSid) {
      const mine = g.homeId === userSid ? res.home.pts : res.away.pts;
      const theirs = g.homeId === userSid ? res.away.pts : res.home.pts;
      const opp = world.schools[g.homeId === userSid ? g.awayId : g.homeId];
      report.userResult = { gameId: g.id, text: `${mine > theirs ? 'W' : 'L'} ${mine}-${theirs} vs ${opp.name}` };
    }
  }
  postGamesWeekly(world);

  // Phase transitions
  if (world.phase === 'regular' && world.week >= world.regularWeeks) {
    world.phase = 'confTourney';
    startConferenceTournaments(world);
  } else if (world.phase === 'confTourney') {
    for (const b of Object.values(world.brackets.conf)) advanceBracket(world, b, 'confTourney');
    const done = Object.values(world.brackets.conf).every((b) => b.championId);
    if (done) {
      for (const [cid, b] of Object.entries(world.brackets.conf)) {
        world.transactions.push({ season: world.season, week: world.week, kind: 'award', text: `${world.schools[b.championId!].name} won the ${world.conferences[cid].abbr} Tournament`, schoolId: b.championId! });
      }
      if (Object.keys(world.conferences).length > 1) {
        world.phase = 'national';
        startNational(world);
      } else {
        endSeason(world);
        return report;
      }
    }
  } else if (world.phase === 'national' && world.brackets.national) {
    advanceBracket(world, world.brackets.national, 'national');
    if (world.brackets.national.championId) {
      endSeason(world);
      return report;
    }
  }
  world.week += 1;
  prepareWeek(world);
  updateRankings(world);
  return report;
}

function prepareWeek(world: World) {
  const userSid = world.coaches[world.userCoachId]?.contract?.schoolId;
  world.recruitingPointsLeft = userSid ? weeklyRecruitingPoints(world, userSid) : 0;
  const g = userGameThisWeek(world);
  if (g && userSid) {
    const opp = world.schools[g.homeId === userSid ? g.awayId : g.homeId];
    void opp;
  }
}

function postGamesWeekly(world: World) {
  weeklyPlayerUpkeep(world);
  weeklyDevelopment(world);
  weeklyRecruiting(world, world.regularWeeks);
  // Teams eliminated in tournaments still recruit and heal.
}

// ---------------------------------------------------------------- season end

function endSeason(world: World) {
  world.phase = 'offseason';
  world.offseasonStep = 'review';
  world.week += 1;
  const userSid = world.coaches[world.userCoachId]?.contract?.schoolId ?? null;
  // Records & history
  const confChamps: Record<string, string> = {};
  // Computed once per conference and once for every school, not once per school.
  const confStandings: Record<string, ReturnType<typeof standings>> = {};
  for (const c of Object.values(world.conferences)) {
    confStandings[c.id] = standings(world, c.id);
    confChamps[c.id] = confStandings[c.id][0].schoolId;
  }
  const recs = allRecords(world);
  const gameById = new Map(world.games.map((g) => [g.id, g]));
  const national = world.brackets.national?.championId ?? null;
  const tourneyChamps: Record<string, string> = {};
  for (const [cid, b] of Object.entries(world.brackets.conf)) if (b.championId) tourneyChamps[cid] = b.championId;
  for (const s of Object.values(world.schools)) {
    const r = recs[s.id];
    const conf = world.conferences[s.conferenceId];
    const st = confStandings[conf.id];
    const place = st.findIndex((x) => x.schoolId === s.id) + 1;
    let post = 'Missed postseason';
    const cb = world.brackets.conf[conf.id];
    if (cb) {
      const rounds = cb.rounds.filter((ids) => ids.some((id) => { const g = gameById.get(id)!; return g.homeId === s.id || g.awayId === s.id; })).length;
      if (rounds) post = cb.championId === s.id ? 'Conference tournament champion' : `Conf. tourney (${rounds} game${rounds > 1 ? 's' : ''})`;
    }
    const nb = world.brackets.national;
    if (nb && nb.seeds[s.id]) {
      const rounds = nb.rounds.filter((ids) => ids.some((id) => { const g = gameById.get(id)!; return g.homeId === s.id || g.awayId === s.id; })).length;
      const size = Object.keys(nb.seeds).length;
      const reached = size / Math.pow(2, rounds - 1);
      post = nb.championId === s.id ? 'NATIONAL CHAMPION' : `National Tournament: ${reached === 2 ? 'runner-up' : reached === 4 ? 'Final Four' : reached === 8 ? 'Elite Eight' : `round of ${reached}`} (No. ${nb.seeds[s.id]} seed)`;
    }
    s.history.push({ season: world.season, w: r.w, l: r.l, cw: r.cw, cl: r.cl, coachId: s.headCoachId, finish: `${ordinal(place)} in ${conf.abbr}`, postseason: post });
  }
  const awards = seasonAwards(world);
  for (const p of Object.values(world.players)) {
    if (p.schoolId && p.stats.g > 0) p.career.push({ season: world.season, schoolId: p.schoolId, stats: { ...p.stats }, ovr: ovr(p) });
  }
  const ur = userSid ? record(world, userSid) : null;
  world.history.push({
    season: world.season,
    nationalChampion: national,
    confChampions: confChamps,
    confTourneyChampions: tourneyChamps,
    coachOfYear: awards.coy,
    playerOfYear: awards.poy,
    userRecord: ur && userSid ? `${world.schools[userSid].abbr} ${ur.w}-${ur.l}` : '—',
  });
  if (national) {
    const hc = world.schools[national].headCoachId;
    if (hc) world.coaches[hc].titles.push(`${world.season} National Champion (${world.schools[national].name})`);
  }
  for (const [cid, sid] of Object.entries(tourneyChamps)) {
    const hc = world.schools[sid].headCoachId;
    if (hc && world.coaches[hc].isUser) world.coaches[hc].titles.push(`${world.season} ${world.conferences[cid].abbr} Tournament champion`);
  }
  for (const [cid, sid] of Object.entries(confChamps)) {
    const hc = world.schools[sid].headCoachId;
    if (hc && world.coaches[hc].isUser) world.coaches[hc].titles.push(`${world.season} ${world.conferences[cid].abbr} regular-season champion`);
  }
  world.inbox.unshift({
    id: nextId(world, 'm'),
    week: world.week,
    season: world.season,
    title: `Season ${world.season} complete`,
    body: national ? `${world.schools[national].name} are national champions. Head to the offseason to review your year.` : 'The season is over. Head to the offseason to review your year.',
    kind: 'info',
    read: false,
  });
}

export function ordinal(n: number): string {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}

function seasonAwards(world: World): { poy: string | null; coy: string | null } {
  const players = Object.values(world.players).filter((p) => p.schoolId && p.stats.g >= 5);
  const recs = allRecords(world);
  const val = (p: (typeof players)[number]) => {
    const s = p.stats;
    const g = Math.max(1, s.g);
    const r = recs[p.schoolId!];
    return (s.pts + s.orb + s.drb * 0.8 + s.ast * 1.2 + s.stl * 1.5 + s.blk * 1.3 - s.tov - (s.fga - s.fgm) * 0.6) / g + (r.w / Math.max(1, r.w + r.l)) * 6;
  };
  const sorted = players.sort((a, b) => val(b) - val(a));
  const poy = sorted[0];
  if (poy) {
    world.awards.push({ season: world.season, name: 'Player of the Year', playerId: poy.id, schoolId: poy.schoolId!, label: `${playerName(poy)} (${world.schools[poy.schoolId!].name})` });
    poy.awards.push(`${world.season} National Player of the Year`);
  }
  for (const [i, p] of sorted.slice(0, 5).entries()) {
    world.awards.push({ season: world.season, name: 'All-American', playerId: p.id, schoolId: p.schoolId!, label: `${playerName(p)} (${world.schools[p.schoolId!].abbr})` });
    if (i > 0 || !p.awards.includes('All-American')) p.awards.push(`${world.season} All-American`);
  }
  for (const c of Object.values(world.conferences)) {
    const inConf = sorted.filter((p) => world.schools[p.schoolId!].conferenceId === c.id);
    const top = inConf[0];
    if (top) {
      world.awards.push({ season: world.season, name: `${c.abbr} Player of the Year`, playerId: top.id, schoolId: top.schoolId!, label: `${playerName(top)} (${world.schools[top.schoolId!].abbr})` });
      top.awards.push(`${world.season} ${c.abbr} Player of the Year`);
    }
    for (const p of inConf.slice(0, 5)) if (p !== top) p.awards.push(`${world.season} All-${c.abbr}`);
  }
  // Coach of the year: biggest overachiever vs preseason strength rank
  let best: { id: string; v: number } | null = null;
  for (const s of Object.values(world.schools)) {
    const r = recs[s.id];
    const wp = r.w / Math.max(1, r.w + r.l);
    const expected = clamp((teamStrength(world, s.id) - 40) / 35, 0.1, 0.9);
    const v = wp - expected + (world.brackets.national?.championId === s.id ? 0.1 : 0);
    if (s.headCoachId && (!best || v > best.v)) best = { id: s.id, v };
  }
  let coy: string | null = null;
  if (best) {
    const s = world.schools[best.id];
    coy = s.headCoachId;
    const c = world.coaches[coy!];
    world.awards.push({ season: world.season, name: 'Coach of the Year', coachId: coy!, schoolId: s.id, label: `${c.first} ${c.last} (${s.name})` });
    c.titles.push(`${world.season} Coach of the Year`);
    c.reputation = clamp(c.reputation + 5, 0, 100);
  }
  void roster;
  return { poy: poy?.id ?? null, coy };
}
