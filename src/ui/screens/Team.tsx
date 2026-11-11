import { useState } from 'react';
import { useGame } from '../store';
import { Badge, DataTable, Explain, Seg, Tabs, fmt1, ovrTone, pct } from '../common';
import { classLabel, heightLabel, isAvailable, ovr, ovrAt, potentialLabel, ROLE_MINUTES } from '../../sim/player';
import { autoDepth, chemistry, depthOrder, practicePrep, roster } from '../../sim/team';
import type { DevFocus, Player, PracticePlan, Pos } from '../../sim/types';
import { StrategyEditor } from '../StrategyEditor';
import { DEV_FOCUS_LABELS, mpg } from '../../sim/development';
import { MAX_SCHOLARSHIPS } from '../../sim/recruiting';
import { scholarshipCount } from '../../sim/offseason';

type TabId = 'roster' | 'depth' | 'strategy' | 'practice' | 'stats';

export function Team() {
  const g = useGame();
  const { world, nav } = g;
  const [tab, setTab] = useState<TabId>((nav.tab as TabId) ?? 'roster');
  const coach = world.coaches[world.userCoachId];
  const sid = coach.contract?.schoolId;
  if (!sid) return <div className="card">You are not with a team right now.</div>;
  const school = world.schools[sid];
  const isHead = coach.contract?.role === 'head';
  const chem = chemistry(world, sid);
  return (
    <div className="stack">
      <div className="row between">
        <h1>
          {school.name} {school.mascot}
        </h1>
        <div className="row small">
          <Badge tone={chem.value > 0.1 ? 'good' : chem.value < -0.1 ? 'bad' : undefined}>Chemistry {chem.value >= 0 ? '+' : ''}{(chem.value * 100).toFixed(0)}</Badge>
          <Badge>
            Scholarships {scholarshipCount(world, sid)}/{MAX_SCHOLARSHIPS}
          </Badge>
        </div>
      </div>
      <Tabs<TabId>
        value={tab}
        onChange={setTab}
        tabs={[
          { id: 'roster', label: 'Roster' },
          { id: 'depth', label: 'Depth chart' },
          { id: 'strategy', label: 'Game plan' },
          { id: 'practice', label: 'Practice & development' },
          { id: 'stats', label: 'Stats' },
        ]}
      />
      {!isHead && (tab === 'depth' || tab === 'strategy') && (
        <div className="callout">As an assistant you can view these, but the head coach makes the calls. You control recruiting and individual development plans.</div>
      )}
      {tab === 'roster' && <RosterTab sid={sid} />}
      {tab === 'depth' && <DepthTab sid={sid} editable={isHead} />}
      {tab === 'strategy' && (
        <div className="grid side">
          <div className="card">
            <StrategyEditor value={school.strategy} disabled={!isHead} onChange={(s) => g.mutate((w) => void (w.schools[sid].strategy = s))} />
          </div>
          <div className="card">
            <h3>Team chemistry</h3>
            <ul className="list small">
              {chem.notes.map((n, i) => (
                <li key={i}>{n}</li>
              ))}
            </ul>
            <Explain>Chemistry nudges shooting and ball security by a point or two. It never outweighs talent and tactics.</Explain>
          </div>
        </div>
      )}
      {tab === 'practice' && <PracticeTab sid={sid} isHead={isHead} />}
      {tab === 'stats' && <StatsTab sid={sid} />}
    </div>
  );
}

export function statusBadges(p: Player) {
  const out = [];
  if (p.injury) out.push(<Badge key="i" tone="bad">INJ {p.injury.weeks}w</Badge>);
  if (!p.eligible) out.push(<Badge key="e" tone="bad">Inelig.</Badge>);
  if (p.redshirting) out.push(<Badge key="r" tone="info">Redshirt</Badge>);
  if (p.eligible && p.gpa < 2.2) out.push(<Badge key="g" tone="warn">GPA {p.gpa.toFixed(2)}</Badge>);
  if (p.morale < 45) out.push(<Badge key="m" tone="warn">Unhappy</Badge>);
  if (p.transferRisk >= 45) out.push(<Badge key="t" tone="warn">Portal risk</Badge>);
  if (p.promise) out.push(<Badge key="p" tone="accent">Promised {p.promise.kind}</Badge>);
  if (!p.scholarship) out.push(<Badge key="w">Walk-on</Badge>);
  return out;
}

