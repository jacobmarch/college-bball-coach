import { Rng, clamp } from './rng';
import { COLORS, CONFERENCE_NAMES, MASCOTS, PLACES, REGIONS, SCHOOL_PATTERNS, COACH_BACKGROUNDS } from './names';
import { generatePlayer, nextId, randomName, computeRoleExpectations, ovr } from './player';
import type {
  Coach, CoachSkills, CoachTrait, Conference, Pos, School, Settings, StaffMember, StaffSpecialty, Strategy, World,
} from './types';
import { GAME_VERSION, SCHEMA_VERSION } from './types';
import { generateRecruitClass, weeklyRecruitingPoints } from './recruiting';
import { buildSeasonSchedule } from './season';
import { autoDepth } from './team';

export type UniverseSize = 'slice' | 'standard' | 'large';
export const UNIVERSE_SIZES: Record<UniverseSize, { label: string; conferences: number; perConf: number; desc: string }> = {
  slice: { label: 'Compact (1 conference, 10 schools)', conferences: 1, perConf: 10, desc: 'Fast seasons focused on one league. Postseason is the conference tournament.' },
  standard: { label: 'Standard (6 conferences, 60 schools)', conferences: 6, perConf: 10, desc: 'Power, mid-major, and low-major leagues with a 16-team national tournament.' },
  large: { label: 'Large (10 conferences, 100 schools)', conferences: 10, perConf: 10, desc: 'A deep world with more job openings and a 32-team national tournament.' },
};

export interface NewCoachInput {
  first: string;
  last: string;
  age: number;
  background: string;
  skills: CoachSkills;
  traits: CoachTrait[];
  style: Strategy;
}

export interface NewWorldInput {
  name: string;
  seed: number;
  size: UniverseSize;
  settings: Settings;
  coach: NewCoachInput;
}

export const DEFAULT_SETTINGS: Settings = {
  seasonLength: 'standard',
  difficulty: 'normal',
  gameMode: 'pbp',
  autoLineup: false,
  autoPractice: false,
  autoRecruit: false,
  explanations: 'expanded',
  reducedMotion: false,
  textScale: 1,
};

export const DEFAULT_STRATEGY: Strategy = { pace: 'normal', offense: 'balanced', defense: 'man', focus: 'none', rotation: 'normal' };

const TIER_PLANS: Record<number, number[]> = {
  1: [2],
  6: [1, 1, 2, 2, 3, 3],
  10: [1, 1, 1, 2, 2, 2, 2, 3, 3, 3],
};

const PRESTIGE_BY_TIER: Record<number, [number, number]> = { 1: [58, 92], 2: [36, 70], 3: [15, 48] };

export function randomStrategy(rng: Rng): Strategy {
  return {
    pace: rng.pick<Strategy['pace']>(['slow', 'normal', 'normal', 'fast']),
    offense: rng.pick<Strategy['offense']>(['balanced', 'balanced', 'perimeter', 'inside', 'motion', 'pickAndRoll']),
    defense: rng.pick<Strategy['defense']>(['man', 'man', 'man', 'zone', 'pack', 'press']),
    focus: rng.pick<Strategy['focus']>(['none', 'none', 'denyStar', 'protectPaint', 'crashBoards', 'pressureBall']),
    rotation: rng.pick<Strategy['rotation']>(['tight', 'normal', 'normal', 'deep']),
  };
}

export function generateStaff(world: World, rng: Rng, quality: number, schoolId: string | null, role: StaffMember['role'] = 'assistant'): StaffMember {
  const [f, l] = randomName(rng);
  const specialty = rng.pick<StaffSpecialty>(['offense', 'defense', 'recruiting', 'development', 'scouting']);
  const sk = (key: StaffSpecialty) => clamp(Math.round(quality + rng.normal(0, 9) + (specialty === key ? 12 : 0)), 15, 95);
  const skills = {
    recruiting: sk('recruiting'),
    development: sk('development'),
    tactics: clamp(Math.round(quality + rng.normal(0, 9) + (specialty === 'offense' || specialty === 'defense' ? 12 : 0)), 15, 95),
    scouting: sk('scouting'),
  };
  const s: StaffMember = {
    id: nextId(world, 's'),
    name: `${f} ${l}`,
    role,
    specialty,
    skills,
    salary: Math.round((role === 'gradAssistant' ? 30 : 90) + quality * (role === 'gradAssistant' ? 0.3 : 4) + rng.normal(0, 15)),
    age: rng.int(role === 'gradAssistant' ? 23 : 28, role === 'gradAssistant' ? 27 : 62),
    ambition: rng.int(20, 95),
    schoolId,
    years: 0,
  };
  world.staff[s.id] = s;
  return s;
}

