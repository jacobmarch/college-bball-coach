import type { RngState } from './rng';

export const SCHEMA_VERSION = 1;
export const GAME_VERSION = '0.1.0';

export type Pos = 'PG' | 'SG' | 'SF' | 'PF' | 'C';
export const POSITIONS: Pos[] = ['PG', 'SG', 'SF', 'PF', 'C'];

export type RatingKey = 'fin' | 'sht' | 'bh' | 'pas' | 'reb' | 'pdef' | 'idef' | 'ath' | 'sta' | 'iq';
export const RATING_KEYS: RatingKey[] = ['fin', 'sht', 'bh', 'pas', 'reb', 'pdef', 'idef', 'ath', 'sta', 'iq'];
export const RATING_LABELS: Record<RatingKey, string> = {
  fin: 'Finishing',
  sht: 'Shooting',
  bh: 'Ball handling',
  pas: 'Passing',
  reb: 'Rebounding',
  pdef: 'Perimeter D',
  idef: 'Interior D',
  ath: 'Athleticism',
  sta: 'Stamina',
  iq: 'Basketball IQ',
};
export type Ratings = Record<RatingKey, number>;

export interface Tendencies {
  /** 0 = lives at the rim, 100 = lives behind the arc */
  threeRate: number;
  drive: number;
  passRisk: number;
  defAgg: number;
  foul: number;
  transition: number;
  clutch: number;
}

export interface Personality {
  workEthic: number;
  ego: number;
  leadership: number;
  loyalty: number;
}

export type Role = 'star' | 'starter' | 'rotation' | 'bench';
export type DevFocus = 'balanced' | 'strength' | 'shooting' | 'ballSkills' | 'defense' | 'decisions' | 'recovery';
export type Origin = 'initial' | 'HS' | 'JUCO' | 'transfer' | 'walk-on';

export interface StatLine {
  g: number;
  gs: number;
  min: number;
  pts: number;
  fgm: number;
  fga: number;
  tpm: number;
  tpa: number;
  ftm: number;
  fta: number;
  orb: number;
  drb: number;
  ast: number;
  stl: number;
  blk: number;
  tov: number;
  pf: number;
}

export interface Injury {
  name: string;
  weeks: number;
}

export interface Promise_ {
  kind: 'starter' | 'minutes' | 'development';
  season: number;
  madeBy: string;
}

export interface DevEntry {
  season: number;
  ovrBefore: number;
  ovrAfter: number;
  factors: string[];
}

export interface Player {
  id: string;
  first: string;
  last: string;
  pos: Pos;
  pos2: Pos;
  height: number; // inches
  weight: number;
  region: string;
  hometown: string;
  schoolId: string | null;
  year: number; // 1..4 (eligibility seasons used, +1 for current)
  redshirtUsed: boolean;
  redshirting: boolean;
  ratings: Ratings;
  /** True potential ceiling (hidden). UI shows a scouted band. */
  pot: number;
  devProfile: 'early' | 'steady' | 'late';
  tendencies: Tendencies;
  personality: Personality;
  morale: number;
  trust: number;
  roleExpect: Role;
  devFocus: DevFocus;
  promise: Promise_ | null;
  gpa: number;
  eligible: boolean;
  injury: Injury | null;
  fatigue: number;
  scholarship: boolean;
  origin: Origin;
  stats: StatLine;
  career: { season: number; schoolId: string; stats: StatLine; ovr: number }[];
  devHistory: DevEntry[];
  awards: string[];
  /** Cached transfer pressure 0-100 with readable factors. */
  transferRisk: number;
  transferFactors: string[];
}

export type RecruitKind = 'HS' | 'JUCO';
export type PitchTopic = 'playingTime' | 'winning' | 'prestige' | 'facilities' | 'academics' | 'proximity' | 'development' | 'nil';
export const PITCH_LABELS: Record<PitchTopic, string> = {
  playingTime: 'Playing time',
  winning: 'Winning now',
  prestige: 'Program prestige',
  facilities: 'Facilities',
  academics: 'Academics',
  proximity: 'Close to home',
  development: 'Player development',
  nil: 'NIL opportunities',
};

export interface Recruit {
  id: string;
  player: Player; // the future player; ratings hidden behind scouting
  kind: RecruitKind;
  stars: number;
  rank: number;
  priorities: PitchTopic[]; // top 3, most important first
  /** Interest by school id (0-100). */
  interest: Record<string, number>;
  offers: string[];
  visited: string[];
  committedTo: string | null;
  signedWith: string | null;
  /** How well the user's staff has scouted this player (0-100). */
  scouted: number;
  /** Which priorities the user has discovered via contact. */
  knownPriorities: number;
  onBoard: boolean;
  /** Actions taken by the user this week, keyed by action. */
  weekActions: string[];
  log: string[];
}

