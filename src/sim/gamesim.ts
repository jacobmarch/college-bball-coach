/**
 * Possession-based basketball simulation.
 *
 * The engine is a pure step function over a serializable LiveGame state, so the
 * same code powers instant sims, play-by-play viewing, and coach mode (where the
 * user changes strategy or rotations at stoppages). Outcomes are reproducible:
 * a game's RNG is seeded from the world seed and the game id.
 */
import { Rng, clamp, hashString, type RngState } from './rng';
import type { BoxLine, Game, GameResult, PbpEvent, Player, Pos, Ratings, School, Strategy, Tendencies, TeamBox, World } from './types';
import { emptyStats, isAvailable, ovrAt } from './player';

export interface LivePlayer {
  id: string;
  name: string;
  short: string;
  pos: Pos;
  ratings: Ratings;
  tend: Tendencies;
  energy: number;
  fouls: number;
  onCourt: boolean;
  starter: boolean;
  depth: number;
  secs: number;
  fouledOut: boolean;
  pref: 'auto' | 'ride' | 'sit';
  box: BoxLine;
  ovr: number;
  injured: boolean;
}

export interface LiveTeam {
  schoolId: string;
  name: string;
  abbr: string;
  players: LivePlayer[];
  strategy: Strategy;
  tactics: number; // 0-100
  prep: number; // -1..1
  chemistry: number; // -1..1
  offSpec?: number;
  defSpec?: number;
  home: boolean;
  teamFouls: number;
  timeouts: number;
  isUser: boolean;
  shots: TeamBox['shots'];
  poss: number;
  fastBreak: number;
  halves: number[];
  run: number; // unanswered points by opponent, for AI timeouts
}

export interface LiveGame {
  gameId: string;
  rng: RngState;
  teams: [LiveTeam, LiveTeam];
  period: number; // 1,2 = halves, 3+ = OT
  clock: number; // seconds remaining in period
  poss: 0 | 1;
  firstPoss: 0 | 1;
  score: [number, number];
  pbp: PbpEvent[];
  recordPbp: boolean;
  done: boolean;
  transition: boolean;
  stopReason: string | null;
  neutral: boolean;
  /** Stops already triggered, so each auto-pause happens once. */
  stopsHit: string[];
}

const HALF = 20 * 60;
const OT = 5 * 60;

const MINUTE_PLANS: Record<Strategy['rotation'], number[]> = {
  tight: [34, 33, 32, 31, 30, 14, 12, 8, 4, 2, 0, 0, 0, 0, 0],
  normal: [31, 30, 29, 28, 27, 17, 15, 12, 7, 4, 0, 0, 0, 0, 0],
  deep: [27, 26, 25, 25, 24, 19, 18, 16, 12, 8, 0, 0, 0, 0, 0],
};

const PACE_SECONDS: Record<Strategy['pace'], number> = { slow: 22.5, normal: 19.5, fast: 16.5 };

// ---------------------------------------------------------------- team setup

export interface TeamInputs {
  school: School;
  players: Player[];
  strategy: Strategy;
  tactics: number;
  prep: number;
  chemistry: number;
  isUser: boolean;
  /** Assistant specialist edges (offense / defense), in shot-make units. */
  offSpec?: number;
  defSpec?: number;
}

export function makeLiveTeam(input: TeamInputs, home: boolean): LiveTeam {
  const { school } = input;
  const order = input.players.filter(isAvailable);
  const players: LivePlayer[] = order.map((p, i) => ({
    id: p.id,
    name: `${p.first} ${p.last}`,
    short: `${p.first[0]}. ${p.last}`,
    pos: p.pos,
    ratings: { ...p.ratings },
    tend: { ...p.tendencies },
    energy: clamp(100 - p.fatigue * 0.35, 55, 100),
    fouls: 0,
    onCourt: i < 5,
    starter: i < 5,
    depth: i,
    secs: 0,
    fouledOut: false,
    pref: 'auto',
    ovr: ovrAt(p, p.pos),
    injured: false,
    box: { ...emptyStats(), playerId: p.id, name: `${p.first} ${p.last}`, pos: p.pos, starter: i < 5 },
  }));
  return {
    schoolId: school.id,
    name: school.name,
    abbr: school.abbr,
    players,
    strategy: { ...input.strategy },
    tactics: input.tactics,
    prep: input.prep,
    chemistry: input.chemistry,
    offSpec: input.offSpec ?? 0,
    defSpec: input.defSpec ?? 0,
    home,
    teamFouls: 0,
    timeouts: 4,
    isUser: input.isUser,
    shots: { rimA: 0, rimM: 0, midA: 0, midM: 0, threeA: 0, threeM: 0 },
    poss: 0,
    fastBreak: 0,
    halves: [0, 0],
    run: 0,
  };
}

