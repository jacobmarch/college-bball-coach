import { useEffect, useRef, useState } from 'react';
import type { World } from '../sim/types';
import { deleteSave, importWorld, listSaves, loadSave, type SaveMeta } from '../storage/db';
import { NewCareer } from './NewCareer';

export function Title({ onLoad }: { onLoad: (w: World) => void }) {
  const [saves, setSaves] = useState<SaveMeta[] | null>(null);
  const [mode, setMode] = useState<'menu' | 'new'>('menu');
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const refresh = () =>
    listSaves()
      .then(setSaves)
      .catch((e) => {
        setSaves([]);
        setError(`Local storage is unavailable: ${e instanceof Error ? e.message : e}. Private browsing can block saves.`);
      });
  useEffect(() => {
    void refresh();
  }, []);

  if (mode === 'new') return <NewCareer onCancel={() => setMode('menu')} onCreated={onLoad} />;

  return (
    <div className="title-screen">
      <div className="title-card stack">
        <div>
          <div className="row" style={{ gap: '0.75rem' }}>
            <span className="brand-mark" style={{ width: 44, height: 44, fontSize: '1.1rem' }} aria-hidden="true">
              BB
            </span>
            <div>
              <div className="hero">Bench Boss</div>
              <div className="muted">College Hoops coaching career simulator</div>
            </div>
          </div>
          <p className="mt muted">
            Build a program, recruit and develop players, call the game plan, and climb the coaching ladder. Everything runs and saves in your browser,
            and the game keeps working offline once it has loaded.
          </p>
        </div>
        {error && <div className="callout bad">{error}</div>}
        <div className="row">
          <button className="btn primary big" onClick={() => setMode('new')}>
            New career
          </button>
          <button className="btn big" onClick={() => fileRef.current?.click()}>
            Import save…
          </button>
          <input
            ref={fileRef}
            type="file"
            accept="application/json,.json"
            hidden
            onChange={async (e) => {
              const f = e.target.files?.[0];
              if (!f) return;
              try {
                const w = await importWorld(f);
                onLoad(w);
              } catch (err) {
                setError(err instanceof Error ? err.message : String(err));
              }
              e.target.value = '';
            }}
          />
        </div>
        <div className="card">
          <div className="card-head">
            <h3>Saved careers</h3>
            <span className="tiny muted">Stored on this device only</span>
          </div>
          {saves === null && <p className="muted">Loading…</p>}
          {saves && !saves.length && <p className="muted">No saved careers yet.</p>}
          <ul className="list">
            {saves?.map((s) => (
              <li key={s.id} className="row between">
                <div>
                  <strong>{s.coach}</strong> · {s.school}
                  <div className="small muted">
                    {s.name} · Season {s.season}, {s.phase === 'offseason' ? 'offseason' : `week ${s.week}`} · saved {new Date(s.updatedAt).toLocaleString()}
                  </div>
                </div>
                <div className="row">
                  <button
                    className="btn primary"
                    onClick={async () => {
                      try {
                        onLoad(await loadSave(s.id));
                      } catch (err) {
                        setError(err instanceof Error ? err.message : String(err));
                      }
                    }}
                  >
                    Continue
                  </button>
                  <button
                    className="btn danger small"
                    onClick={async () => {
                      if (!confirm(`Delete "${s.coach} · ${s.school}" and its backups? This cannot be undone.`)) return;
                      await deleteSave(s.id);
                      void refresh();
                    }}
                  >
                    Delete
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </div>
        <p className="tiny muted">
          Saves live in this browser's storage. Clearing site data removes them, so use Export in Settings to keep a backup file.
        </p>
      </div>
    </div>
  );
}
