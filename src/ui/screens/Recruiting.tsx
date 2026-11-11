import { useMemo, useState } from 'react';
import { useGame } from '../store';
import { Badge, Bar, DataTable, Explain, Modal, Stars, Tabs } from '../common';
import type { PitchTopic, Pos, Recruit } from '../../sim/types';
import { PITCH_LABELS, POSITIONS, RATING_KEYS, RATING_LABELS } from '../../sim/types';
import { heightLabel, ovr, playerName, scoutedBand } from '../../sim/player';
import { ACTION_COSTS, MAX_SCHOLARSHIPS, openScholarships, recruitAction, topicScore, weeklyRecruitingPoints } from '../../sim/recruiting';
import { REGIONS } from '../../sim/names';
import { roster } from '../../sim/team';

type TabId = 'prospects' | 'board' | 'needs';

export function ovrBand(r: Recruit): [number, number] {
  return scoutedBand(ovr(r.player), r.scouted, r.rank);
}
export function potBand(r: Recruit): [number, number] {
  return scoutedBand(r.player.pot, r.scouted * 0.8, r.rank + 7);
}

function interestWord(v: number): string {
  return v >= 75 ? 'Very high' : v >= 55 ? 'High' : v >= 35 ? 'Medium' : v >= 15 ? 'Low' : 'Minimal';
}

