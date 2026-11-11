import { Rng, clamp } from './rng';
import { REGIONS } from './names';
import { generatePlayer, nextId, ovr, playerName } from './player';
import type { PitchTopic, Pos, Recruit, School, World } from './types';
import { PITCH_LABELS } from './types';
import { depthAtPosition, headCoach, roster, staffSkill, teamStrength } from './team';

export const MAX_SCHOLARSHIPS = 13;
const TOPICS: PitchTopic[] = ['playingTime', 'winning', 'prestige', 'facilities', 'academics', 'proximity', 'development', 'nil'];

export const ACTION_COSTS = { scout: 4, call: 2, pitch: 3, homeVisit: 8, campusVisit: 6 } as const;
export type RecruitAction = keyof typeof ACTION_COSTS | 'offer' | 'pull';

export function generateRecruitClass(world: World) {
  const rng = new Rng(world.rng);
  const schools = Object.values(world.schools);
  const nHS = Math.round(schools.length * 3.4);
  const nJ = Math.round(schools.length * 0.6);
  const list: Recruit[] = [];
  for (let i = 0; i < nHS + nJ; i++) {
    const juco = i >= nHS;
    // Talent tail: a few elite prospects, many projects.
    const u = rng.next();
    const quality = juco ? clamp(rng.normal(53, 6), 38, 72) : clamp(36 + 34 * Math.pow(u, 2.2) + rng.normal(0, 3), 30, 78);
    const p = generatePlayer(world, rng, { quality, year: juco ? 3 : 1, regions: REGIONS, schoolId: null });
    p.origin = juco ? 'JUCO' : 'HS';
    if (!juco) p.pot = clamp(Math.round(p.pot + rng.normal(3, 4)), 30, 99);
    const pri = rng.shuffle([...TOPICS]).slice(0, 3);
    list.push({
      id: nextId(world, 'r'),
      player: p,
      kind: juco ? 'JUCO' : 'HS',
      stars: 1,
      rank: 0,
      priorities: pri,
      interest: {},
      offers: [],
      visited: [],
      committedTo: null,
      signedWith: null,
      scouted: 10,
      knownPriorities: 0,
      onBoard: false,
      weekActions: [],
      log: [],
    });
  }
  const score = (r: Recruit) => ovr(r.player) * 0.6 + r.player.pot * 0.4;
  list.sort((a, b) => score(b) - score(a));
  list.forEach((r, i) => {
    const pctl = i / list.length;
    r.rank = i + 1;
    r.stars = pctl < 0.04 ? 5 : pctl < 0.16 ? 4 : pctl < 0.45 ? 3 : pctl < 0.78 ? 2 : 1;
    // AI pursuers: schools whose level matches
    const level = 100 - pctl * 100;
    const candidates = schools
      .map((s) => ({ s, d: Math.abs(s.prestige - level) + rng.range(0, 25) + (s.region === r.player.region ? -8 : 0) }))
      .sort((a, b) => a.d - b.d)
      .slice(0, rng.int(3, 6));
    for (const c of candidates) r.interest[c.s.id] = clamp(Math.round(fitScore(world, r, c.s) * 0.45 + rng.range(0, 10)), 1, 60);
    world.recruits[r.id] = r;
  });
  world.rng = rng.state();
}

