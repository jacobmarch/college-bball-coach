import { useEffect, useState } from 'react';
import type { World } from '../sim/types';
import { getActiveId, loadSave } from '../storage/db';
import { GameProvider, useGame, type Screen } from './store';
import { Title } from './Title';
import { Home } from './screens/Home';
import { Team } from './screens/Team';
import { Recruiting } from './screens/Recruiting';
import { Schedule } from './screens/Schedule';
import { GameCenter } from './screens/GameCenter';
import { Program } from './screens/Program';
import { League } from './screens/League';
import { Career } from './screens/Career';
import { SettingsScreen } from './screens/Settings';
import { PlayerModal } from './PlayerModal';
import { BoxScoreModal } from './BoxScore';
import { Logo } from './common';
import { record, currentRank, userGameThisWeek } from '../sim/season';
import { OFFSEASON_LABELS } from '../sim/types';

export function App() {
  const [world, setWorld] = useState<World | null>(null);
  const [checked, setChecked] = useState(false);

  useEffect(() => {
    // Resume the last career automatically if it exists.
    (async () => {
      try {
        const id = await getActiveId();
        if (id && !sessionStorage.getItem('bb-title')) setWorld(await loadSave(id));
      } catch {
        /* show title */
      }
      setChecked(true);
    })();
  }, []);

  if (!checked) return null;
  if (!world)
    return (
      <Title
        onLoad={(w) => {
          sessionStorage.removeItem('bb-title');
          setWorld(w);
        }}
      />
    );
  return (
    <GameProvider
      key={world.id}
      initial={world}
      onExit={() => {
        sessionStorage.setItem('bb-title', '1');
        setWorld(null);
      }}
    >
      <Shell />
    </GameProvider>
  );
}

const NAV: { id: Screen; label: string; icon: string }[] = [
  { id: 'home', label: 'Home', icon: '⌂' },
  { id: 'team', label: 'Team', icon: '◉' },
  { id: 'recruiting', label: 'Recruiting', icon: '✦' },
  { id: 'schedule', label: 'Schedule', icon: '▦' },
  { id: 'game', label: 'Game Center', icon: '▶' },
  { id: 'program', label: 'Program', icon: '▲' },
  { id: 'league', label: 'League', icon: '☰' },
  { id: 'career', label: 'Career', icon: '★' },
  { id: 'settings', label: 'Settings', icon: '⚙' },
];

export function phaseLabel(w: World): string {
  switch (w.phase) {
    case 'preseason':
      return `Season ${w.season} · Preseason`;
    case 'regular':
      return `Season ${w.season} · Week ${w.week} of ${w.regularWeeks}`;
    case 'confTourney':
      return `Season ${w.season} · Conference tournaments`;
    case 'national':
      return `Season ${w.season} · National tournament`;
    case 'offseason':
      return `Season ${w.season} · Offseason: ${OFFSEASON_LABELS[w.offseasonStep]}`;
  }
}

function Shell() {
  const g = useGame();
  const { world, nav, go } = g;
  const coach = world.coaches[world.userCoachId];
  const sid = coach.contract?.schoolId;
  const school = sid ? world.schools[sid] : null;
  const unread = world.inbox.filter((m) => !m.read).length;
  const userGame = userGameThisWeek(world);
  const needsPlay = userGame && !userGame.played && world.phase !== 'offseason' && world.phase !== 'preseason';
  const r = sid ? record(world, sid) : null;
  const rank = sid ? currentRank(world, sid) : null;

  const advanceLabel =
    world.phase === 'preseason' ? 'Start season' : world.phase === 'offseason' ? 'Offseason' : needsPlay && world.settings.gameMode !== 'instant' ? 'Go to game' : 'Advance week';

  const onAdvance = async () => {
    if (world.phase === 'offseason') return go('home');
    if (needsPlay && world.settings.gameMode !== 'instant') return go('game');
    const reps = await g.advance(1);
    const res = reps.find((x) => x.userResult)?.userResult;
    if (res) g.toast(res.text);
  };

  const screen = (() => {
    switch (nav.screen) {
      case 'home':
        return <Home />;
      case 'team':
        return <Team />;
      case 'recruiting':
        return <Recruiting />;
      case 'schedule':
        return <Schedule />;
      case 'game':
        return <GameCenter />;
      case 'program':
        return <Program />;
      case 'league':
        return <League />;
      case 'career':
        return <Career />;
      case 'settings':
        return <SettingsScreen />;
    }
  })();

  return (
    <div className="app">
      <nav className="sidebar" aria-label="Main">
        <div className="brand">
          <span className="brand-mark" aria-hidden="true">
            BB
          </span>
          Bench Boss
        </div>
        {NAV.map((n) => (
          <button key={n.id} className="nav-btn" aria-current={nav.screen === n.id ? 'page' : undefined} onClick={() => go(n.id)}>
            <span aria-hidden="true">{n.icon}</span>
            {n.label}
            {n.id === 'home' && unread > 0 && <span className="count">{unread}</span>}
            {n.id === 'game' && g.live && <span className="count">LIVE</span>}
          </button>
        ))}
        <div className="sidebar-foot">
          {g.saveError ? (
            <span style={{ color: 'var(--bad)' }}>Save failed: {g.saveError}</span>
          ) : g.lastSaved ? (
            <>Saved {new Date(g.lastSaved).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} · on this device</>
          ) : (
            <>Autosaves before each advance</>
          )}
        </div>
      </nav>
      <div className="main">
        <header className="topbar">
          <div className="team-chip">
            {school ? <Logo school={school} /> : null}
            <div style={{ minWidth: 0 }}>
              <div>
                {school ? (
                  <>
                    {rank ? <span className="muted">#{rank} </span> : null}
                    {school.name} {school.mascot}
                  </>
                ) : (
                  'Between jobs'
                )}
              </div>
              <div className="meta">
                {coach.first} {coach.last} · {coach.contract ? (coach.contract.role === 'head' ? 'Head coach' : 'Assistant') : 'Unemployed'}
                {r ? ` · ${r.w}-${r.l} (${r.cw}-${r.cl} conf)` : ''}
              </div>
            </div>
          </div>
          <div className="spacer" />
          <div className="meta">{phaseLabel(world)}</div>
          <button className="btn primary" onClick={onAdvance} disabled={!!g.busy || !!g.live}>
            {advanceLabel} →
          </button>
        </header>
        <main className="content" id="main">
          {screen}
        </main>
      </div>
      {g.playerId && <PlayerModal id={g.playerId} onClose={() => g.openPlayer(null)} />}
      {g.gameId && <BoxScoreModal id={g.gameId} onClose={() => g.openGame(null)} />}
    </div>
  );
}
