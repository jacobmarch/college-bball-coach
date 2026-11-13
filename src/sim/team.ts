import { clamp } from './rng';
import { isAvailable, ovr, ovrAt, ROLE_MINUTES } from './player';
import type { Player, Pos, World } from './types';
import { POSITIONS } from './types';
import type { TeamInputs } from './gamesim';
import { specialtyEdge } from './assistant';

export function roster(world: World, schoolId: string): Player[] {
  return world.schools[schoolId].rosterIds.map((id) => world.players[id]).filter(Boolean);
}

/** Best five covering positions, then bench by quality. Unavailable players go last. */
export function autoDepth(world: World, schoolId: string): string[] {
  const all = roster(world, schoolId);
  const avail = all.filter(isAvailable);
  const starters: Player[] = [];
  const remaining = new Set(avail);
  // Greedy: fill the slot where the best available option is strongest first.
  const slots: Pos[] = [...POSITIONS];
  while (slots.length && remaining.size) {
    let best: { p: Player; slot: Pos; v: number } | null = null;
    for (const slot of slots) {
      for (const p of remaining) {
        const fit = p.pos === slot ? 0 : p.pos2 === slot ? -3 : -9;
        const v = ovrAt(p, slot) + fit;
        if (!best || v > best.v) best = { p, slot, v };
      }
    }
    if (!best) break;
    starters.push(best.p);
    remaining.delete(best.p);
    slots.splice(slots.indexOf(best.slot), 1);
  }
  const order: Pos[] = ['PG', 'SG', 'SF', 'PF', 'C'];
  starters.sort((a, b) => order.indexOf(a.pos) - order.indexOf(b.pos));
  const bench = [...remaining].sort((a, b) => ovr(b) - ovr(a));
  const out = [...starters, ...bench, ...all.filter((p) => !isAvailable(p))];
  return out.map((p) => p.id);
}

export function depthOrder(world: World, schoolId: string): Player[] {
  const school = world.schools[schoolId];
  const ids = new Set(school.rosterIds);
  const ordered = school.depth.filter((id) => ids.has(id)).map((id) => world.players[id]);
  for (const id of school.rosterIds) if (!school.depth.includes(id)) ordered.push(world.players[id]);
  return ordered.filter(Boolean);
}

/** Overall team strength (0-100 scale). */
export function teamStrength(world: World, schoolId: string): number {
  const players = roster(world, schoolId).filter(isAvailable).map(ovr).sort((a, b) => b - a);
  const w = [1.2, 1.15, 1.1, 1.05, 1.0, 0.7, 0.55, 0.4, 0.2];
  let s = 0;
  let tw = 0;
  for (let i = 0; i < w.length; i++) {
    const v = players[i] ?? 30;
    s += v * w[i];
    tw += w[i];
  }
  return s / tw;
}

export function headCoach(world: World, schoolId: string) {
  const id = world.schools[schoolId].headCoachId;
  return id ? world.coaches[id] : null;
}

export function staffOf(world: World, schoolId: string) {
  return world.schools[schoolId].staffIds.map((id) => world.staff[id]).filter(Boolean);
}

/** The user (when an assistant) counts as a staff member at their school. */
export function staffSkill(world: World, schoolId: string, key: 'recruiting' | 'development' | 'tactics' | 'scouting'): number {
  const st = staffOf(world, schoolId).map((s) => s.skills[key]);
  const user = world.coaches[world.userCoachId];
  if (user?.contract?.schoolId === schoolId && user.contract.role !== 'head') {
    const map = { recruiting: user.skills.recruiting, development: user.skills.development, tactics: user.skills.tactics, scouting: user.skills.tactics };
    st.push(map[key]);
  }
  if (!st.length) return 35;
  st.sort((a, b) => b - a);
  return st[0] * 0.65 + (st[1] ?? st[0]) * 0.35;
}

