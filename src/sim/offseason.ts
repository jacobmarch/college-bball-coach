import { Rng, clamp } from './rng';
import type { OffseasonStep, Player, PortalEntry, Promise_, StaffMember, World } from './types';
import { OFFSEASON_STEPS } from './types';
import { computeRoleExpectations, emptyStats, generatePlayer, nextId, ovr, playerName } from './player';
import { REGIONS } from './names';
import { MAX_SCHOLARSHIPS, generateRecruitClass, signingDay, weeklyRecruitingPoints } from './recruiting';
import { buildSeasonSchedule, updateRankings } from './season';
import { autoDepth, headCoach, roster, staffOf } from './team';
import { computeTransferRisk, offseasonDevelop } from './development';
import { acceptJob as acceptJobInner, applyForJob, assistantOpenings, boardReview, runCarousel, unsolicitedOffers, userCoach } from './career';
import { generateStaff } from './generate';

export function userSchool(world: World): string | null {
  return userCoach(world).contract?.schoolId ?? null;
}

export function scholarshipCount(world: World, schoolId: string): number {
  return roster(world, schoolId).filter((p) => p.scholarship).length;
}

function nextStep(step: OffseasonStep): OffseasonStep {
  return OFFSEASON_STEPS[Math.min(OFFSEASON_STEPS.length - 1, OFFSEASON_STEPS.indexOf(step) + 1)];
}

/** What blocks the user from continuing, if anything. */
export function offseasonBlocker(world: World): string | null {
  const sid = userSchool(world);
  if (world.offseasonStep === 'ready' && sid) {
    const n = scholarshipCount(world, sid);
    if (n > MAX_SCHOLARSHIPS) return `You have ${n} scholarship players; the limit is ${MAX_SCHOLARSHIPS}. Release or convert players in Team before starting the season.`;
  }
  if (world.offseasonStep === 'jobs' && !sid) return 'You are unemployed. Accept one of your job offers below to continue.';
  return null;
}

/** Perform the transition out of the current offseason step. */
export function offseasonContinue(world: World) {
  const step = world.offseasonStep;
  const rep = world.offseasonReport;
  switch (step) {
    case 'review': {
      rep.review = boardReview(world);
      world.offseasonStep = 'signing';
      rep.signing = signingDay(world).userLines;
      if (!rep.signing.length) rep.signing = ['You had no recruits on your board this year.'];
      break;
    }
    case 'signing': {
      rep.departures = departures(world);
      world.offseasonStep = 'departures';
      break;
    }
    case 'departures': {
      openPortal(world);
      world.offseasonStep = 'portal';
      break;
    }
    case 'portal': {
      rep.portal = resolvePortal(world);
      world.offseasonStep = 'jobs';
      if (userCoach(world).contract?.role !== 'head') assistantOpenings(world);
      unsolicitedOffers(world);
      if (!userSchool(world)) {
        // Someone always gives a dismissed coach a chance to rebuild.
        for (const j of world.jobs.filter((x) => x.role === 'assistant').slice(0, 2)) {
          j.applied = true;
          j.offered = true;
          j.rationale = ['An old colleague vouched for you.'];
        }
      }
      break;
    }
    case 'jobs': {
      rep.jobs = runCarousel(world);
      world.jobs = [];
      staffTurnover(world);
      world.offseasonStep = 'staff';
      break;
    }
    case 'staff': {
      fillAIStaff(world);
      rep.progression = progression(world);
      world.offseasonStep = 'progression';
      break;
    }
    case 'progression': {
      world.offseasonStep = 'ready';
      break;
    }
    case 'ready': {
      startNewSeason(world);
      return;
    }
  }
  void nextStep;
}

// ---------------------------------------------------------------- departures

function removePlayer(world: World, p: Player) {
  if (p.schoolId) {
    const s = world.schools[p.schoolId];
    s.rosterIds = s.rosterIds.filter((id) => id !== p.id);
    s.depth = s.depth.filter((id) => id !== p.id);
  }
  p.schoolId = null;
}

