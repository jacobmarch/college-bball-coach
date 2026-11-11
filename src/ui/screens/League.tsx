import { useState } from 'react';
import { useGame } from '../store';
import { Badge, DataTable, Logo, TeamLink, Tabs, fmt1 } from '../common';
import { resume, standings, powerScores } from '../../sim/season';
import { ovr, playerName, classLabel } from '../../sim/player';
import { roster, teamStrength } from '../../sim/team';
import type { Bracket, Player } from '../../sim/types';
import { strategySummary } from '../StrategyEditor';

type TabId = 'standings' | 'rankings' | 'leaders' | 'brackets' | 'teams' | 'history';

export function League() {
  const g = useGame();
  const { world, nav } = g;
  const [tab, setTab] = useState<TabId>((nav.tab as TabId) ?? 'standings');
  const [team, setTeam] = useState<string | undefined>(nav.param);
  const sid = world.coaches[world.userCoachId].contract?.schoolId;
  const [conf, setConf] = useState<string>(sid ? world.schools[sid].conferenceId : Object.keys(world.conferences)[0]);
  if (nav.param && nav.param !== team) {
    setTeam(nav.param);
    setTab('teams');
  }
  return (
    <div className="stack">
      <h1>League</h1>
      <Tabs<TabId>
        value={tab}
        onChange={(t) => {
          setTab(t);
          if (t !== 'teams') setTeam(undefined);
        }}
        tabs={[
          { id: 'standings', label: 'Standings' },
          { id: 'rankings', label: 'Rankings' },
          { id: 'leaders', label: 'Leaders' },
          { id: 'brackets', label: 'Tournaments' },
          { id: 'teams', label: 'Teams' },
          { id: 'history', label: 'History' },
        ]}
      />
      {tab === 'standings' && (
        <>
          {Object.keys(world.conferences).length > 1 && (
            <select value={conf} onChange={(e) => setConf(e.target.value)} aria-label="Conference" style={{ maxWidth: 320 }}>
              {Object.values(world.conferences).map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name} (tier {c.tier})
                </option>
              ))}
            </select>
          )}
          <div className="card flush">
            <DataTable
              rows={standings(world, conf)}
              rowKey={(r) => r.schoolId}
              highlight={(r) => r.schoolId === sid}
              columns={[
                { key: 'team', label: 'Team', render: (r) => <TeamLink id={r.schoolId} /> },
                { key: 'conf', label: 'Conf', render: (r) => `${r.cw}-${r.cl}` },
                { key: 'all', label: 'Overall', render: (r) => `${r.w}-${r.l}` },
                { key: 'home', label: 'Home', render: (r) => r.home },
                { key: 'away', label: 'Away', render: (r) => r.away },
                { key: 'pd', label: 'Margin', num: true, render: (r) => fmt1((r.pf - r.pa) / Math.max(1, r.w + r.l)) },
                { key: 'l10', label: 'Last 10', render: (r) => r.last10 },
                { key: 'st', label: 'Streak', render: (r) => r.streak },
              ]}
            />
          </div>
        </>
      )}
      {tab === 'rankings' && <Rankings />}
      {tab === 'leaders' && <Leaders />}
      {tab === 'brackets' && <Brackets />}
      {tab === 'teams' && (team ? <TeamPage id={team} onBack={() => setTeam(undefined)} /> : <TeamsList onPick={setTeam} />)}
      {tab === 'history' && <History />}
    </div>
  );
}