export function createLiveGame(game: Game, home: TeamInputs, away: TeamInputs, worldSeed: number, recordPbp: boolean): LiveGame {
  const seed = (hashString(game.id) ^ worldSeed) >>> 0;
  const rng = new Rng(seed);
  const first: 0 | 1 = rng.chance(0.5) ? 0 : 1;
  const g: LiveGame = {
    gameId: game.id,
    rng: rng.state(),
    teams: [makeLiveTeam(home, !game.neutral), makeLiveTeam(away, false)],
    period: 1,
    clock: HALF,
    poss: first,
    firstPoss: first,
    score: [0, 0],
    pbp: [],
    recordPbp,
    done: false,
    transition: false,
    stopReason: null,
    neutral: game.neutral,
    stopsHit: [],
  };
  for (const t of g.teams) ensureFive(t);
  log(g, `Tip-off: ${g.teams[first].name} wins the opening tip.`);
  return g;
}

// ---------------------------------------------------------------- helpers

function clockLabel(g: LiveGame): string {
  const m = Math.floor(g.clock / 60);
  const s = Math.floor(g.clock % 60);
  const per = g.period <= 2 ? `${g.period}H` : g.period === 3 ? 'OT' : `${g.period - 2}OT`;
  return `${per} ${m}:${s.toString().padStart(2, '0')}`;
}

function log(g: LiveGame, text: string, key = false) {
  if (!g.recordPbp) return;
  g.pbp.push({ t: clockLabel(g), text, home: g.score[0], away: g.score[1], key });
}

const onCourt = (t: LiveTeam) => t.players.filter((p) => p.onCourt);

function pickWeighted<T>(rng: Rng, items: T[], w: (x: T) => number): T {
  return items[rng.weighted(items.map(w))];
}

function energyMod(p: LivePlayer): number {
  return p.energy >= 72 ? 0 : -(72 - p.energy) * 0.0032;
}

function elapsedFraction(g: LiveGame): number {
  if (g.period > 2) return 1;
  const elapsed = (g.period - 1) * HALF + (HALF - g.clock);
  return elapsed / (2 * HALF);
}

function foulTrouble(g: LiveGame, p: LivePlayer): boolean {
  if (g.period === 1) return p.fouls >= 2 && g.clock > 4 * 60 ? true : p.fouls >= 3;
  if (g.period === 2) return p.fouls >= 4 && g.clock > 5 * 60;
  return false;
}

function desirability(g: LiveGame, t: LiveTeam, p: LivePlayer): number {
  if (p.fouledOut || p.injured || p.pref === 'sit') return -1e9;
  const plan = MINUTE_PLANS[t.strategy.rotation][p.depth] ?? 0;
  const expectedSecs = plan * 60 * elapsedFraction(g);
  const over = (p.secs - expectedSecs) / 60;
  let d = p.ovr + (10 - p.depth) * 1.1 + (p.energy - 100) * 0.42;
  if (over > 0) d -= over * 2.2;
  else d -= over * 0.8; // under-target players get a little push
  if (foulTrouble(g, p)) d -= 30;
  if (p.pref === 'ride') d += 18;
  if (p.onCourt) d += 5; // hysteresis: avoid churning subs for marginal gains
  // Crunch time: best players play.
  const crunch = g.period >= 2 && g.clock < 240 && Math.abs(g.score[0] - g.score[1]) <= 10;
  if (crunch) d += (p.ovr - 50) * 0.6 + (p.energy - 100) * -0.2;
  return d;
}

/** Choose the five best available with some positional sanity. */
function chooseLineup(g: LiveGame, t: LiveTeam): LivePlayer[] {
  const avail = t.players.filter((p) => !p.fouledOut && !p.injured);
  const ranked = [...avail].sort((a, b) => desirability(g, t, b) - desirability(g, t, a));
  const pick: LivePlayer[] = [];
  const guards = (arr: LivePlayer[]) => arr.filter((p) => p.pos === 'PG' || p.pos === 'SG').length;
  const bigs = (arr: LivePlayer[]) => arr.filter((p) => p.pos === 'C' || p.pos === 'PF').length;
  for (const p of ranked) {
    if (pick.length >= 5) break;
    const trial = [...pick, p];
    if (bigs(trial) > 3) continue;
    if (guards(trial) > 3) continue;
    pick.push(p);
  }
  for (const p of ranked) {
    if (pick.length >= 5) break;
    if (!pick.includes(p)) pick.push(p);
  }
  // Need a ball handler.
  if (guards(pick) === 0) {
    const g2 = ranked.find((p) => !pick.includes(p) && (p.pos === 'PG' || p.pos === 'SG') && desirability(g, t, p) > -1e8);
    if (g2) pick[4] = g2;
  }
  return pick;
}

function ensureFive(t: LiveTeam) {
  const on = onCourt(t);
  if (on.length >= 5) return;
  for (const p of t.players) {
    if (onCourt(t).length >= 5) break;
    if (!p.onCourt && !p.fouledOut && !p.injured) p.onCourt = true;
  }
  // If fewer than five can play, the team plays short-handed.
}

