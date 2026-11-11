import { Rng, clamp } from './rng';
import type { DevFocus, Player, RatingKey, World } from './types';
import { RATING_KEYS } from './types';
import { nextId, ovr, OVR_WEIGHTS, playerName, ROLE_MINUTES } from './player';
import { headCoach, staffSkill } from './team';

export const DEV_FOCUS_KEYS: Record<DevFocus, RatingKey[]> = {
  balanced: [],
  strength: ['ath', 'sta', 'reb'],
  shooting: ['sht'],
  ballSkills: ['bh', 'pas'],
  defense: ['pdef', 'idef'],
  decisions: ['iq', 'pas'],
  recovery: [],
};
export const DEV_FOCUS_LABELS: Record<DevFocus, string> = {
  balanced: 'Balanced',
  strength: 'Strength & conditioning',
  shooting: 'Shooting',
  ballSkills: 'Ball skills',
  defense: 'Defense',
  decisions: 'Decision-making',
  recovery: 'Recovery',
};

const PRACTICE_KEYS: Record<string, RatingKey[]> = {
  balanced: [],
  offense: ['sht', 'fin', 'pas'],
  defense: ['pdef', 'idef', 'reb'],
  transition: ['ath', 'bh'],
  fundamentals: ['iq', 'bh', 'pas', 'sht'],
  conditioning: ['sta', 'ath'],
  rest: [],
};

export function mpg(p: Player): number {
  return p.stats.g ? p.stats.min / p.stats.g : 0;
}

export function devMultiplier(world: World, p: Player): { mult: number; factors: string[] } {
  if (!p.schoolId) return { mult: 1, factors: [] };
  const school = world.schools[p.schoolId];
  const hc = headCoach(world, p.schoolId);
  const coachDev = hc?.skills.development ?? 50;
  const staffDev = staffSkill(world, p.schoolId, 'development');
  const minutes = mpg(p);
  const f: string[] = [];
  let m = 0.75;
  m += p.personality.workEthic / 220;
  f.push(`Work ethic ${p.personality.workEthic}${p.personality.workEthic >= 70 ? ' (+)' : p.personality.workEthic < 40 ? ' (−)' : ''}`);
  m += (coachDev - 50) / 220;
  m += (staffDev - 50) / 260;
  f.push(`Coaching/staff development ${Math.round(coachDev)}/${Math.round(staffDev)}`);
  m += (school.facilities - 50) / 320;
  if (school.facilities >= 70) f.push(`Facilities ${school.facilities} (+)`);
  m += clamp(minutes / 30, 0, 1.1) * 0.15;
  if (p.stats.g) f.push(`Played ${minutes.toFixed(1)} mpg`);
  if (hc?.traits.includes('developer')) {
    m += 0.15;
    f.push('Developer head coach (+)');
  }
  if (p.morale < 40) {
    m -= 0.08;
    f.push('Low morale (−)');
  }
  return { mult: clamp(m, 0.5, 1.6), factors: f };
}

function bump(p: Player, rng: Rng, focusKeys: RatingKey[], dir: 1 | -1) {
  const w = OVR_WEIGHTS[p.pos];
  const keys = RATING_KEYS;
  const weights = keys.map((k) => (w[k] ?? 0.02) + (focusKeys.includes(k) ? 0.22 : 0));
  const k = keys[rng.weighted(weights)];
  p.ratings[k] = clamp(p.ratings[k] + dir, 10, 99);
}