/** How well a school scores on a recruiting topic (0-100). Honest, visible inputs. */
export function topicScore(world: World, r: Recruit, school: School, topic: PitchTopic): number {
  switch (topic) {
    case 'prestige':
      return school.prestige;
    case 'facilities':
      return school.facilities;
    case 'academics':
      return clamp(school.academics + (r.player.gpa - 3) * 15, 0, 100);
    case 'proximity':
      return school.region === r.player.region ? 95 : 30;
    case 'nil':
      return clamp(school.nilPool / 10, 0, 100);
    case 'development': {
      const hc = headCoach(world, school.id);
      return clamp((hc?.skills.development ?? 50) * 0.5 + staffSkill(world, school.id, 'development') * 0.3 + school.facilities * 0.2, 0, 100);
    }
    case 'winning': {
      const rec = school.history[school.history.length - 1];
      const games = world.games.filter((g) => g.played && (g.homeId === school.id || g.awayId === school.id));
      const wins = games.filter((g) => (g.homeId === school.id ? g.homePts > g.awayPts : g.awayPts > g.homePts)).length;
      const cur = games.length >= 4 ? (wins / games.length) * 100 : null;
      const last = rec ? (rec.w / Math.max(1, rec.w + rec.l)) * 100 : null;
      const str = (teamStrength(world, school.id) - 45) * 3;
      return clamp(cur ?? last ?? str, 0, 100);
    }
    case 'playingTime': {
      const ahead = depthAtPosition(world, school.id, r.player.pos as Pos).filter((p) => ovr(p) >= ovr(r.player) - 3).length;
      const committed = Object.values(world.recruits).filter((x) => x.committedTo === school.id && x.player.pos === r.player.pos && x.id !== r.id).length;
      return clamp(100 - (ahead + committed) * 28, 5, 100);
    }
  }
}

export function fitScore(world: World, r: Recruit, school: School): number {
  const w = [0.45, 0.33, 0.22];
  let s = 0;
  r.priorities.forEach((t, i) => (s += topicScore(world, r, school, t) * w[i]));
  const level = r.stars * 17;
  const gap = Math.max(0, level - school.prestige - 12) * 0.7;
  return clamp(s * 0.7 + school.prestige * 0.3 - gap, 0, 100);
}

export function openScholarships(world: World, schoolId: string): number {
  const school = world.schools[schoolId];
  const returning = roster(world, schoolId).filter((p) => p.scholarship && (p.year < 4 || p.redshirting)).length;
  const committed = Object.values(world.recruits).filter((r) => r.committedTo === schoolId || r.signedWith === schoolId).length;
  void school;
  return Math.max(0, MAX_SCHOLARSHIPS - returning - committed);
}

export function weeklyRecruitingPoints(world: World, schoolId: string): number {
  const school = world.schools[schoolId];
  const coach = world.coaches[world.userCoachId];
  let pts = 24 + school.budget.recruiting / 25 + staffSkill(world, schoolId, 'recruiting') * 0.15 + coach.skills.recruiting * 0.1;
  if (coach.traits.includes('aggressiveRecruiter')) pts *= 1.2;
  return Math.round(pts);
}

function effectiveness(world: World, r: Recruit, school: School): number {
  const coach = world.coaches[world.userCoachId];
  let eff = 0.65 + coach.skills.recruiting / 250 + staffSkill(world, school.id, 'recruiting') / 330;
  const level = r.stars * 17;
  const gap = Math.max(0, level - school.prestige - 10);
  eff *= clamp(1 - gap / 70, 0.25, 1.1);
  if (world.settings.difficulty === 'easy') eff *= 1.15;
  if (world.settings.difficulty === 'hard') eff *= 0.88;
  return eff;
}

export interface ActionResult {
  ok: boolean;
  message: string;
}