function substitutions(g: LiveGame, t: LiveTeam) {
  const want = chooseLineup(g, t);
  const before = onCourt(t);
  const wantIds = new Set(want.map((p) => p.id));
  const subsIn: string[] = [];
  const subsOut: string[] = [];
  for (const p of t.players) {
    const should = wantIds.has(p.id);
    if (should !== p.onCourt) {
      // Avoid churning for tiny gains: only swap a player out if clearly better option exists.
      if (!should && p.onCourt) {
        subsOut.push(p.short);
      } else subsIn.push(p.short);
      p.onCourt = should;
    }
  }
  if (subsIn.length && g.recordPbp && t.isUser) {
    log(g, `${t.abbr} sub: ${subsIn.join(', ')} in for ${subsOut.join(', ') || '—'}.`);
  }
  if (before.length === 0) ensureFive(t);
}

function avg(arr: LivePlayer[], f: (p: LivePlayer) => number): number {
  if (!arr.length) return 40;
  let s = 0;
  for (const p of arr) s += f(p);
  return s / arr.length;
}

// ---------------------------------------------------------------- possession

function addPoints(g: LiveGame, team: 0 | 1, pts: number) {
  g.score[team] += pts;
  const t = g.teams[team];
  const o = g.teams[team === 0 ? 1 : 0];
  if (g.period <= 2) t.halves[g.period - 1] += pts;
  else {
    while (t.halves.length < g.period) t.halves.push(0);
    t.halves[g.period - 1] += pts;
  }
  o.run += pts;
  t.run = 0;
}

function freeThrows(g: LiveGame, rng: Rng, team: 0 | 1, shooter: LivePlayer, n: number): number {
  const pct = clamp(0.47 + shooter.ratings.sht * 0.0036 + (shooter.ratings.iq - 50) * 0.0006 + energyMod(shooter) * 0.5, 0.35, 0.93);
  let made = 0;
  for (let i = 0; i < n; i++) if (rng.chance(pct)) made++;
  shooter.box.fta += n;
  shooter.box.ftm += made;
  shooter.box.pts += made;
  addPoints(g, team, made);
  return made;
}

function commitFoul(g: LiveGame, def: LiveTeam, fouler: LivePlayer) {
  fouler.fouls += 1;
  fouler.box.pf += 1;
  def.teamFouls += 1;
  if (fouler.fouls >= 5) {
    fouler.fouledOut = true;
    fouler.onCourt = false;
    log(g, `${fouler.short} (${def.abbr}) has fouled out.`, true);
    substitutions(g, def);
    ensureFive(def);
  }
}

const SHOT_WORDS = {
  rimMake: ['finishes at the rim', 'lays it in', 'scores on a strong drive', 'throws it down', 'flips in a runner', 'scores through contact'],
  rimMiss: ['misses at the rim', 'can\'t finish the layup', 'is stuffed trying to finish', 'misses a contested floater'],
  midMake: ['hits a pull-up jumper', 'knocks down a baseline jumper', 'drills a mid-range shot', 'scores on a turnaround'],
  midMiss: ['misses a pull-up jumper', 'misfires from the elbow', 'clanks a fadeaway'],
  threeMake: ['drains a three', 'buries a corner three', 'hits from deep', 'splashes a step-back three'],
  threeMiss: ['misses from three', 'can\'t connect from deep', 'airballs a contested three'],
};