function departures(world: World): string[] {
  const rng = new Rng(world.rng);
  const sid = userSchool(world);
  const lines: string[] = [];
  for (const p of Object.values(world.players)) {
    if (!p.schoolId) continue;
    const mine = p.schoolId === sid;
    if (p.year >= 4 && !p.redshirting) {
      if (mine) lines.push(`${playerName(p)} (${p.pos}, ${ovr(p)} OVR) graduates.`);
      removePlayer(world, p);
      delete world.players[p.id];
      continue;
    }
    const o = ovr(p);
    if (p.year >= 2 && o >= 76 && rng.chance(clamp((o - 74) * 0.09, 0, 0.85))) {
      if (mine) lines.push(`${playerName(p)} (${o} OVR) declares for the pro ranks.`);
      world.transactions.push({ season: world.season, week: world.week, kind: 'roster', text: `${playerName(p)} (${world.schools[p.schoolId].abbr}) turns pro`, schoolId: p.schoolId });
      removePlayer(world, p);
      delete world.players[p.id];
      continue;
    }
    if (p.redshirting) {
      p.redshirting = false;
      p.redshirtUsed = true;
    } else p.year += 1;
    if (p.promise && p.promise.season < world.season + 1) p.promise = null;
  }
  // Old recruits that never signed disappear; signed ones remain until progression.
  for (const r of Object.values(world.recruits)) if (!r.signedWith) delete world.recruits[r.id];
  world.rng = rng.state();
  if (!lines.length) lines.push('No graduations or early departures on your roster.');
  return lines;
}

// ---------------------------------------------------------------- portal

function openPortal(world: World) {
  const rng = new Rng(world.rng);
  const sid = userSchool(world);
  world.portal = [];
  const hc = sid ? headCoach(world, sid) : null;
  world.retentionMeetingsLeft = 3 + (hc?.isUser && hc.skills.relationships >= 65 ? 1 : 0) + (hc?.traits.includes('relationshipBuilder') ? 1 : 0);
  for (const p of Object.values(world.players)) {
    if (!p.schoolId) continue;
    computeTransferRisk(world, p);
    const roll = rng.next() * 100;
    if (roll < p.transferRisk * 0.75) {
      const entry: PortalEntry = { playerId: p.id, fromSchoolId: p.schoolId, reasons: [...p.transferFactors], offers: [], userInterest: 0, decided: false };
      world.portal.push(entry);
      if (p.schoolId !== sid) removePlayer(world, p);
    }
  }
  world.rng = rng.state();
}

export function retentionChance(world: World, playerId: string, promise: Promise_['kind'] | 'listen'): number {
  const p = world.players[playerId];
  const c = userCoach(world);
  let ch = 0.3 + p.trust / 220 + c.skills.relationships / 260 - p.transferRisk / 260;
  if (promise === 'starter') ch += 0.32;
  if (promise === 'minutes') ch += 0.22;
  if (promise === 'development') ch += c.traits.includes('developer') ? 0.22 : 0.12;
  if (c.traits.includes('relationshipBuilder')) ch += 0.08;
  if (p.personality.loyalty >= 65) ch += 0.08;
  return clamp(ch, 0.05, 0.95);
}

