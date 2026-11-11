import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { School, World } from '../sim/types';
import { useGame } from './store';
import { record, currentRank } from '../sim/season';

export function Logo({ school, size = 34 }: { school: School; size?: number }) {
  return (
    <span className="logo" aria-hidden="true" style={{ background: school.colors[0], color: school.colors[1], width: size, height: size, fontSize: size * 0.3 }}>
      {school.abbr.slice(0, 4)}
    </span>
  );
}

export function TeamLink({ id, showRank = true, short = false }: { id: string; showRank?: boolean; short?: boolean }) {
  const { world, go } = useGame();
  const s = world.schools[id];
  if (!s) return <span>—</span>;
  const rank = showRank ? currentRank(world, id) : null;
  return (
    <button className="linkish" onClick={() => go('league', 'teams', id)}>
      <span className="swatch" style={{ background: s.colors[0], marginRight: 6, verticalAlign: 'middle' }} />
      {rank ? <span className="muted small">#{rank} </span> : null}
      {short ? s.abbr : s.name}
    </button>
  );
}

export function PlayerLink({ id, children }: { id: string; children?: ReactNode }) {
  const { world, openPlayer } = useGame();
  const p = world.players[id];
  return (
    <button className="linkish" onClick={() => openPlayer(id)}>
      {children ?? (p ? `${p.first} ${p.last}` : 'Former player')}
    </button>
  );
}

export function Stars({ n }: { n: number }) {
  return (
    <span className="stars" aria-label={`${n} star${n === 1 ? '' : 's'}`}>
      {'★'.repeat(n)}
      <span className="off">{'★'.repeat(5 - n)}</span>
    </span>
  );
}

export function Bar({ value, max = 100, tone }: { value: number; max?: number; tone?: 'good' | 'bad' | 'warn' }) {
  const t = tone ?? (value / max >= 0.66 ? 'good' : value / max < 0.4 ? 'bad' : 'warn');
  return (
    <div className={`bar ${t}`} role="meter" aria-valuenow={Math.round(value)} aria-valuemin={0} aria-valuemax={max}>
      <span style={{ width: `${Math.max(2, Math.min(100, (value / max) * 100))}%` }} />
    </div>
  );
}

export function Badge({ children, tone }: { children: ReactNode; tone?: 'good' | 'bad' | 'warn' | 'info' | 'accent' }) {
  return <span className={`badge ${tone ?? ''}`}>{children}</span>;
}

export function Tabs<T extends string>({ tabs, value, onChange }: { tabs: { id: T; label: ReactNode }[]; value: T; onChange: (t: T) => void }) {
  return (
    <div className="tabs" role="tablist">
      {tabs.map((t) => (
        <button key={t.id} role="tab" className="tab" aria-selected={value === t.id} onClick={() => onChange(t.id)}>
          {t.label}
        </button>
      ))}
    </div>
  );
}

export function Seg<T extends string>({ options, value, onChange, label, disabled }: { options: { id: T; label: string; title?: string }[]; value: T; onChange: (v: T) => void; label: string; disabled?: boolean }) {
  return (
    <div className="seg" role="group" aria-label={label}>
      {options.map((o) => (
        <button key={o.id} aria-pressed={value === o.id} title={o.title} onClick={() => onChange(o.id)} disabled={disabled}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Modal({ title, onClose, children, wide }: { title: ReactNode; onClose: () => void; children: ReactNode; wide?: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const prev = document.activeElement as HTMLElement | null;
    ref.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
      prev?.focus?.();
    };
  }, [onClose]);
  return (
    <div className="modal-back" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal" role="dialog" aria-modal="true" tabIndex={-1} ref={ref} style={wide ? { maxWidth: 1100 } : undefined}>
        <div className="modal-head">
          <div style={{ minWidth: 0 }}>{typeof title === 'string' ? <h2>{title}</h2> : title}</div>
          <button className="btn small" onClick={onClose} aria-label="Close">
            Close ✕
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

export interface Column<T> {
  key: string;
  label: ReactNode;
  render: (row: T) => ReactNode;
  sort?: (row: T) => number | string;
  num?: boolean;
  title?: string;
}

export function DataTable<T>({ rows, columns, rowKey, onRow, initialSort, desc = true, highlight, empty }: {
  rows: T[];
  columns: Column<T>[];
  rowKey: (r: T) => string;
  onRow?: (r: T) => void;
  initialSort?: string;
  desc?: boolean;
  highlight?: (r: T) => boolean;
  empty?: ReactNode;
}) {
  const [sortKey, setSortKey] = useState<string | undefined>(initialSort);
  const [sortDesc, setSortDesc] = useState(desc);
  const sorted = useMemo(() => {
    const col = columns.find((c) => c.key === sortKey);
    if (!col?.sort) return rows;
    const f = col.sort;
    return [...rows].sort((a, b) => {
      const x = f(a);
      const y = f(b);
      const r = typeof x === 'number' && typeof y === 'number' ? x - y : String(x).localeCompare(String(y));
      return sortDesc ? -r : r;
    });
  }, [rows, columns, sortKey, sortDesc]);
  return (
    <div className="table-wrap">
      <table className="data">
        <thead>
          <tr>
            {columns.map((c) => (
              <th
                key={c.key}
                className={`${c.sort ? 'sortable' : ''} ${c.num ? 'num' : ''}`}
                title={c.title}
                aria-sort={sortKey === c.key ? (sortDesc ? 'descending' : 'ascending') : undefined}
                onClick={() => {
                  if (!c.sort) return;
                  if (sortKey === c.key) setSortDesc(!sortDesc);
                  else {
                    setSortKey(c.key);
                    setSortDesc(true);
                  }
                }}
                tabIndex={c.sort ? 0 : undefined}
                onKeyDown={(e) => {
                  if (c.sort && (e.key === 'Enter' || e.key === ' ')) {
                    e.preventDefault();
                    if (sortKey === c.key) setSortDesc(!sortDesc);
                    else {
                      setSortKey(c.key);
                      setSortDesc(true);
                    }
                  }
                }}
              >
                {c.label}
                {sortKey === c.key ? (sortDesc ? ' ▾' : ' ▴') : ''}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {sorted.map((r) => (
            <tr key={rowKey(r)} className={`${onRow ? 'clickable' : ''} ${highlight?.(r) ? 'me' : ''}`} onClick={onRow ? () => onRow(r) : undefined}>
              {columns.map((c) => (
                <td key={c.key} className={c.num ? 'num' : ''}>
                  {c.render(r)}
                </td>
              ))}
            </tr>
          ))}
          {!sorted.length && (
            <tr>
              <td colSpan={columns.length} className="muted center">
                {empty ?? 'Nothing here yet.'}
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

export function recStr(world: World, id: string): string {
  const r = record(world, id);
  return `${r.w}-${r.l}`;
}

export function fmt1(n: number): string {
  return Number.isFinite(n) ? n.toFixed(1) : '0.0';
}

export function pct(n: number, d: number): string {
  return d ? `${((n / d) * 100).toFixed(1)}%` : '—';
}

export function ovrTone(v: number): 'good' | 'warn' | 'bad' | undefined {
  return v >= 70 ? 'good' : v < 50 ? 'bad' : undefined;
}

export function Explain({ children }: { children: ReactNode }) {
  const { world } = useGame();
  if (world.settings.explanations === 'compact') return null;
  return <p className="small muted">{children}</p>;
}
