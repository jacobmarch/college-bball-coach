import { useGame } from '../store';
import { Badge, DataTable, Explain, TeamLink } from '../common';
import { OFFSEASON_LABELS, OFFSEASON_STEPS } from '../../sim/types';
import { offseasonBlocker, openSlotsNow, portalFit, portalOffer, retentionChance, retentionMeeting, scholarshipCount } from '../../sim/offseason';
import { acceptJob, applyForJob, requiredReputation } from '../../sim/career';
import { ovr, playerName, classLabel } from '../../sim/player';
import { MAX_SCHOLARSHIPS } from '../../sim/recruiting';

export function Offseason() {
  const g = useGame();
  const { world, mutate, go } = g;
  const step = world.offseasonStep;
  const rep = world.offseasonReport;
  const coach = world.coaches[world.userCoachId];
  const sid = coach.contract?.schoolId ?? null;
  const blocker = offseasonBlocker(world);
  const idx = OFFSEASON_STEPS.indexOf(step);
  const last = sid ? world.schools[sid].history[world.schools[sid].history.length - 1] : null;
  const hist = world.history[world.history.length - 1];
  const awards = world.awards.filter((a) => a.season === world.season);

  const Lines = ({ lines }: { lines?: string[] }) => (
    <ul className="list small">
      {(lines ?? []).map((l, i) => (
        <li key={i}>{l}</li>
      ))}
    </ul>
  );

  return (
    <div className="stack">
      <h1>Offseason</h1>
      <div className="steps" aria-label="Offseason steps">
        {OFFSEASON_STEPS.map((s, i) => (
          <span key={s} className={`step ${i < idx ? 'done' : i === idx ? 'now' : ''}`}>
            {OFFSEASON_LABELS[s]}
          </span>
        ))}
      </div>

      {step === 'review' && (
        <div className="grid cols-2">
          <div className="card">
            <h3>Your season</h3>
            {last && last.season === world.season ? (
              <div className="stack">
                <div className="row">
                  <span className="stat">
                    <span className="v">
                      {last.w}-{last.l}
                    </span>
                    <span className="k">Record</span>
                  </span>
                  <span className="stat" style={{ marginLeft: '1.5rem' }}>
                    <span className="v">
                      {last.cw}-{last.cl}
                    </span>
                    <span className="k">Conference</span>
                  </span>
                </div>
                <div>{last.finish}</div>
                <div>
                  <Badge tone={/CHAMPION|Final Four|runner/.test(last.postseason) ? 'good' : 'info'}>{last.postseason}</Badge>
                </div>
              </div>
            ) : (
              <p className="muted">You were not coaching this season.</p>
            )}
            <Explain>Continue to see the athletic director's review and signing day results.</Explain>
          </div>
          <div className="card">
            <h3>Around the league</h3>
            <ul className="list small">
              {hist?.nationalChampion && (
                <li>
                  National champion: <TeamLink id={hist.nationalChampion} />
                </li>
              )}
              {awards.filter((a) => !a.name.startsWith('All')).map((a, i) => (
                <li key={i}>
                  <strong>{a.name}:</strong> {a.label}
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}

      {step === 'signing' && (
        <div className="grid cols-2">
          <div className="card">
            <h3>Athletic director's review</h3>
            <Lines lines={rep.review} />
          </div>
          <div className="card">
            <h3>Signing day</h3>
            <Lines lines={rep.signing} />
            <Explain>Each loss shows the recruit's top priority and how your program scored on it versus the school he chose.</Explain>
          </div>
        </div>
      )}

      {step === 'departures' && (
        <div className="card">
          <h3>Graduations and early departures</h3>
          <Lines lines={rep.departures} />
          <Explain>Next: the transfer portal opens. Players unhappy with their role, trust, or promises may leave unless you talk them out of it.</Explain>
        </div>
      )}

      {step === 'portal' && sid && <Portal />}
      {step === 'portal' && !sid && <div className="card muted">You are not at a school, so the portal does not concern you this year.</div>}

      {step === 'jobs' && (
        <div className="stack">
          <div className="card">
            <h3>Portal results</h3>
            <Lines lines={rep.portal} />
          </div>
          <div className="card">
            <div className="card-head">
              <h3>Coaching carousel</h3>
              <span className="small muted">Your reputation: {Math.round(coach.reputation)}</span>
            </div>
            <Explain>
              Apply to see exactly how a school rates you. Accepting a job moves you there for next season; your old program will hire a replacement. Offers expire when you continue.
            </Explain>
            <DataTable
              rows={world.jobs}
              rowKey={(j) => j.schoolId + j.role}
              columns={[
                { key: 'school', label: 'School', render: (j) => <TeamLink id={j.schoolId} showRank={false} /> },
                { key: 'role', label: 'Role', render: (j) => (j.role === 'head' ? 'Head coach' : 'Assistant') },
                { key: 'prestige', label: 'Prestige', num: true, render: (j) => world.schools[j.schoolId].prestige, sort: (j) => world.schools[j.schoolId].prestige },
                { key: 'need', label: 'Rep. sought', num: true, render: (j) => requiredReputation(world, j.schoolId, j.role) },
                { key: 'salary', label: 'Salary', num: true, render: (j) => `$${j.salary}K × ${j.years}y` },
                { key: 'why', label: 'Why open', render: (j) => <span className="small muted">{j.reason}</span> },
                {
                  key: 'act',
                  label: '',
                  render: (j) =>
                    j.offered ? (
                      <button className="btn primary small" onClick={() => mutate((w) => acceptJob(w, j.schoolId))}>
                        Accept offer
                      </button>
                    ) : j.applied ? (
                      <Badge tone="bad">Turned down</Badge>
                    ) : (
                      <button className="btn small" onClick={() => mutate((w) => applyForJob(w, j.schoolId))}>
                        Apply
                      </button>
                    ),
                },
              ]}
              empty="No openings this year."
            />
            {world.jobs.filter((j) => j.applied).map((j) => (
              <div key={j.schoolId} className={`callout ${j.offered ? 'good' : 'warn'} mt`}>
                <strong>{world.schools[j.schoolId].name}:</strong>
                <ul className="small" style={{ margin: '0.25rem 0 0 1rem', padding: 0 }}>
                  {j.rationale.map((l, i) => (
                    <li key={i}>{l}</li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>
      )}

      {step === 'staff' && (
        <div className="grid cols-2">
          <div className="card">
            <h3>Carousel results</h3>
            <Lines lines={rep.jobs?.length ? rep.jobs : ['No head-coaching changes this year.']} />
          </div>
          <div className="card">
            <h3>Your staff</h3>
            <p className="small">Assistants with ambition may have left for promotions. A fresh pool of candidates is available.</p>
            <button className="btn" onClick={() => go('program')}>
              Manage staff in Program
            </button>
          </div>
        </div>
      )}

      {step === 'progression' && (
        <div className="card">
          <h3>Player development and new arrivals</h3>
          <Lines lines={rep.progression} />
          <Explain>Open any player to see the factors behind his change: work ethic, minutes, coaching, facilities, and his development focus.</Explain>
        </div>
      )}

      {step === 'ready' && sid && (
        <div className="card">
          <h3>Ready for season {world.season + 1}</h3>
          <p>
            Scholarship players: <strong>{scholarshipCount(world, sid)}</strong> / {MAX_SCHOLARSHIPS}
          </p>
          <button className="btn" onClick={() => go('team')}>
            Review roster
          </button>
        </div>
      )}

      {blocker && <div className="callout bad">{blocker}</div>}
      <div className="row">
        <button className="btn primary big" disabled={!!blocker || !!g.busy} onClick={() => g.offseasonNext()}>
          {step === 'ready' ? `Start season ${world.season + 1}` : `Continue to ${OFFSEASON_LABELS[OFFSEASON_STEPS[idx + 1]]}`} →
        </button>
      </div>
    </div>
  );
}

function Portal() {
  const { world, mutate, openPlayer } = useGame();
  const sid = world.coaches[world.userCoachId].contract!.schoolId;
  const mine = world.portal.filter((e) => e.fromSchoolId === sid);
  const others = world.portal.filter((e) => e.fromSchoolId !== sid);
  const isHead = world.coaches[world.userCoachId].contract?.role === 'head';
  return (
    <div className="stack">
      <div className="card">
        <div className="card-head">
          <h3>Players considering a transfer</h3>
          <Badge tone="accent">{world.retentionMeetingsLeft} meetings left</Badge>
        </div>
        <Explain>Promises raise the odds he stays, but he will expect you to keep them next season. Broken promises hurt morale and trust across the roster.</Explain>
        {!mine.length && <p className="muted">Nobody on your roster is looking to leave.</p>}
        <ul className="list">
          {mine.map((e) => {
            const p = world.players[e.playerId];
            return (
              <li key={e.playerId} className="stack">
                <div className="row between">
                  <div>
                    <button className="linkish" onClick={() => openPlayer(e.playerId)}>
                      {playerName(p)}
                    </button>{' '}
                    <span className="small muted">
                      {p.pos} · {classLabel(p)} · {ovr(p)} OVR
                    </span>
                    <div className="small muted">Reasons: {e.reasons.join('; ') || 'personal'}</div>
                  </div>
                  {e.decided ? <Badge tone="bad">Entering portal</Badge> : <Badge tone="warn">Undecided</Badge>}
                </div>
                {!e.decided && (
                  <div className="row">
                    {(['listen', 'development', 'minutes', 'starter'] as const).map((k) => (
                      <button key={k} className="btn small" disabled={world.retentionMeetingsLeft <= 0} onClick={() => mutate((w) => retentionMeeting(w, e.playerId, k))}>
                        {k === 'listen' ? 'Just listen' : k === 'development' ? 'Promise dev plan' : k === 'minutes' ? 'Promise 20+ min' : 'Promise starter'} ({Math.round(retentionChance(world, e.playerId, k) * 100)}%)
                      </button>
                    ))}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      </div>
      <div className="card">
        <div className="card-head">
          <h3>Transfer portal</h3>
          <Badge tone="accent">{Math.max(0, openSlotsNow(world, sid))} open scholarships</Badge>
        </div>
        <Explain>Fit blends your prestige, likely playing time at his position, and distance from home. Players decide when you continue.</Explain>
        {!isHead && <p className="small muted">As an assistant you can still pitch transfers on behalf of the head coach.</p>}
        <DataTable
          rows={others}
          rowKey={(e) => e.playerId}
          initialSort="ovr"
          columns={[
            { key: 'name', label: 'Player', render: (e) => playerName(world.players[e.playerId]) },
            { key: 'pos', label: 'Pos', render: (e) => world.players[e.playerId].pos, sort: (e) => world.players[e.playerId].pos },
            { key: 'yr', label: 'Class', render: (e) => classLabel(world.players[e.playerId]) },
            { key: 'ovr', label: 'OVR', num: true, render: (e) => ovr(world.players[e.playerId]), sort: (e) => ovr(world.players[e.playerId]) },
            { key: 'from', label: 'From', render: (e) => world.schools[e.fromSchoolId].abbr },
            { key: 'fit', label: 'Fit w/ you', num: true, render: (e) => portalFit(world, e.playerId, sid), sort: (e) => portalFit(world, e.playerId, sid) },
            { key: 'why', label: 'Why he left', render: (e) => <span className="small muted">{e.reasons[0] ?? '—'}</span> },
            {
              key: 'act',
              label: '',
              render: (e) => (
                <button className={`btn small ${e.offers.includes(sid) ? '' : 'primary'}`} onClick={() => mutate((w) => portalOffer(w, e.playerId))}>
                  {e.offers.includes(sid) ? 'Withdraw' : 'Offer'}
                </button>
              ),
            },
          ]}
        />
      </div>
    </div>
  );
}