export function retentionMeeting(world: World, playerId: string, promise: Promise_['kind'] | 'listen'): string {
  const entry = world.portal.find((e) => e.playerId === playerId && !e.decided);
  if (!entry) return 'He is not considering a transfer.';
  if (world.retentionMeetingsLeft <= 0) return 'No meetings left this offseason.';
  world.retentionMeetingsLeft -= 1;
  const rng = new Rng(world.rng);
  const ch = retentionChance(world, playerId, promise);
  const p = world.players[playerId];
  const stays = rng.chance(ch);
  world.rng = rng.state();
  if (stays) {
    world.portal = world.portal.filter((e) => e !== entry);
    if (promise !== 'listen') p.promise = { kind: promise, season: world.season + 1, madeBy: world.userCoachId };
    p.morale = clamp(p.morale + 12, 0, 100);
    p.trust = clamp(p.trust + 8, 0, 100);
    return `${playerName(p)} is staying.${promise !== 'listen' ? ` You promised: ${promise === 'starter' ? 'a starting role' : promise === 'minutes' ? '20+ minutes a game' : 'a dedicated development plan'}. He will hold you to it.` : ''}`;
  }
  entry.decided = true;
  return `${playerName(p)} thanked you but is still entering the portal (${Math.round(ch * 100)}% chance).`;
}

export function portalFit(world: World, playerId: string, schoolId: string): number {
  const p = world.players[playerId];
  const s = world.schools[schoolId];
  const same = roster(world, schoolId).filter((x) => x.pos === p.pos && ovr(x) >= ovr(p) - 2).length;
  const pt = clamp(100 - same * 30, 5, 100);
  const c = s.headCoachId ? world.coaches[s.headCoachId] : null;
  return Math.round(s.prestige * 0.4 + pt * 0.4 + (s.region === p.region ? 15 : 3) + (c ? c.reputation * 0.1 : 0));
}

export function openSlotsNow(world: World, schoolId: string): number {
  const signed = Object.values(world.recruits).filter((r) => r.signedWith === schoolId).length;
  const portalIn = world.portal.filter((e) => e.offers.includes(schoolId) && e.fromSchoolId !== schoolId).length;
  const leaving = world.portal.filter((e) => e.fromSchoolId === schoolId && e.decided).length;
  return MAX_SCHOLARSHIPS - scholarshipCount(world, schoolId) - signed + leaving - (schoolId === userSchool(world) ? portalIn : 0);
}

export function portalOffer(world: World, playerId: string): string {
  const sid = userSchool(world);
  if (!sid) return 'No job.';
  const e = world.portal.find((x) => x.playerId === playerId);
  if (!e) return 'Not in the portal.';
  if (e.fromSchoolId === sid) return 'That is your own player.';
  if (e.offers.includes(sid)) {
    e.offers = e.offers.filter((x) => x !== sid);
    return 'Offer withdrawn.';
  }
  if (openSlotsNow(world, sid) <= 0) return 'No open scholarships. Release a player or withdraw another offer first.';
  e.offers.push(sid);
  e.userInterest = portalFit(world, playerId, sid);
  return `Offer made to ${playerName(world.players[playerId])}. His fit score with you: ${e.userInterest}.`;
}

