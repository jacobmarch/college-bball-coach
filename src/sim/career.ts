import { Rng, clamp } from './rng';
import type { Coach, CoachRoleKind, CoachSkills, JobOpening, World } from './types';
import { expectationFor, generateAICoach } from './generate';
import { nextId } from './player';
import { record } from './season';
import { roster } from './team';
import { bestSpecialty } from './assistant';

export function userCoach(world: World): Coach {
  return world.coaches[world.userCoachId];
}

function postseasonBonus(post: string): number {
  if (post.includes('NATIONAL CHAMPION')) return 25;
  if (post.includes('runner-up')) return 18;
  if (post.includes('Final Four')) return 14;
  if (post.includes('Elite Eight')) return 10;
  if (post.includes('National Tournament')) return 6;
  if (post.includes('Conference tournament champion')) return 5;
  return 0;
}

function grow(skills: CoachSkills, key: keyof CoachSkills, amount: number) {
  const cur = skills[key];
  skills[key] = clamp(Math.round((cur + amount * (1 - cur / 110)) * 10) / 10, 1, 99);
}

/** Season-end evaluation for every head coach; may fire coaches. Returns report lines for the user. */
export function boardReview(world: World, repBefore?: number): string[] {
  const rng = new Rng(world.rng);
  const lines: string[] = [];
  const user = userCoach(world);
  for (const s of Object.values(world.schools)) {
    const hcId = s.headCoachId;
    if (!hcId) continue;
    const c = world.coaches[hcId];
    const last = s.history[s.history.length - 1];
    if (!last || last.season !== world.season) continue;
    const wp = last.w / Math.max(1, last.w + last.l);
    const exp = expectationFor(s.prestige);
    const bonus = postseasonBonus(last.postseason);
    const delta = (wp - exp.winPct) * 110 + bonus * 0.6 - (world.settings.difficulty === 'hard' && c.isUser ? 4 : 0) + (world.settings.difficulty === 'easy' && c.isUser ? 4 : 0);
    c.security = clamp(Math.round(c.security + delta), 0, 100);
    if (c.contract) c.contract.yearsLeft -= 1;
    // Reputation: winning above your program's level counts more.
    const repDelta = (wp - 0.5) * 14 + bonus * 0.5 + (wp - exp.winPct) * 10 + (s.prestige - c.reputation) * 0.04;
    c.reputation = clamp(Math.round((c.reputation + repDelta) * 10) / 10, 1, 99);
    // Program prestige drifts with results.
    s.prestige = clamp(Math.round(s.prestige + (wp - 0.5) * 5 + bonus * 0.15 + rng.normal(0, 0.7)), 5, 99);
    s.facilities = clamp(Math.round(s.facilities + (s.budget.facilities - 300) / 250 + rng.normal(0, 0.6)), 5, 99);
    s.fanSupport = clamp(Math.round(s.fanSupport + (wp - 0.5) * 8), 5, 99);

    if (c.isUser) {
      lines.push(`Record ${last.w}-${last.l} (${last.cw}-${last.cl} conf), ${last.finish}. ${last.postseason}.`);
      lines.push(`Expectation was: ${exp.text} (about a ${Math.round(exp.winPct * 100)}% win rate). Board confidence ${delta >= 0 ? 'rose' : 'fell'} to ${c.security}.`);
      lines.push(`Your reputation is now ${Math.round(c.reputation)} (${repDelta >= 0 ? '+' : ''}${repDelta.toFixed(1)}).`);
      grow(c.skills, 'gameMgmt', 1.5 + bonus * 0.05);
      grow(c.skills, 'tactics', 1.2);
      grow(c.skills, 'programBuilding', 1 + (wp > exp.winPct ? 1 : 0));
      grow(c.skills, 'relationships', 0.8);
      if (c.contract && c.contract.yearsLeft <= 0) {
        if (c.security >= 50) {
          c.contract.yearsLeft = 4;
          c.contract.salary = Math.round(c.contract.salary * 1.15);
          lines.push(`The athletic director extended your contract four years at $${c.contract.salary}K per year.`);
        } else {
          lines.push('Your contract expired and the school chose not to renew it.');
          fireCoach(world, c, s.id, 'contract not renewed');
        }
      } else if (c.security < 18) {
        lines.push(`The athletic director has fired you. Buyout paid: $${c.contract?.buyout ?? 0}K.`);
        fireCoach(world, c, s.id, 'fired after the season');
      } else if (c.security < 35) {
        lines.push('You are on the hot seat. Another season below expectations will likely cost you the job.');
      } else if (c.security >= 80 && c.contract && c.contract.yearsLeft <= 2) {
        c.contract.yearsLeft += 2;
        c.contract.salary = Math.round(c.contract.salary * 1.1);
        lines.push(`Rewarded with a two-year extension (now ${c.contract.yearsLeft} years at $${c.contract.salary}K).`);
      }
      continue;
    }
    // AI decisions
    const fire = c.security < 22 || (c.contract && c.contract.yearsLeft <= 0 && wp < exp.winPct) || (c.age >= 68 && rng.chance(0.5));
    if (fire) {
      const why = c.age >= 68 ? 'retired' : 'fired';
      fireCoach(world, c, s.id, why);
    } else if (c.contract && c.contract.yearsLeft <= 0) {
      c.contract.yearsLeft = rng.int(2, 5);
    }
  }
  // Assistant role: reputation from recruiting and team success
  if (user.contract && user.contract.role !== 'head') {
    const s = world.schools[user.contract.schoolId];
    const last = s.history[s.history.length - 1];
    const wp = last ? last.w / Math.max(1, last.w + last.l) : 0.5;
    const bonus = last ? postseasonBonus(last.postseason) : 0;
    const signed = Object.values(world.recruits).filter((r) => r.committedTo === s.id);
    const classScore = signed.reduce((t, r) => t + r.stars, 0);
    const repDelta = (wp - 0.5) * 8 + bonus * 0.3 + classScore * 0.6 + (s.prestige - 50) * 0.03;
    user.reputation = clamp(Math.round((user.reputation + repDelta) * 10) / 10, 1, 99);
    // Report the total change, including any assignment grade applied before this review.
    const total = user.reputation - (repBefore ?? user.reputation - repDelta);
    grow(user.skills, 'recruiting', 1 + classScore * 0.15);
    grow(user.skills, 'development', 1.2);
    grow(user.skills, 'tactics', 0.6);
    user.contract.yearsLeft = Math.max(1, user.contract.yearsLeft - 1);
    lines.push(`${s.name} went ${last?.w ?? 0}-${last?.l ?? 0}. ${last?.postseason ?? ''}.`);
    lines.push(`Your recruiting board produced ${signed.length} commitments (${classScore} total stars). Reputation now ${Math.round(user.reputation)} (${total >= 0 ? '+' : ''}${total.toFixed(1)}).`);
    if (user.reputation >= 40) lines.push('Athletic directors are starting to notice you. Watch the coaching carousel for head-coaching openings.');
  }
  user.age += 0; // aging happens at new season
  world.rng = rng.state();
  return lines;
}