export function recruitAction(world: World, recruitId: string, action: RecruitAction, topic?: PitchTopic): ActionResult {
  const r = world.recruits[recruitId];
  const coach = world.coaches[world.userCoachId];
  const schoolId = coach.contract?.schoolId;
  if (!r || !schoolId) return { ok: false, message: 'No active job.' };
  const school = world.schools[schoolId];
  if (r.signedWith) return { ok: false, message: `${playerName(r.player)} has already signed.` };
  if (action === 'pull') {
    r.offers = r.offers.filter((s) => s !== schoolId);
    r.interest[schoolId] = clamp((r.interest[schoolId] ?? 0) - 15, 0, 100);
    if (r.committedTo === schoolId) r.committedTo = null;
    r.log.unshift(`Week ${world.week}: you pulled your offer.`);
    return { ok: true, message: 'Offer pulled. He will not forget it.' };
  }
  if (action === 'offer') {
    if (r.offers.includes(schoolId)) return { ok: false, message: 'Already offered.' };
    if (openScholarships(world, schoolId) <= 0 && r.committedTo !== schoolId) {
      // Allow over-offering a little; you can only sign what you have room for.
      const outstanding = Object.values(world.recruits).filter((x) => x.offers.includes(schoolId) && !x.committedTo && !x.signedWith).length;
      if (outstanding >= 4) return { ok: false, message: 'No scholarships projected open and you already have 4 outstanding offers.' };
    }
    r.offers.push(schoolId);
    r.interest[schoolId] = clamp((r.interest[schoolId] ?? 0) + 6, 0, 100);
    r.onBoard = true;
    r.log.unshift(`Week ${world.week}: scholarship offer from ${school.name}.`);
    return { ok: true, message: `Scholarship offered to ${playerName(r.player)}.` };
  }
  const cost = ACTION_COSTS[action];
  if (r.weekActions.includes(action)) return { ok: false, message: 'Already done this week.' };
  if (world.recruitingPointsLeft < cost) return { ok: false, message: `Not enough recruiting hours (${cost} needed).` };
  if (action === 'campusVisit' && r.visited.includes(schoolId)) return { ok: false, message: 'He has already visited campus.' };
  if (action === 'homeVisit' && r.log.filter((l) => l.includes('home visit')).length >= 2)
    return { ok: false, message: 'Two home visits is the limit.' };
  world.recruitingPointsLeft -= cost;
  r.weekActions.push(action);
  r.onBoard = true;
  const eff = effectiveness(world, r, school);
  const cur = r.interest[schoolId] ?? 0;
  const diminish = 1 - cur / 140;
  let msg = '';
  let gain = 0;
  if (action === 'scout') {
    const g = 14 + staffSkill(world, schoolId, 'scouting') * 0.15;
    r.scouted = clamp(r.scouted + g, 0, 100);
    msg = `Scouting report updated: confidence now ${Math.round(r.scouted)}%.`;
  } else if (action === 'call') {
    gain = 2.5 * eff * diminish;
    if (r.knownPriorities < 3) {
      r.knownPriorities += 1;
      msg = `Good call. He mentioned that ${PITCH_LABELS[r.priorities[r.knownPriorities - 1]].toLowerCase()} matters to him.`;
    } else msg = 'Good conversation; the relationship is growing.';
  } else if (action === 'pitch' && topic) {
    const idx = r.priorities.indexOf(topic);
    const ts = topicScore(world, r, school, topic);
    const weight = idx === 0 ? 6 : idx === 1 ? 4.5 : idx === 2 ? 3 : 0.6;
    const credibility = (ts - 40) / 40; // a pitch you can't back up hurts
    gain = weight * credibility * eff * diminish;
    if (coach.traits.includes('developer') && topic === 'development') gain *= 1.3;
    if (idx < 0) msg = `He listened politely, but ${PITCH_LABELS[topic].toLowerCase()} isn't high on his list.`;
    else if (credibility < 0) msg = `Your ${PITCH_LABELS[topic].toLowerCase()} pitch rang hollow (your score ${Math.round(ts)}/100). Interest dropped.`;
    else msg = `Your ${PITCH_LABELS[topic].toLowerCase()} pitch landed (your score ${Math.round(ts)}/100).`;
    if (idx >= 0 && r.knownPriorities < idx + 1) r.knownPriorities = idx + 1;
  } else if (action === 'homeVisit') {
    gain = 8 * eff * diminish;
    msg = 'The home visit went well.';
    r.log.unshift(`Week ${world.week}: home visit by ${coach.first} ${coach.last}.`);
  } else if (action === 'campusVisit') {
    gain = (10 + school.facilities / 10) * eff * diminish;
    r.visited.push(schoolId);
    msg = `Campus visit complete. Facilities (${school.facilities}) and fan support made an impression.`;
  }
  r.interest[schoolId] = clamp(cur + gain, 0, 100);
  if (gain) msg += ` Interest ${gain >= 0 ? '+' : ''}${gain.toFixed(1)}.`;
  return { ok: true, message: msg };
}