function resolvePortal(world: World): string[] {
  const rng = new Rng(world.rng);
  const sid = userSchool(world);
  const lines: string[] = [];
  // User's undecided intents still leave unless retained.
  for (const e of world.portal) {
    const p = world.players[e.playerId];
    if (p.schoolId && p.schoolId === sid) {
      lines.push(`${playerName(p)} entered the transfer portal (${e.reasons.join('; ') || 'personal reasons'}).`);
      removePlayer(world, p);
    }
    e.decided = true;
  }
  // AI schools make offers by need
  const open: Record<string, number> = {};
  for (const id of Object.keys(world.schools)) {
    const signed = Object.values(world.recruits).filter((r) => r.signedWith === id).length;
    open[id] = MAX_SCHOLARSHIPS - scholarshipCount(world, id) - signed;
  }
  const entries = [...world.portal].sort((a, b) => ovr(world.players[b.playerId]) - ovr(world.players[a.playerId]));
  for (const e of entries) {
    const p = world.players[e.playerId];
    const candidates = Object.values(world.schools)
      .filter((s) => s.id !== e.fromSchoolId && s.id !== sid && open[s.id] > 0)
      .map((s) => ({ s, fit: portalFit(world, p.id, s.id) + rng.range(0, 15) - Math.abs(s.prestige - (ovr(p) - 40) * 2.2) * 0.4 }))
      .sort((a, b) => b.fit - a.fit)
      .slice(0, 3);
    for (const c of candidates) if (!e.offers.includes(c.s.id)) e.offers.push(c.s.id);
    // Decide
    const choices = e.offers.filter((x) => x === sid ? openSlotsNow(world, sid) + 1 > 0 : open[x] > 0).map((x) => ({ x, v: portalFit(world, p.id, x) + rng.range(0, 12) }));
    choices.sort((a, b) => b.v - a.v);
    const pick = choices[0]?.x;
    if (pick) {
      const s = world.schools[pick];
      p.schoolId = pick;
      s.rosterIds.push(p.id);
      p.origin = 'transfer';
      p.trust = 50;
      p.morale = 70;
      p.promise = null;
      open[pick] -= 1;
      world.transactions.push({ season: world.season, week: world.week, kind: 'transfer', text: `${playerName(p)} transfers from ${world.schools[e.fromSchoolId].abbr} to ${s.abbr}`, schoolId: pick });
      if (pick === sid) lines.push(`Signed transfer ${playerName(p)} (${p.pos}, ${ovr(p)} OVR) from ${world.schools[e.fromSchoolId].name}.`);
      else if (e.offers.includes(sid ?? '')) lines.push(`Transfer target ${playerName(p)} chose ${s.name} over you.`);
      else if (e.fromSchoolId === sid) lines.push(`${playerName(p)} landed at ${s.name}.`);
    } else {
      if (e.fromSchoolId === sid) lines.push(`${playerName(p)} found no new home and left basketball.`);
      delete world.players[p.id];
    }
  }
  world.portal = [];
  world.rng = rng.state();
  if (!lines.length) lines.push('A quiet portal for your program.');
  return lines;
}

// ---------------------------------------------------------------- jobs + staff

export function acceptJob(world: World, schoolId: string) {
  acceptJobInner(world, schoolId);
}
export { applyForJob };

function staffTurnover(world: World) {
  const rng = new Rng(world.rng);
  const sid = userSchool(world);
  for (const st of Object.values(world.staff)) {
    if (!st.schoolId) continue;
    st.years += 1;
    for (const k of Object.keys(st.skills) as (keyof StaffMember['skills'])[]) st.skills[k] = clamp(st.skills[k] + rng.int(-1, 2), 10, 95);
    const best = Math.max(...Object.values(st.skills));
    const leaveChance = clamp((st.ambition - 50) / 200 + (best - 65) / 120, 0, 0.45);
    if (rng.chance(leaveChance)) {
      const s = world.schools[st.schoolId];
      s.staffIds = s.staffIds.filter((id) => id !== st.id);
      if (st.schoolId === sid) {
        world.inbox.unshift({ id: nextId(world, 'm'), week: world.week, season: world.season, title: `${st.name} is leaving`, body: `${st.name} took a promotion elsewhere. Hire a replacement in Program.`, kind: 'team', read: false });
      }
      st.schoolId = null;
      delete world.staff[st.id];
    }
  }
  // Refresh the free-agent pool
  for (const st of Object.values(world.staff)) if (!st.schoolId) delete world.staff[st.id];
  for (let i = 0; i < 10; i++) generateStaff(world, rng, rng.int(30, 75), null);
  world.rng = rng.state();
}

export function staffBudgetUsed(world: World, schoolId: string): number {
  return staffOf(world, schoolId).reduce((s, x) => s + x.salary, 0);
}

export const MAX_STAFF = 3;