function RosterTab({ sid }: { sid: string }) {
  const { world, openPlayer } = useGame();
  const players = roster(world, sid);
  const r = (k: keyof Player['ratings'], label: string) => ({ key: k, label, num: true, render: (p: Player) => p.ratings[k], sort: (p: Player) => p.ratings[k] });
  return (
    <div className="card flush">
      <DataTable
        rows={players}
        rowKey={(p) => p.id}
        onRow={(p) => openPlayer(p.id)}
        initialSort="ovr"
        columns={[
          { key: 'name', label: 'Name', render: (p) => <strong>{p.first} {p.last}</strong>, sort: (p) => p.last },
          { key: 'pos', label: 'Pos', render: (p) => `${p.pos}/${p.pos2}`, sort: (p) => p.pos },
          { key: 'yr', label: 'Yr', render: (p) => classLabel(p), sort: (p) => p.year },
          { key: 'ht', label: 'Ht', render: (p) => heightLabel(p.height), sort: (p) => p.height },
          { key: 'ovr', label: 'OVR', num: true, render: (p) => <Badge tone={ovrTone(ovr(p))}>{ovr(p)}</Badge>, sort: (p) => ovr(p) },
          { key: 'pot', label: 'Potential', render: (p) => <span className="small">{potentialLabel(p, 75)}</span>, sort: (p) => p.pot },
          r('fin', 'Fin'),
          r('sht', 'Sht'),
          r('bh', 'BH'),
          r('pas', 'Pas'),
          r('reb', 'Reb'),
          r('pdef', 'PD'),
          r('idef', 'ID'),
          r('ath', 'Ath'),
          r('sta', 'Sta'),
          { key: 'mor', label: 'Morale', num: true, render: (p) => Math.round(p.morale), sort: (p) => p.morale },
          { key: 'role', label: 'Expects', render: (p) => <span className="small">{p.roleExpect}</span> },
          { key: 'st', label: 'Status', render: (p) => <span className="row" style={{ gap: 4 }}>{statusBadges(p)}</span> },
        ]}
      />
    </div>
  );
}

const MINUTES = [31, 30, 29, 28, 27, 17, 15, 12, 7, 4];

