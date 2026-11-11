import { Rng, clamp } from './rng';
import { FIRST_NAMES, LAST_NAMES, PLACES } from './names';
import type { Player, Pos, Ratings, RatingKey, StatLine, Role, World } from './types';
import { RATING_KEYS } from './types';

export const OVR_WEIGHTS: Record<Pos, Partial<Record<RatingKey, number>>> = {
  PG: { bh: 0.2, pas: 0.19, sht: 0.16, iq: 0.15, pdef: 0.12, ath: 0.1, fin: 0.08 },
  SG: { sht: 0.25, fin: 0.13, bh: 0.12, pdef: 0.15, ath: 0.12, iq: 0.11, pas: 0.07, reb: 0.05 },
  SF: { sht: 0.16, fin: 0.16, pdef: 0.14, ath: 0.14, reb: 0.1, iq: 0.1, bh: 0.08, idef: 0.06, pas: 0.06 },
  PF: { fin: 0.18, reb: 0.18, idef: 0.16, ath: 0.14, sht: 0.1, iq: 0.1, pdef: 0.08, pas: 0.06 },
  C: { reb: 0.22, idef: 0.22, fin: 0.2, ath: 0.12, iq: 0.1, sht: 0.04, pas: 0.05, pdef: 0.05 },
};

const POS_OFFSETS: Record<Pos, Partial<Record<RatingKey, number>>> = {
  PG: { bh: 13, pas: 12, sht: 4, pdef: 4, reb: -14, idef: -12, fin: -3, iq: 3 },
  SG: { sht: 10, bh: 4, pdef: 4, reb: -8, idef: -9, pas: 0 },
  SF: { ath: 4, fin: 3, reb: -2, idef: -2 },
  PF: { reb: 9, idef: 8, fin: 5, bh: -9, pas: -5, pdef: -4, sht: -4 },
  C: { reb: 14, idef: 14, fin: 7, bh: -16, pas: -8, sht: -12, pdef: -8, ath: -2 },
};

const HEIGHTS: Record<Pos, [number, number]> = {
  PG: [71, 77],
  SG: [74, 79],
  SF: [77, 81],
  PF: [79, 83],
  C: [81, 87],
};

const SECONDARY: Record<Pos, Pos[]> = {
  PG: ['SG'],
  SG: ['PG', 'SF'],
  SF: ['SG', 'PF'],
  PF: ['SF', 'C'],
  C: ['PF'],
};

export function ovr(p: { pos: Pos; ratings: Ratings }): number {
  const w = OVR_WEIGHTS[p.pos];
  let s = 0;
  for (const k in w) s += (p.ratings[k as RatingKey] ?? 50) * (w[k as RatingKey] ?? 0);
  return Math.round(s);
}

export function ovrAt(p: { ratings: Ratings }, pos: Pos): number {
  return ovr({ pos, ratings: p.ratings });
}

export function emptyStats(): StatLine {
  return { g: 0, gs: 0, min: 0, pts: 0, fgm: 0, fga: 0, tpm: 0, tpa: 0, ftm: 0, fta: 0, orb: 0, drb: 0, ast: 0, stl: 0, blk: 0, tov: 0, pf: 0 };
}

export function addStats(a: StatLine, b: StatLine) {
  for (const k of Object.keys(a) as (keyof StatLine)[]) a[k] += b[k];
}

export const CLASS_LABELS = ['', 'FR', 'SO', 'JR', 'SR', 'GR'];
export function classLabel(p: Player): string {
  return (p.redshirting ? 'RS-' : '') + (CLASS_LABELS[p.year] ?? 'GR') + (p.redshirtUsed && !p.redshirting ? '*' : '');
}

export function heightLabel(inches: number): string {
  return `${Math.floor(inches / 12)}'${inches % 12}"`;
}

export function nextId(world: World, prefix: string): string {
  world.nextId += 1;
  return `${prefix}${world.nextId.toString(36)}`;
}

export function randomName(rng: Rng): [string, string] {
  return [rng.pick(FIRST_NAMES), rng.pick(LAST_NAMES)];
}

export interface GenOptions {
  pos?: Pos;
  quality: number; // target OVR at generation
  year: number;
  region?: string;
  regions: string[];
  schoolId: string | null;
}

