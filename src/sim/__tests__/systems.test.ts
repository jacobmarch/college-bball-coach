import { describe, expect, it } from 'vitest';
import { makeWorld } from './helpers';
import { advanceWeek, userGameThisWeek, simulateGame } from '../season';
import { createLiveGame, runUntilStop, finishLiveGame } from '../gamesim';
import { teamInputs } from '../team';
import { recruitAction, signingDay, openScholarships } from '../recruiting';
import { validateWorld, migrateWorld } from '../migrate';
import { offseasonContinue } from '../offseason';

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
});