export function chemistry(world: World, schoolId: string): { value: number; notes: string[] } {
  const players = roster(world, schoolId);
  if (!players.length) return { value: 0, notes: [] };
  const notes: string[] = [];
  const morale = players.reduce((s, p) => s + p.morale, 0) / players.length;
  let v = (morale - 60) / 80;
  const leader = players.filter((p) => p.personality.leadership >= 72 && p.year >= 3);
  if (leader.length) {
    v += 0.12;
    notes.push(`Leadership from ${leader.slice(0, 2).map((p) => p.last).join(' and ')}.`);
  } else notes.push('No clear veteran leader.');
  const unhappy = players.filter((p) => p.morale < 40);
  if (unhappy.length) {
    v -= unhappy.length * 0.06;
    notes.push(`${unhappy.length} unhappy player${unhappy.length > 1 ? 's' : ''} in the locker room.`);
  }
  const egos = players.filter((p) => p.personality.ego >= 78).length;
  if (egos >= 3) {
    v -= 0.1;
    notes.push('Several big egos competing for touches.');
  }
  notes.unshift(`Average morale ${Math.round(morale)}.`);
  return { value: clamp(v, -1, 1), notes };
}

export function practicePrep(world: World, schoolId: string): number {
  const school = world.schools[schoolId];
  const p = school.practice;
  let v = 0;
  if (p.focus === 'offense' || p.focus === 'defense' || p.focus === 'fundamentals') v += 0.2;
  if (p.focus === 'transition') v += 0.15;
  if (p.focus === 'rest') v -= 0.15;
  if (p.focus === 'conditioning') v -= 0.05;
  if (p.intensity === 'hard') v += 0.15;
  if (p.intensity === 'light') v -= 0.1;
  v += (staffSkill(world, schoolId, 'scouting') - 50) / 120;
  const hc = headCoach(world, schoolId);
  if (hc?.traits.includes('tactician')) v += 0.15;
  if (hc?.traits.includes('relationshipBuilder')) v -= 0.05;
  return clamp(v, -1, 1);
}

export function coachTactics(world: World, schoolId: string): number {
  const hc = headCoach(world, schoolId);
  const base = hc ? hc.skills.tactics * 0.6 + hc.skills.gameMgmt * 0.4 : 45;
  return base * 0.8 + staffSkill(world, schoolId, 'tactics') * 0.2;
}

export function teamInputs(world: World, schoolId: string): TeamInputs {
  const school = world.schools[schoolId];
  const players = depthOrder(world, schoolId).filter(isAvailable);
  const isUser = world.coaches[world.userCoachId]?.contract?.schoolId === schoolId;
  return {
    school,
    players,
    strategy: school.strategy,
    tactics: coachTactics(world, schoolId),
    prep: practicePrep(world, schoolId),
    chemistry: chemistry(world, schoolId).value,
    isUser,
    offSpec: specialtyEdge(world, schoolId, 'offense'),
    defSpec: specialtyEdge(world, schoolId, 'defense'),
  };
}

/** Minutes a player is likely to get given depth-chart slot. */
export function projectedRole(world: World, p: Player): { minutes: number; slot: number } {
  if (!p.schoolId) return { minutes: 0, slot: 99 };
  const order = depthOrder(world, p.schoolId).filter(isAvailable);
  const slot = order.findIndex((x) => x.id === p.id);
  const plan = [31, 30, 29, 28, 27, 17, 15, 12, 7, 4, 0, 0, 0, 0, 0];
  return { minutes: slot < 0 ? 0 : plan[slot] ?? 0, slot };
}

export function expectedMinutes(p: Player): number {
  return ROLE_MINUTES[p.roleExpect];
}

/** Players at a position by quality, for recruiting "playing time" credibility. */
export function depthAtPosition(world: World, schoolId: string, pos: Pos): Player[] {
  return roster(world, schoolId)
    .filter((p) => (p.pos === pos || p.pos2 === pos) && p.year < 4)
    .sort((a, b) => ovrAt(b, pos) - ovrAt(a, pos));
}