export function generatePlayer(world: World, rng: Rng, opt: GenOptions): Player {
  const pos = opt.pos ?? rng.pick<Pos>(['PG', 'SG', 'SF', 'PF', 'C']);
  const [first, last] = randomName(rng);
  const region = opt.region ?? rng.pick(opt.regions);
  const base = opt.quality + rng.normal(0, 3);
  const ratings = {} as Ratings;
  const off = POS_OFFSETS[pos];
  // Give each player a "spike" skill so archetypes feel distinct.
  const spike = rng.pick(RATING_KEYS);
  for (const k of RATING_KEYS) {
    let v = base + (off[k] ?? 0) + rng.normal(0, 7);
    if (k === spike) v += rng.range(5, 12);
    ratings[k] = clamp(Math.round(v), 15, 99);
  }
  // Re-center so overall lands near the requested quality.
  const tmp = { pos, ratings };
  const diff = opt.quality - ovr(tmp);
  for (const k of RATING_KEYS) ratings[k] = clamp(Math.round(ratings[k] + diff * 0.9), 15, 99);

  const [hmin, hmax] = HEIGHTS[pos];
  const height = rng.int(hmin, hmax);
  const weight = Math.round(150 + (height - 70) * 6.5 + rng.normal(0, 10));
  const yearsLeft = 5 - opt.year;
  const growth = Math.max(0, rng.normal(4 + yearsLeft * 3.2, 4.5));
  const devProfile = rng.pick<Player['devProfile']>(['early', 'steady', 'steady', 'late']);
  const sht = ratings.sht;

  const p: Player = {
    id: nextId(world, 'p'),
    first,
    last,
    pos,
    pos2: rng.pick(SECONDARY[pos]),
    height,
    weight,
    region,
    hometown: rng.pick(PLACES[region] ?? PLACES.Midwest),
    schoolId: opt.schoolId,
    year: opt.year,
    redshirtUsed: opt.year >= 2 && rng.chance(0.12),
    redshirting: false,
    ratings,
    pot: clamp(Math.round(ovr(tmp) + growth), 20, 99),
    devProfile,
    tendencies: {
      threeRate: clamp(Math.round(sht * 0.8 + (pos === 'C' ? -35 : pos === 'PF' ? -15 : 5) + rng.normal(0, 10)), 2, 95),
      drive: clamp(Math.round((ratings.fin + ratings.ath + ratings.bh) / 3 + rng.normal(0, 10)), 5, 95),
      passRisk: clamp(Math.round(rng.normal(50, 15)), 5, 95),
      defAgg: clamp(Math.round(rng.normal(50, 15)), 5, 95),
      foul: clamp(Math.round(rng.normal(45, 15) + (pos === 'C' ? 10 : 0)), 5, 95),
      transition: clamp(Math.round(ratings.ath * 0.7 + rng.normal(15, 10)), 5, 95),
      clutch: clamp(Math.round(rng.normal(50, 18)), 5, 95),
    },
    personality: {
      workEthic: clamp(Math.round(rng.normal(55, 18)), 5, 99),
      ego: clamp(Math.round(rng.normal(45, 18)), 5, 99),
      leadership: clamp(Math.round(rng.normal(45, 18) + opt.year * 3), 5, 99),
      loyalty: clamp(Math.round(rng.normal(55, 18)), 5, 99),
    },
    morale: 70,
    trust: 55,
    roleExpect: 'rotation',
    devFocus: 'balanced',
    promise: null,
    gpa: Math.round(clamp(rng.normal(3.0, 0.45), 1.6, 4.0) * 100) / 100,
    eligible: true,
    injury: null,
    fatigue: 0,
    scholarship: true,
    origin: 'initial',
    stats: emptyStats(),
    career: [],
    devHistory: [],
    awards: [],
    transferRisk: 0,
    transferFactors: [],
  };
  return p;
}

/** A player's expectation of role is derived from talent relative to teammates and ego. */
export function computeRoleExpectations(world: World, schoolId: string) {
  const school = world.schools[schoolId];
  const roster = school.rosterIds.map((id) => world.players[id]).filter(Boolean);
  const sorted = [...roster].sort((a, b) => ovr(b) - ovr(a));
  sorted.forEach((p, i) => {
    const egoBump = p.personality.ego > 70 ? -1 : 0;
    const rank = Math.max(0, i + egoBump);
    let role: Role = rank < 1 ? 'star' : rank < 5 ? 'starter' : rank < 9 ? 'rotation' : 'bench';
    if (p.year === 1 && role === 'star' && ovr(p) < 70) role = 'starter';
    p.roleExpect = role;
  });
}

export const ROLE_MINUTES: Record<Role, number> = { star: 30, starter: 24, rotation: 14, bench: 4 };

/** Scouted band for a rating or OVR given scouting confidence. */
export function scoutedBand(trueValue: number, scouted: number, salt: number): [number, number] {
  const width = Math.round(2 + (100 - scouted) * 0.16);
  // Deterministic bias so the band isn't always centered on the truth.
  const bias = Math.round(Math.sin(salt * 12.9898) * width * 0.6);
  const center = trueValue + bias;
  return [clamp(center - width, 1, 99), clamp(center + width, 1, 99)];
}

export function potentialLabel(p: Player, scouted = 60): string {
  const [lo, hi] = scoutedBand(p.pot, scouted, p.height + p.weight);
  const mid = (lo + hi) / 2;
  const tier = mid >= 82 ? 'All-American' : mid >= 74 ? 'All-Conference' : mid >= 66 ? 'Starter' : mid >= 56 ? 'Rotation' : 'Depth';
  return `${tier} (${lo}–${hi})`;
}

export function ratingBand(v: number): string {
  return v >= 85 ? 'Elite' : v >= 75 ? 'Very good' : v >= 65 ? 'Good' : v >= 55 ? 'Average' : v >= 45 ? 'Below avg' : 'Weak';
}

export function playerName(p: Player | undefined): string {
  return p ? `${p.first} ${p.last}` : 'Unknown';
}

export function isAvailable(p: Player): boolean {
  return !p.injury && p.eligible && !p.redshirting;
}