function Rankings() {
  const { world } = useGame();
  const sid = world.coaches[world.userCoachId].contract?.schoolId;
  const last = world.rankings[world.rankings.length - 1];
  const prev = world.rankings[world.rankings.length - 2];
  const res = resume(world);
  if (!last) return <p className="muted">Rankings are published once the season begins.</p>;
  return (
    <div className="card flush">
      <div className="card-head">
        <h3>Top {last.ids.length}</h3>
        <span className="small muted">Blend of record, strength of schedule, margin, quality wins, and roster strength early in the year</span>
      </div>
      <DataTable
        rows={last.ids.map((id, i) => ({ id, i }))}
        rowKey={(r) => r.id}
        highlight={(r) => r.id === sid}
        columns={[
          { key: 'rk', label: '#', num: true, render: (r) => r.i + 1 },
          {
            key: 'chg',
            label: '±',
            render: (r) => {
              if (!prev) return '';
              const p = prev.ids.indexOf(r.id);
              if (p < 0) return <Badge tone="info">new</Badge>;
              const d = p - r.i;
              return d === 0 ? '–' : <span style={{ color: d > 0 ? 'var(--good)' : 'var(--bad)' }}>{d > 0 ? `▲${d}` : `▼${-d}`}</span>;
            },
          },
          { key: 'team', label: 'Team', render: (r) => <TeamLink id={r.id} showRank={false} /> },
          { key: 'conf', label: 'Conf', render: (r) => world.conferences[world.schools[r.id].conferenceId].abbr },
          { key: 'rec', label: 'Record', render: (r) => `${Math.round(res[r.id].wp * 100)}% W` },
          { key: 'sos', label: 'Opp. W%', num: true, render: (r) => res[r.id].owp.toFixed(3) },
          { key: 'q1', label: 'Quality W', num: true, render: (r) => res[r.id].q1 },
        ]}
      />
    </div>
  );
}

function Leaders() {
  const { world, openPlayer } = useGame();
  const players = Object.values(world.players).filter((p) => p.schoolId && p.stats.g >= Math.max(1, Math.floor(world.week / 3)));
  const cats: { label: string; v: (p: Player) => number }[] = [
    { label: 'Points', v: (p) => p.stats.pts / p.stats.g },
    { label: 'Rebounds', v: (p) => (p.stats.orb + p.stats.drb) / p.stats.g },
    { label: 'Assists', v: (p) => p.stats.ast / p.stats.g },
    { label: 'Steals', v: (p) => p.stats.stl / p.stats.g },
    { label: 'Blocks', v: (p) => p.stats.blk / p.stats.g },
    { label: '3-pointers made', v: (p) => p.stats.tpm / p.stats.g },
  ];
  if (!players.length) return <p className="muted">No stats yet.</p>;
  return (
    <div className="grid cols-3">
      {cats.map((c) => (
        <div key={c.label} className="card">
          <h3>{c.label} per game</h3>
          <ol className="small" style={{ margin: 0, paddingLeft: '1.2rem' }}>
            {[...players]
              .sort((a, b) => c.v(b) - c.v(a))
              .slice(0, 10)
              .map((p) => (
                <li key={p.id}>
                  <button className="linkish" onClick={() => openPlayer(p.id)}>
                    {playerName(p)}
                  </button>{' '}
                  <span className="muted">{world.schools[p.schoolId!].abbr}</span> <strong className="mono">{fmt1(c.v(p))}</strong>
                </li>
              ))}
          </ol>
        </div>
      ))}
    </div>
  );
}