/** AI recruiting and commitments; called once per week. */
export function weeklyRecruiting(world: World, totalWeeks: number) {
  const rng = new Rng(world.rng);
  const userSchool = world.coaches[world.userCoachId]?.contract?.schoolId ?? null;
  const userIsHead = world.coaches[world.userCoachId]?.contract?.role === 'head';
  const autoUser = userSchool && world.settings.autoRecruit;
  const open: Record<string, number> = {};
  for (const id of Object.keys(world.schools)) open[id] = openScholarships(world, id);
  const progress = clamp(world.week / Math.max(1, totalWeeks), 0, 1);

  for (const r of Object.values(world.recruits)) {
    r.weekActions = [];
    if (r.signedWith || r.committedTo) continue;
    for (const sid of Object.keys(r.interest)) {
      if (sid === userSchool && !autoUser) {
        // Slow decay without contact
        r.interest[sid] = clamp(r.interest[sid] - 0.6, 0, 100);
        continue;
      }
      const s = world.schools[sid];
      const hc = headCoach(world, sid);
      const fit = fitScore(world, r, s);
      const target = fit * 0.95;
      const effort = (hc ? hc.skills.recruiting : 50) / 60;
      const step = (target - r.interest[sid]) * 0.08 + rng.range(0.5, 2.6) * effort;
      r.interest[sid] = clamp(r.interest[sid] + step, 0, 100);
      const diffMult = sid !== userSchool && world.settings.difficulty === 'hard' ? 1.08 : world.settings.difficulty === 'easy' ? 0.95 : 1;
      r.interest[sid] = clamp(r.interest[sid] * (step > 0 ? diffMult : 1), 0, 100);
      if (!r.offers.includes(sid) && r.interest[sid] > 30 && open[sid] > 0 && rng.chance(0.25)) {
        r.offers.push(sid);
        r.log.unshift(`Week ${world.week}: offer from ${s.name}.`);
      }
    }
    // Commitment check among offers
    const offers = r.offers.filter((sid) => r.interest[sid] !== undefined);
    if (!offers.length) continue;
    const sorted = offers.map((sid) => ({ sid, v: r.interest[sid] })).sort((a, b) => b.v - a.v);
    const lead = sorted[0];
    const second = sorted[1]?.v ?? 0;
    if (lead.v >= 62 && lead.v - second >= 10 && open[lead.sid] > 0 && rng.chance(0.12 + progress * 0.3)) {
      r.committedTo = lead.sid;
      open[lead.sid] -= 1;
      const s = world.schools[lead.sid];
      r.log.unshift(`Week ${world.week}: committed to ${s.name}.`);
      if (lead.sid === userSchool) {
        world.inbox.unshift({
          id: nextId(world, 'm'),
          week: world.week,
          season: world.season,
          title: `Commitment: ${playerName(r.player)}`,
          body: `${r.stars}★ ${r.player.pos} ${playerName(r.player)} (${r.player.hometown}) has committed to ${s.name}.`,
          kind: 'recruiting',
          read: false,
        });
      } else if (r.onBoard && userSchool) {
        world.inbox.unshift({
          id: nextId(world, 'm'),
          week: world.week,
          season: world.season,
          title: `${playerName(r.player)} commits elsewhere`,
          body: `${r.stars}★ ${r.player.pos} ${playerName(r.player)} committed to ${s.name}. Your interest: ${Math.round(r.interest[userSchool] ?? 0)}, theirs: ${Math.round(lead.v)}.`,
          kind: 'recruiting',
          read: false,
        });
      }
    }
  }
  // Auto recruiting for the user's school when delegated (or when the user is an assistant with auto on)
  if (userSchool && autoUser) {
    void userIsHead;
    const us = world.schools[userSchool];
    const pool = Object.values(world.recruits).filter((r) => !r.signedWith && !r.committedTo);
    const tracked = pool.filter((r) => r.interest[userSchool] !== undefined).length;
    const want = open[userSchool] * 3 + 2;
    if (tracked < want) {
      const fresh = pool
        .filter((r) => r.interest[userSchool] === undefined)
        .map((r) => ({ r, v: fitScore(world, r, us) - Math.abs(r.stars * 17 - us.prestige) * 0.5 }))
        .sort((a, b) => b.v - a.v)
        .slice(0, want - tracked);
      for (const { r } of fresh) {
        r.interest[userSchool] = clamp(fitScore(world, r, us) * 0.4, 1, 50);
        r.onBoard = true;
      }
    }
  }
  world.rng = rng.state();
}