export function generateAICoach(world: World, rng: Rng, quality: number): Coach {
  const [f, l] = randomName(rng);
  const sk = () => clamp(Math.round(quality + rng.normal(0, 10)), 15, 95);
  const c: Coach = {
    id: nextId(world, 'c'),
    first: f,
    last: l,
    age: rng.int(34, 66),
    background: rng.pick(COACH_BACKGROUNDS),
    isUser: false,
    skills: { recruiting: sk(), development: sk(), tactics: sk(), gameMgmt: sk(), relationships: sk(), academics: sk(), programBuilding: sk() },
    traits: [],
    reputation: clamp(Math.round(quality + rng.normal(0, 8)), 5, 99),
    style: randomStrategy(rng),
    contract: null,
    security: 60,
    relationships: { players: 55, staff: 55, admin: 55, boosters: 55, network: 50 },
    history: [],
    careerW: 0,
    careerL: 0,
    titles: [],
  };
  world.coaches[c.id] = c;
  return c;
}

const ROSTER_POSITIONS: Pos[] = ['PG', 'PG', 'SG', 'SG', 'SG', 'SF', 'SF', 'SF', 'PF', 'PF', 'PF', 'C', 'C'];

export function teamBaseQuality(prestige: number): number {
  return 46 + prestige * 0.22;
}

function fillRoster(world: World, rng: Rng, school: School) {
  const base = teamBaseQuality(school.prestige);
  for (let i = 0; i < ROSTER_POSITIONS.length; i++) {
    const year = (i % 4) + 1;
    const q = clamp(base + (year - 2.5) * 3 + rng.normal(0, 5.5), 25, 88);
    const region = rng.chance(0.55) ? school.region : rng.pick(REGIONS);
    const p = generatePlayer(world, rng, { pos: ROSTER_POSITIONS[i], quality: q, year, region, regions: REGIONS, schoolId: school.id });
    world.players[p.id] = p;
    school.rosterIds.push(p.id);
  }
}

function makeSchoolName(rng: Rng, region: string, used: Set<string>): { name: string; place: string } {
  for (let tries = 0; tries < 200; tries++) {
    const place = rng.pick(PLACES[region]);
    const pattern = rng.pick(SCHOOL_PATTERNS);
    const name = pattern.replace('{p}', place);
    if (!used.has(place)) {
      used.add(place);
      return { name, place };
    }
  }
  const place = `${rng.pick(PLACES[region])} ${rng.int(2, 9)}`;
  return { name: `${place} College`, place };
}

function makeAbbr(name: string, used: Set<string>): string {
  const cleaned = name.replace(/^University of /, '').replace(/^Saint /, 'St ').replace(/ College$/, '');
  const words = cleaned.replace('A&M', 'AM').split(/\s+/).filter(Boolean);
  const letters = (w: string) => w.replace(/[^A-Za-z]/g, '').toUpperCase();
  const first = letters(words[0]);
  const initials = words.map((w) => letters(w)[0]).join('');
  const candidates = [
    words.length > 1 ? initials : first.slice(0, 4),
    first.slice(0, 4),
    first.slice(0, 3) + (words[1] ? letters(words[1])[0] : ''),
    first.slice(0, 2) + (words[1] ? letters(words[1]).slice(0, 2) : first.slice(2, 4)),
    words.length > 1 ? first.slice(0, 3) + letters(words[words.length - 1])[0] : first.slice(0, 5),
    first.slice(0, 5),
  ];
  for (const c of candidates) {
    if (c.length >= 2 && !used.has(c)) {
      used.add(c);
      return c;
    }
  }
  let i = 2;
  while (used.has(first.slice(0, 3) + i)) i++;
  used.add(first.slice(0, 3) + i);
  return first.slice(0, 3) + i;
}