/** Simulate one possession. */
export function stepPossession(g: LiveGame) {
  if (g.done) return;
  const rng = new Rng(g.rng);
  const offIdx = g.poss;
  const defIdx = (offIdx === 0 ? 1 : 0) as 0 | 1;
  const off = g.teams[offIdx];
  const def = g.teams[defIdx];
  const O = onCourt(off);
  const D = onCourt(def);
  if (O.length === 0 || D.length === 0) {
    ensureFive(off);
    ensureFive(def);
  }
  off.poss += 1;

  const paceS = (PACE_SECONDS[off.strategy.pace] * 0.6 + PACE_SECONDS[def.strategy.pace] * 0.4) + (def.strategy.defense === 'press' ? -1.5 : 0);
  const isTransition = g.transition || rng.chance(clamp(0.05 + (avg(O, (p) => p.tend.transition) - 50) * 0.002 + (off.strategy.pace === 'fast' ? 0.05 : 0), 0.01, 0.25));
  g.transition = false;
  let duration = isTransition ? rng.range(4, 9) : clamp(rng.normal(paceS, 4.5), 5, 30);
  duration = Math.min(duration, g.clock);

  // Fatigue and minutes
  const paceMult = off.strategy.pace === 'fast' ? 1.15 : off.strategy.pace === 'slow' ? 0.9 : 1;
  for (const t of g.teams) {
    const pressMult = t.strategy.defense === 'press' ? 1.2 : 1;
    for (const p of t.players) {
      if (p.onCourt) {
        p.energy = clamp(p.energy - (1.5 - p.ratings.sta / 100) * paceMult * pressMult * (duration / 16), 5, 100);
        p.secs += duration;
      } else {
        p.energy = clamp(p.energy + 1.7 * (duration / 16), 0, 100);
      }
    }
  }
  g.clock -= duration;

  const homeAdv = (team: LiveTeam) => (team.home && !g.neutral ? 0.01 : 0);
  const tacticsEdge = (off.tactics - def.tactics) * 0.00025 + (off.offSpec ?? 0) - (def.defSpec ?? 0);
  const crunch = g.period >= 2 && g.clock < 120 && Math.abs(g.score[0] - g.score[1]) <= 6;

  // ---- turnover check
  const handler = pickWeighted(rng, O, (p) => (p.ratings.bh * 1.2 + p.ratings.pas) ** 2 * (p.pos === 'PG' ? 1.6 : 1));
  let toProb = 0.165
    - ((handler.ratings.bh * 0.5 + handler.ratings.pas * 0.2 + handler.ratings.iq * 0.3) - 58) * 0.002
    + (avg(D, (p) => p.ratings.pdef) - 55) * 0.0012
    + (handler.tend.passRisk - 50) * 0.0008
    - energyMod(handler) * 0.6;
  if (def.strategy.defense === 'press') toProb += 0.035;
  if (def.strategy.focus === 'pressureBall') toProb += 0.018;
  if (off.strategy.offense === 'motion') toProb += 0.008;
  if (off.strategy.offense === 'pickAndRoll') toProb += 0.004;
  toProb -= off.prep * 0.012 + off.chemistry * 0.01;
  toProb = clamp(toProb, 0.06, 0.32);
  if (isTransition) toProb *= 0.85;

  if (rng.chance(toProb)) {
    handler.box.tov += 1;
    const stealChance = 0.5 + (def.strategy.defense === 'press' ? 0.08 : 0);
    if (rng.chance(stealChance)) {
      const stealer = pickWeighted(rng, D, (p) => p.ratings.pdef * 0.6 + p.ratings.ath * 0.2 + p.tend.defAgg * 0.4);
      stealer.box.stl += 1;
      log(g, `${stealer.short} picks off ${handler.short} — steal ${def.abbr}.`);
      g.transition = rng.chance(0.55);
    } else {
      log(g, `${handler.short} ${rng.pick(['travels', 'steps out of bounds', 'throws it away', 'is called for an offensive foul', 'loses the handle'])}. Turnover ${off.abbr}.`);
    }
    endPossession(g, rng, defIdx, true);
    return;
  }

  // ---- non-shooting foul
  if (rng.chance(0.075 + (def.strategy.defense === 'press' ? 0.012 : 0))) {
    const fouler = pickWeighted(rng, D, (p) => p.tend.foul + 10);
    commitFoul(g, def, fouler);
    if (def.teamFouls >= 7) {
      const fouled = pickWeighted(rng, O, (p) => p.ratings.bh + p.ratings.ath);
      const n = def.teamFouls >= 10 ? 2 : rng.chance(fouled.ratings.sht / 140 + 0.2) ? 2 : 1;
      const made = freeThrows(g, rng, offIdx, fouled, n);
      log(g, `Foul on ${fouler.short}. ${fouled.short} makes ${made} of ${n} at the line (bonus).`);
      endPossession(g, rng, defIdx, true);
      return;
    }
    log(g, `Reach-in foul on ${fouler.short}.`);
    // Possession continues with a reset; small clock cost already applied.
  }

  let shotClockLeft = true;
  let offRebounds = 0;
  while (shotClockLeft) {
    // ---- shot selection
    const star = [...D].sort((a, b) => b.ovr - a.ovr)[0];
    const offStarIdx = [...O].sort((a, b) => b.ovr - a.ovr)[0];
    const shooter = pickWeighted(rng, O, (p) => {
      const skill = Math.max(p.ratings.fin, p.ratings.sht) * 0.65 + p.ratings.bh * 0.15 + p.ratings.iq * 0.2;
      let w = Math.pow(skill / 50, 2.4) * (0.7 + p.energy / 330);
      if (def.strategy.focus === 'denyStar' && p === offStarIdx) w *= 0.7;
      if (off.strategy.offense === 'inside' && (p.pos === 'C' || p.pos === 'PF')) w *= 1.35;
      if (off.strategy.offense === 'perimeter' && (p.pos === 'SG' || p.pos === 'SF')) w *= 1.2;
      if (crunch) w *= 1 + (p.tend.clutch - 50) / 120;
      return w;
    });
    void star;

    let threeShare = shooter.tend.threeRate * 0.8 + 4;
    if (off.strategy.offense === 'perimeter') threeShare += 9;
    if (off.strategy.offense === 'inside') threeShare -= 9;
    if (def.strategy.defense === 'zone') threeShare += 8;
    if (def.strategy.defense === 'pack') threeShare += 10;
    if (def.strategy.focus === 'protectPaint') threeShare += 6;
    if (isTransition) threeShare -= 10;
    if (offRebounds > 0) threeShare -= 15;
    threeShare = clamp(threeShare, 2, 70) / 100;
    let type: 'rim' | 'mid' | 'three';
    if (rng.chance(threeShare)) type = 'three';
    else {
      let rimShare = 0.52 + (shooter.tend.drive - 50) / 160;
      if (isTransition) rimShare += 0.25;
      if (offRebounds > 0) rimShare += 0.3;
      if (off.strategy.offense === 'inside') rimShare += 0.08;
      if (def.strategy.defense === 'zone' || def.strategy.defense === 'pack') rimShare -= 0.08;
      type = rng.chance(clamp(rimShare, 0.2, 0.92)) ? 'rim' : 'mid';
    }

    // ---- defender matchup
    const primaryDef = pickWeighted(rng, D, (p) => (type === 'rim' ? p.ratings.idef ** 2 * (p.pos === 'C' || p.pos === 'PF' ? 1.5 : 0.7) : p.ratings.pdef ** 2));
    const perD = avg(D, (p) => p.ratings.pdef) * 0.45 + primaryDef.ratings.pdef * 0.55;
    const intD = avg(D, (p) => p.ratings.idef) * 0.4 + primaryDef.ratings.idef * 0.6;

    let make: number;
    if (type === 'rim') {
      make = 0.545 + ((shooter.ratings.fin * 0.65 + shooter.ratings.ath * 0.35) - (intD * 0.7 + primaryDef.ratings.ath * 0.3)) * 0.0036;
      if (isTransition) make += 0.07;
      if (def.strategy.defense === 'zone') make -= 0.025;
      if (def.strategy.defense === 'pack') make -= 0.04;
      if (def.strategy.focus === 'protectPaint') make -= 0.03;
    } else if (type === 'mid') {
      make = 0.37 + (shooter.ratings.sht - perD * 0.5 - 27) * 0.0033;
    } else {
      make = 0.322 + (shooter.ratings.sht - perD * 0.5 - 32) * 0.0036;
      if (def.strategy.defense === 'zone') make += 0.005;
      if (def.strategy.defense === 'pack') make += 0.018;
      if (def.strategy.focus === 'protectPaint') make += 0.01;
    }
    make += energyMod(shooter) + homeAdv(off) + tacticsEdge + off.prep * 0.02 - def.prep * 0.012 + off.chemistry * 0.012;
    make += (shooter.ratings.iq - 55) * 0.0008;
    if (def.strategy.focus === 'denyStar' && shooter === offStarIdx) make -= 0.04;
    if (off.strategy.offense === 'motion') make += 0.012;
    if (off.strategy.offense === 'pickAndRoll' && type !== 'three') make += 0.012;
    if (def.strategy.defense === 'press') make += 0.02; // beating the press leaves numbers
    if (crunch) make += (shooter.tend.clutch - 50) * 0.0009;
    make = clamp(make, 0.12, 0.85);

    // ---- block
    const blockChance = type === 'rim' ? clamp(0.055 + (intD - 55) * 0.0022 + (primaryDef.ratings.ath - 55) * 0.001, 0.01, 0.16) : type === 'mid' ? 0.02 : 0.01;
    const blocked = rng.chance(blockChance);

    // ---- shooting foul
    const foulBase = type === 'rim' ? 0.175 : type === 'mid' ? 0.06 : 0.022;
    const shootingFoul = rng.chance(clamp(foulBase + (primaryDef.tend.foul - 45) * 0.0016 + (shooter.tend.drive - 50) * 0.0006, 0.005, 0.25));

    let made = !blocked && rng.chance(make);
    if (shootingFoul) made = made && rng.chance(0.55);

    const pts = type === 'three' ? 3 : 2;
    const key = type === 'rim' ? 'rim' : type === 'mid' ? 'mid' : 'three';
    off.shots[`${key}A` as 'rimA'] += 1;
    if (isTransition && made) off.fastBreak += pts;

    if (shootingFoul) {
      commitFoul(g, def, primaryDef);
    }

    if (shootingFoul && !made) {
      // Fouled on a miss: FTs, no FGA
      off.shots[`${key}A` as 'rimA'] -= 1;
      const n = type === 'three' ? 3 : 2;
      const fm = freeThrows(g, rng, offIdx, shooter, n);
      log(g, `${shooter.short} is fouled by ${primaryDef.short} on the shot and makes ${fm} of ${n}.`);
      endPossession(g, rng, defIdx, true);
      return;
    }

    shooter.box.fga += 1;
    if (type === 'three') shooter.box.tpa += 1;

    if (made) {
      shooter.box.fgm += 1;
      if (type === 'three') shooter.box.tpm += 1;
      shooter.box.pts += pts;
      off.shots[`${key}M` as 'rimM'] += 1;
      addPoints(g, offIdx, pts);
      let assistTxt = '';
      const astProb = (type === 'three' ? 0.82 : type === 'mid' ? 0.55 : 0.5) + (off.strategy.offense === 'motion' ? 0.08 : 0) - (offRebounds > 0 ? 0.35 : 0);
      if (rng.chance(astProb)) {
        const others = O.filter((p) => p !== shooter);
        if (others.length) {
          const a = pickWeighted(rng, others, (p) => p.ratings.pas ** 2 * (p.pos === 'PG' ? 1.4 : 1));
          a.box.ast += 1;
          assistTxt = ` (assist ${a.short})`;
        }
      }
      const word = rng.pick(type === 'rim' ? SHOT_WORDS.rimMake : type === 'mid' ? SHOT_WORDS.midMake : SHOT_WORDS.threeMake);
      if (shootingFoul) {
        const fm = freeThrows(g, rng, offIdx, shooter, 1);
        log(g, `${shooter.short} ${word} and draws the foul${assistTxt}! ${fm ? 'Completes the and-one.' : 'Misses the free throw.'}`, pts === 3);
      } else {
        log(g, `${shooter.short} ${word}${assistTxt}.`);
      }
      endPossession(g, rng, defIdx, false);
      return;
    }

    // ---- miss
    if (blocked) {
      primaryDef.box.blk += 1;
      log(g, `${primaryDef.short} blocks ${shooter.short}!`);
    } else {
      log(g, `${shooter.short} ${rng.pick(type === 'rim' ? SHOT_WORDS.rimMiss : type === 'mid' ? SHOT_WORDS.midMiss : SHOT_WORDS.threeMiss)}.`);
    }
    let orbProb = 0.29 + (avg(O, (p) => p.ratings.reb) - avg(D, (p) => p.ratings.reb)) * 0.0045;
    if (off.strategy.focus === 'crashBoards') orbProb += 0.045;
    if (def.strategy.focus === 'crashBoards') orbProb -= 0.03;
    if (def.strategy.defense === 'zone') orbProb += 0.025;
    if (type === 'three') orbProb += 0.02;
    orbProb = clamp(orbProb, 0.12, 0.45);
    if (rng.chance(orbProb) && g.clock > 1) {
      const r = pickWeighted(rng, O, (p) => (p.ratings.reb ** 2) * (p.pos === 'C' ? 1.5 : p.pos === 'PF' ? 1.3 : 0.8));
      r.box.orb += 1;
      log(g, `Offensive rebound ${r.short}.`);
      offRebounds += 1;
      const extra = Math.min(g.clock, rng.range(2, 7));
      g.clock -= extra;
      for (const p of [...O, ...D]) p.secs += extra;
      if (g.clock <= 0) shotClockLeft = false;
      continue;
    }
    const r = pickWeighted(rng, D, (p) => (p.ratings.reb ** 2) * (p.pos === 'C' ? 1.5 : p.pos === 'PF' ? 1.3 : 0.8));
    r.box.drb += 1;
    g.transition = rng.chance(clamp(0.1 + (avg(D, (p) => p.tend.transition) - 50) * 0.003 + (def.strategy.pace === 'fast' ? 0.08 : 0) + (off.strategy.focus === 'crashBoards' ? 0.05 : 0), 0.02, 0.4));
    endPossession(g, rng, defIdx, false, true);
    return;
  }
  endPossession(g, rng, defIdx, false);
}