function fireCoach(world: World, c: Coach, schoolId: string, why: string) {
  const s = world.schools[schoolId];
  const stop = c.history[c.history.length - 1];
  if (stop) stop.note = why;
  c.contract = null;
  c.security = 50;
  s.headCoachId = null;
  world.transactions.push({ season: world.season, week: world.week, kind: 'fire', text: `${c.first} ${c.last} ${why} at ${s.name}`, schoolId });
  if (!c.isUser) {
    world.jobs.push(makeOpening(world, schoolId, why === 'retired' ? 'Coach retired' : 'Coach fired'));
  } else {
    world.inbox.unshift({ id: nextId(world, 'm'), week: world.week, season: world.season, title: 'You have been let go', body: `${s.name} has moved on. Look for openings in the coaching carousel; lower-tier programs will still listen.`, kind: 'career', read: false });
    world.jobs.push(makeOpening(world, schoolId, 'Previous coach dismissed'));
  }
  // Players lose trust in a coaching change
  for (const p of roster(world, schoolId)) p.trust = clamp(p.trust - 15, 0, 100);
}

export function makeOpening(world: World, schoolId: string, reason: string, role: CoachRoleKind = 'head'): JobOpening {
  const s = world.schools[schoolId];
  const exp = expectationFor(s.prestige);
  return {
    schoolId,
    role,
    reason,
    applied: false,
    offered: false,
    rationale: [],
    salary: role === 'head' ? Math.round(180 + s.prestige * 14) : Math.round(80 + s.prestige * 3),
    years: role === 'head' ? 4 + (s.prestige > 70 ? 1 : 0) : 2,
    expectation: role === 'head' ? exp.text : 'Recruiting and player development duties',
  };
}

