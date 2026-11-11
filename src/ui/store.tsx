import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { World } from '../sim/types';
import type { LiveGame } from '../sim/gamesim';
import { saveWorld } from '../storage/db';
import { runSim } from '../worker/client';
import type { AdvanceReport } from '../sim/season';

export type Screen = 'home' | 'team' | 'recruiting' | 'schedule' | 'game' | 'program' | 'league' | 'career' | 'settings';

export interface Nav {
  screen: Screen;
  tab?: string;
  param?: string;
}

interface Ctx {
  world: World;
  version: number;
  nav: Nav;
  go: (screen: Screen, tab?: string, param?: string) => void;
  mutate: (fn: (w: World) => void | string, opts?: { save?: boolean; toast?: boolean }) => void;
  replaceWorld: (w: World) => void;
  advance: (weeks: number) => Promise<AdvanceReport[]>;
  offseasonNext: () => Promise<void>;
  busy: string | null;
  progress: [number, number] | null;
  lastSaved: number | null;
  saveError: string | null;
  saveNow: () => Promise<void>;
  toast: (msg: string) => void;
  openPlayer: (id: string | null) => void;
  playerId: string | null;
  openGame: (id: string | null) => void;
  gameId: string | null;
  live: LiveGame | null;
  setLive: (g: LiveGame | null) => void;
  exitToTitle: () => void;
}

const GameContext = createContext<Ctx | null>(null);

export function useGame(): Ctx {
  const c = useContext(GameContext);
  if (!c) throw new Error('useGame outside provider');
  return c;
}

export function GameProvider({ initial, children, onExit }: { initial: World; children: ReactNode; onExit: () => void }) {
  const worldRef = useRef<World>(initial);
  const [version, setVersion] = useState(0);
  const [nav, setNav] = useState<Nav>({ screen: 'home' });
  const [busy, setBusy] = useState<string | null>(null);
  const [progress, setProgress] = useState<[number, number] | null>(null);
  const [lastSaved, setLastSaved] = useState<number | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [toasts, setToasts] = useState<{ id: number; msg: string }[]>([]);
  const [playerId, setPlayerId] = useState<string | null>(null);
  const [gameId, setGameId] = useState<string | null>(null);
  const [live, setLiveState] = useState<LiveGame | null>(null);
  const saveTimer = useRef<number | null>(null);
  const toastSeq = useRef(0);

  const toast = useCallback((msg: string) => {
    const id = ++toastSeq.current;
    setToasts((t) => [...t.slice(-3), { id, msg }]);
    window.setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 4200);
  }, []);

  const saveNow = useCallback(async () => {
    try {
      await saveWorld(worldRef.current);
      setLastSaved(Date.now());
      setSaveError(null);
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : String(e));
    }
  }, []);

  const scheduleSave = useCallback(() => {
    if (saveTimer.current) window.clearTimeout(saveTimer.current);
    saveTimer.current = window.setTimeout(() => void saveNow(), 1200);
  }, [saveNow]);

  const mutate = useCallback<Ctx['mutate']>(
    (fn, opts) => {
      const r = fn(worldRef.current);
      setVersion((v) => v + 1);
      if (typeof r === 'string' && opts?.toast !== false) toast(r);
      if (opts?.save !== false) scheduleSave();
    },
    [scheduleSave, toast],
  );

  const replaceWorld = useCallback(
    (w: World) => {
      worldRef.current = w;
      setVersion((v) => v + 1);
    },
    [],
  );

  const advance = useCallback(
    async (weeks: number) => {
      setBusy(weeks > 1 ? 'Simulating weeks…' : 'Simulating the week…');
      setProgress(null);
      try {
        await saveNow(); // autosave before each advance
        const res = await runSim({ op: 'advance', world: worldRef.current, weeks, stopAtUserGame: weeks > 1 }, (d, t) => setProgress([d, t]));
        worldRef.current = res.world;
        setVersion((v) => v + 1);
        await saveNow();
        return res.reports;
      } catch (e) {
        toast(`Simulation failed: ${e instanceof Error ? e.message : String(e)}`);
        return [];
      } finally {
        setBusy(null);
        setProgress(null);
      }
    },
    [saveNow, toast],
  );

  const offseasonNext = useCallback(async () => {
    setBusy('Processing the offseason…');
    try {
      await saveNow();
      const res = await runSim({ op: 'offseason', world: worldRef.current });
      worldRef.current = res.world;
      setVersion((v) => v + 1);
      await saveNow();
    } catch (e) {
      toast(`Offseason step failed: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setBusy(null);
    }
  }, [saveNow, toast]);

  const go = useCallback((screen: Screen, tab?: string, param?: string) => {
    setNav({ screen, tab, param });
    window.scrollTo({ top: 0 });
  }, []);

  useEffect(() => {
    const s = worldRef.current.settings;
    document.documentElement.style.setProperty('--scale', String(s.textScale));
    document.documentElement.classList.toggle('reduced-motion', s.reducedMotion);
  }, [version]);

  useEffect(() => {
    const flush = () => {
      if (saveTimer.current) void saveNow();
    };
    window.addEventListener('beforeunload', flush);
    return () => window.removeEventListener('beforeunload', flush);
  }, [saveNow]);

  const value = useMemo<Ctx>(
    () => ({
      world: worldRef.current,
      version,
      nav,
      go,
      mutate,
      replaceWorld,
      advance,
      offseasonNext,
      busy,
      progress,
      lastSaved,
      saveError,
      saveNow,
      toast,
      openPlayer: setPlayerId,
      playerId,
      openGame: setGameId,
      gameId,
      live,
      setLive: setLiveState,
      exitToTitle: onExit,
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [version, nav, busy, progress, lastSaved, saveError, playerId, gameId, live],
  );

  return (
    <GameContext.Provider value={value}>
      {children}
      <div className="toast-wrap" role="status" aria-live="polite">
        {toasts.map((t) => (
          <div className="toast" key={t.id}>
            {t.msg}
          </div>
        ))}
      </div>
      {busy && (
        <div className="busy-overlay" role="alert" aria-busy="true">
          <div className="busy-card">
            <strong>{busy}</strong>
            {progress && (
              <div className="mt">
                <div className="bar">
                  <span style={{ width: `${(progress[0] / progress[1]) * 100}%` }} />
                </div>
                <div className="tiny muted mt">
                  Week {progress[0]} of {progress[1]}
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </GameContext.Provider>
  );
}