export type StaffRole = 'assistant' | 'associate' | 'gradAssistant';
export type StaffSpecialty = 'offense' | 'defense' | 'recruiting' | 'development' | 'scouting';
export interface StaffMember {
  id: string;
  name: string;
  role: StaffRole;
  specialty: StaffSpecialty;
  skills: { recruiting: number; development: number; tactics: number; scouting: number };
  salary: number; // thousands per year
  age: number;
  ambition: number;
  schoolId: string | null;
  years: number;
}

export interface Strategy {
  pace: 'slow' | 'normal' | 'fast';
  offense: 'balanced' | 'perimeter' | 'inside' | 'motion' | 'pickAndRoll';
  defense: 'man' | 'zone' | 'press' | 'pack';
  focus: 'none' | 'denyStar' | 'protectPaint' | 'pressureBall' | 'crashBoards';
  /** Minutes distribution: tight = starters play more, deep = spread */
  rotation: 'tight' | 'normal' | 'deep';
}

export interface PracticePlan {
  focus: 'balanced' | 'offense' | 'defense' | 'transition' | 'fundamentals' | 'conditioning' | 'rest';
  intensity: 'light' | 'normal' | 'hard';
}

export interface Conference {
  id: string;
  name: string;
  abbr: string;
  tier: number; // 1 = power, 3 = low-major
  schoolIds: string[];
}

export interface SeasonRecord {
  season: number;
  w: number;
  l: number;
  cw: number;
  cl: number;
  coachId: string | null;
  finish: string;
  postseason: string;
}

export interface School {
  id: string;
  name: string;
  mascot: string;
  abbr: string;
  city: string;
  region: string;
  colors: [string, string];
  conferenceId: string;
  prestige: number;
  facilities: number;
  academics: number;
  fanSupport: number;
  budget: { staff: number; recruiting: number; facilities: number; support: number };
  nilPool: number;
  rosterIds: string[];
  staffIds: string[];
  headCoachId: string | null;
  strategy: Strategy;
  practice: PracticePlan;
  /** Ordered player ids; first five are starters. */
  depth: string[];
  history: SeasonRecord[];
  rival: string | null;
}

export type CoachRoleKind = 'gradAssistant' | 'assistant' | 'associate' | 'head';
export const ROLE_LABELS: Record<CoachRoleKind, string> = {
  gradAssistant: 'Graduate assistant',
  assistant: 'Assistant coach',
  associate: 'Associate head coach',
  head: 'Head coach',
};

export interface CoachSkills {
  recruiting: number;
  development: number;
  tactics: number;
  gameMgmt: number;
  relationships: number;
  academics: number;
  programBuilding: number;
}
export const COACH_SKILL_LABELS: Record<keyof CoachSkills, string> = {
  recruiting: 'Recruiting',
  development: 'Player development',
  tactics: 'Tactics',
  gameMgmt: 'Game management',
  relationships: 'Relationships',
  academics: 'Academics & compliance',
  programBuilding: 'Program building',
};

export type CoachTrait = 'developer' | 'tactician' | 'relationshipBuilder' | 'disciplinarian' | 'aggressiveRecruiter' | 'motivator';
export const TRAIT_INFO: Record<CoachTrait, { label: string; desc: string }> = {
  developer: { label: 'Developer', desc: '+15% player development; recruits value "development" pitches more from you. Recruiting contacts cost slightly more.' },
  tactician: { label: 'Tactician', desc: 'Better game prep and in-game adjustments. Players with big egos trust you a little slower.' },
  relationshipBuilder: { label: 'Relationship builder', desc: 'Morale and retention conversations go better. Slightly weaker game prep.' },
  disciplinarian: { label: 'Disciplinarian', desc: 'Fewer turnovers and fouls; academics improve. Morale falls faster when players are unhappy.' },
  aggressiveRecruiter: { label: 'Aggressive recruiter', desc: '+20% recruiting effort. Current players expect more from promises and notice when broken.' },
  motivator: { label: 'Motivator', desc: 'Bigger home-court and comeback bumps. Fatigue builds a bit faster under your intensity.' },
};

export interface Contract {
  schoolId: string;
  role: CoachRoleKind;
  salary: number; // thousands
  yearsLeft: number;
  buyout: number;
  expectation: string;
  expectedWinPct: number;
}

export interface CareerStop {
  season: number;
  schoolId: string;
  role: CoachRoleKind;
  w: number;
  l: number;
  note: string;
}

export interface Coach {
  id: string;
  first: string;
  last: string;
  age: number;
  background: string;
  isUser: boolean;
  skills: CoachSkills;
  traits: CoachTrait[];
  reputation: number;
  style: Strategy;
  contract: Contract | null;
  /** Board confidence 0-100 (only meaningful for head coaches). */
  security: number;
  relationships: { players: number; staff: number; admin: number; boosters: number; network: number };
  history: CareerStop[];
  careerW: number;
  careerL: number;
  titles: string[];
}

export interface PbpEvent {
  t: string; // clock display, e.g. "1H 12:34"
  text: string;
  home: number;
  away: number;
  key?: boolean;
}

