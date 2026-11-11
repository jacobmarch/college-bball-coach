import { useGame } from '../store';
import { Badge, Logo, TeamLink, recStr, Explain } from '../common';
import { userGameThisWeek, record, currentRank } from '../../sim/season';
import { isAvailable, ovr, playerName } from '../../sim/player';
import { roster, teamStrength } from '../../sim/team';
import { openScholarships } from '../../sim/recruiting';
import { Offseason } from './Offseason';
import { strategySummary } from '../StrategyEditor';
import { phaseLabel } from '../App';

export function Home() {
  const g = useGame();
  const { world, go, mutate } = g;
  const coach = world.coaches[world.userCoachId];
  const sid = coach.contract?.schoolId ?? null;

  if (world.phase === 'offseason') return <Offseason />;

  const school = sid ? world.schools[sid] : null;
  const game = userGameThisWeek(world);
  const opp = game && sid ? world.schools[game.homeId === sid ? game.awayId : game.homeId] : null;
  const players = sid ? roster(world, sid) : [];
  const injured = players.filter((p) => p.injury);
  const academic = players.filter((p) => p.gpa < 2.2 && p.eligible);
  const unhappy = players.filter((p) => p.morale < 45);
  const risk = players.filter((p) => p.transferRisk >= 45);
  const ineligible = players.filter((p) => !p.eligible);
  const recent = sid
    ? world.games
        .filter((x) => x.played && (x.homeId === sid || x.awayId === sid))
        .slice(-5)
        .reverse()
    : [];
  const board = Object.values(world.recruits).filter((r) => r.onBoard && !r.signedWith);
  const commits = sid ? Object.values(world.recruits).filter((r) => r.committedTo === sid) : [];
  const isHead = coach.contract?.role === 'head';

  const deadlines: { text: string; why: string; action?: () => void; label?: string }[] = [];
  if (world.phase === 'preseason') {
    deadlines.push({ text: 'Set your lineup and practice plan', why: 'Your depth chart decides who starts and who plays.', action: () => go('team', 'depth'), label: 'Depth chart' });
    deadlines.push({ text: 'Build a recruiting board', why: 'Recruits commit throughout the season. Scout, call, and offer early.', action: () => go('recruiting'), label: 'Recruiting' });
  }
  if (world.phase === 'regular') {
    const left = world.regularWeeks - world.week;
    deadlines.push({ text: `${left} week${left === 1 ? '' : 's'} left in the regular season`, why: 'Conference standings set the tournament seeding.' });
    const mid = Math.round(world.regularWeeks / 2);
    if (world.week < mid) deadlines.push({ text: `Academic eligibility check in week ${mid}`, why: 'Players under a 2.0 GPA sit out the rest of the season.' });
  }
  if (sid && world.recruitingPointsLeft > 5 && world.phase !== 'preseason') {
    deadlines.push({ text: `${world.recruitingPointsLeft} recruiting hours unused this week`, why: 'Hours reset every week; unused hours are lost.', action: () => go('recruiting', 'board'), label: 'Use them' });
  }
  if (injured.length && isHead) deadlines.push({ text: `${injured.length} injured player${injured.length > 1 ? 's' : ''}`, why: 'Injured players are skipped automatically, but check your rotation.', action: () => go('team', 'depth'), label: 'Depth chart' });

  return (
    <div className="stack">
      <div className="row between">
        <div>
          <h1>Home</h1>
          <div className="muted small">{phaseLabel(world)}</div>
        </div>
      </div>
      {!sid && (
        <div className="callout warn">You are between jobs this season. Advance to the offseason to look for openings in the coaching carousel.</div>
      )}
      <div className="grid side">
        <div className="stack">
          {game && opp && school && (
            <div className="card">
              <div className="card-head">
                <h3>{game.played ? 'This week' : 'Next game'}</h3>
                <span className="badge accent">{game.label ?? (game.kind === 'conf' ? 'Conference' : game.kind === 'nonconf' ? 'Non-conference' : game.kind)}</span>
              </div>
              <div className="row between">
                <div className="row">
                  <Logo school={opp} />
                  <div>
                    <div>
                      {game.neutral ? 'vs' : game.homeId === sid ? 'vs' : '@'} <TeamLink id={opp.id} /> <span className="muted small">({recStr(world, opp.id)})</span>
                    </div>
                    <div className="small muted">
                      Roster strength {Math.round(teamStrength(world, opp.id))} vs your {Math.round(teamStrength(world, sid!))} · They play {strategySummary(opp.strategy)}
                      {school.rival === opp.id ? ' · RIVALRY' : ''}
                    </div>
                  </div>
                </div>
                {game.played ? (
                  <button className="btn" onClick={() => g.openGame(game.id)}>
                    Box score ({game.homeId === sid ? game.homePts : game.awayPts}-{game.homeId === sid ? game.awayPts : game.homePts})
                  </button>
                ) : (
                  <div className="row">
                    <button className="btn primary" onClick={() => go('game')} disabled={!!g.busy}>
                      {isHead ? 'Game plan & play' : 'Watch game'}
                    </button>
                  </div>
                )}
              </div>
            </div>
          )}
          {world.phase === 'preseason' && (
            <div className="card">
              <h3>Preseason</h3>
              <p>
                Welcome to season {world.season}. {isHead ? 'Set your depth chart, practice plan, and game strategy.' : 'Your head coach sets the lineup; your job is recruiting and player development.'} When you are ready, start the season from the top bar.
              </p>
              <Explain>Tip: every screen shows what matters this week. Ratings bands, scouting confidence, and post-game explanations tell you why things happened.</Explain>
            </div>
          )}
          <div className="card">
            <div className="card-head">
              <h3>Inbox</h3>
              <button className="btn small ghost" onClick={() => mutate((w) => w.inbox.forEach((m) => (m.read = true)))}>
                Mark all read
              </button>
            </div>
            <ul className="list">
              {world.inbox.slice(0, 12).map((m) => (
                <li key={m.id} className={`inbox-item ${m.read ? '' : 'unread'}`} onClick={() => !m.read && mutate((w) => { const x = w.inbox.find((y) => y.id === m.id); if (x) x.read = true; }, { save: false })}>
                  <span className={`dot ${m.read ? 'off' : ''}`} />
                  <div style={{ minWidth: 0 }}>
                    <div className="t">
                      {m.kind === 'urgent' && <Badge tone="bad">Urgent</Badge>} {m.title}
                    </div>
                    <div className="small muted">{m.body}</div>
                  </div>
                </li>
              ))}
              {!world.inbox.length && <li className="muted">No messages.</li>}
            </ul>
          </div>
        </div>
        <div className="stack">
          <div className="card">
            <h3>What needs attention</h3>
            <ul className="list">
              {deadlines.map((d, i) => (
                <li key={i} className="row between">
                  <div style={{ minWidth: 0 }}>
                    <div>{d.text}</div>
                    <div className="small muted">{d.why}</div>
                  </div>
                  {d.action && (
                    <button className="btn small" onClick={d.action}>
                      {d.label}
                    </button>
                  )}
                </li>
              ))}
              {!deadlines.length && <li className="muted">Nothing urgent. Advance when ready.</li>}
            </ul>
          </div>
          {sid && (
            <div className="card">
              <h3>Squad status</h3>
              <div className="stack small">
                <div className="row between">
                  <span>Available</span>
                  <strong>
                    {players.filter(isAvailable).length}/{players.length}
                  </strong>
                </div>
                {injured.map((p) => (
                  <div key={p.id} className="row between">
                    <button className="linkish" onClick={() => g.openPlayer(p.id)}>
                      {playerName(p)}
                    </button>
                    <Badge tone="bad">
                      {p.injury!.name} · {p.injury!.weeks} wk
                    </Badge>
                  </div>
                ))}
                {ineligible.map((p) => (
                  <div key={p.id} className="row between">
                    <button className="linkish" onClick={() => g.openPlayer(p.id)}>
                      {playerName(p)}
                    </button>
                    <Badge tone="bad">Academically ineligible</Badge>
                  </div>
                ))}
                {academic.map((p) => (
                  <div key={p.id} className="row between">
                    <button className="linkish" onClick={() => g.openPlayer(p.id)}>
                      {playerName(p)}
                    </button>
                    <Badge tone="warn">GPA {p.gpa.toFixed(2)}</Badge>
                  </div>
                ))}
                {unhappy.map((p) => (
                  <div key={p.id} className="row between">
                    <button className="linkish" onClick={() => g.openPlayer(p.id)}>
                      {playerName(p)}
                    </button>
                    <Badge tone="warn">Unhappy ({Math.round(p.morale)})</Badge>
                  </div>
                ))}
                {risk.map((p) => (
                  <div key={p.id} className="row between">
                    <button className="linkish" onClick={() => g.openPlayer(p.id)}>
                      {playerName(p)}
                    </button>
                    <Badge tone="warn">Transfer risk {p.transferRisk}%</Badge>
                  </div>
                ))}
              </div>
            </div>
          )}
          {sid && (
            <div className="card">
              <div className="card-head">
                <h3>Recruiting</h3>
                <button className="btn small" onClick={() => go('recruiting')}>
                  Open
                </button>
              </div>
              <div className="grid cols-3 small">
                <div className="stat">
                  <span className="v">{openScholarships(world, sid)}</span>
                  <span className="k">Open slots</span>
                </div>
                <div className="stat">
                  <span className="v">{commits.length}</span>
                  <span className="k">Commits</span>
                </div>
                <div className="stat">
                  <span className="v">{board.length}</span>
                  <span className="k">On board</span>
                </div>
              </div>
            </div>
          )}
          {recent.length > 0 && sid && (
            <div className="card">
              <h3>Recent results</h3>
              <ul className="list small">
                {recent.map((x) => {
                  const mine = x.homeId === sid ? x.homePts : x.awayPts;
                  const theirs = x.homeId === sid ? x.awayPts : x.homePts;
                  const o = x.homeId === sid ? x.awayId : x.homeId;
                  return (
                    <li key={x.id} className="row between">
                      <span>
                        <Badge tone={mine > theirs ? 'good' : 'bad'}>{mine > theirs ? 'W' : 'L'}</Badge> {x.homeId === sid ? 'vs' : '@'} <TeamLink id={o} short />
                      </span>
                      <button className="linkish mono" onClick={() => g.openGame(x.id)}>
                        {mine}-{theirs}
                      </button>
                    </li>
                  );
                })}
              </ul>
            </div>
          )}
          {sid && (
            <div className="card small">
              <h3>Program pulse</h3>
              <div className="row between">
                <span>Rank</span>
                <strong>{currentRank(world, sid) ? `#${currentRank(world, sid)}` : 'Unranked'}</strong>
              </div>
              <div className="row between">
                <span>Best player</span>
                <strong>{players.length ? (() => { const b = [...players].sort((a, b) => ovr(b) - ovr(a))[0]; return `${b.last} (${ovr(b)})`; })() : '—'}</strong>
              </div>
              <div className="row between">
                <span>Record</span>
                <strong>{(() => { const r = record(world, sid); return `${r.w}-${r.l}`; })()}</strong>
              </div>
              {isHead && (
                <div className="row between">
                  <span>Board confidence</span>
                  <strong>{Math.round(coach.security)}</strong>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