/** Injury healing, fatigue recovery, morale, academics, transfer risk. */
export function weeklyPlayerUpkeep(world: World) {
  const rng = new Rng(world.rng);
  const userSid = world.coaches[world.userCoachId]?.contract?.schoolId;
  const midseason = Math.round(world.regularWeeks / 2);
  const lastResult: Record<string, boolean> = {};
  for (const g of world.games) {
    if (g.week !== world.week || !g.played) continue;
    lastResult[g.homeId] = g.homePts > g.awayPts;
    lastResult[g.awayId] = g.awayPts > g.homePts;
  }
  for (const p of Object.values(world.players)) {
    if (!p.schoolId) continue;
    const school = world.schools[p.schoolId];
    const hc = headCoach(world, p.schoolId);
    const isUser = p.schoolId === userSid;
    if (p.injury) {
      p.injury.weeks -= 1;
      if (p.injury.weeks <= 0) {
        if (isUser) world.inbox.unshift({ id: nextId(world, 'm'), week: world.week, season: world.season, title: `${playerName(p)} cleared to play`, body: `${playerName(p)} has recovered from a ${p.injury.name.toLowerCase()}.`, kind: 'team', read: false });
        p.injury = null;
      }
    }
    const pr = school.practice;
    let rec = 20 + (pr.focus === 'rest' ? 14 : 0) + (pr.intensity === 'light' ? 6 : pr.intensity === 'hard' ? -7 : 0) + (p.devFocus === 'recovery' ? 6 : 0);
    if (hc?.traits.includes('motivator')) rec -= 2;
    p.fatigue = clamp(p.fatigue - rec, 0, 100);

    // Morale: minutes vs expectations, winning, promises, coach style
    const exp = ROLE_MINUTES[p.roleExpect];
    const m = mpg(p);
    let dm = 0;
    if (p.stats.g >= 2 && !p.redshirting && !p.injury) dm += clamp((m - exp) * 0.22, -2.6, 1.2);
    if (lastResult[p.schoolId] !== undefined) dm += lastResult[p.schoolId] ? 0.8 : -0.6;
    dm += (66 - p.morale) * 0.03;
    if (hc?.traits.includes('relationshipBuilder')) dm += 0.5;
    if (hc?.traits.includes('disciplinarian') && p.morale < 50) dm -= 0.5;
    if (p.promise && p.promise.season === world.season && p.stats.g >= 6) {
      const kept = p.promise.kind === 'starter' ? p.stats.gs / p.stats.g >= 0.6 : p.promise.kind === 'minutes' ? m >= 20 : true;
      if (!kept) {
        dm -= hc?.traits.includes('aggressiveRecruiter') ? 2.5 : 1.8;
        p.trust = clamp(p.trust - 1.5, 0, 100);
      } else p.trust = clamp(p.trust + 0.5, 0, 100);
    }
    p.morale = clamp(p.morale + dm, 0, 100);
    p.trust = clamp(p.trust + (p.morale - 55) * 0.01, 0, 100);

    // Academics
    const acad = (hc?.skills.academics ?? 50) * 0.6 + school.budget.support / 6;
    p.gpa = clamp(Math.round((p.gpa + rng.normal((acad - 55) / 4000 + (hc?.traits.includes('disciplinarian') ? 0.004 : 0), 0.03)) * 100) / 100, 1.2, 4.0);
    if (world.phase === 'regular' && world.week === midseason) {
      if (p.gpa < 2.0 && p.eligible) {
        p.eligible = false;
        if (isUser) world.inbox.unshift({ id: nextId(world, 'm'), week: world.week, season: world.season, title: `Academic ineligibility: ${playerName(p)}`, body: `${playerName(p)} (GPA ${p.gpa.toFixed(2)}) failed the midseason academic check and is ineligible for the rest of the season.`, kind: 'urgent', read: false });
      }
    }
    if (isUser && world.phase === 'regular' && world.week === midseason - 2 && p.gpa < 2.2 && p.eligible) {
      world.inbox.unshift({ id: nextId(world, 'm'), week: world.week, season: world.season, title: `Academic warning: ${playerName(p)}`, body: `${playerName(p)} has a ${p.gpa.toFixed(2)} GPA. The eligibility check is in two weeks. Lighter practice and a higher support budget help.`, kind: 'urgent', read: false });
    }
    computeTransferRisk(world, p);
  }
  world.rng = rng.state();
}

