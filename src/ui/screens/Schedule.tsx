import { useState } from 'react';
import { useGame } from '../store';
import { Badge, TeamLink, recStr, Tabs } from '../common';

export function Schedule() {
  const g = useGame();
  const { world } = g;
  const [tab, setTab] = useState<'mine' | 'week'>('mine');
  const sid = world.coaches[world.userCoachId].contract?.schoolId;
  const mine = sid ? world.games.filter((x) => x.homeId === sid || x.awayId === sid) : [];
  const thisWeek = world.games.filter((x) => x.week === world.week);
  const weeksLeft = world.phase === 'regular' ? world.regularWeeks - world.week + 1 : world.phase === 'preseason' ? world.regularWeeks : 0;

  const simWeeks = async (n: number) => {
    const reps = await g.advance(n);
    const results = reps.map((r) => r.userResult?.text).filter(Boolean);
    if (results.length) g.toast(results.join(' · '));
  };

  return (
    <div className="stack">
      <div className="row between">
        <h1>Schedule</h1>
        <div className="row">
          {world.phase !== 'offseason' && (
            <>
              <button className="btn" disabled={!!g.busy || world.phase === 'preseason'} onClick={() => simWeeks(1)}>
                Sim 1 week
              </button>
              <button className="btn" disabled={!!g.busy || weeksLeft < 2} onClick={() => simWeeks(Math.min(4, weeksLeft))}>
                Sim 4 weeks
              </button>
              <button className="btn" disabled={!!g.busy || weeksLeft < 1} onClick={() => simWeeks(weeksLeft)}>
                Sim to end of regular season
              </button>
            </>
          )}
        </div>
      </div>
      <p className="small muted">
        Multi-week sims stop at your next game when your game mode is play-by-play or coach mode, so you never miss a game you wanted to coach. Switch to Instant in Settings to
        simulate straight through.
      </p>
      <Tabs
        value={tab}
        onChange={setTab}
        tabs={[
          { id: 'mine', label: 'My schedule' },
          { id: 'week', label: `League · week ${world.week}` },
        ]}
      />
      {tab === 'mine' && (
        <div className="card flush">
          <div className="table-wrap">
            <table className="data">
              <thead>
                <tr>
                  <th>Wk</th>
                  <th>Type</th>
                  <th>Opponent</th>
                  <th>Opp. record</th>
                  <th>Result</th>
                </tr>
              </thead>
              <tbody>
                {mine.map((x) => {
                  const opp = x.homeId === sid ? x.awayId : x.homeId;
                  const ms = x.homeId === sid ? x.homePts : x.awayPts;
                  const ts = x.homeId === sid ? x.awayPts : x.homePts;
                  return (
                    <tr key={x.id} className={x.week === world.week && !x.played ? 'me' : ''}>
                      <td>{x.week}</td>
                      <td className="small">{x.label ?? (x.kind === 'conf' ? 'Conference' : 'Non-conf')}</td>
                      <td>
                        {x.neutral ? 'vs' : x.homeId === sid ? 'vs' : '@'} <TeamLink id={opp} />
                        {world.schools[sid!].rival === opp && <Badge tone="accent">Rival</Badge>}
                      </td>
                      <td className="small">{recStr(world, opp)}</td>
                      <td>
                        {x.played ? (
                          <button className="linkish" onClick={() => g.openGame(x.id)}>
                            <Badge tone={ms > ts ? 'good' : 'bad'}>{ms > ts ? 'W' : 'L'}</Badge> {ms}-{ts}
                          </button>
                        ) : x.week === world.week ? (
                          <button className="btn small primary" onClick={() => g.go('game')}>
                            Play
                          </button>
                        ) : (
                          <span className="muted small">—</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
                {!mine.length && (
                  <tr>
                    <td colSpan={5} className="muted center">
                      No games scheduled.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
      {tab === 'week' && (
        <div className="card flush">
          <div className="table-wrap">
            <table className="data">
              <thead>
                <tr>
                  <th>Away</th>
                  <th>Home</th>
                  <th>Result</th>
                </tr>
              </thead>
              <tbody>
                {thisWeek.map((x) => (
                  <tr key={x.id}>
                    <td>
                      <TeamLink id={x.awayId} /> <span className="small muted">{recStr(world, x.awayId)}</span>
                    </td>
                    <td>
                      {x.neutral ? 'vs ' : '@ '}
                      <TeamLink id={x.homeId} /> <span className="small muted">{recStr(world, x.homeId)}</span>
                    </td>
                    <td className="mono">{x.played ? `${x.awayPts}-${x.homePts}` : '—'}</td>
                  </tr>
                ))}
                {!thisWeek.length && (
                  <tr>
                    <td colSpan={3} className="muted center">
                      No games this week.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