export function createWorld(input: NewWorldInput): World {
  const rng = new Rng(input.seed);
  const world: World = {
    id: `w${Date.now().toString(36)}${Math.floor(rng.next() * 1e6).toString(36)}`,
    name: input.name,
    schemaVersion: SCHEMA_VERSION,
    gameVersion: GAME_VERSION,
    createdAt: Date.now(),
    seed: input.seed,
    rng: rng.state(),
    settings: { ...input.settings },
    season: 1,
    week: 0,
    phase: 'preseason',
    offseasonStep: 'review',
    userCoachId: '',
    conferences: {},
    schools: {},
    players: {},
    coaches: {},
    staff: {},
    recruits: {},
    games: [],
    regularWeeks: 0,
    brackets: { conf: {}, national: null },
    rankings: [],
    inbox: [],
    transactions: [],
    portal: [],
    jobs: [],
    awards: [],
    history: [],
    retentionMeetingsLeft: 3,
    recruitingPointsLeft: 0,
    nextId: 0,
    offseasonReport: {},
    flags: {},
  };

  const size = UNIVERSE_SIZES[input.size];
  const tiers = TIER_PLANS[size.conferences];
  const usedPlaces = new Set<string>();
  const usedAbbr = new Set<string>();
  const regionOrder = rng.shuffle([...REGIONS]);
  let colorIdx = rng.int(0, COLORS.length - 1);
  for (let c = 0; c < size.conferences; c++) {
    const cn = CONFERENCE_NAMES[c];
    const conf: Conference = { id: `conf${c}`, name: cn.name, abbr: cn.abbr, tier: tiers[c], schoolIds: [] };
    world.conferences[conf.id] = conf;
    const regionsForConf = [regionOrder[c % regionOrder.length], regionOrder[(c + 3) % regionOrder.length]];
    const [pmin, pmax] = input.size === 'slice' ? [22, 82] : PRESTIGE_BY_TIER[conf.tier];
    for (let i = 0; i < size.perConf; i++) {
      const region = regionsForConf[i % 2 === 0 || size.conferences === 1 ? 0 : 1] ?? rng.pick(REGIONS);
      const r = size.conferences === 1 ? rng.pick(REGIONS) : region;
      const { name, place } = makeSchoolName(rng, r, usedPlaces);
      const prestige = Math.round(pmin + ((pmax - pmin) * (size.perConf - 1 - i)) / (size.perConf - 1) + rng.normal(0, 3));
      const school: School = {
        id: `sch${c}_${i}`,
        name,
        mascot: rng.pick(MASCOTS),
        abbr: makeAbbr(name, usedAbbr),
        city: place,
        region: r,
        colors: COLORS[colorIdx++ % COLORS.length],
        conferenceId: conf.id,
        prestige: clamp(prestige, 5, 98),
        facilities: clamp(Math.round(prestige + rng.normal(0, 10)), 5, 98),
        academics: clamp(Math.round(rng.normal(60, 15)), 20, 98),
        fanSupport: clamp(Math.round(prestige * 0.7 + rng.normal(20, 10)), 10, 98),
        budget: {
          staff: Math.round(300 + prestige * 12),
          recruiting: Math.round(80 + prestige * 4),
          facilities: Math.round(100 + prestige * 6),
          support: Math.round(60 + prestige * 3),
        },
        nilPool: Math.round(prestige * prestige * 0.12),
        rosterIds: [],
        staffIds: [],
        headCoachId: null,
        strategy: { ...DEFAULT_STRATEGY },
        practice: { focus: 'balanced', intensity: 'normal' },
        depth: [],
        history: [],
        rival: null,
      };
      world.schools[school.id] = school;
      conf.schoolIds.push(school.id);
      fillRoster(world, rng, school);
      const coach = generateAICoach(world, rng, school.prestige * 0.6 + 25);
      school.headCoachId = coach.id;
      school.strategy = { ...coach.style };
      coach.contract = { schoolId: school.id, role: 'head', salary: Math.round(250 + school.prestige * 30), yearsLeft: rng.int(1, 5), buyout: 0, expectation: '', expectedWinPct: 0.5 };
      coach.history.push({ season: 0, schoolId: school.id, role: 'head', w: 0, l: 0, note: 'Hired before the game began' });
      for (let k = 0; k < 2; k++) school.staffIds.push(generateStaff(world, rng, school.prestige * 0.55 + 22, school.id).id);
      computeRoleExpectations(world, school.id);
      school.depth = autoDepth(world, school.id);
    }
    // Rivalries: pair neighbors by prestige
    const ids = [...conf.schoolIds];
    rng.shuffle(ids);
    for (let i = 0; i + 1 < ids.length; i += 2) {
      world.schools[ids[i]].rival = ids[i + 1];
      world.schools[ids[i + 1]].rival = ids[i];
    }
  }

  // The user's coach
  const ci = input.coach;
  const userCoach: Coach = {
    id: nextId(world, 'c'),
    first: ci.first || 'Pat',
    last: ci.last || 'Rivers',
    age: ci.age,
    background: ci.background,
    isUser: true,
    skills: { ...ci.skills },
    traits: [...ci.traits],
    reputation: 25,
    style: { ...ci.style },
    contract: null,
    security: 60,
    relationships: { players: 55, staff: 55, admin: 55, boosters: 50, network: 45 },
    history: [],
    careerW: 0,
    careerL: 0,
    titles: [],
  };
  world.coaches[userCoach.id] = userCoach;
  world.userCoachId = userCoach.id;

  // Free-agent staff pool
  for (let i = 0; i < 12; i++) generateStaff(world, rng, rng.int(30, 70), null);

  world.rng = rng.state();
  generateRecruitClass(world);
  buildSeasonSchedule(world);
  return world;
}