export function computeTransferRisk(world: World, p: Player) {
  const f: string[] = [];
  if (!p.schoolId || (p.year >= 4 && !p.redshirting)) {
    p.transferRisk = 0;
    p.transferFactors = p.year >= 4 ? ['Graduating senior'] : [];
    return;
  }
  const school = world.schools[p.schoolId];
  let r = 5;
  const exp = ROLE_MINUTES[p.roleExpect];
  const m = mpg(p);
  if (p.stats.g >= 3 && exp - m > 5 && !p.injury) {
    r += (exp - m) * 2.2;
    f.push(`Wants more minutes (${m.toFixed(1)} mpg, expects ~${exp})`);
  }
  if (p.morale < 50) {
    r += (50 - p.morale) * 0.9;
    f.push(`Low morale (${Math.round(p.morale)})`);
  }
  if (p.trust < 40) {
    r += (40 - p.trust) * 0.8;
    f.push(`Low trust in the staff (${Math.round(p.trust)})`);
  }
  if (p.promise && p.promise.season === world.season && p.stats.g >= 6) {
    const kept = p.promise.kind === 'starter' ? p.stats.gs / p.stats.g >= 0.6 : p.promise.kind === 'minutes' ? m >= 20 : true;
    if (!kept) {
      r += 22;
      f.push(`Broken promise (${p.promise.kind})`);
    }
  }
  if (p.region !== school.region && p.personality.loyalty < 45) {
    r += 7;
    f.push('Far from home');
  }
  const o = ovr(p);
  if (o >= 68 && school.prestige < 50) {
    r += (o - 64) * 1.6;
    f.push('Could move up to a bigger program');
  }
  r -= (p.personality.loyalty - 50) * 0.3;
  if (p.personality.loyalty >= 70) f.push(`Loyal (${p.personality.loyalty})`);
  p.transferRisk = Math.round(clamp(r, 0, 95));
  p.transferFactors = f;
}

/** Small in-season gains from practice focus and individual plans. */
export function weeklyDevelopment(world: World) {
  if (world.phase !== 'regular' && world.phase !== 'confTourney' && world.phase !== 'national') return;
  const rng = new Rng(world.rng);
  for (const p of Object.values(world.players)) {
    if (!p.schoolId) continue;
    if (p.injury) continue;
    const school = world.schools[p.schoolId];
    const gap = p.pot - ovr(p);
    if (gap <= 0) continue;
    const { mult } = devMultiplier(world, p);
    const intensity = school.practice.intensity === 'hard' ? 1.3 : school.practice.intensity === 'light' ? 0.7 : 1;
    const chance = clamp(0.06 * mult * intensity * (gap / 12) * (p.redshirting ? 1.3 : 1), 0, 0.35);
    if (rng.chance(chance)) {
      const keys = [...(PRACTICE_KEYS[school.practice.focus] ?? []), ...DEV_FOCUS_KEYS[p.devFocus]];
      bump(p, rng, keys, 1);
    }
    if (school.practice.focus === 'conditioning' && rng.chance(0.08)) p.ratings.sta = clamp(p.ratings.sta + 1, 10, 99);
  }
  world.rng = rng.state();
}

const RATES: Record<Player['devProfile'], number[]> = {
  early: [0.48, 0.38, 0.28, 0.22, 0.2],
  steady: [0.36, 0.36, 0.32, 0.26, 0.22],
  late: [0.22, 0.32, 0.42, 0.42, 0.3],
};

/** Main offseason development for one player. Returns the change in OVR. */
export function offseasonDevelop(world: World, p: Player, rng: Rng): number {
  const before = ovr(p);
  const gap = p.pot - before;
  const rate = RATES[p.devProfile][clamp(p.year - 1, 0, 4)];
  const { mult, factors } = devMultiplier(world, p);
  let growth = Math.max(0, gap) * rate * mult + rng.normal(0, 1.6);
  const plateau = rng.chance(0.1);
  if (plateau) growth *= 0.25;
  if (gap < 0) growth = Math.min(growth, 0.5);
  if (p.redshirting) growth += 0.8;
  const target = Math.round(before + growth);
  const focus = DEV_FOCUS_KEYS[p.devFocus];
  let guard = 0;
  while (ovr(p) < target && guard++ < 300) bump(p, rng, focus, 1);
  while (ovr(p) > target && guard++ < 600) bump(p, rng, [], -1);
  // Physical maturation
  if (p.year <= 2 && rng.chance(0.5)) p.weight += rng.int(2, 9);
  if (p.year === 1 && rng.chance(0.15)) p.height += 1;
  const after = ovr(p);
  const fx = [...factors];
  if (p.devFocus !== 'balanced') fx.push(`Focus: ${DEV_FOCUS_LABELS[p.devFocus]}`);
  if (plateau) fx.push('Plateau year');
  if (p.redshirting) fx.push('Redshirt year of practice (+)');
  p.devHistory.push({ season: world.season, ovrBefore: before, ovrAfter: after, factors: fx });
  return after - before;
}