function endPossession(g: LiveGame, rng: Rng, nextPoss: 0 | 1, deadBall: boolean, liveRebound = false) {
  g.poss = nextPoss;
  // AI timeouts to stop runs
  for (const t of g.teams) {
    if (!t.isUser && t.run >= 9 && t.timeouts > 0 && g.clock > 30) {
      t.timeouts -= 1;
      t.run = 0;
      for (const p of onCourt(t)) p.energy = clamp(p.energy + 5, 0, 100);
      log(g, `Timeout ${t.abbr} to stop the run.`, true);
      deadBall = true;
    }
  }
  if (g.clock <= 0) {
    endPeriod(g, rng);
  } else if (deadBall || !liveRebound) {
    for (const t of g.teams) substitutions(g, t);
  }
  g.rng = rng.state();
}

function endPeriod(g: LiveGame, rng: Rng) {
  const [h, a] = g.score;
  if (g.period === 1) {
    log(g, `Halftime: ${g.teams[0].abbr} ${h}, ${g.teams[1].abbr} ${a}.`, true);
    g.period = 2;
    g.clock = HALF;
    g.poss = g.firstPoss === 0 ? 1 : 0;
    for (const t of g.teams) {
      t.teamFouls = 0;
      for (const p of t.players) p.energy = clamp(p.energy + 28, 0, 100);
      substitutions(g, t);
    }
    return;
  }
  if (h === a) {
    g.period += 1;
    g.clock = OT;
    g.poss = rng.chance(0.5) ? 0 : 1;
    log(g, `End of regulation tied at ${h}. Overtime!`, true);
    for (const t of g.teams) {
      t.halves.push(0);
      t.timeouts = Math.max(t.timeouts, 1);
      for (const p of t.players) p.energy = clamp(p.energy + 8, 0, 100);
      substitutions(g, t);
    }
    return;
  }
  g.done = true;
  const winner = h > a ? g.teams[0] : g.teams[1];
  log(g, `Final: ${g.teams[0].abbr} ${h}, ${g.teams[1].abbr} ${a}. ${winner.name} win${g.period > 2 ? ' in overtime' : ''}.`, true);
}