export interface SigningSummary {
  signed: { recruitId: string; schoolId: string }[];
  userLines: string[];
}

/** Signing day: commitments become signatures; others choose; leftovers go elsewhere. */
export function signingDay(world: World): SigningSummary {
  const rng = new Rng(world.rng);
  const userSchool = world.coaches[world.userCoachId]?.contract?.schoolId ?? null;
  const open: Record<string, number> = {};
  for (const id of Object.keys(world.schools)) open[id] = openScholarships(world, id);
  const out: SigningSummary = { signed: [], userLines: [] };
  const recruits = Object.values(world.recruits).sort((a, b) => a.rank - b.rank);
  for (const r of recruits) {
    if (r.committedTo) {
      r.signedWith = r.committedTo;
      out.signed.push({ recruitId: r.id, schoolId: r.committedTo });
      continue;
    }
    const choices = r.offers.filter((sid) => open[sid] > 0).map((sid) => ({ sid, v: (r.interest[sid] ?? 0) + rng.range(0, 6) })).sort((a, b) => b.v - a.v);
    if (choices.length) {
      const pick = choices[0].sid;
      r.signedWith = pick;
      r.committedTo = pick;
      open[pick] -= 1;
      out.signed.push({ recruitId: r.id, schoolId: pick });
    }
  }
  // AI schools fill remaining slots from the leftover pool (best fit first).
  const leftovers = recruits.filter((r) => !r.signedWith);
  for (const s of Object.values(world.schools).sort((a, b) => b.prestige - a.prestige)) {
    if (s.id === userSchool) continue;
    while (open[s.id] > 0 && leftovers.length) {
      let bestIdx = 0;
      let best = -1;
      for (let i = 0; i < Math.min(leftovers.length, 40); i++) {
        const v = fitScore(world, leftovers[i], s) + rng.range(0, 10);
        if (v > best) {
          best = v;
          bestIdx = i;
        }
      }
      const r = leftovers.splice(bestIdx, 1)[0];
      r.signedWith = s.id;
      r.committedTo = s.id;
      open[s.id] -= 1;
      out.signed.push({ recruitId: r.id, schoolId: s.id });
    }
  }
  // Explain the user's board
  if (userSchool) {
    for (const r of recruits.filter((x) => x.onBoard)) {
      const mine = Math.round(r.interest[userSchool] ?? 0);
      if (r.signedWith === userSchool) {
        out.userLines.push(`Signed ${r.stars}★ ${r.player.pos} ${playerName(r.player)} — your interest ${mine}. Key priority: ${PITCH_LABELS[r.priorities[0]]}.`);
      } else if (r.signedWith) {
        const other = world.schools[r.signedWith];
        const theirs = Math.round(r.interest[r.signedWith] ?? 0);
        const t = r.priorities[0];
        const myScore = Math.round(topicScore(world, r, world.schools[userSchool], t));
        const theirScore = Math.round(topicScore(world, r, other, t));
        const offered = r.offers.includes(userSchool) ? '' : ' You never offered a scholarship.';
        out.userLines.push(
          `Lost ${r.stars}★ ${playerName(r.player)} to ${other.name}: interest ${theirs} vs your ${mine}. His top priority, ${PITCH_LABELS[t].toLowerCase()}, scored ${theirScore} there vs ${myScore} with you.${offered}`,
        );
      } else {
        out.userLines.push(`${playerName(r.player)} went unsigned (no offer he accepted).`);
      }
    }
  }
  world.rng = rng.state();
  return out;
}
