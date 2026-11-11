import { useEffect, useRef, useState } from 'react';
import { useGame } from '../store';
import { Badge, Logo, Seg, TeamLink, recStr, Explain } from '../common';
import { userGameThisWeek, finishUserLiveGame, simulateGame } from '../../sim/season';
import { createLiveGame, runUntilStop, stepPossession, userTimeout, applyLineupChanges, type LiveGame, type LivePlayer } from '../../sim/gamesim';
import { depthOrder, staffSkill, teamInputs, teamStrength } from '../../sim/team';
import { isAvailable, ovr, scoutedBand } from '../../sim/player';
import { StrategyEditor, strategySummary } from '../StrategyEditor';
import { BoxScoreView } from '../BoxScore';
import type { Strategy } from '../../sim/types';

const SPEEDS: Record<string, number> = { slow: 900, normal: 420, fast: 140, turbo: 25 };

export function GameCenter() {
  const g = useGame();
  const { world, live, setLive } = g;
  const sid = world.coaches[world.userCoachId].contract?.schoolId;
  const game = userGameThisWeek(world);
  const isHead = world.coaches[world.userCoachId].contract?.role === 'head';

  if (!sid) return <div className="card">No team, no games.</div>;
  if (live && game && live.gameId === game.id) return <LiveView live={live} />;
  if (!game || world.phase === 'offseason' || world.phase === 'preseason') {
    const last = world.games.filter((x) => x.played && x.result && (x.homeId === sid || x.awayId === sid)).slice(-1)[0];
    return (
      <div className="stack">
        <h1>Game Center</h1>
        <div className="card">
          {world.phase === 'preseason' ? 'The season has not started yet. Start it from the top bar.' : world.phase === 'offseason' ? 'The season is over.' : 'No game for you this week (eliminated or idle). Advance the week.'}
        </div>
        {last && (
          <div className="card">
            <h3>Last game</h3>
            <BoxScoreView gameId={last.id} />
          </div>
        )}
      </div>
    );
  }
  if (game.played)
    return (
      <div className="stack">
        <h1>Game Center</h1>
        <div className="card">
          <BoxScoreView gameId={game.id} />
        </div>
      </div>
    );

  const oppId = game.homeId === sid ? game.awayId : game.homeId;
  const opp = world.schools[oppId];
  const me = world.schools[sid];
  const scout = staffSkill(world, sid, 'scouting');
  const oppPlayers = depthOrder(world, oppId).filter(isAvailable).slice(0, 8);
  const myStarters = depthOrder(world, sid).filter(isAvailable).slice(0, 5);

  const start = (mode: 'pbp' | 'coach') => {
    const lg = createLiveGame(game, teamInputs(world, game.homeId), teamInputs(world, game.awayId), world.seed, true);
    (lg as LiveGame & { mode?: string }).mode = mode;
    setLive(lg);
  };
  const instant = () => {
    g.mutate((w) => {
      const gm = w.games.find((x) => x.id === game.id)!;
      const res = simulateGame(w, gm, true);
      const mine = gm.homeId === sid ? res.home.pts : res.away.pts;
      const theirs = gm.homeId === sid ? res.away.pts : res.home.pts;
      return `${mine > theirs ? 'Win' : 'Loss'}, ${mine}-${theirs}. Advance the week when ready.`;
    });
    g.openGame(game.id);
  };

  // Simple scouting read: strengths & weaknesses relative to league average
  const avg = (k: keyof (typeof oppPlayers)[number]['ratings']) => oppPlayers.reduce((s, p) => s + p.ratings[k], 0) / Math.max(1, oppPlayers.length);
  const notes: string[] = [];
  if (avg('sht') >= 62) notes.push('Dangerous shooting team: zone and pack-line defenses are risky.');
  if (avg('reb') >= 60) notes.push('Big on the glass: consider crashing the boards or protecting the paint.');
  if (avg('bh') <= 50) notes.push('Shaky ball-handlers: pressure or the press could force turnovers.');
  if (avg('idef') >= 60) notes.push('Strong rim protection: inside-heavy offense will struggle.');
  if (avg('pdef') <= 50) notes.push('Weak perimeter defenders: a perimeter or pick-and-roll attack could feast.');
  if (avg('sta') <= 52) notes.push('Low stamina: a fast pace could wear them down.');
  if (!notes.length) notes.push('No glaring weakness. Trust your matchups.');
  const star = [...oppPlayers].sort((a, b) => ovr(b) - ovr(a))[0];

  return (
    <div className="stack">
      <h1>Game Center</h1>
      <div className="scoreboard">
        <div className="side">
          <Logo school={world.schools[game.awayId]} size={44} />
          <div>
            <strong>{world.schools[game.awayId].name}</strong>
            <div className="small muted">{recStr(world, game.awayId)}</div>
          </div>
        </div>
        <div className="clock">
          {game.label ?? (game.kind === 'conf' ? 'Conference game' : 'Non-conference')}
          <div className="tiny">{game.neutral ? 'Neutral site' : `at ${world.schools[game.homeId].city}`}</div>
        </div>
        <div className="side away">
          <div>
            <strong>{world.schools[game.homeId].name}</strong>
            <div className="small muted">{recStr(world, game.homeId)}</div>
          </div>
          <Logo school={world.schools[game.homeId]} size={44} />
        </div>
      </div>
      <div className="grid cols-2">
        <div className="card">
          <div className="card-head">
            <h3>Scouting report: {opp.name}</h3>
            <Badge>Scouting {Math.round(scout)}</Badge>
          </div>
          <div className="small mb">
            Roster strength {Math.round(teamStrength(world, oppId))} (yours {Math.round(teamStrength(world, sid))}). Likely plan: {strategySummary(opp.strategy)}.
          </div>
          <ul className="small" style={{ margin: '0 0 0.75rem 1.1rem', padding: 0 }}>
            {notes.map((n, i) => (
              <li key={i}>{n}</li>
            ))}
          </ul>
          {star && (
            <div className="callout small mb">
              Go-to player: <strong>{star.first} {star.last}</strong> ({star.pos}), averaging {star.stats.g ? (star.stats.pts / star.stats.g).toFixed(1) : '—'} ppg. "Deny star" focus targets him.
            </div>
          )}
          <table className="data">
            <thead>
              <tr>
                <th>Rotation</th>
                <th>Pos</th>
                <th className="num">OVR</th>
                <th className="num">Sht</th>
                <th className="num">Fin</th>
                <th className="num">Def</th>
              </tr>
            </thead>
            <tbody>
              {oppPlayers.map((p, i) => {
                const b = (v: number) => {
                  const [x, y] = scoutedBand(v, scout, p.height + i);
                  return x === y ? `${x}` : `${x}–${y}`;
                };
                return (
                  <tr key={p.id}>
                    <td>
                      {i < 5 ? '★ ' : ''}
                      {p.first[0]}. {p.last}
                    </td>
                    <td>{p.pos}</td>
                    <td className="num">{b(ovr(p))}</td>
                    <td className="num">{b(p.ratings.sht)}</td>
                    <td className="num">{b(p.ratings.fin)}</td>
                    <td className="num">{b(Math.round((p.ratings.pdef + p.ratings.idef) / 2))}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <p className="tiny muted mt">Better scouting staff narrows these ranges.</p>
        </div>
        <div className="stack">
          <div className="card">
            <div className="card-head">
              <h3>Your game plan</h3>
              {!isHead && <Badge>Head coach decides</Badge>}
            </div>
            <StrategyEditor value={me.strategy} disabled={!isHead} onChange={(s) => g.mutate((w) => void (w.schools[sid].strategy = s), { toast: false })} />
            <div className="small mt">
              Starters: {myStarters.map((p) => `${p.last} (${p.pos})`).join(', ')}{' '}
              {isHead && (
                <button className="linkish small" onClick={() => g.go('team', 'depth')}>
                  edit
                </button>
              )}
            </div>
          </div>
          <div className="card stack">
            <h3>Tip-off</h3>
            <div className="row">
              <button className="btn primary" onClick={() => start('coach')} disabled={!isHead}>
                Coach the game
              </button>
              <button className="btn" onClick={() => start('pbp')}>
                Watch play-by-play
              </button>
              <button className="btn" onClick={instant}>
                Instant result
              </button>
            </div>
            <Explain>Coach mode pauses at media timeouts and halftime so you can change the plan, sub players, or call timeouts. Results are seeded: the same choices produce the same game.</Explain>
          </div>
        </div>
      </div>
    </div>
  );
}

function LiveView({ live }: { live: LiveGame & { mode?: string } }) {
  const g = useGame();
  const { world, setLive } = g;
  const [, setTick] = useState(0);
  const [speed, setSpeed] = useState<keyof typeof SPEEDS>(world.settings.reducedMotion ? 'fast' : 'normal');
  const [paused, setPaused] = useState(live.mode === 'coach');
  const feedRef = useRef<HTMLDivElement>(null);
  const sid = world.coaches[world.userCoachId].contract!.schoolId;
  const myIdx: 0 | 1 = live.teams[0].schoolId === sid ? 0 : 1;
  const coachMode = live.mode === 'coach';
  const rerender = () => setTick((t) => t + 1);

  useEffect(() => {
    if (paused || live.done) return;
    const t = window.setInterval(() => {
      const prevStops = live.stopsHit.length;
      if (coachMode) {
        runUntilStop(live, 'coach', 1);
        if (live.stopsHit.length > prevStops) setPaused(true);
      } else stepPossession(live);
      rerender();
    }, SPEEDS[speed]);
    return () => window.clearInterval(t);
  }, [paused, speed, live, coachMode]);

  useEffect(() => {
    feedRef.current?.scrollTo({ top: 0 });
  }, [live.pbp.length]);

  const finish = () => {
    g.mutate((w) => {
      const gm = w.games.find((x) => x.id === live.gameId)!;
      const res = finishUserLiveGame(w, gm, live);
      const mine = myIdx === 0 ? res.home.pts : res.away.pts;
      const theirs = myIdx === 0 ? res.away.pts : res.home.pts;
      return `${mine > theirs ? 'Win' : 'Loss'}, ${mine}-${theirs}. Advance the week when ready.`;
    });
    setLive(null);
    g.openGame(live.gameId);
  };

  const simToEnd = () => {
    runUntilStop(live, 'none');
    rerender();
  };

  const my = live.teams[myIdx];
  const setStrategy = (s: Strategy) => {
    my.strategy = s;
    rerender();
  };
  const setPref = (p: LivePlayer, pref: LivePlayer['pref']) => {
    p.pref = pref;
    applyLineupChanges(live, myIdx);
    rerender();
  };
  const per = live.period <= 2 ? `${live.period === 1 ? '1st' : '2nd'} half` : live.period === 3 ? 'OT' : `${live.period - 2}OT`;
  const clock = `${Math.floor(live.clock / 60)}:${String(Math.floor(live.clock % 60)).padStart(2, '0')}`;

  return (
    <div className="stack">
      <div className="row between">
        <h1>{coachMode ? 'Coach mode' : 'Play-by-play'}</h1>
        <Badge tone={live.done ? 'good' : 'bad'}>{live.done ? 'FINAL' : 'LIVE'}</Badge>
      </div>
      <div className="scoreboard" aria-live="polite">
        <div className="side">
          <Logo school={world.schools[live.teams[1].schoolId]} size={44} />
          <div>
            <TeamLink id={live.teams[1].schoolId} />
            <div className="tiny muted">TO left: {live.teams[1].timeouts}</div>
          </div>
          <span className="pts" style={{ marginLeft: 'auto' }}>
            {live.score[1]}
          </span>
        </div>
        <div className="clock">
          {live.done ? 'Final' + (live.period > 2 ? ` (${live.period - 2 === 1 ? 'OT' : `${live.period - 2}OT`})` : '') : `${per} · ${clock}`}
          {live.stopReason && !live.done && <div className="tiny">{live.stopReason}</div>}
        </div>
        <div className="side away">
          <span className="pts" style={{ marginRight: 'auto' }}>
            {live.score[0]}
          </span>
          <div>
            <TeamLink id={live.teams[0].schoolId} />
            <div className="tiny muted">TO left: {live.teams[0].timeouts}</div>
          </div>
          <Logo school={world.schools[live.teams[0].schoolId]} size={44} />
        </div>
      </div>
      <div className="row">
        {!live.done && (
          <>
            <button className="btn primary" onClick={() => setPaused(!paused)}>
              {paused ? (coachMode && live.stopReason ? 'Resume play' : 'Play') : 'Pause'}
            </button>
            <Seg
              label="Speed"
              value={speed}
              onChange={setSpeed}
              options={[
                { id: 'slow', label: 'Slow' },
                { id: 'normal', label: 'Normal' },
                { id: 'fast', label: 'Fast' },
                { id: 'turbo', label: 'Turbo' },
              ]}
            />
            {coachMode && (
              <button
                className="btn"
                disabled={my.timeouts <= 0}
                onClick={() => {
                  userTimeout(live, myIdx);
                  setPaused(true);
                  live.stopReason = 'Your timeout';
                  rerender();
                }}
              >
                Call timeout ({my.timeouts})
              </button>
            )}
            <button className="btn" onClick={simToEnd}>
              Sim to end
            </button>
          </>
        )}
        {live.done && (
          <button className="btn primary big" onClick={finish}>
            Final box score & save →
          </button>
        )}
      </div>
      <div className="grid side">
        <div className="pbp" ref={feedRef} aria-label="Play-by-play">
          {[...live.pbp].reverse().slice(0, 300).map((e, i) => (
            <div key={live.pbp.length - i} className={e.key ? 'key' : ''}>
              <span className="t">{e.t}</span>
              <span>{e.text}</span>
              <span className="s">
                {e.away}-{e.home}
              </span>
            </div>
          ))}
        </div>
        <div className="stack">
          {live.teams.map((t, ti) => (
            <div className="card" key={t.schoolId}>
              <h4>
                {t.abbr} on the floor {ti === myIdx ? '(you)' : ''}
              </h4>
              <div className="court-row">
                {t.players
                  .filter((p) => p.onCourt)
                  .map((p) => (
                    <div className="court-player" key={p.id}>
                      <strong>{p.short}</strong> <span className="muted">{p.pos}</span>
                      <div className="tiny muted">
                        {p.box.pts} pts · {p.fouls} PF
                      </div>
                      <div className="e" title={`Energy ${Math.round(p.energy)}`}>
                        <span style={{ width: `${p.energy}%`, background: p.energy < 50 ? 'var(--bad)' : p.energy < 70 ? 'var(--warn)' : undefined }} />
                      </div>
                    </div>
                  ))}
              </div>
            </div>
          ))}
        </div>
      </div>
      {coachMode && !live.done && (paused || live.stopReason) && (
        <div className="grid cols-2">
          <div className="card">
            <h3>Adjust the plan</h3>
            <StrategyEditor value={my.strategy} onChange={setStrategy} />
          </div>
          <div className="card">
            <h3>Rotation</h3>
            <p className="small muted">"Ride" keeps a player on the floor unless exhausted or in foul trouble; "Sit" benches him. Changes apply at the next dead ball.</p>
            <table className="data">
              <thead>
                <tr>
                  <th>Player</th>
                  <th className="num">Min</th>
                  <th className="num">Pts</th>
                  <th className="num">PF</th>
                  <th className="num">Energy</th>
                  <th>Usage</th>
                </tr>
              </thead>
              <tbody>
                {my.players.map((p) => (
                  <tr key={p.id} className={p.onCourt ? 'me' : ''}>
                    <td>
                      {p.short} <span className="muted small">{p.pos}</span>
                    </td>
                    <td className="num">{Math.round(p.secs / 60)}</td>
                    <td className="num">{p.box.pts}</td>
                    <td className="num" style={{ color: p.fouls >= 4 ? 'var(--bad)' : undefined }}>
                      {p.fouledOut ? 'OUT' : p.fouls}
                    </td>
                    <td className="num">{Math.round(p.energy)}</td>
                    <td>
                      <select aria-label={`Usage for ${p.short}`} value={p.pref} disabled={p.fouledOut} onChange={(e) => setPref(p, e.target.value as LivePlayer['pref'])}>
                        <option value="auto">Auto</option>
                        <option value="ride">Ride</option>
                        <option value="sit">Sit</option>
                      </select>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