// ---------------------------------------------------------------- control

export type StopRule = 'none' | 'coach';

/** Advance until the game ends or a coach-mode stoppage occurs. */
export function runUntilStop(g: LiveGame, rule: StopRule, maxPossessions = 1e6): LiveGame {
  let n = 0;
  g.stopReason = null;
  while (!g.done && n < maxPossessions) {
    const prevPeriod = g.period;
    stepPossession(g);
    n++;
    if (rule === 'coach' && !g.done) {
      if (g.period !== prevPeriod && prevPeriod === 1 && !g.stopsHit.includes('half')) {
        g.stopsHit.push('half');
        g.stopReason = 'Halftime';
        break;
      }
      if (g.period === 2 && g.clock <= 12 * 60 && !g.stopsHit.includes('u12')) {
        g.stopsHit.push('u12');
        g.stopReason = 'Media timeout (under 12:00)';
        break;
      }
      if (g.period === 2 && g.clock <= 4 * 60 && !g.stopsHit.includes('u4')) {
        g.stopsHit.push('u4');
        g.stopReason = 'Media timeout (under 4:00)';
        break;
      }
      if (g.period === 1 && g.clock <= 8 * 60 && !g.stopsHit.includes('1h8')) {
        g.stopsHit.push('1h8');
        g.stopReason = 'Media timeout (first half, under 8:00)';
        break;
      }
      if (g.period > 2 && !g.stopsHit.includes('ot' + g.period)) {
        g.stopsHit.push('ot' + g.period);
        g.stopReason = 'Overtime';
        break;
      }
    }
  }
  return g;
}

