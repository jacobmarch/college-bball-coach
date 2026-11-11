import { describe, expect, it } from 'vitest';
import { makeWorld } from './helpers';
import { advanceWeek, userGameThisWeek, simulateGame } from '../season';
import { createLiveGame, runUntilStop, finishLiveGame } from '../gamesim';
import { teamInputs } from '../team';
import { recruitAction, signingDay, openScholarships } from '../recruiting';
import { validateWorld, migrateWorld } from '../migrate';
import { offseasonContinue } from '../offseason';
import { applyForJob, makeOpening } from '../career';
import { specialtyEdge } from '../assistant';

describe('game engine', () => {
  it('live coach-mode game with no changes matches the instant sim', () => {
    const w = makeWorld(5, 'slice');
    advanceWeek(w); // preseason -> week 1
    const g = userGameThisWeek(w)!;
    const live = createLiveGame(g, teamInputs(w, g.homeId), teamInputs(w, g.awayId), w.seed, true);
    while (!live.done) runUntilStop(live, 'coach');
    const a = finishLiveGame(live, w.seed);
    const copy = structuredClone(w);
    const b = simulateGame(copy, copy.games.find((x) => x.id === g.id)!, true);
    expect([a.home.pts, a.away.pts]).toEqual([b.home.pts, b.away.pts]);
    expect(a.pbp.length).toBeGreaterThan(50);
    expect(a.factors.length).toBeGreaterThan(2);
  });

  it('strategy changes outcomes measurably (zone invites threes)', () => {
    const w = makeWorld(8, 'slice');
    advanceWeek(w);
    const g = userGameThisWeek(w)!;
    let threes = { man: 0, zone: 0 };
    for (const d of ['man', 'zone'] as const) {
      for (let i = 0; i < 30; i++) {
        const home = teamInputs(w, g.homeId);
        const away = { ...teamInputs(w, g.awayId), strategy: { ...w.schools[g.awayId].strategy, defense: d } };
        const live = createLiveGame({ ...g, id: g.id + i }, home, away, w.seed, false);
        runUntilStop(live, 'none');
        threes[d] += live.teams[0].shots.threeA;
      }
    }
    expect(threes.zone).toBeGreaterThan(threes.man);
  });
});

describe('recruiting', () => {
  it('user actions raise interest and signing respects scholarships', () => {
    const w = makeWorld(11, 'standard');
    advanceWeek(w);
    const sid = w.coaches[w.userCoachId].contract!.schoolId;
    const target = Object.values(w.recruits).filter((r) => r.stars <= 2).sort((a, b) => a.rank - b.rank)[0];
    expect(recruitAction(w, target.id, 'call').ok).toBe(true);
    expect(recruitAction(w, target.id, 'offer').ok).toBe(true);
    expect(target.interest[sid]).toBeGreaterThan(0);
    expect(recruitAction(w, target.id, 'call').ok).toBe(false); // once per week
    const open = openScholarships(w, sid);
    signingDay(w);
    const signed = Object.values(w.recruits).filter((r) => r.signedWith === sid).length;
    expect(signed).toBeLessThanOrEqual(open);
  });
});

describe('saves', () => {
  it('validates and round-trips through JSON', () => {
    const w = makeWorld(3, 'slice');
    const copy = JSON.parse(JSON.stringify(w));
    expect(validateWorld(copy).ok).toBe(true);
    const { world } = migrateWorld(copy);
    expect(world.seed).toBe(w.seed);
    const broken = JSON.parse(JSON.stringify(w));
    delete broken.players[Object.keys(broken.players)[0]];
    expect(validateWorld(broken).ok).toBe(false);
  });
});

describe('assistant career', () => {
  it('assistant start runs a full season and offseason', () => {
    const w = makeWorld(21, 'standard', 'assistant');
    expect(w.coaches[w.userCoachId].contract!.role).toBe('assistant');
    let guard = 0;
    while (w.phase !== 'offseason' && guard++ < 100) advanceWeek(w);
    guard = 0;
    while (w.phase === 'offseason' && guard++ < 12) offseasonContinue(w);
    expect(w.season).toBe(2);
    expect(w.phase).toBe('preseason');
  });

  it('assistant gets a specialty and a season assignment at the start', () => {
    const w = makeWorld(22, 'standard', 'assistant');
    const c = w.coaches[w.userCoachId];
    expect(c.specialty).toBe('recruiting');
    expect(c.assignment?.status).toBe('open');
    expect(c.assignment?.season).toBe(w.season);
  });

  it('head coach start has no specialty or assignment', () => {
    const w = makeWorld(23, 'standard', 'head');
    const c = w.coaches[w.userCoachId];
    expect(c.specialty ?? null).toBeNull();
    expect(c.assignment ?? null).toBeNull();
  });

  it('season assignment is graded at review and moves reputation', () => {
    const w = makeWorld(24, 'standard', 'assistant');
    const c = w.coaches[w.userCoachId];
    c.specialty = 'offense';
    c.assignment = { ...c.assignment!, specialty: 'offense', title: 'Run the offense', target: 'x' };
    const before = c.reputation;
    let guard = 0;
    while (w.phase !== 'offseason' && guard++ < 100) advanceWeek(w);
    offseasonContinue(w); // review
    expect(['met', 'missed']).toContain(c.assignment!.status);
    const delta = c.reputation - before;
    expect(Math.abs(delta)).toBeGreaterThan(0);
    expect(c.assignment!.note.length).toBeGreaterThan(0);
  });

  it('a specialty edge only applies to the matching side at the user school', () => {
    const w = makeWorld(25, 'standard', 'assistant');
    const sid = w.coaches[w.userCoachId].contract!.schoolId;
    w.coaches[w.userCoachId].specialty = 'defense';
    expect(specialtyEdge(w, sid, 'offense')).toBe(0);
    expect(specialtyEdge(w, sid, 'defense')).toBeGreaterThan(0);
    const other = Object.keys(w.schools).find((x) => x !== sid)!;
    expect(specialtyEdge(w, other, 'defense')).toBe(0);
  });

  it('a reputable assistant earns a head-coach offer and a weak one does not', () => {
    const w = makeWorld(26, 'standard', 'assistant');
    const c = w.coaches[w.userCoachId];
    const target = Object.values(w.schools).filter((s) => s.id !== c.contract!.schoolId).sort((a, b) => a.prestige - b.prestige)[2];
    w.jobs.push(makeOpening(w, target.id, 'Test vacancy', 'head'));
    c.reputation = 10;
    applyForJob(w, target.id);
    expect(w.jobs.find((j) => j.schoolId === target.id)!.offered).toBe(false);
    w.jobs = [];
    c.reputation = 95;
    w.jobs.push(makeOpening(w, target.id, 'Test vacancy', 'head'));
    applyForJob(w, target.id);
    expect(w.jobs.find((j) => j.schoolId === target.id)!.offered).toBe(true);
  });
});