export function requiredReputation(world: World, schoolId: string, role: CoachRoleKind): number {
  const s = world.schools[schoolId];
  // Head jobs never go to a coach with no track record, even at the smallest programs.
  return role === 'head' ? Math.max(20, Math.round(s.prestige * 0.72 - 4)) : Math.round(s.prestige * 0.35);
}

/** A readable evaluation of the user as a candidate. */
export function evaluateCandidate(world: World, schoolId: string, role: CoachRoleKind): { score: number; needed: number; lines: string[]; offer: boolean } {
  const c = userCoach(world);
  const s = world.schools[schoolId];
  const needed = requiredReputation(world, schoolId, role);
  const lines: string[] = [];
  let score = c.reputation;
  lines.push(`Reputation ${Math.round(c.reputation)} vs about ${needed} they look for.`);
  if (c.contract && world.schools[c.contract.schoolId].region === s.region && c.contract.schoolId !== s.id) {
    score += 2;
    lines.push(`Recruiting ties in the ${s.region} region (+).`);
  }
  const headSeasons = c.history.filter((h) => h.role === 'head').length;
  if (role === 'head') {
    if (headSeasons > 0) {
      score += Math.min(8, headSeasons * 2);
      lines.push(`Head-coaching experience (${headSeasons} stop${headSeasons > 1 ? 's' : ''}) (+).`);
    } else {
      score -= 3;
      lines.push('No head-coaching experience yet (−).');
    }
  }
  const recent = c.history[c.history.length - 1];
  if (recent && recent.w + recent.l > 0) {
    const wp = recent.w / (recent.w + recent.l);
    score += (wp - 0.5) * 20;
    lines.push(`Most recent record ${recent.w}-${recent.l} (${wp >= 0.5 ? '+' : '−'}).`);
  }
  const avgSkill = Object.values(c.skills).reduce((a, b) => a + b, 0) / 7;
  score += (avgSkill - 50) * 0.25;
  lines.push(`Coaching profile averages ${Math.round(avgSkill)} across skills.`);
  if (c.relationships.network >= 60) {
    score += 3;
    lines.push('Strong coaching network vouches for you (+).');
  }
  if (c.titles.length) {
    score += Math.min(8, c.titles.length * 2);
    lines.push(`Championships and honors: ${c.titles.length} (+).`);
  }
  if (c.contract && c.contract.schoolId === schoolId) lines.push('You already work here.');
  const recentFire = c.history.some((h) => h.season >= world.season - 1 && /fired|not renewed/.test(h.note));
  if (recentFire) {
    score -= 5;
    lines.push('Recently dismissed (−).');
  }
  const offer = score >= needed;
  lines.push(offer ? 'Verdict: they want to make you an offer.' : `Verdict: not enough yet (short by ${Math.ceil(needed - score)}).`);
  return { score, needed, lines, offer };
}

export function applyForJob(world: World, schoolId: string) {
  const j = world.jobs.find((x) => x.schoolId === schoolId);
  if (!j || j.applied) return;
  const ev = evaluateCandidate(world, schoolId, j.role);
  j.applied = true;
  j.offered = ev.offer;
  j.rationale = ev.lines;
}

/** Schools that would come to the user unprompted. */
export function unsolicitedOffers(world: World) {
  const c = userCoach(world);
  for (const j of world.jobs) {
    if (j.applied || j.role !== 'head') continue;
    const ev = evaluateCandidate(world, j.schoolId, j.role);
    if (ev.offer && ev.score >= ev.needed + 6) {
      j.applied = true;
      j.offered = true;
      j.rationale = ['They reached out to you first.', ...ev.lines];
    }
  }
  void c;
}