export function userTimeout(g: LiveGame, teamIdx: 0 | 1): boolean {
  const t = g.teams[teamIdx];
  if (t.timeouts <= 0 || g.done) return false;
  t.timeouts -= 1;
  t.run = 0;
  for (const p of onCourt(t)) p.energy = clamp(p.energy + 5, 0, 100);
  const rng = new Rng(g.rng);
  substitutions(g, t);
  g.rng = rng.state();
  log(g, `Timeout ${t.abbr}.`, true);
  return true;
}

export function applyLineupChanges(g: LiveGame, teamIdx: 0 | 1) {
  substitutions(g, g.teams[teamIdx]);
}

// ---------------------------------------------------------------- results

function teamBox(t: LiveTeam, pts: number): TeamBox {
  const lines = t.players.map((p) => ({ ...p.box, min: Math.round(p.secs / 60), g: p.secs > 0 ? 1 : 0, gs: p.starter ? 1 : 0 }));
  const benchPts = t.players.filter((p) => !p.starter).reduce((s, p) => s + p.box.pts, 0);
  return { schoolId: t.schoolId, pts, lines, shots: { ...t.shots }, poss: t.poss, fastBreak: t.fastBreak, benchPts, halves: [...t.halves] };
}

function totals(b: TeamBox) {
  const s = emptyStats();
  for (const l of b.lines) for (const k of Object.keys(s) as (keyof typeof s)[]) s[k] += l[k];
  return s;
}

const pct = (n: number) => `${(n * 100).toFixed(1)}%`;

export function explainGame(g: LiveGame, home: TeamBox, away: TeamBox): string[] {
  const H = totals(home);
  const A = totals(away);
  const nameH = g.teams[0].abbr;
  const nameA = g.teams[1].abbr;
  const efg = (s: typeof H) => (s.fga ? (s.fgm + 0.5 * s.tpm) / s.fga : 0);
  const tov = (s: typeof H, poss: number) => (poss ? s.tov / poss : 0);
  const orb = (s: typeof H, o: typeof H) => (s.orb + o.drb ? s.orb / (s.orb + o.drb) : 0);
  const ftr = (s: typeof H) => (s.fga ? s.ftm / s.fga : 0);
  const items: { w: number; text: string }[] = [];
  const dEfg = efg(H) - efg(A);
  items.push({ w: Math.abs(dEfg) * 100 * 0.4 * 2, text: `Shooting: ${nameH} effective FG ${pct(efg(H))} vs ${nameA} ${pct(efg(A))}.` });
  const dTov = tov(A, away.poss) - tov(H, home.poss);
  items.push({ w: Math.abs(dTov) * 100 * 0.25 * 2, text: `Ball security: ${nameH} turned it over on ${pct(tov(H, home.poss))} of possessions, ${nameA} on ${pct(tov(A, away.poss))}.` });
  const dOrb = orb(H, A) - orb(A, H);
  items.push({ w: Math.abs(dOrb) * 100 * 0.2, text: `Rebounding: offensive rebound rate ${nameH} ${pct(orb(H, A))}, ${nameA} ${pct(orb(A, H))} (${H.orb + H.drb}–${A.orb + A.drb} total boards).` });
  const dFt = ftr(H) - ftr(A);
  items.push({ w: Math.abs(dFt) * 100 * 0.15 * 2, text: `Free throws: ${nameH} ${H.ftm}/${H.fta}, ${nameA} ${A.ftm}/${A.fta}.` });
  const dBench = home.benchPts - away.benchPts;
  items.push({ w: Math.abs(dBench) * 0.25, text: `Bench scoring: ${nameH} ${home.benchPts}, ${nameA} ${away.benchPts}.` });
  const dFb = home.fastBreak - away.fastBreak;
  items.push({ w: Math.abs(dFb) * 0.3, text: `Transition: fast-break points ${nameH} ${home.fastBreak}, ${nameA} ${away.fastBreak}.` });
  const d3 = home.shots.threeM * 3 - away.shots.threeM * 3;
  items.push({ w: Math.abs(d3) * 0.22, text: `Three-point line: ${nameH} ${home.shots.threeM}/${home.shots.threeA}, ${nameA} ${away.shots.threeM}/${away.shots.threeA}.` });
  items.sort((a, b) => b.w - a.w);
  const out = items.slice(0, 3).map((i) => i.text);
  const topH = [...home.lines].sort((a, b) => b.pts - a.pts)[0];
  const topA = [...away.lines].sort((a, b) => b.pts - a.pts)[0];
  if (topH && topA) out.push(`Top scorers: ${topH.name} ${topH.pts} pts for ${nameH}; ${topA.name} ${topA.pts} pts for ${nameA}.`);
  const tired = g.teams.flatMap((t) => t.players.filter((p) => p.secs > 30 * 60 && p.energy < 45).map((p) => `${p.short} (${t.abbr})`));
  if (tired.length) out.push(`Heavy legs late: ${tired.slice(0, 3).join(', ')} logged big minutes and faded.`);
  if (!g.neutral) out.push(`Home court: ${g.teams[0].name} had the crowd (worth roughly 1.5 points per game).`);
  return out;
}

