import { useEffect, useRef, useState } from 'react';
import { useGame } from '../store';
import { Seg } from '../common';
import { exportWorld, importWorld, listBackups, requestPersistence, restoreBackup, storageEstimate, type SaveMeta } from '../../storage/db';
import type { Settings } from '../../sim/types';

export function SettingsScreen() {
  const g = useGame();
  const { world, mutate } = g;
  const s = world.settings;
  const [backups, setBackups] = useState<{ key: string; meta: SaveMeta }[]>([]);
  const [est, setEst] = useState<{ usage: number; quota: number; persisted: boolean } | null>(null);
  const [theme, setTheme] = useState<string>(() => {
    try {
      return localStorage.getItem('bb-theme') ?? 'auto';
    } catch {
      return 'auto';
    }
  });
  const fileRef = useRef<HTMLInputElement>(null);
  const set = <K extends keyof Settings>(k: K, v: Settings[K]) => mutate((w) => void (w.settings[k] = v), { toast: false });

  useEffect(() => {
    listBackups(world.id).then(setBackups).catch(() => setBackups([]));
    storageEstimate().then(setEst).catch(() => setEst(null));
  }, [world.id, g.lastSaved]);

  useEffect(() => {
    if (theme === 'auto') document.documentElement.removeAttribute('data-theme');
    else document.documentElement.setAttribute('data-theme', theme);
    try {
      localStorage.setItem('bb-theme', theme);
    } catch {
      /* ignore */
    }
  }, [theme]);

  return (
    <div className="stack">
      <h1>Settings & saves</h1>
      <div className="grid cols-2">
        <div className="card stack">
          <h3>Gameplay</h3>
          <div className="field">
            <span>Default game presentation</span>
            <Seg
              label="Game presentation"
              value={s.gameMode}
              onChange={(v) => set('gameMode', v)}
              options={[
                { id: 'instant', label: 'Instant' },
                { id: 'pbp', label: 'Play-by-play' },
                { id: 'coach', label: 'Coach mode' },
              ]}
            />
            <span className="tiny muted">Instant lets "Advance week" simulate your game directly. The others take you to the Game Center first.</span>
          </div>
          <label className="row">
            <input type="checkbox" checked={s.autoLineup} onChange={(e) => set('autoLineup', e.target.checked)} /> Let staff set the depth chart each week
          </label>
          <label className="row">
            <input type="checkbox" checked={s.autoRecruit} onChange={(e) => set('autoRecruit', e.target.checked)} /> Let staff handle routine recruiting
          </label>
          <div className="field">
            <span>Explanations</span>
            <Seg
              label="Explanations"
              value={s.explanations}
              onChange={(v) => set('explanations', v)}
              options={[
                { id: 'compact', label: 'Compact' },
                { id: 'expanded', label: 'Expanded' },
              ]}
            />
          </div>
          <div className="field">
            <span>Difficulty</span>
            <Seg
              label="Difficulty"
              value={s.difficulty}
              onChange={(v) => set('difficulty', v)}
              options={[
                { id: 'easy', label: 'Easy' },
                { id: 'normal', label: 'Normal' },
                { id: 'hard', label: 'Hard' },
              ]}
            />
          </div>
          <p className="tiny muted">Season length is fixed per career. World seed: {world.seed}.</p>
        </div>
        <div className="card stack">
          <h3>Accessibility & display</h3>
          <div className="field">
            <span>Theme</span>
            <Seg
              label="Theme"
              value={theme}
              onChange={setTheme}
              options={[
                { id: 'auto', label: 'System' },
                { id: 'light', label: 'Light' },
                { id: 'dark', label: 'Dark' },
              ]}
            />
          </div>
          <div className="field">
            <span>Text size</span>
            <Seg
              label="Text size"
              value={String(s.textScale)}
              onChange={(v) => set('textScale', Number(v))}
              options={[
                { id: '0.9', label: 'Small' },
                { id: '1', label: 'Normal' },
                { id: '1.15', label: 'Large' },
                { id: '1.3', label: 'Larger' },
              ]}
            />
          </div>
          <label className="row">
            <input type="checkbox" checked={s.reducedMotion} onChange={(e) => set('reducedMotion', e.target.checked)} /> Reduce motion
          </label>
          <p className="tiny muted">Every screen works with the keyboard; status is never shown by color alone.</p>
        </div>
      </div>
      <div className="card stack">
        <h3>Saves</h3>
        <p className="small">
          This career saves automatically before and after every advance and shortly after each change. Saves stay on this device; nothing is uploaded.
          {g.lastSaved && <> Last saved {new Date(g.lastSaved).toLocaleString()}.</>}
        </p>
        {g.saveError && <div className="callout bad">Last save failed: {g.saveError}</div>}
        <div className="row">
          <button className="btn primary" onClick={async () => { await g.saveNow(); g.toast('Saved.'); }}>
            Save now
          </button>
          <button className="btn" onClick={() => exportWorld(world)}>
            Export career file
          </button>
          <button className="btn" onClick={() => fileRef.current?.click()}>
            Import career file…
          </button>
          <input
            ref={fileRef}
            hidden
            type="file"
            accept="application/json,.json"
            onChange={async (e) => {
              const f = e.target.files?.[0];
              if (!f) return;
              try {
                const w = await importWorld(f);
                g.toast(`Imported ${w.name}. Switching to it.`);
                g.exitToTitle();
              } catch (err) {
                g.toast(err instanceof Error ? err.message : String(err));
              }
              e.target.value = '';
            }}
          />
          <button className="btn ghost" onClick={async () => { await g.saveNow(); g.exitToTitle(); }}>
            Save & exit to title
          </button>
        </div>
        <h4 className="mt">Rotating backups</h4>
        <ul className="list small">
          {backups.map((b) => (
            <li key={b.key} className="row between">
              <span>
                {b.meta.school} · season {b.meta.season}, {b.meta.phase === 'offseason' ? 'offseason' : `week ${b.meta.week}`} · {new Date(b.meta.updatedAt).toLocaleString()}
              </span>
              <button
                className="btn small"
                onClick={async () => {
                  if (!confirm('Restore this backup? Your current progress becomes the newest backup.')) return;
                  const w = await restoreBackup(b.key);
                  g.replaceWorld(w);
                  g.toast('Backup restored.');
                }}
              >
                Restore
              </button>
            </li>
          ))}
          {!backups.length && <li className="muted">Backups appear after a few saves.</li>}
        </ul>
        <h4 className="mt">Storage</h4>
        <p className="small">
          {est ? <>Using {(est.usage / 1024 / 1024).toFixed(1)} MB of about {(est.quota / 1024 / 1024).toFixed(0)} MB available. {est.persisted ? 'Storage is marked persistent.' : 'The browser may clear storage under pressure.'}</> : 'Storage details unavailable.'}
        </p>
        {est && !est.persisted && (
          <button className="btn small" onClick={async () => { const ok = await requestPersistence(); g.toast(ok ? 'Storage marked persistent.' : 'The browser declined. Export a backup file to be safe.'); setEst(await storageEstimate()); }}>
            Ask the browser to keep my saves
          </button>
        )}
        <div className="callout warn small">Clearing site data or browsing privately can erase local saves. Export a career file now and then to keep a copy.</div>
      </div>
      <div className="card small">
        <h3>Offline play</h3>
        <p>
          After your first visit the game is cached on this device. You can install it from your browser's menu (Install app / Add to Home Screen) and play with no connection. The very first load
          needs internet.
        </p>
        <p className="muted">Status: {navigator.onLine ? 'online' : 'offline'} · {'serviceWorker' in navigator ? (navigator.serviceWorker.controller ? 'offline cache active' : 'offline cache installs after the first full load') : 'offline cache not supported by this browser'}</p>
      </div>
    </div>
  );
}