export function Recruiting() {
  const g = useGame();
  const { world, nav } = g;
  const [tab, setTab] = useState<TabId>((nav.tab as TabId) ?? 'prospects');
  const [pos, setPos] = useState<Pos | 'all'>('all');
  const [stars, setStars] = useState(0);
  const [region, setRegion] = useState('all');
  const [kind, setKind] = useState<'all' | 'HS' | 'JUCO'>('all');
  const [hideTaken, setHideTaken] = useState(true);
  const [open, setOpen] = useState<string | null>(null);
  const coach = world.coaches[world.userCoachId];
  const sid = coach.contract?.schoolId;
  const all = Object.values(world.recruits);
  const rows = useMemo(
    () =>
      all.filter(
        (r) =>
          (pos === 'all' || r.player.pos === pos) &&
          r.stars >= stars &&
          (region === 'all' || r.player.region === region) &&
          (kind === 'all' || r.kind === kind) &&
          (!hideTaken || !r.committedTo || r.committedTo === sid) &&
          (tab !== 'board' || r.onBoard),
      ),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [g.version, pos, stars, region, kind, hideTaken, tab],
  );
  if (!sid) return <div className="card">You need a job to recruit.</div>;
  const school = world.schools[sid];
  const commits = all.filter((r) => r.committedTo === sid);

  return (
    <div className="stack">
      <div className="row between">
        <h1>Recruiting</h1>
        <div className="row">
          <Badge tone="accent">
            {world.recruitingPointsLeft}/{weeklyRecruitingPoints(world, sid)} hours this week
          </Badge>
          <Badge>{openScholarships(world, sid)} open scholarships</Badge>
          <Badge tone="good">{commits.length} committed</Badge>
        </div>
      </div>
      {world.phase === 'offseason' && <div className="callout">Signing day has passed. The next class appears when the new season begins.</div>}
      <Explain>
        Hours reset weekly. Scouting narrows the rating ranges. Calls reveal what a prospect cares about; pitches only work on things he values and that your program can honestly back up.
        Prospects commit once a school with an offer leads clearly, more often as the season goes on.
      </Explain>
      <Tabs<TabId>
        value={tab}
        onChange={setTab}
        tabs={[
          { id: 'prospects', label: `All prospects (${all.length})` },
          { id: 'board', label: `My board (${all.filter((r) => r.onBoard).length})` },
          { id: 'needs', label: 'Class needs' },
        ]}
      />
      {tab !== 'needs' && (
        <>
          <div className="row small">
            <select aria-label="Position" value={pos} onChange={(e) => setPos(e.target.value as Pos | 'all')}>
              <option value="all">All positions</option>
              {POSITIONS.map((p) => (
                <option key={p}>{p}</option>
              ))}
            </select>
            <select aria-label="Minimum stars" value={stars} onChange={(e) => setStars(Number(e.target.value))}>
              <option value={0}>Any stars</option>
              {[2, 3, 4, 5].map((s) => (
                <option key={s} value={s}>
                  {s}★ and up
                </option>
              ))}
            </select>
            <select aria-label="Region" value={region} onChange={(e) => setRegion(e.target.value)}>
              <option value="all">All regions</option>
              {REGIONS.map((r) => (
                <option key={r}>{r}</option>
              ))}
            </select>
            <select aria-label="Type" value={kind} onChange={(e) => setKind(e.target.value as 'all' | 'HS' | 'JUCO')}>
              <option value="all">HS + JUCO</option>
              <option value="HS">High school</option>
              <option value="JUCO">Junior college</option>
            </select>
            <label className="row" style={{ gap: 4 }}>
              <input type="checkbox" checked={hideTaken} onChange={(e) => setHideTaken(e.target.checked)} /> Hide committed elsewhere
            </label>
            <span className="muted">Your region: {school.region}</span>
          </div>
          <div className="card flush">
            <DataTable
              rows={rows}
              rowKey={(r) => r.id}
              onRow={(r) => setOpen(r.id)}
              initialSort="rank"
              pageSize={50}
              desc={false}
              highlight={(r) => r.committedTo === sid}
              empty={tab === 'board' ? 'Your board is empty. Open a prospect and scout, call, or offer to add him.' : 'No prospects match.'}
              columns={[
                { key: 'rank', label: 'Rank', num: true, render: (r) => r.rank, sort: (r) => r.rank },
                { key: 'stars', label: 'Stars', render: (r) => <Stars n={r.stars} />, sort: (r) => r.stars },
                { key: 'name', label: 'Name', render: (r) => <strong>{playerName(r.player)}</strong>, sort: (r) => r.player.last },
                { key: 'pos', label: 'Pos', render: (r) => r.player.pos, sort: (r) => r.player.pos },
                { key: 'kind', label: 'Type', render: (r) => r.kind },
                { key: 'ht', label: 'Ht', render: (r) => heightLabel(r.player.height), sort: (r) => r.player.height },
                { key: 'home', label: 'Hometown', render: (r) => <span className="small">{r.player.hometown} ({r.player.region})</span>, sort: (r) => r.player.region },
                { key: 'ovr', label: 'OVR (scouted)', render: (r) => { const [a, b] = ovrBand(r); return `${a}–${b}`; }, sort: (r) => ovrBand(r)[0] },
                { key: 'pot', label: 'Potential', render: (r) => { const [a, b] = potBand(r); return `${a}–${b}`; }, sort: (r) => potBand(r)[0] },
                { key: 'sc', label: 'Scouted', num: true, render: (r) => `${Math.round(r.scouted)}%`, sort: (r) => r.scouted },
                { key: 'int', label: 'Your interest', num: true, render: (r) => (r.interest[sid] !== undefined ? Math.round(r.interest[sid]) : '—'), sort: (r) => r.interest[sid] ?? -1 },
                {
                  key: 'status',
                  label: 'Status',
                  render: (r) =>
                    r.committedTo ? (
                      <Badge tone={r.committedTo === sid ? 'good' : 'bad'}>Committed: {world.schools[r.committedTo].abbr}</Badge>
                    ) : r.offers.includes(sid) ? (
                      <Badge tone="accent">Offered · {r.offers.length} offers</Badge>
                    ) : (
                      <span className="small muted">{r.offers.length} offers</span>
                    ),
                },
              ]}
            />
          </div>
        </>
      )}
      {tab === 'needs' && <Needs sid={sid} />}
      {open && <RecruitModal id={open} onClose={() => setOpen(null)} />}
    </div>
  );
}