export function reviewPlan(g: LiveGame, teamIdx: 0 | 1, mine: TeamBox, theirs: TeamBox): string[] {
  const t = g.teams[teamIdx];
  const o = g.teams[teamIdx === 0 ? 1 : 0];
  const s = t.strategy;
  const out: string[] = [];
  const opp3 = theirs.shots.threeA ? theirs.shots.threeM / theirs.shots.threeA : 0;
  const oppRim = theirs.shots.rimA ? theirs.shots.rimM / theirs.shots.rimA : 0;
  const oppShare3 = theirs.shots.threeA / Math.max(1, theirs.shots.threeA + theirs.shots.midA + theirs.shots.rimA);
  if (s.defense === 'zone' || s.defense === 'pack') {
    out.push(`Your ${s.defense} defense held ${o.abbr} to ${pct(oppRim)} at the rim, but they took ${pct(oppShare3)} of shots from three and made ${pct(opp3)}.`);
  } else if (s.defense === 'press') {
    const oppTov = theirs.lines.reduce((x, l) => x + l.tov, 0);
    out.push(`Your press forced ${oppTov} turnovers, but conceded ${theirs.fastBreak + Math.round(theirs.shots.rimM * 0.3)} quick-hitting points and drained your legs.`);
  } else {
    out.push(`Man-to-man: ${o.abbr} shot ${pct(opp3)} from three and ${pct(oppRim)} at the rim.`);
  }
  if (s.focus === 'denyStar') {
    const star = [...theirs.lines].sort((a, b) => b.fga - a.fga)[0];
    if (star) out.push(`Deny-the-star plan: ${star.name} finished with ${star.pts} points on ${star.fgm}/${star.fga} shooting.`);
  }
  if (s.focus === 'protectPaint') out.push(`Protect-the-paint plan: ${o.abbr} made ${theirs.shots.rimM} of ${theirs.shots.rimA} at the rim.`);
  if (s.focus === 'crashBoards') {
    const orb = mine.lines.reduce((x, l) => x + l.orb, 0);
    out.push(`Crashing the boards produced ${orb} offensive rebounds, and ${o.abbr} scored ${theirs.fastBreak} fast-break points.`);
  }
  if (s.offense === 'perimeter' || s.offense === 'inside') {
    const share = s.offense === 'perimeter' ? mine.shots.threeA : mine.shots.rimA;
    const tot = mine.shots.threeA + mine.shots.midA + mine.shots.rimA;
    out.push(`${s.offense === 'perimeter' ? 'Perimeter' : 'Inside'} offense: ${pct(share / Math.max(1, tot))} of your shots came ${s.offense === 'perimeter' ? 'from three' : 'at the rim'}.`);
  }
  out.push(`Pace: you played ${mine.poss} possessions (${s.pace} pace setting).`);
  return out;
}

export function finishLiveGame(g: LiveGame, seed: number): GameResult {
  const home = teamBox(g.teams[0], g.score[0]);
  const away = teamBox(g.teams[1], g.score[1]);
  const userIdx = g.teams[0].isUser ? 0 : g.teams[1].isUser ? 1 : -1;
  return {
    home,
    away,
    ot: Math.max(0, g.period - 2),
    pbp: g.pbp,
    factors: explainGame(g, home, away),
    planReview: userIdx >= 0 ? reviewPlan(g, userIdx as 0 | 1, userIdx === 0 ? home : away, userIdx === 0 ? away : home) : [],
    seed,
  };
}

export function simulateFull(game: Game, home: TeamInputs, away: TeamInputs, world: Pick<World, 'seed'>, recordPbp: boolean): { live: LiveGame; result: GameResult } {
  const live = createLiveGame(game, home, away, world.seed, recordPbp);
  runUntilStop(live, 'none');
  return { live, result: finishLiveGame(live, world.seed) };
}