/** Programs that would hire the new coach for a starting role. */
export function startingJobOptions(world: World, role: 'head' | 'assistant'): string[] {
  const schools = Object.values(world.schools).sort((a, b) => a.prestige - b.prestige);
  if (role === 'head') {
    const pool = schools.slice(0, Math.max(3, Math.ceil(schools.length * 0.3)));
    return pool.slice(0, 4).map((s) => s.id);
  }
  const top = schools.slice(Math.floor(schools.length * 0.35), Math.floor(schools.length * 0.9));
  const step = Math.max(1, Math.floor(top.length / 4));
  return [0, 1, 2, 3].map((i) => top[Math.min(top.length - 1, i * step)].id).filter((v, i, a) => a.indexOf(v) === i);
}

export function expectationFor(prestige: number): { text: string; winPct: number } {
  if (prestige >= 80) return { text: 'Contend for the conference title and win in the national tournament', winPct: 0.72 };
  if (prestige >= 65) return { text: 'Finish in the conference top three and make the national tournament', winPct: 0.62 };
  if (prestige >= 50) return { text: 'Post a winning record and finish in the top half of the conference', winPct: 0.53 };
  if (prestige >= 35) return { text: 'Show steady improvement and compete in the conference tournament', winPct: 0.42 };
  return { text: 'Build a foundation: develop players and avoid the conference basement', winPct: 0.32 };
}

export function takeStartingJob(world: World, schoolId: string, role: 'head' | 'assistant') {
  const coach = world.coaches[world.userCoachId];
  const school = world.schools[schoolId];
  const rng = new Rng(world.rng);
  const exp = expectationFor(school.prestige);
  if (role === 'head') {
    // Previous coach moves to the free pool.
    const prev = school.headCoachId ? world.coaches[school.headCoachId] : null;
    if (prev) prev.contract = null;
    school.headCoachId = coach.id;
    school.strategy = { ...coach.style };
    coach.contract = { schoolId, role: 'head', salary: Math.round(180 + school.prestige * 12), yearsLeft: 4, buyout: 200, expectation: exp.text, expectedWinPct: exp.winPct };
    coach.reputation = clamp(Math.round(18 + school.prestige * 0.15), 10, 40);
  } else {
    coach.contract = { schoolId, role: 'assistant', salary: Math.round(90 + school.prestige * 3), yearsLeft: 2, buyout: 0, expectation: 'Run recruiting and player development for the head coach', expectedWinPct: exp.winPct };
    coach.reputation = clamp(Math.round(15 + school.prestige * 0.12), 10, 35);
  }
  coach.history.push({ season: world.season, schoolId, role, w: 0, l: 0, note: 'First job' });
  world.flags.started = true;
  world.recruitingPointsLeft = weeklyRecruitingPoints(world, schoolId);
  world.rng = rng.state();
  const head = school.headCoachId ? world.coaches[school.headCoachId] : null;
  world.inbox.unshift({
    id: nextId(world, 'm'),
    week: world.week,
    season: world.season,
    title: `Welcome to ${school.name}`,
    body:
      role === 'head'
        ? `The athletic director has handed you the keys. Expectation: ${exp.text}. Set your practice plan and lineup in Team, build a recruiting board in Recruiting, then advance to the first game.`
        : `${head ? head.first + ' ' + head.last : 'The head coach'} wants you running recruiting and player development. Lineups and game strategy belong to the head coach, but your recruiting classes and player growth will build your reputation toward a head job.`,
    kind: 'career',
    read: false,
  });
  world.transactions.push({ season: world.season, week: 0, kind: 'job', text: `${coach.first} ${coach.last} hired as ${role === 'head' ? 'head coach' : 'assistant coach'} at ${school.name}`, schoolId });
  void ovr;
}

export function userSchoolId(world: World): string | null {
  return world.coaches[world.userCoachId]?.contract?.schoolId ?? null;
}

export function isUserHead(world: World): boolean {
  return world.coaches[world.userCoachId]?.contract?.role === 'head';
}