function BracketView({ b }: { b: Bracket }) {
  const { world, openGame } = useGame();
  const sid = world.coaches[world.userCoachId].contract?.schoolId;
  return (
    <div className="card">
      <div className="card-head">
        <h3>{b.name}</h3>
        {b.championId && <Badge tone="good">Champion: {world.schools[b.championId].name}</Badge>}
      </div>
      <div className="bracket">
        {b.rounds.map((ids, ri) => (
          <div className="bracket-round" key={ri}>
            {ids.map((id) => {
              const gm = world.games.find((x) => x.id === id)!;
              const row = (team: string, pts: number, win: boolean) => (
                <div className={`${win ? 'w' : ''} ${team === sid ? 'me' : ''}`}>
                  <span>
                    <span className="muted">{b.seeds[team]}</span> {world.schools[team].abbr}
                  </span>
                  <span className="mono">{gm.played ? pts : ''}</span>
                </div>
              );
              return (
                <button key={id} className="bracket-game linkish" style={{ fontWeight: 400 }} onClick={() => gm.result && openGame(id)}>
                  {row(gm.homeId, gm.homePts, gm.played && gm.homePts > gm.awayPts)}
                  {row(gm.awayId, gm.awayPts, gm.played && gm.awayPts > gm.homePts)}
                </button>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}

function Brackets() {
  const { world } = useGame();
  const confs = Object.entries(world.brackets.conf);
  const nb = world.brackets.national;
  if (!confs.length && !nb) {
    const ps = powerScores(world);
    const res = resume(world);
    const multi = Object.keys(world.conferences).length > 1;
    const bubble = Object.keys(world.schools)
      .sort((a, b) => res[b].rpi * 100 + res[b].q1 * 1.2 + ps[b] * 0.05 - (res[a].rpi * 100 + res[a].q1 * 1.2 + ps[a] * 0.05))
      .slice(0, 20);
    return (
      <div className="stack">
        <p className="muted">Tournaments begin after the regular season. Top 8 in each conference make their conference tournament; champions earn automatic national bids.</p>
        {multi && (
          <div className="card">
            <h3>Projected national field (résumé score)</h3>
            <p className="small muted">Résumé = 25% win pct, 50% opponents' win pct, 25% opponents' opponents' win pct, plus quality wins. Shown so selection is never a mystery.</p>
            <ol className="small" style={{ paddingLeft: '1.2rem' }}>
              {bubble.map((id) => (
                <li key={id}>
                  <TeamLink id={id} /> <span className="muted">RPI {res[id].rpi.toFixed(3)}, quality wins {res[id].q1}</span>
                </li>
              ))}
            </ol>
          </div>
        )}
      </div>
    );
  }
  return (
    <div className="stack">
      {nb && (
        <>
          <BracketView b={nb} />
          {nb.field && (
            <div className="card">
              <h3>Selection</h3>
              <div className="small" style={{ columns: 2 }}>
                {nb.field.map((f) => (
                  <div key={f.schoolId}>
                    {f.seed}. {world.schools[f.schoolId].name} <span className="muted">({f.how}, {f.score})</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}
      {confs.map(([cid, b]) => (
        <BracketView key={cid} b={b} />
      ))}
    </div>
  );
}

function TeamsList({ onPick }: { onPick: (id: string) => void }) {
  const { world } = useGame();
  const sid = world.coaches[world.userCoachId].contract?.schoolId;
  return (
    <div className="card flush">
      <DataTable
        rows={Object.values(world.schools)}
        rowKey={(s) => s.id}
        onRow={(s) => onPick(s.id)}
        highlight={(s) => s.id === sid}
        initialSort="pres"
        columns={[
          { key: 'name', label: 'School', render: (s) => <span><span className="swatch" style={{ background: s.colors[0], marginRight: 6 }} />{s.name} {s.mascot}</span>, sort: (s) => s.name },
          { key: 'conf', label: 'Conf', render: (s) => world.conferences[s.conferenceId].abbr, sort: (s) => s.conferenceId },
          { key: 'pres', label: 'Prestige', num: true, render: (s) => s.prestige, sort: (s) => s.prestige },
          { key: 'str', label: 'Roster', num: true, render: (s) => Math.round(teamStrength(world, s.id)), sort: (s) => teamStrength(world, s.id) },
          { key: 'fac', label: 'Facilities', num: true, render: (s) => s.facilities, sort: (s) => s.facilities },
          { key: 'reg', label: 'Region', render: (s) => s.region, sort: (s) => s.region },
          { key: 'hc', label: 'Head coach', render: (s) => { const c = s.headCoachId ? world.coaches[s.headCoachId] : null; return c ? `${c.first} ${c.last}${c.isUser ? ' (you)' : ''}` : 'Vacant'; } },
        ]}
      />
    </div>
  );
}

function TeamPage({ id, onBack }: { id: string; onBack: () => void }) {
  const { world, openPlayer, go } = useGame();
  const s = world.schools[id];
  const hc = s.headCoachId ? world.coaches[s.headCoachId] : null;
  const players = roster(world, id);
  return (
    <div className="stack">
      <button className="btn ghost small" onClick={() => { onBack(); go('league', 'teams'); }} style={{ alignSelf: 'flex-start' }}>
        ← All teams
      </button>
      <div className="card">
        <div className="row">
          <Logo school={s} size={52} />
          <div>
            <h2>
              {s.name} {s.mascot}
            </h2>
            <div className="small muted">
              {world.conferences[s.conferenceId].name} · {s.city}, {s.region} · Prestige {s.prestige} · Facilities {s.facilities} · Academics {s.academics}
            </div>
            <div className="small">
              Head coach: {hc ? `${hc.first} ${hc.last} (rep ${Math.round(hc.reputation)}, ${hc.careerW}-${hc.careerL})` : 'Vacant'} · Plays {strategySummary(s.strategy)}
              {s.rival && <> · Rival: <TeamLink id={s.rival} /></>}
            </div>
          </div>
        </div>
      </div>
      <div className="card flush">
        <div className="card-head"><h3>Roster</h3></div>
        <DataTable
          rows={players}
          rowKey={(p) => p.id}
          onRow={(p) => openPlayer(p.id)}
          initialSort="ppg"
          columns={[
            { key: 'n', label: 'Player', render: (p) => playerName(p), sort: (p) => p.last },
            { key: 'pos', label: 'Pos', render: (p) => p.pos },
            { key: 'yr', label: 'Yr', render: (p) => classLabel(p), sort: (p) => p.year },
            { key: 'ppg', label: 'PPG', num: true, render: (p) => fmt1(p.stats.g ? p.stats.pts / p.stats.g : 0), sort: (p) => (p.stats.g ? p.stats.pts / p.stats.g : 0) },
            { key: 'rpg', label: 'RPG', num: true, render: (p) => fmt1(p.stats.g ? (p.stats.orb + p.stats.drb) / p.stats.g : 0) },
            { key: 'apg', label: 'APG', num: true, render: (p) => fmt1(p.stats.g ? p.stats.ast / p.stats.g : 0) },
            { key: 'ovr', label: 'Est. OVR', num: true, render: (p) => `~${Math.round(ovr(p) / 5) * 5}`, sort: (p) => ovr(p), title: 'Rounded estimate from public scouting' },
          ]}
        />
      </div>
      <div className="card flush">
        <div className="card-head"><h3>Program history</h3></div>
        <DataTable
          rows={[...s.history].reverse()}
          rowKey={(h) => String(h.season)}
          columns={[
            { key: 's', label: 'Season', render: (h) => h.season },
            { key: 'r', label: 'Record', render: (h) => `${h.w}-${h.l} (${h.cw}-${h.cl})` },
            { key: 'f', label: 'Finish', render: (h) => h.finish },
            { key: 'p', label: 'Postseason', render: (h) => h.postseason },
            { key: 'c', label: 'Coach', render: (h) => { const c = h.coachId ? world.coaches[h.coachId] : null; return c ? `${c.first} ${c.last}` : '—'; } },
          ]}
          empty="No completed seasons yet."
        />
      </div>
    </div>
  );
}

function History() {
  const { world } = useGame();
  return (
    <div className="stack">
      <div className="card flush">
        <div className="card-head"><h3>Champions</h3></div>
        <DataTable
          rows={[...world.history].reverse()}
          rowKey={(h) => String(h.season)}
          columns={[
            { key: 's', label: 'Season', render: (h) => h.season },
            { key: 'n', label: 'National champion', render: (h) => (h.nationalChampion ? <TeamLink id={h.nationalChampion} showRank={false} /> : '—') },
            { key: 'c', label: 'Conference tourney champions', render: (h) => Object.values(h.confTourneyChampions).map((id) => world.schools[id].abbr).join(', ') },
            { key: 'u', label: 'You', render: (h) => h.userRecord },
          ]}
          empty="History is written at the end of each season."
        />
      </div>
      <div className="card">
        <h3>Awards</h3>
        <ul className="list small">
          {[...world.awards].reverse().filter((a) => !a.name.startsWith('All-')).slice(0, 60).map((a, i) => (
            <li key={i}>
              <strong>Season {a.season} {a.name}:</strong> {a.label}
            </li>
          ))}
          {!world.awards.length && <li className="muted">None yet.</li>}
        </ul>
      </div>
      <div className="card">
        <h3>Recent transactions</h3>
        <ul className="list small">
          {[...world.transactions].reverse().slice(0, 40).map((t, i) => (
            <li key={i}>
              <span className="muted">S{t.season} W{t.week}</span> {t.text}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
