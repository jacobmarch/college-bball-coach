import { clamp } from './rng';
import { nextId } from './player';
import type { Assignment, AssistantSpecialty, Coach, Player, World } from './types';
import { ASSISTANT_SPECIALTY_LABELS } from './types';

/*
 * Assistant careers. An assistant does not pick lineups, strategy, or practice; the head coach does.
 * Instead the assistant owns one specialty, receives an assignment in that area each season, and is
 * judged on it at season end. Good work raises reputation, which is the route to a head-coach job.
 */

export const ASSIGNMENT_BRIEFS: Record<AssistantSpecialty, { title: string; brief: string; target: string }> = {
  offense: {
    title: 'Run the offense',
    brief: 'Own the offensive install and the shot profile in practice.',
    target: 'Score at least 1 more point per game than the league average.',
  },
  defense: {
    title: 'Own the defense',
    brief: 'Teach the rotations and the help defense.',
    target: 'Allow at least 1 fewer point per game than the league average.',
  },
  recruiting: {
    title: 'Land a top prospect',
    brief: 'Work the board and close on a high-end recruit.',
    target: 'Get at least one three-star or better commitment this cycle.',
  },
  development: {
    title: 'Develop the roster',
    brief: 'Run individual development plans and skill work.',
    target: 'Get at least three players to gain 2 or more OVR in offseason development.',
  },
};

/** The user's specialty, but only while they are an assistant at this school. */
export function assistantSpecialty(world: World, schoolId: string): AssistantSpecialty | null {
  const c = world.coaches[world.userCoachId];
  if (!c?.contract || c.contract.role === 'head' || c.contract.schoolId !== schoolId) return null;
  return c.specialty ?? null;
}

/** Team edge from an offense or defense assistant, in the same units as the game engine's tactics edge. */
export function specialtyEdge(world: World, schoolId: string, side: 'offense' | 'defense'): number {
  if (assistantSpecialty(world, schoolId) !== side) return 0;
  const c = world.coaches[world.userCoachId];
  return 0.004 * clamp(c.skills.tactics / 55, 0.6, 1.4);
}

/** Pick the specialty that fits a coach's strongest skill. */
export function bestSpecialty(c: Coach): AssistantSpecialty {
  const options: [AssistantSpecialty, number][] = [
    ['recruiting', c.skills.recruiting],
    ['development', c.skills.development],
    ['offense', c.skills.tactics],
  ];
  options.sort((a, b) => b[1] - a[1]);
  return options[0][0];
}

/** Issue this season's assignment to the user, if they are an assistant. */
export function issueAssignment(world: World): Assignment | null {
  const c = world.coaches[world.userCoachId];
  if (!c.contract || c.contract.role === 'head') {
    c.assignment = null;
    return null;
  }
  const sp = c.specialty ?? (c.specialty = bestSpecialty(c));
  const s = world.schools[c.contract.schoolId];
  const hc = s.headCoachId ? world.coaches[s.headCoachId] : null;
  const b = ASSIGNMENT_BRIEFS[sp];
  c.assignment = { season: world.season, specialty: sp, title: b.title, brief: b.brief, target: b.target, status: 'open', note: '' };
  world.inbox.unshift({
    id: nextId(world, 'm'),
    week: world.week,
    season: world.season,
    title: `Assignment: ${b.title}`,
    body: `${hc ? `${hc.first} ${hc.last}` : 'The head coach'} gave you ${ASSISTANT_SPECIALTY_LABELS[sp].toLowerCase()} duties for ${world.season}. ${b.brief} Goal: ${b.target}`,
    kind: 'career',
    read: false,
  });
  return c.assignment;
}

interface Scoring {
  pf: number;
  pa: number;
  n: number;
}

