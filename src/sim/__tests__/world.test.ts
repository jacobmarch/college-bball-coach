import { describe, expect, it } from 'vitest';
import { makeWorld } from './helpers';
import { advanceWeek, nationalFieldSize, seedOrder, selectNationalField, standings, totalSeasonWeeks } from '../season';
import { UNIVERSE_SIZES, conferencePlan } from '../generate';

describe('full 312-team world', () => {
  const w = makeWorld(2024, 'full');

  it('has 312 schools in 32 conferences with unique names and abbreviations', () => {
    const schools = Object.values(w.schools);
    expect(schools.length).toBe(312);
    expect(Object.keys(w.conferences).length).toBe(32);
    expect(new Set(schools.map((s) => s.name)).size).toBe(312);
    expect(new Set(schools.map((s) => s.abbr)).size).toBe(312);
    expect(new Set(Object.values(w.conferences).map((c) => c.abbr)).size).toBe(32);
    const sizes = Object.values(w.conferences).map((c) => c.schoolIds.length);
    expect(sizes.reduce((a, b) => a + b, 0)).toBe(312);
    expect(conferencePlan(UNIVERSE_SIZES.full).length).toBe(32);
  });

  it('gives every school a full roster and a head coach', () => {
    for (const s of Object.values(w.schools)) {
      expect(s.rosterIds.length).toBe(13);
      expect(s.headCoachId).toBeTruthy();
    }
  });

  it('uses a 68-team national field with 32 automatic bids', () => {
    expect(nationalFieldSize(w)).toBe(68);
    expect(totalSeasonWeeks(w)).toBeGreaterThan(w.regularWeeks);
  });

  it('seeds a 64-team bracket so seed lines meet 1 v 16', () => {
    const order = seedOrder(64);
    expect(order.length).toBe(64);
    for (let i = 0; i < 64; i += 2) expect(order[i] + order[i + 1]).toBe(65);
  });

  it('plays a full season, a 68-team tournament, and a champion', () => {
    const t0 = Date.now();
    let weekMs = 0;
    let guard = 0;
    while (w.phase !== 'offseason' && guard++ < 100) {
      const t = Date.now();
      advanceWeek(w);
      weekMs = Math.max(weekMs, Date.now() - t);
    }
    const total = Date.now() - t0;
    console.log(`full season: ${total} ms total, slowest week ${weekMs} ms, ${w.regularWeeks} regular weeks`);
    expect(w.phase).toBe('offseason');
    expect(weekMs).toBeLessThan(2000);

    const nb = w.brackets.national!;
    expect(nb.field!.length).toBe(68);
    expect(nb.field!.filter((f) => f.how === 'auto').length).toBe(32);
    expect(nb.rounds[0].length).toBe(4);
    expect(w.games.find((g) => g.id === nb.rounds[0][0])!.label).toContain('First Four');
    expect(nb.rounds[1].length).toBe(32);
    expect(nb.championId).toBeTruthy();
    expect(nb.alive.length).toBe(1);
    const champ = nb.championId!;
    expect(nb.field!.some((f) => f.schoolId === champ)).toBe(true);
  });

  it('keeps every conference champion in the field and the 68-team seeds distinct', () => {
    const field = selectNationalField(w);
    expect(field.length).toBe(68);
    expect(new Set(field.map((f) => f.schoolId)).size).toBe(68);
    const st = standings(w, 'conf0');
    expect(st.length).toBe(14);
  });
});

describe('weekly pace in a full world', () => {
  it('a fresh full world is generated quickly', () => {
    const t = Date.now();
    makeWorld(7, 'full');
    expect(Date.now() - t).toBeLessThan(5000);
  });
});
