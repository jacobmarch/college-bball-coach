import { useState } from 'react';
import { useGame } from './store';
import { Modal, TeamLink, Tabs, pct } from './common';
import type { TeamBox } from '../sim/types';

function TeamTable({ box }: { box: TeamBox }) {
  const { world, openPlayer } = useGame();
  const lines = box.lines.filter((l) => l.min > 0 || l.pts > 0);
  const t = lines.reduce(
    (a, l) => {
      for (const k of ['min', 'pts', 'fgm', 'fga', 'tpm', 'tpa', 'ftm', 'fta', 'orb', 'drb', 'ast', 'stl', 'blk', 'tov', 'pf'] as const) a[k] += l[k];
      return a;
    },
    { min: 0, pts: 0, fgm: 0, fga: 0, tpm: 0, tpa: 0, ftm: 0, fta: 0, orb: 0, drb: 0, ast: 0, stl: 0, blk: 0, tov: 0, pf: 0 },
  );
  return (
    <div className="table-wrap">
      <table className="data">
        <thead>
          <tr>
            <th>{world.schools[box.schoolId]?.abbr}</th>
            <th className="num">MIN</th>
            <th className="num">PTS</th>
            <th className="num">FG</th>
            <th className="num">3P</th>
            <th className="num">FT</th>
            <th className="num">REB</th>
            <th className="num">AST</th>
            <th className="num">STL</th>
            <th className="num">BLK</th>
            <th className="num">TO</th>
            <th className="num">PF</th>
          </tr>
        </thead>
        <tbody>
          {lines.map((l) => (
            <tr key={l.playerId}>
              <td>
                {world.players[l.playerId] ? (
                  <button className="linkish" onClick={() => openPlayer(l.playerId)}>
                    {l.name}
                  </button>
                ) : (
                  l.name
                )}{' '}
                <span className="small muted">
                  {l.pos}
                  {l.starter ? ' ★' : ''}
                </span>
              </td>
              <td className="num">{l.min}</td>
              <td className="num">
                <strong>{l.pts}</strong>
              </td>
              <td className="num">
                {l.fgm}-{l.fga}
              </td>
              <td className="num">
                {l.tpm}-{l.tpa}
              </td>
              <td className="num">
                {l.ftm}-{l.fta}
              </td>
              <td className="num">{l.orb + l.drb}</td>
              <td className="num">{l.ast}</td>
              <td className="num">{l.stl}</td>
              <td className="num">{l.blk}</td>
              <td className="num">{l.tov}</td>
              <td className="num">{l.pf}</td>
            </tr>
          ))}
          <tr>
            <td>
              <strong>Team</strong>
            </td>
            <td className="num">{t.min}</td>
            <td className="num">
              <strong>{t.pts}</strong>
            </td>
            <td className="num">
              {t.fgm}-{t.fga} ({pct(t.fgm, t.fga)})
            </td>
            <td className="num">
              {t.tpm}-{t.tpa} ({pct(t.tpm, t.tpa)})
            </td>
            <td className="num">
              {t.ftm}-{t.fta}
            </td>
            <td className="num">{t.orb + t.drb}</td>
            <td className="num">{t.ast}</td>
            <td className="num">{t.stl}</td>
            <td className="num">{t.blk}</td>
            <td className="num">{t.tov}</td>
            <td className="num">{t.pf}</td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}

function ShotProfile({ box }: { box: TeamBox }) {
  const s = box.shots;
  const tot = s.rimA + s.midA + s.threeA || 1;
  return (
    <div className="small">
      <div>
        At rim: {s.rimM}/{s.rimA} ({pct(s.rimM, s.rimA)}) · {Math.round((s.rimA / tot) * 100)}% of shots
      </div>
      <div>
        Mid-range: {s.midM}/{s.midA} ({pct(s.midM, s.midA)}) · {Math.round((s.midA / tot) * 100)}%
      </div>
      <div>
        Three: {s.threeM}/{s.threeA} ({pct(s.threeM, s.threeA)}) · {Math.round((s.threeA / tot) * 100)}%
      </div>
      <div>
        Possessions {box.poss} · Fast-break pts {box.fastBreak} · Bench pts {box.benchPts}
      </div>
    </div>
  );
}

export function BoxScoreView({ gameId }: { gameId: string }) {
  const { world } = useGame();
  const [tab, setTab] = useState<'box' | 'why' | 'pbp'>('why');
  const game = world.games.find((x) => x.id === gameId);
  if (!game) return <p className="muted">Game not found.</p>;
  const r = game.result;
  return (
    <div className="stack">
      <div className="row between">
        <div className="row" style={{ fontSize: '1.15rem' }}>
          <TeamLink id={game.awayId} /> <strong className="mono">{game.awayPts}</strong>
          <span className="muted">{game.neutral ? 'vs' : '@'}</span>
          <TeamLink id={game.homeId} /> <strong className="mono">{game.homePts}</strong>
          {r && r.ot > 0 && <span className="badge">{r.ot > 1 ? `${r.ot}OT` : 'OT'}</span>}
        </div>
        {r && (
          <div className="small muted mono">
            Halves: {r.away.halves.join('-')} / {r.home.halves.join('-')}
          </div>
        )}
      </div>
      {!r && <p className="muted small">Detailed box scores are kept for your games only.</p>}
      {r && (
        <>
          <Tabs
            value={tab}
            onChange={setTab}
            tabs={[
              { id: 'why', label: 'Why it happened' },
              { id: 'box', label: 'Box score' },
              { id: 'pbp', label: 'Play-by-play' },
            ]}
          />
          {tab === 'why' && (
            <div className="grid cols-2">
              <div className="card">
                <h3>Decisive factors</h3>
                <ul className="small" style={{ margin: 0, paddingLeft: '1.1rem' }}>
                  {r.factors.map((f, i) => (
                    <li key={i} style={{ marginBottom: 4 }}>
                      {f}
                    </li>
                  ))}
                </ul>
              </div>
              <div className="card">
                <h3>Your plan vs. what happened</h3>
                {r.planReview.length ? (
                  <ul className="small" style={{ margin: 0, paddingLeft: '1.1rem' }}>
                    {r.planReview.map((f, i) => (
                      <li key={i} style={{ marginBottom: 4 }}>
                        {f}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="muted small">Not your game.</p>
                )}
              </div>
              <div className="card">
                <h4>{world.schools[r.away.schoolId].abbr} shot profile</h4>
                <ShotProfile box={r.away} />
              </div>
              <div className="card">
                <h4>{world.schools[r.home.schoolId].abbr} shot profile</h4>
                <ShotProfile box={r.home} />
              </div>
            </div>
          )}
          {tab === 'box' && (
            <div className="stack">
              <TeamTable box={r.away} />
              <TeamTable box={r.home} />
            </div>
          )}
          {tab === 'pbp' && (
            <div className="pbp">
              {r.pbp.map((e, i) => (
                <div key={i} className={e.key ? 'key' : ''}>
                  <span className="t">{e.t}</span>
                  <span>{e.text}</span>
                  <span className="s">
                    {e.away}-{e.home}
                  </span>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}

export function BoxScoreModal({ id, onClose }: { id: string; onClose: () => void }) {
  return (
    <Modal title="Game summary" onClose={onClose} wide>
      <BoxScoreView gameId={id} />
    </Modal>
  );
}