function teamScoring(world: World, sid: string): Scoring {
  let pf = 0;
  let pa = 0;
  let n = 0;
  for (const g of world.games) {
    if (!g.played) continue;
    if (g.homeId === sid) {
      pf += g.homePts;
      pa += g.awayPts;
      n++;
    } else if (g.awayId === sid) {
      pf += g.awayPts;
      pa += g.homePts;
      n++;
    }
  }
  return { pf: n ? pf / n : 0, pa: n ? pa / n : 0, n };
}

function leaguePointsPerGame(world: World): number {
  let pts = 0;
  let n = 0;
  for (const g of world.games) {
    if (!g.played) continue;
    pts += g.homePts + g.awayPts;
    n++;
  }
  return n ? pts / (2 * n) : 0;
}

function finish(world: World, a: Assignment, met: boolean, note: string): string[] {
  const c = world.coaches[world.userCoachId];
  const sid = c.contract!.schoolId;
  a.status = met ? 'met' : 'missed';
  a.note = note;
  c.reputation = clamp(Math.round((c.reputation + (met ? 4 : -2)) * 10) / 10, 1, 99);
  c.relationships.staff = clamp(c.relationships.staff + (met ? 3 : -2), 0, 100);
  const s = world.schools[sid];
  const hc = s.headCoachId ? world.coaches[s.headCoachId] : null;
  const who = hc ? `${hc.first} ${hc.last}` : 'Your head coach';
  world.inbox.unshift({
    id: nextId(world, 'm'),
    week: world.week,
    season: world.season,
    title: met ? `Assignment met: ${a.title}` : `Assignment missed: ${a.title}`,
    body: `${note} ${who} ${met ? 'is pleased. Reputation +4.' : 'wants more next season. Reputation −2.'}`,
    kind: 'career',
    read: false,
  });
  return [`${met ? 'Assignment met' : 'Assignment missed'} (${a.title}): ${note}`];
}

function openAssignment(world: World, want?: AssistantSpecialty[]): Assignment | null {
  const c = world.coaches[world.userCoachId];
  const a = c.assignment;
  if (!a || a.status !== 'open' || a.season !== world.season || !c.contract || c.contract.role === 'head') return null;
  if (want && !want.includes(a.specialty)) return null;
  return a;
}

/** Season review: grade offense, defense, and recruiting assignments. */
export function gradeSeasonAssignment(world: World): string[] {
  const a = openAssignment(world, ['offense', 'defense', 'recruiting']);
  if (!a) return [];
  const sid = world.coaches[world.userCoachId].contract!.schoolId;
  if (a.specialty === 'recruiting') {
    const stars = Object.values(world.recruits).filter((r) => r.committedTo === sid && r.stars >= 3).length;
    return finish(world, a, stars >= 1, stars ? `${stars} three-star-or-better commitment${stars > 1 ? 's' : ''} this cycle.` : 'No three-star commitments this cycle.');
  }
  const mine = teamScoring(world, sid);
  if (!mine.n) return finish(world, a, false, 'No games were played.');
  const league = leaguePointsPerGame(world);
  if (a.specialty === 'offense') {
    return finish(world, a, mine.pf - league >= 1, `Scored ${mine.pf.toFixed(1)} per game against a league average of ${league.toFixed(1)}.`);
  }
  return finish(world, a, league - mine.pa >= 1, `Allowed ${mine.pa.toFixed(1)} per game against a league average of ${league.toFixed(1)}.`);
}

/** After offseason progression: grade the development assignment. */
export function gradeDevelopmentAssignment(world: World): string[] {
  const a = openAssignment(world, ['development']);
  if (!a) return [];
  const sid = world.coaches[world.userCoachId].contract!.schoolId;
  const roster: Player[] = world.schools[sid].rosterIds.map((id) => world.players[id]).filter(Boolean);
  const improved = roster.filter((p) => {
    const e = p.devHistory[p.devHistory.length - 1];
    return !!e && e.season === world.season && e.ovrAfter - e.ovrBefore >= 2;
  }).length;
  return finish(world, a, improved >= 3, `${improved} player${improved === 1 ? '' : 's'} gained 2 or more OVR in offseason development.`);
}