function Needs({ sid }: { sid: string }) {
  const { world } = useGame();
  const players = roster(world, sid);
  const returning = players.filter((p) => p.year < 4 || p.redshirting);
  const commits = Object.values(world.recruits).filter((r) => r.committedTo === sid);
  return (
    <div className="grid cols-2">
      <div className="card">
        <h3>Next year's roster by position</h3>
        <table className="data">
          <thead>
            <tr>
              <th>Pos</th>
              <th className="num">Returning</th>
              <th className="num">Seniors leaving</th>
              <th className="num">Commits</th>
              <th>Need</th>
            </tr>
          </thead>
          <tbody>
            {POSITIONS.map((p) => {
              const ret = returning.filter((x) => x.pos === p).length;
              const sr = players.filter((x) => x.pos === p && x.year >= 4 && !x.redshirting).length;
              const cm = commits.filter((r) => r.player.pos === p).length;
              const total = ret + cm;
              const need = total < 2 ? 'High' : total < 3 ? 'Medium' : 'Low';
              return (
                <tr key={p}>
                  <td>{p}</td>
                  <td className="num">{ret}</td>
                  <td className="num">{sr}</td>
                  <td className="num">{cm}</td>
                  <td>
                    <Badge tone={need === 'High' ? 'bad' : need === 'Medium' ? 'warn' : 'good'}>{need}</Badge>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        <p className="small muted mt">
          Scholarship limit {MAX_SCHOLARSHIPS}. Projected open: {openScholarships(world, sid)} (before transfers and early departures).
        </p>
      </div>
      <div className="card">
        <h3>Committed class</h3>
        <ul className="list">
          {commits.map((r) => (
            <li key={r.id} className="row between">
              <span>
                <Stars n={r.stars} /> {playerName(r.player)} <span className="muted small">{r.player.pos} · {r.kind}</span>
              </span>
              <span className="small muted">#{r.rank}</span>
            </li>
          ))}
          {!commits.length && <li className="muted">No commitments yet.</li>}
        </ul>
      </div>
    </div>
  );
}

function RecruitModal({ id, onClose }: { id: string; onClose: () => void }) {
  const { world, mutate, version } = useGame();
  const [topic, setTopic] = useState<PitchTopic>('playingTime');
  const r = world.recruits[id];
  void version;
  if (!r) return null;
  const sid = world.coaches[world.userCoachId].contract!.schoolId;
  const school = world.schools[sid];
  const p = r.player;
  const mine = r.interest[sid];
  const [oa, ob] = ovrBand(r);
  const [pa, pb] = potBand(r);
  const competitors = Object.entries(r.interest)
    .filter(([s]) => s !== sid)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5);
  const done = r.weekActions;
  const act = (a: Parameters<typeof recruitAction>[2], t?: PitchTopic) => mutate((w) => recruitAction(w, id, a, t).message);
  const closed = !!r.signedWith || (r.committedTo && r.committedTo !== sid) || world.phase === 'offseason';

  return (
    <Modal
      onClose={onClose}
      wide
      title={
        <div>
          <h2>
            {playerName(p)} <Stars n={r.stars} />
          </h2>
          <div className="small muted">
            #{r.rank} overall · {p.pos}/{p.pos2} · {heightLabel(p.height)}, {p.weight} lb · {r.kind === 'JUCO' ? 'Junior college' : 'High school'} · {p.hometown} ({p.region}) · GPA {p.gpa.toFixed(2)}
          </div>
        </div>
      }
    >
      <div className="grid cols-2">
        <div className="stack">
          <div className="card">
            <h3>Scouting report</h3>
            <div className="row small mb">
              <Badge>Confidence {Math.round(r.scouted)}%</Badge>
              <span>
                OVR <strong>{oa}–{ob}</strong> · Potential <strong>{pa}–{pb}</strong>
              </span>
            </div>
            {RATING_KEYS.map((k) => {
              const [a, b] = scoutedBand(p.ratings[k], r.scouted, r.rank + k.length * 13);
              return (
                <div key={k} className="rating-row">
                  <span>{RATING_LABELS[k]}</span>
                  <div className="bar" style={{ position: 'relative' }}>
                    <span style={{ marginLeft: `${a}%`, width: `${Math.max(2, b - a)}%`, opacity: 0.85 }} />
                  </div>
                  <span className="mono small">
                    {a}–{b}
                  </span>
                </div>
              );
            })}
            <p className="tiny muted mt">Ranges narrow as you scout. A lower-ranked recruit can outperform his stars.</p>
          </div>
        </div>
        <div className="stack">
          <div className="card">
            <h3>Recruitment</h3>
            <div className="small">What matters to him:</div>
            <ol className="small" style={{ margin: '0.25rem 0 0.5rem 1.2rem', padding: 0 }}>
              {r.priorities.map((t, i) => (
                <li key={t}>
                  {i < r.knownPriorities ? (
                    <>
                      <strong>{PITCH_LABELS[t]}</strong> <span className="muted">(you: {Math.round(topicScore(world, r, school, t))}/100)</span>
                    </>
                  ) : (
                    <span className="muted">Unknown. Call him to find out.</span>
                  )}
                </li>
              ))}
            </ol>
            <div className="small">Your interest level</div>
            {mine !== undefined ? (
              <div className="row">
                <div style={{ flex: 1 }}>
                  <Bar value={mine} />
                </div>
                <span className="mono">{Math.round(mine)}</span>
              </div>
            ) : (
              <p className="small muted">Not on your radar yet.</p>
            )}
            <div className="small mt">Other schools involved:</div>
            <ul className="small" style={{ margin: '0.25rem 0 0 1.2rem', padding: 0 }}>
              {competitors.map(([s, v]) => (
                <li key={s}>
                  {world.schools[s].name} — {interestWord(v)} {r.offers.includes(s) ? '(offered)' : ''}
                </li>
              ))}
              {!competitors.length && <li className="muted">None yet</li>}
            </ul>
            {r.committedTo && (
              <div className={`callout ${r.committedTo === sid ? 'good' : 'warn'} mt`}>
                {r.signedWith ? 'Signed with' : 'Committed to'} {world.schools[r.committedTo].name}.
              </div>
            )}
          </div>
          {!closed && (
            <div className="card stack">
              <div className="row between">
                <h3>Actions</h3>
                <Badge tone="accent">{world.recruitingPointsLeft} hours left</Badge>
              </div>
              <div className="row">
                <button className="btn small" disabled={done.includes('scout')} onClick={() => act('scout')}>
                  Scout ({ACTION_COSTS.scout}h)
                </button>
                <button className="btn small" disabled={done.includes('call')} onClick={() => act('call')}>
                  Call ({ACTION_COSTS.call}h)
                </button>
                <button className="btn small" disabled={done.includes('homeVisit')} onClick={() => act('homeVisit')}>
                  Home visit ({ACTION_COSTS.homeVisit}h)
                </button>
                <button className="btn small" disabled={done.includes('campusVisit') || r.visited.includes(sid)} onClick={() => act('campusVisit')}>
                  {r.visited.includes(sid) ? 'Visited campus' : `Campus visit (${ACTION_COSTS.campusVisit}h)`}
                </button>
              </div>
              <div className="row">
                <select aria-label="Pitch topic" value={topic} onChange={(e) => setTopic(e.target.value as PitchTopic)}>
                  {(Object.keys(PITCH_LABELS) as PitchTopic[]).map((t) => (
                    <option key={t} value={t}>
                      {PITCH_LABELS[t]} (you: {Math.round(topicScore(world, r, school, t))})
                    </option>
                  ))}
                </select>
                <button className="btn small" disabled={done.includes('pitch')} onClick={() => act('pitch', topic)}>
                  Pitch ({ACTION_COSTS.pitch}h)
                </button>
              </div>
              <div className="row">
                {r.offers.includes(sid) ? (
                  <button className="btn danger small" onClick={() => act('pull')}>
                    Pull scholarship offer
                  </button>
                ) : (
                  <button className="btn primary small" onClick={() => act('offer')}>
                    Offer scholarship
                  </button>
                )}
                <label className="row small" style={{ gap: 4 }}>
                  <input type="checkbox" checked={r.onBoard} onChange={() => mutate((w) => void (w.recruits[id].onBoard = !w.recruits[id].onBoard), { toast: false })} /> On my board
                </label>
              </div>
              <p className="tiny muted">Pitching something your program can't back up (a score under 40) costs interest. Each action can be used once per week.</p>
            </div>
          )}
          <div className="card">
            <h3>Timeline</h3>
            <ul className="list small">
              {r.log.slice(0, 8).map((l, i) => (
                <li key={i}>{l}</li>
              ))}
              {!r.log.length && <li className="muted">Nothing yet.</li>}
            </ul>
          </div>
        </div>
      </div>
    </Modal>
  );
}