export interface BoxLine extends StatLine {
  playerId: string;
  name: string;
  pos: Pos;
  starter: boolean;
}

export interface TeamBox {
  schoolId: string;
  pts: number;
  lines: BoxLine[];
  shots: { rimA: number; rimM: number; midA: number; midM: number; threeA: number; threeM: number };
  poss: number;
  fastBreak: number;
  benchPts: number;
  halves: number[];
}

export interface GameResult {
  home: TeamBox;
  away: TeamBox;
  ot: number;
  pbp: PbpEvent[];
  factors: string[];
  planReview: string[];
  seed: number;
}

export type GameKind = 'nonconf' | 'conf' | 'confTourney' | 'national' | 'exhibition';
export interface Game {
  id: string;
  week: number;
  homeId: string;
  awayId: string;
  neutral: boolean;
  kind: GameKind;
  label?: string;
  played: boolean;
  homePts: number;
  awayPts: number;
  /** Full detail stored only for the user's games. */
  result?: GameResult;
}

export interface InboxItem {
  id: string;
  week: number;
  season: number;
  title: string;
  body: string;
  kind: 'info' | 'urgent' | 'result' | 'recruiting' | 'career' | 'team';
  read: boolean;
}

export interface Transaction {
  season: number;
  week: number;
  kind: 'recruit' | 'transfer' | 'hire' | 'fire' | 'roster' | 'contract' | 'injury' | 'award' | 'job';
  text: string;
  schoolId?: string;
}

export type Phase = 'preseason' | 'regular' | 'confTourney' | 'national' | 'offseason';
export type OffseasonStep = 'review' | 'signing' | 'departures' | 'portal' | 'jobs' | 'staff' | 'progression' | 'ready';
export const OFFSEASON_STEPS: OffseasonStep[] = ['review', 'signing', 'departures', 'portal', 'jobs', 'staff', 'progression', 'ready'];
export const OFFSEASON_LABELS: Record<OffseasonStep, string> = {
  review: 'Season review',
  signing: 'Signing day',
  departures: 'Departures',
  portal: 'Transfer portal',
  jobs: 'Coaching carousel',
  staff: 'Staff changes',
  progression: 'Player development',
  ready: 'New season',
};

export interface Bracket {
  name: string;
  rounds: string[][]; // game ids per round
  seeds: Record<string, number>;
  championId: string | null;
  /** schoolIds still alive */
  alive: string[];
  field?: { schoolId: string; seed: number; how: 'auto' | 'at-large'; score: number }[];
}

export interface PortalEntry {
  playerId: string;
  fromSchoolId: string;
  reasons: string[];
  offers: string[];
  userInterest: number;
  decided: boolean;
}

export interface JobOpening {
  schoolId: string;
  role: CoachRoleKind;
  reason: string;
  applied: boolean;
  offered: boolean;
  rationale: string[];
  salary: number;
  years: number;
  expectation: string;
}

export interface Settings {
  seasonLength: 'short' | 'standard';
  difficulty: 'easy' | 'normal' | 'hard';
  gameMode: 'instant' | 'pbp' | 'coach';
  autoLineup: boolean;
  autoPractice: boolean;
  autoRecruit: boolean;
  explanations: 'compact' | 'expanded';
  reducedMotion: boolean;
  textScale: number;
}

export interface Award {
  season: number;
  name: string;
  playerId?: string;
  coachId?: string;
  schoolId: string;
  label: string;
}

export interface LeagueHistoryEntry {
  season: number;
  nationalChampion: string | null;
  confChampions: Record<string, string>; // conferenceId -> regular season champ
  confTourneyChampions: Record<string, string>;
  coachOfYear: string | null;
  playerOfYear: string | null;
  userRecord: string;
}

export interface World {
  id: string;
  name: string;
  schemaVersion: number;
  gameVersion: string;
  createdAt: number;
  seed: number;
  rng: RngState;
  settings: Settings;
  season: number;
  week: number;
  phase: Phase;
  offseasonStep: OffseasonStep;
  userCoachId: string;
  conferences: Record<string, Conference>;
  schools: Record<string, School>;
  players: Record<string, Player>;
  coaches: Record<string, Coach>;
  staff: Record<string, StaffMember>;
  recruits: Record<string, Recruit>;
  games: Game[];
  regularWeeks: number;
  brackets: { conf: Record<string, Bracket>; national: Bracket | null };
  rankings: { week: number; ids: string[] }[];
  inbox: InboxItem[];
  transactions: Transaction[];
  portal: PortalEntry[];
  jobs: JobOpening[];
  awards: Award[];
  history: LeagueHistoryEntry[];
  retentionMeetingsLeft: number;
  recruitingPointsLeft: number;
  nextId: number;
  offseasonReport: Partial<Record<OffseasonStep, string[]>>;
  /** Set by tutorials/onboarding. */
  flags: Record<string, boolean>;
}
