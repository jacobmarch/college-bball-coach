import { describe, expect, it } from 'vitest';
import { makeWorld } from './helpers';
import { advanceWeek, standings } from '../season';
import { offseasonContinue, offseasonBlocker } from '../offseason';
import { ovr } from '../player';
import { acceptJob } from '../career';

function playSeason(w: ReturnType<typeof makeWorld>) {
  let guard = 0;
  while (w.phase !== 'offseason' && guard++ < 100) advanceWeek(w);
}

describe('season simulation', () => {
  it('plays a full season with sensible scores', () => {
    const w = makeWorld(777);
    playSeason(w);
    expect(w.phase).toBe('offseason');
    const games = w.games.filter((g) => g.played);
    const pts = games.flatMap((g) => [g.homePts, g.awayPts]);
    const avg = pts.reduce((a, b) => a + b, 0) / pts.length;
    const homeWins = games.filter((g) => !g.neutral && g.homePts > g.awayPts).length / games.filter((g) => !g.neutral).length;
    const ot = games.filter((g) => g.homePts === g.awayPts).length;
    const poss = games.filter(g=>g.result).map(g=>g.result!.home.poss); console.log('poss', poss.reduce((a,b)=>a+b,0)/poss.length);
    const margins = games.map(g=>Math.abs(g.homePts-g.awayPts)).sort((a,b)=>a-b); console.log('median margin', margins[Math.floor(margins.length/2)], 'p90', margins[Math.floor(margins.length*0.9)]);
    console.log(`games=${games.length} avgPts=${avg.toFixed(1)} min=${Math.min(...pts)} max=${Math.max(...pts)} homeWin=${homeWins.toFixed(3)}`);
    expect(ot).toBe(0);
    expect(avg).toBeGreaterThan(60);
    expect(avg).toBeLessThan(82);
    expect(w.brackets.national?.championId).toBeTruthy();
    // Player stat sanity
    const ps = Object.values(w.players).filter((p) => p.stats.g > 10);
    const top = ps.sort((a, b) => b.stats.pts / b.stats.g - a.stats.pts / a.stats.g).slice(0, 5);
    for (const p of top) console.log(`${p.first} ${p.last} ${p.pos} ovr${ovr(p)} ${(p.stats.pts / p.stats.g).toFixed(1)}ppg ${(p.stats.min / p.stats.g).toFixed(1)}mpg ${(p.stats.tpm/Math.max(1,p.stats.tpa)).toFixed(3)} 3P`);
    const all = Object.values(w.players).reduce((a, p) => { a.fga += p.stats.fga; a.fgm += p.stats.fgm; a.tpa += p.stats.tpa; a.tpm += p.stats.tpm; a.tov += p.stats.tov; a.fta += p.stats.fta; a.ftm += p.stats.ftm; return a; }, { fga: 0, fgm: 0, tpa: 0, tpm: 0, tov: 0, fta: 0, ftm: 0 });
    console.log(`FG% ${(all.fgm / all.fga).toFixed(3)} 3P% ${(all.tpm / all.tpa).toFixed(3)} 3PA rate ${(all.tpa / all.fga).toFixed(3)} FT% ${(all.ftm / all.fta).toFixed(3)} TOV/g ${(all.tov / games.length / 2).toFixed(1)} FTA/g ${(all.fta / games.length / 2).toFixed(1)}`);
    const st = standings(w);
    console.log('best', st[0].w, st[0].l, 'worst', st[st.length - 1].w, st[st.length - 1].l);
  });

  it('is deterministic for the same seed', () => {
    const a = makeWorld(42, 'slice');
    const b = makeWorld(42, 'slice');
    playSeason(a);
    playSeason(b);
    expect(a.games.map((g) => `${g.homePts}-${g.awayPts}`)).toEqual(b.games.map((g) => `${g.homePts}-${g.awayPts}`));
  });

  it('runs multiple seasons through the offseason', () => {
    const w = makeWorld(99, 'standard');
    for (let season = 0; season < 3; season++) {
      playSeason(w);
      let guard = 0;
      while (w.phase === 'offseason' && guard++ < 20) {
        const block = offseasonBlocker(w);
        if (block) {
          // Accept the first offer when unemployed; release extras when over the limit.
          console.log('blocker', w.offseasonStep, block);
          const offer = w.jobs.find((j) => j.offered);
          if (offer) acceptJob(w, offer.schoolId);
          else break;
          continue;
        }
        offseasonContinue(w);
      }
      for (const s of Object.values(w.schools)) {
        if (s.rosterIds.length < 10) console.log('short roster', s.name, s.rosterIds.length, w.phase, w.offseasonStep);
        expect(s.rosterIds.length).toBeGreaterThanOrEqual(10);
        expect(s.headCoachId).toBeTruthy();
      }
    }
    expect(w.season).toBeGreaterThanOrEqual(3);
    console.log('players', Object.keys(w.players).length, 'size', (JSON.stringify(w).length / 1024).toFixed(0), 'KB');
  });
});