function DepthTab({ sid, editable }: { sid: string; editable: boolean }) {
  const { world, mutate, openPlayer } = useGame();
  const order = depthOrder(world, sid);
  const avail = order.filter(isAvailable);
  const slotPos: Pos[] = ['PG', 'SG', 'SF', 'PF', 'C'];
  const move = (id: string, dir: -1 | 1) =>
    mutate((w) => {
      const s = w.schools[sid];
      const ids = depthOrder(w, sid).map((p) => p.id);
      const i = ids.indexOf(id);
      const j = i + dir;
      if (j < 0 || j >= ids.length) return;
      [ids[i], ids[j]] = [ids[j], ids[i]];
      s.depth = ids;
    });
  return (
    <div className="grid side">
      <div className="card flush">
        <div className="card-head">
          <h3>Rotation order</h3>
          {editable && (
            <button className="btn small" onClick={() => mutate((w) => void (w.schools[sid].depth = autoDepth(w, sid)), { toast: false })}>
              Auto-arrange
            </button>
          )}
        </div>
        <div className="table-wrap">
          <table className="data">
            <thead>
              <tr>
                <th>#</th>
                <th>Slot</th>
                <th>Player</th>
                <th className="num">OVR at slot</th>
                <th className="num">Proj. min</th>
                <th className="num">Expects</th>
                <th>Status</th>
                {editable && <th>Move</th>}
              </tr>
            </thead>
            <tbody>
              {order.map((p, i) => {
                const ai = avail.indexOf(p);
                const slot = ai >= 0 && ai < 5 ? slotPos[ai] : ai >= 0 ? 'Bench' : 'Out';
                const exp = ROLE_MINUTES[p.roleExpect];
                const proj = ai >= 0 ? MINUTES[ai] ?? 0 : 0;
                return (
                  <tr key={p.id} className={ai >= 0 && ai < 5 ? 'me' : ''}>
                    <td>{i + 1}</td>
                    <td>{slot}</td>
                    <td>
                      <button className="linkish" onClick={() => openPlayer(p.id)}>
                        {p.first} {p.last}
                      </button>{' '}
                      <span className="small muted">{p.pos}</span>
                    </td>
                    <td className="num">{ai >= 0 && ai < 5 ? ovrAt(p, slotPos[ai]) : ovr(p)}</td>
                    <td className="num">{proj}</td>
                    <td className="num">
                      <span style={{ color: proj + 5 < exp ? 'var(--bad)' : undefined }}>~{exp}</span>
                    </td>
                    <td>
                      <span className="row" style={{ gap: 4 }}>
                        {statusBadges(p)}
                      </span>
                    </td>
                    {editable && (
                      <td className="nowrap">
                        <button className="btn small" aria-label={`Move ${p.last} up`} onClick={() => move(p.id, -1)} disabled={i === 0}>
                          ▲
                        </button>{' '}
                        <button className="btn small" aria-label={`Move ${p.last} down`} onClick={() => move(p.id, 1)} disabled={i === order.length - 1}>
                          ▼
                        </button>
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
      <div className="card">
        <h3>How the rotation works</h3>
        <p className="small">
          The first five available players start. Projected minutes come from your rotation setting ({world.schools[sid].strategy.rotation}) and are adjusted
          in-game for fatigue, foul trouble, and crunch time.
        </p>
        <p className="small">Players whose projected minutes fall well short of what they expect (shown in red) lose morale and may consider the transfer portal.</p>
        <Explain>Injured, ineligible, and redshirting players drop to the bottom automatically.</Explain>
      </div>
    </div>
  );
}

const FOCUS_HELP: Record<PracticePlan['focus'], string> = {
  balanced: 'No special emphasis.',
  offense: 'Sharper offensive execution next game; small shooting/finishing growth.',
  defense: 'Better defensive prep; small defensive growth.',
  transition: 'Faster breaks; athleticism and ball-handling growth.',
  fundamentals: 'Good prep and slow, steady skill growth across the board.',
  conditioning: 'Builds stamina over time, but slightly less game prep this week.',
  rest: 'Players recover from fatigue much faster. Less preparation and growth.',
};

function PracticeTab({ sid, isHead }: { sid: string; isHead: boolean }) {
  const { world, mutate, openPlayer } = useGame();
  const school = world.schools[sid];
  const players = roster(world, sid);
  const prep = practicePrep(world, sid);
  return (
    <div className="stack">
      <div className="card stack">
        <h3>Team practice plan</h3>
        <div className="field">
          <span>Focus</span>
          <Seg
            label="Practice focus"
            disabled={!isHead}
            value={school.practice.focus}
            onChange={(v) => mutate((w) => void (w.schools[sid].practice.focus = v))}
            options={(['balanced', 'offense', 'defense', 'transition', 'fundamentals', 'conditioning', 'rest'] as const).map((f) => ({ id: f, label: f[0].toUpperCase() + f.slice(1) }))}
          />
          <span className="tiny muted">{FOCUS_HELP[school.practice.focus]}</span>
        </div>
        <div className="field">
          <span>Intensity</span>
          <Seg
            label="Intensity"
            disabled={!isHead}
            value={school.practice.intensity}
            onChange={(v) => mutate((w) => void (w.schools[sid].practice.intensity = v))}
            options={[
              { id: 'light', label: 'Light' },
              { id: 'normal', label: 'Normal' },
              { id: 'hard', label: 'Hard' },
            ]}
          />
          <span className="tiny muted">Hard practices speed development and preparation, but raise fatigue and injury risk.</span>
        </div>
        <div className="small">
          Game preparation rating: <strong>{prep >= 0 ? '+' : ''}{(prep * 100).toFixed(0)}</strong> (practice focus, intensity, scouting staff, and coach traits)
        </div>
      </div>
      <div className="card flush">
        <div className="card-head">
          <h3>Individual development plans</h3>
          <span className="small muted">Growth depends on age, potential, minutes, work ethic, coaching, facilities, and fit.</span>
        </div>
        <DataTable
          rows={players}
          rowKey={(p) => p.id}
          initialSort="ovr"
          columns={[
            { key: 'name', label: 'Player', render: (p) => <button className="linkish" onClick={() => openPlayer(p.id)}>{p.first} {p.last}</button>, sort: (p) => p.last },
            { key: 'pos', label: 'Pos', render: (p) => p.pos },
            { key: 'yr', label: 'Yr', render: (p) => classLabel(p), sort: (p) => p.year },
            { key: 'ovr', label: 'OVR', num: true, render: (p) => ovr(p), sort: (p) => ovr(p) },
            { key: 'pot', label: 'Potential', render: (p) => <span className="small">{potentialLabel(p, 75)}</span> },
            { key: 'we', label: 'Work ethic', num: true, render: (p) => p.personality.workEthic, sort: (p) => p.personality.workEthic },
            { key: 'fat', label: 'Fatigue', num: true, render: (p) => Math.round(p.fatigue), sort: (p) => p.fatigue },
            {
              key: 'focus',
              label: 'Focus',
              render: (p) => (
                <select
                  aria-label={`Development focus for ${p.last}`}
                  value={p.devFocus}
                  onClick={(e) => e.stopPropagation()}
                  onChange={(e) => mutate((w) => void (w.players[p.id].devFocus = e.target.value as DevFocus), { toast: false })}
                >
                  {(Object.keys(DEV_FOCUS_LABELS) as DevFocus[]).map((k) => (
                    <option key={k} value={k}>
                      {DEV_FOCUS_LABELS[k]}
                    </option>
                  ))}
                </select>
              ),
            },
            {
              key: 'rs',
              label: 'Redshirt',
              render: (p) =>
                p.redshirtUsed ? (
                  <span className="small muted">Used</span>
                ) : (
                  <label className="row small" style={{ gap: 4 }}>
                    <input
                      type="checkbox"
                      checked={p.redshirting}
                      disabled={!isHead || (p.stats.g > 4 && !p.redshirting)}
                      onChange={() =>
                        mutate((w) => {
                          const x = w.players[p.id];
                          x.redshirting = !x.redshirting;
                          w.schools[sid].depth = w.schools[sid].depth.filter((id) => id !== p.id).concat(x.redshirting ? [p.id] : []);
                          if (!x.redshirting) w.schools[sid].depth = [p.id, ...w.schools[sid].depth.filter((id) => id !== p.id)];
                          return x.redshirting ? `${x.last} will redshirt: he sits this season, practices, and keeps a year of eligibility.` : `${x.last} is back in the rotation.`;
                        })
                      }
                    />
                    {p.redshirting ? 'Yes' : 'No'}
                  </label>
                ),
            },
          ]}
        />
        <div className="small muted" style={{ padding: '0.75rem 1rem' }}>
          Redshirts are allowed until a player has appeared in five games. Redshirting players gain a little extra development.
        </div>
      </div>
    </div>
  );
}

function StatsTab({ sid }: { sid: string }) {
  const { world, openPlayer } = useGame();
  const players = roster(world, sid).filter((p) => p.stats.g > 0);
  const pg = (p: Player, k: keyof Player['stats']) => (p.stats.g ? p.stats[k] / p.stats.g : 0);
  return (
    <div className="card flush">
      <DataTable
        rows={players}
        rowKey={(p) => p.id}
        onRow={(p) => openPlayer(p.id)}
        initialSort="ppg"
        empty="No games played yet."
        columns={[
          { key: 'name', label: 'Player', render: (p) => `${p.first} ${p.last}`, sort: (p) => p.last },
          { key: 'g', label: 'G', num: true, render: (p) => p.stats.g, sort: (p) => p.stats.g },
          { key: 'gs', label: 'GS', num: true, render: (p) => p.stats.gs, sort: (p) => p.stats.gs },
          { key: 'mpg', label: 'MPG', num: true, render: (p) => fmt1(mpg(p)), sort: (p) => mpg(p) },
          { key: 'ppg', label: 'PPG', num: true, render: (p) => fmt1(pg(p, 'pts')), sort: (p) => pg(p, 'pts') },
          { key: 'rpg', label: 'RPG', num: true, render: (p) => fmt1((p.stats.orb + p.stats.drb) / p.stats.g), sort: (p) => (p.stats.orb + p.stats.drb) / p.stats.g },
          { key: 'apg', label: 'APG', num: true, render: (p) => fmt1(pg(p, 'ast')), sort: (p) => pg(p, 'ast') },
          { key: 'spg', label: 'SPG', num: true, render: (p) => fmt1(pg(p, 'stl')), sort: (p) => pg(p, 'stl') },
          { key: 'bpg', label: 'BPG', num: true, render: (p) => fmt1(pg(p, 'blk')), sort: (p) => pg(p, 'blk') },
          { key: 'tov', label: 'TOV', num: true, render: (p) => fmt1(pg(p, 'tov')), sort: (p) => pg(p, 'tov') },
          { key: 'fg', label: 'FG%', num: true, render: (p) => pct(p.stats.fgm, p.stats.fga), sort: (p) => p.stats.fgm / Math.max(1, p.stats.fga) },
          { key: '3p', label: '3P%', num: true, render: (p) => pct(p.stats.tpm, p.stats.tpa), sort: (p) => p.stats.tpm / Math.max(1, p.stats.tpa) },
          { key: 'ft', label: 'FT%', num: true, render: (p) => pct(p.stats.ftm, p.stats.fta), sort: (p) => p.stats.ftm / Math.max(1, p.stats.fta) },
        ]}
      />
    </div>
  );
}