export function acceptJob(world: World, schoolId: string) {
  const j = world.jobs.find((x) => x.schoolId === schoolId);
  if (!j || !j.offered) return;
  const c = userCoach(world);
  const prev = c.contract?.schoolId;
  if (prev && c.contract?.role === 'head') {
    const ps = world.schools[prev];
    ps.headCoachId = null;
    world.jobs.push(makeOpening(world, prev, `${c.first} ${c.last} left for ${world.schools[schoolId].name}`));
    for (const p of roster(world, prev)) p.trust = clamp(p.trust - 15, 0, 100);
  }
  const s = world.schools[schoolId];
  if (j.role === 'head') {
    if (s.headCoachId && s.headCoachId !== c.id) world.coaches[s.headCoachId].contract = null;
    s.headCoachId = c.id;
    s.strategy = { ...c.style };
  }
  const exp = expectationFor(s.prestige);
  c.contract = { schoolId, role: j.role, salary: j.salary, yearsLeft: j.years, buyout: Math.round(j.salary * 1.5), expectation: j.expectation, expectedWinPct: exp.winPct };
  if (j.role === 'head') c.assignment = null;
  else c.specialty ??= bestSpecialty(c);
  c.security = 60;
  c.history.push({ season: world.season + 1, schoolId, role: j.role, w: 0, l: 0, note: 'Hired' });
  c.relationships.network = clamp(c.relationships.network + 4, 0, 100);
  for (const p of roster(world, schoolId)) p.trust = 45;
  world.jobs = world.jobs.filter((x) => x.schoolId !== schoolId);
  world.transactions.push({ season: world.season, week: world.week, kind: 'job', text: `${c.first} ${c.last} hired as ${j.role === 'head' ? 'head coach' : 'assistant'} at ${s.name}`, schoolId });
  world.inbox.unshift({ id: nextId(world, 'm'), week: world.week, season: world.season, title: `New job: ${s.name}`, body: `You are the new ${j.role === 'head' ? 'head coach' : 'assistant coach'} at ${s.name}. Expectation: ${j.expectation}.`, kind: 'career', read: false });
}

/** Fill remaining openings: AI coaches move up, assistants get promoted. */
export function runCarousel(world: World): string[] {
  const rng = new Rng(world.rng);
  const lines: string[] = [];
  let guard = 0;
  while (world.jobs.some((j) => j.role === 'head') && guard++ < 200) {
    world.jobs.sort((a, b) => world.schools[b.schoolId].prestige - world.schools[a.schoolId].prestige);
    const j = world.jobs.find((x) => x.role === 'head')!;
    world.jobs = world.jobs.filter((x) => x !== j);
    const s = world.schools[j.schoolId];
    if (s.headCoachId) continue;
    // Candidates: sitting AI head coaches at less prestigious schools with strong reputations.
    const movers = Object.values(world.coaches)
      .filter((c) => !c.isUser && c.contract?.role === 'head' && world.schools[c.contract.schoolId].prestige + 8 < s.prestige && c.reputation >= s.prestige * 0.7)
      .sort((a, b) => b.reputation - a.reputation);
    let hire: Coach;
    if (movers.length && rng.chance(0.65)) {
      hire = movers[0];
      const from = hire.contract!.schoolId;
      world.schools[from].headCoachId = null;
      world.jobs.push(makeOpening(world, from, `${hire.first} ${hire.last} left for ${s.name}`));
      lines.push(`${hire.first} ${hire.last} leaves ${world.schools[from].name} for ${s.name}.`);
    } else {
      const free = Object.values(world.coaches).filter((c) => !c.isUser && !c.contract && c.age < 66 && c.reputation >= s.prestige * 0.5);
      if (free.length && rng.chance(0.4)) {
        hire = rng.pick(free);
        lines.push(`${s.name} hires ${hire.first} ${hire.last}, back on the sidelines.`);
      } else {
        hire = generateAICoach(world, rng, s.prestige * 0.55 + 22);
        hire.age = rng.int(32, 50);
        lines.push(`${s.name} promotes a rising assistant, ${hire.first} ${hire.last}.`);
      }
    }
    const exp = expectationFor(s.prestige);
    hire.contract = { schoolId: s.id, role: 'head', salary: j.salary, yearsLeft: j.years, buyout: 0, expectation: exp.text, expectedWinPct: exp.winPct };
    hire.security = 60;
    hire.history.push({ season: world.season + 1, schoolId: s.id, role: 'head', w: 0, l: 0, note: 'Hired' });
    s.headCoachId = hire.id;
    s.strategy = { ...hire.style };
    world.transactions.push({ season: world.season, week: world.week, kind: 'hire', text: `${s.name} hired ${hire.first} ${hire.last}`, schoolId: s.id });
  }
  world.jobs = world.jobs.filter((j) => j.role !== 'head');
  world.rng = rng.state();
  return lines;
}

/** For an unemployed or assistant coach: a few assistant openings at better programs. */
export function assistantOpenings(world: World) {
  const c = userCoach(world);
  const rng = new Rng(world.rng);
  const schools = Object.values(world.schools).filter((s) => s.id !== c.contract?.schoolId && requiredReputation(world, s.id, 'assistant') <= c.reputation + 15);
  rng.shuffle(schools);
  for (const s of schools.slice(0, 3)) world.jobs.push(makeOpening(world, s.id, 'Assistant vacancy', 'assistant'));
  world.rng = rng.state();
}

export function recordFor(world: World, schoolId: string) {
  return record(world, schoolId);
}