export function hireStaff(world: World, staffId: string): string {
  const sid = userSchool(world);
  if (!sid || userCoach(world).contract?.role !== 'head') return 'Only head coaches hire staff.';
  const st = world.staff[staffId];
  const s = world.schools[sid];
  if (!st || st.schoolId) return 'Not available.';
  if (s.staffIds.length >= MAX_STAFF) return `Staff is full (${MAX_STAFF}). Let someone go first.`;
  if (staffBudgetUsed(world, sid) + st.salary > s.budget.staff) return `Over your staff budget ($${s.budget.staff}K).`;
  st.schoolId = sid;
  st.years = 0;
  s.staffIds.push(st.id);
  world.transactions.push({ season: world.season, week: world.week, kind: 'hire', text: `${s.name} hired ${st.name} (${st.specialty})`, schoolId: sid });
  return `${st.name} hired.`;
}

export function fireStaff(world: World, staffId: string): string {
  const sid = userSchool(world);
  if (!sid || userCoach(world).contract?.role !== 'head') return 'Only head coaches manage staff.';
  const st = world.staff[staffId];
  const s = world.schools[sid];
  s.staffIds = s.staffIds.filter((id) => id !== staffId);
  st.schoolId = null;
  userCoach(world).relationships.staff = clamp(userCoach(world).relationships.staff - 5, 0, 100);
  return `${st.name} let go.`;
}

function fillAIStaff(world: World) {
  const rng = new Rng(world.rng);
  const sid = userSchool(world);
  for (const s of Object.values(world.schools)) {
    if (s.id === sid && userCoach(world).contract?.role === 'head') continue;
    while (s.staffIds.length < 2) s.staffIds.push(generateStaff(world, rng, s.prestige * 0.55 + 22, s.id).id);
  }
  world.rng = rng.state();
}

// ---------------------------------------------------------------- progression

function progression(world: World): string[] {
  const rng = new Rng(world.rng);
  const sid = userSchool(world);
  const lines: string[] = [];
  const changes: { p: Player; d: number }[] = [];
  for (const p of Object.values(world.players)) {
    if (!p.schoolId) continue;
    const d = offseasonDevelop(world, p, rng);
    if (p.schoolId === sid) changes.push({ p, d });
  }
  // Signed recruits join rosters
  for (const r of Object.values(world.recruits)) {
    if (!r.signedWith) continue;
    const p = r.player;
    p.schoolId = r.signedWith;
    p.origin = r.kind;
    p.year = r.kind === 'JUCO' ? 3 : 1;
    world.players[p.id] = p;
    world.schools[r.signedWith].rosterIds.push(p.id);
    if (r.signedWith === sid) lines.push(`Freshman arrival: ${r.stars}★ ${p.pos} ${playerName(p)} (${ovr(p)} OVR).`);
    delete world.recruits[r.id];
  }
  // Walk-ons for thin rosters; AI trims excess scholarships.
  for (const s of Object.values(world.schools)) {
    while (s.rosterIds.length < 11) {
      const p = generatePlayer(world, rng, { quality: 30 + s.prestige * 0.2, year: rng.int(1, 3), region: s.region, regions: REGIONS, schoolId: s.id });
      p.origin = 'walk-on';
      p.scholarship = s.rosterIds.filter((id) => world.players[id].scholarship).length < MAX_SCHOLARSHIPS;
      world.players[p.id] = p;
      s.rosterIds.push(p.id);
      if (s.id === sid) lines.push(`${p.scholarship ? 'Added scholarship depth' : 'Added walk-on'}: ${p.pos} ${playerName(p)}.`);
    }
    if (s.id !== sid) {
      const schol = roster(world, s.id).filter((p) => p.scholarship).sort((a, b) => ovr(a) - ovr(b));
      while (schol.length > MAX_SCHOLARSHIPS) {
        const cut = schol.shift()!;
        removePlayer(world, cut);
        delete world.players[cut.id];
      }
    }
  }
  changes.sort((a, b) => b.d - a.d);
  for (const { p, d } of changes.slice(0, 4)) if (d > 0) lines.unshift(`${playerName(p)} improved +${d} to ${ovr(p)} OVR.`);
  for (const { p, d } of changes.filter((x) => x.d < 0)) lines.push(`${playerName(p)} slipped ${d} to ${ovr(p)} OVR.`);
  world.rng = rng.state();
  return lines;
}

