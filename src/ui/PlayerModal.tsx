import { useGame } from './store';
import { Badge, Bar, Modal, TeamLink, fmt1, pct, Tabs } from './common';
import { useState } from 'react';
import { classLabel, heightLabel, ovr, potentialLabel, ratingBand, scoutedBand } from '../sim/player';
import { RATING_KEYS, RATING_LABELS, type DevFocus } from '../sim/types';
import { DEV_FOCUS_LABELS, mpg } from '../sim/development';
import { staffSkill } from '../sim/team';
import { playerMeeting, MEETING_LABELS, meetingKey, type MeetingKind } from '../sim/meetings';
import { releasePlayer, toggleScholarship } from '../sim/offseason';
import { statusBadges } from './screens/Team';

export function PlayerModal({ id, onClose }: { id: string; onClose: () => void }) {
  const { world, mutate } = useGame();
  const [tab, setTab] = useState<'profile' | 'stats' | 'dev'>('profile');
  const p = world.players[id];
  if (!p) return null;
  const coach = world.coaches[world.userCoachId];
  const sid = coach.contract?.schoolId;
  const mine = p.schoolId === sid;
  const isHead = coach.contract?.role === 'head';
  const scout = mine ? 100 : sid ? staffSkill(world, sid, 'scouting') : 50;
  const band = (v: number, salt: number) => {
    if (mine) return [v, v];
    return scoutedBand(v, scout, salt);
  };
  const s = p.stats;
  const g = Math.max(1, s.g);
  return (
    <Modal
      onClose={onClose}
      wide
      title={
        <div>
          <h2>
            {p.first} {p.last} <Badge tone="accent">{mine ? ovr(p) : `${band(ovr(p), 1)[0]}–${band(ovr(p), 1)[1]}`} OVR</Badge>
          </h2>
          <div className="small muted">
            {p.pos}/{p.pos2} · {classLabel(p)} · {heightLabel(p.height)}, {p.weight} lb · {p.hometown} ({p.region}) · {p.origin === 'HS' ? 'HS recruit' : p.origin === 'JUCO' ? 'JUCO transfer' : p.origin}
            {p.schoolId && (
              <>
                {' · '}
                <TeamLink id={p.schoolId} />
              </>
            )}
          </div>
          <div className="row mt" style={{ gap: 4 }}>
            {statusBadges(p)}
          </div>
        </div>
      }
    >
      <Tabs
        value={tab}
        onChange={setTab}
        tabs={[
          { id: 'profile', label: 'Profile' },
          { id: 'stats', label: 'Stats & career' },
          { id: 'dev', label: 'Development' },
        ]}
      />
      {tab === 'profile' && (
        <div className="grid cols-2">
          <div className="card">
            <h3>Ratings {mine ? '' : <span className="small muted">(scouted)</span>}</h3>
            {RATING_KEYS.map((k, i) => {
              const [a, b] = band(p.ratings[k], i * 7 + p.height);
              return (
                <div key={k} className="rating-row">
                  <span>{RATING_LABELS[k]}</span>
                  <Bar value={(a + b) / 2} />
                  <span className="mono small" title={ratingBand(p.ratings[k])}>
                    {a === b ? a : `${a}–${b}`}
                  </span>
                </div>
              );
            })}
            <p className="small mt">
              Potential: <strong>{potentialLabel(p, mine ? 75 : scout * 0.7)}</strong>
            </p>
          </div>
          <div className="stack">
            <div className="card small">
              <h3>Tendencies</h3>
              {(
                [
                  ['Three-point lean', p.tendencies.threeRate],
                  ['Drives', p.tendencies.drive],
                  ['Passing risk', p.tendencies.passRisk],
                  ['Defensive aggression', p.tendencies.defAgg],
                  ['Foul prone', p.tendencies.foul],
                  ['Runs in transition', p.tendencies.transition],
                  ['Clutch comfort', p.tendencies.clutch],
                ] as [string, number][]
              ).map(([l, v]) => (
                <div key={l} className="rating-row">
                  <span>{l}</span>
                  <Bar value={v} tone="warn" />
                  <span className="mono">{v}</span>
                </div>
              ))}
            </div>
            {mine && (
              <div className="card small">
                <h3>Personality & status</h3>
                <div className="grid cols-2">
                  <div>Work ethic: {p.personality.workEthic}</div>
                  <div>Ego: {p.personality.ego}</div>
                  <div>Leadership: {p.personality.leadership}</div>
                  <div>Loyalty: {p.personality.loyalty}</div>
                  <div>Morale: {Math.round(p.morale)}</div>
                  <div>Trust in you: {Math.round(p.trust)}</div>
                  <div>Expects: {p.roleExpect} (~{mpg(p) ? `${fmt1(mpg(p))} mpg now` : 'no games yet'})</div>
                  <div>GPA: {p.gpa.toFixed(2)} {p.eligible ? '' : '(ineligible)'}</div>
                  <div>Fatigue: {Math.round(p.fatigue)}</div>
                  <div>Scholarship: {p.scholarship ? 'Yes' : 'Walk-on'}</div>
                </div>
                <div className="mt">
                  <strong>Transfer risk {p.transferRisk}%</strong>
                  <ul style={{ margin: '0.25rem 0 0 1rem', padding: 0 }}>
                    {p.transferFactors.map((f, i) => (
                      <li key={i}>{f}</li>
                    ))}
                    {!p.transferFactors.length && <li className="muted">No concerns.</li>}
                  </ul>
                </div>
                {p.promise && <div className="callout warn mt">You promised: {p.promise.kind === 'starter' ? 'a starting role' : p.promise.kind === 'minutes' ? '20+ minutes per game' : 'a development plan'} this season.</div>}
              </div>
            )}
            {mine && world.phase !== 'offseason' && (
              <div className="card small">
                <h3>Meet with him</h3>
                <div className="row">
                  {(Object.keys(MEETING_LABELS) as MeetingKind[]).map((k) => (
                    <button key={k} className="btn small" disabled={!!world.flags[meetingKey(world, p.id)]} onClick={() => mutate((w) => playerMeeting(w, p.id, k))}>
                      {MEETING_LABELS[k]}
                    </button>
                  ))}
                </div>
                <p className="tiny muted mt">One meeting per player per week.</p>
              </div>
            )}
            {mine && (
              <div className="card small">
                <h3>Development focus</h3>
                <select value={p.devFocus} onChange={(e) => mutate((w) => void (w.players[p.id].devFocus = e.target.value as DevFocus), { toast: false })} aria-label="Development focus">
                  {(Object.keys(DEV_FOCUS_LABELS) as DevFocus[]).map((k) => (
                    <option key={k} value={k}>
                      {DEV_FOCUS_LABELS[k]}
                    </option>
                  ))}
                </select>
                {isHead && (
                  <div className="row mt">
                    <button className="btn small" onClick={() => mutate((w) => toggleScholarship(w, p.id))}>
                      {p.scholarship ? 'Remove scholarship' : 'Award scholarship'}
                    </button>
                    <button
                      className="btn small danger"
                      onClick={() => {
                        if (confirm(`Release ${p.first} ${p.last}? He leaves the program and teammates will notice.`)) {
                          mutate((w) => releasePlayer(w, p.id));
                          onClose();
                        }
                      }}
                    >
                      Release
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}
      {tab === 'stats' && (
        <div className="stack">
          <div className="card">
            <h3>This season</h3>
            {s.g ? (
              <div className="grid cols-4 small">
                <div className="stat"><span className="v">{fmt1(s.pts / g)}</span><span className="k">PPG</span></div>
                <div className="stat"><span className="v">{fmt1((s.orb + s.drb) / g)}</span><span className="k">RPG</span></div>
                <div className="stat"><span className="v">{fmt1(s.ast / g)}</span><span className="k">APG</span></div>
                <div className="stat"><span className="v">{fmt1(s.min / g)}</span><span className="k">MPG</span></div>
                <div className="stat"><span className="v">{pct(s.fgm, s.fga)}</span><span className="k">FG%</span></div>
                <div className="stat"><span className="v">{pct(s.tpm, s.tpa)}</span><span className="k">3P%</span></div>
                <div className="stat"><span className="v">{pct(s.ftm, s.fta)}</span><span className="k">FT%</span></div>
                <div className="stat"><span className="v">{s.g}/{s.gs}</span><span className="k">G/GS</span></div>
              </div>
            ) : (
              <p className="muted">No games played.</p>
            )}
          </div>
          <div className="card flush">
            <div className="card-head"><h3>Career</h3></div>
            <div className="table-wrap">
              <table className="data">
                <thead>
                  <tr><th>Season</th><th>School</th><th className="num">OVR</th><th className="num">G</th><th className="num">PPG</th><th className="num">RPG</th><th className="num">APG</th><th className="num">FG%</th></tr>
                </thead>
                <tbody>
                  {p.career.map((c) => (
                    <tr key={c.season + c.schoolId}>
                      <td>{c.season}</td>
                      <td>{world.schools[c.schoolId]?.abbr}</td>
                      <td className="num">{c.ovr}</td>
                      <td className="num">{c.stats.g}</td>
                      <td className="num">{fmt1(c.stats.pts / Math.max(1, c.stats.g))}</td>
                      <td className="num">{fmt1((c.stats.orb + c.stats.drb) / Math.max(1, c.stats.g))}</td>
                      <td className="num">{fmt1(c.stats.ast / Math.max(1, c.stats.g))}</td>
                      <td className="num">{pct(c.stats.fgm, c.stats.fga)}</td>
                    </tr>
                  ))}
                  {!p.career.length && <tr><td colSpan={8} className="muted center">First season.</td></tr>}
                </tbody>
              </table>
            </div>
          </div>
          {p.awards.length > 0 && (
            <div className="card">
              <h3>Awards</h3>
              <ul className="small">{p.awards.map((a, i) => <li key={i}>{a}</li>)}</ul>
            </div>
          )}
        </div>
      )}
      {tab === 'dev' && (
        <div className="card">
          <h3>Development history</h3>
          {!p.devHistory.length && <p className="muted small">No offseason development recorded yet. Year-over-year changes and the reasons behind them appear here.</p>}
          <ul className="list small">
            {p.devHistory.map((d, i) => (
              <li key={i}>
                <strong>
                  After season {d.season}: {d.ovrBefore} → {d.ovrAfter} ({d.ovrAfter - d.ovrBefore >= 0 ? '+' : ''}
                  {d.ovrAfter - d.ovrBefore})
                </strong>
                <div className="muted">{d.factors.join(' · ')}</div>
              </li>
            ))}
          </ul>
        </div>
      )}
    </Modal>
  );
}