export function releasePlayer(world: World, playerId: string): string {
  const p = world.players[playerId];
  if (!p || p.schoolId !== userSchool(world)) return 'Not on your roster.';
  removePlayer(world, p);
  delete world.players[p.id];
  const c = userCoach(world);
  c.relationships.players = clamp(c.relationships.players - 4, 0, 100);
  for (const x of roster(world, c.contract!.schoolId)) x.trust = clamp(x.trust - 2, 0, 100);
  return `${playerName(p)} released. The locker room noticed.`;
}

export function toggleScholarship(world: World, playerId: string): string {
  const p = world.players[playerId];
  if (!p || p.schoolId !== userSchool(world)) return 'Not on your roster.';
  if (p.scholarship) {
    p.scholarship = false;
    p.morale = clamp(p.morale - 25, 0, 100);
    p.trust = clamp(p.trust - 20, 0, 100);
    return `${playerName(p)} is now a walk-on. He is not happy.`;
  }
  if (scholarshipCount(world, p.schoolId!) >= MAX_SCHOLARSHIPS) return 'No scholarship available.';
  p.scholarship = true;
  p.morale = clamp(p.morale + 20, 0, 100);
  return `${playerName(p)} put on scholarship.`;
}

// ---------------------------------------------------------------- new season

export function startNewSeason(world: World) {
  const rng = new Rng(world.rng);
  world.season += 1;
  world.week = 0;
  world.phase = 'preseason';
  world.offseasonStep = 'review';
  world.offseasonReport = {};
  world.rankings = [];
  world.portal = [];
  world.jobs = [];
  world.inbox = world.inbox.slice(0, 60);
  for (const k of Object.keys(world.flags)) if (k.startsWith('meet:')) delete world.flags[k];
  if (world.transactions.length > 600) world.transactions = world.transactions.slice(-600);
  for (const p of Object.values(world.players)) {
    if (!p.schoolId) {
      delete world.players[p.id];
      continue;
    }
    p.stats = emptyStats();
    p.eligible = true;
    p.fatigue = 0;
    p.morale = clamp(p.morale * 0.5 + 35, 0, 100);
    p.redshirting = false;
  }
  for (const c of Object.values(world.coaches)) {
    c.age += 1;
    if (!c.isUser && !c.contract && (c.age > 70 || rng.chance(0.25))) delete world.coaches[c.id];
  }
  for (const s of Object.values(world.schools)) {
    computeRoleExpectations(world, s.id);
    s.depth = autoDepth(world, s.id);
    const hc = s.headCoachId ? world.coaches[s.headCoachId] : null;
    if (hc && !hc.isUser) s.strategy = { ...hc.style };
  }
  const sid = userSchool(world);
  const c = userCoach(world);
  if (sid) {
    const stop = c.history[c.history.length - 1];
    if (!stop || stop.schoolId !== sid || stop.season !== world.season) {
      if (!(stop && stop.schoolId === sid && stop.season === world.season)) c.history.push({ season: world.season, schoolId: sid, role: c.contract!.role, w: 0, l: 0, note: '' });
    }
  }
  world.games = [];
  world.rng = rng.state();
  generateRecruitClass(world);
  buildSeasonSchedule(world);
  updateRankings(world);
  for (const p of Object.values(world.players)) computeTransferRisk(world, p);
  world.recruitingPointsLeft = sid ? weeklyRecruitingPoints(world, sid) : 0;
  world.inbox.unshift({
    id: nextId(world, 'm'),
    week: 0,
    season: world.season,
    title: `Season ${world.season} preseason`,
    body: sid
      ? `A new recruiting class is on the board and the schedule is out. Review roles, practice plans, and any promises you made before the opener.`
      : 'You are sitting out this season. Advance to the next offseason to look for jobs again.',
    kind: 'info',
    read: false,
  });
}

