/**
 * Local-only persistence in IndexedDB. Nothing leaves the device.
 *
 * Layout:
 *  - saves:   one record per career { id, meta, world }
 *  - backups: rotating snapshots per career, key `${id}:${slot}`
 *  - meta:    { key: 'active', id } pointer to the last played career
 *
 * Writes are "validate, then commit": the snapshot is validated before it
 * replaces the active save, and the previous version is rotated into backups.
 */
import { openDB, type IDBPDatabase } from 'idb';
import type { World } from '../sim/types';
import { GAME_VERSION, SCHEMA_VERSION } from '../sim/types';
import { migrateWorld, validateWorld } from '../sim/migrate';

export interface SaveMeta {
  id: string;
  name: string;
  coach: string;
  school: string;
  season: number;
  week: number;
  phase: string;
  updatedAt: number;
  createdAt: number;
  schemaVersion: number;
  gameVersion: string;
  checksum: string;
}

interface SaveRecord {
  id: string;
  meta: SaveMeta;
  world: World;
}

const DB_NAME = 'bench-boss';
const BACKUP_SLOTS = 3;
let dbp: Promise<IDBPDatabase> | null = null;

function db() {
  if (!dbp) {
    dbp = openDB(DB_NAME, 1, {
      upgrade(d) {
        d.createObjectStore('saves', { keyPath: 'id' });
        d.createObjectStore('backups');
        d.createObjectStore('meta');
      },
    });
  }
  return dbp;
}

function checksum(s: string): string {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < s.length; i += 7) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0).toString(16) + ':' + s.length.toString(36);
}

export function metaFor(world: World, json?: string): SaveMeta {
  const c = world.coaches[world.userCoachId];
  const sid = c?.contract?.schoolId;
  return {
    id: world.id,
    name: world.name,
    coach: c ? `${c.first} ${c.last}` : '—',
    school: sid ? world.schools[sid].name : 'Unemployed',
    season: world.season,
    week: world.week,
    phase: world.phase,
    updatedAt: Date.now(),
    createdAt: world.createdAt,
    schemaVersion: SCHEMA_VERSION,
    gameVersion: GAME_VERSION,
    checksum: checksum(json ?? JSON.stringify(world)),
  };
}

export async function listSaves(): Promise<SaveMeta[]> {
  const d = await db();
  const all = (await d.getAll('saves')) as SaveRecord[];
  return all.map((r) => r.meta).sort((a, b) => b.updatedAt - a.updatedAt);
}

export async function getActiveId(): Promise<string | null> {
  const d = await db();
  return ((await d.get('meta', 'active')) as string | undefined) ?? null;
}

export async function loadSave(id: string): Promise<World> {
  const d = await db();
  const rec = (await d.get('saves', id)) as SaveRecord | undefined;
  if (!rec) throw new Error('Save not found.');
  const v = validateWorld(rec.world);
  if (!v.ok) throw new Error(`Save failed validation: ${v.errors.join(' ')}`);
  const before = rec.world.schemaVersion;
  const { world, migrated } = migrateWorld(rec.world);
  if (migrated) {
    // Keep a pre-migration copy.
    await d.put('backups', { ...rec, meta: { ...rec.meta, name: `${rec.meta.name} (pre-migration v${before})` } }, `${id}:premigration`);
  }
  await d.put('meta', id, 'active');
  return world;
}

/** Atomic-ish save: serialize, validate a parsed copy, rotate backup, write, update pointer. */
export async function saveWorld(world: World): Promise<SaveMeta> {
  const json = JSON.stringify(world);
  const copy = JSON.parse(json) as World;
  const v = validateWorld(copy);
  if (!v.ok) throw new Error(`Refusing to save an invalid game: ${v.errors.join(' ')}`);
  const meta = metaFor(copy, json);
  const d = await db();
  const tx = d.transaction(['saves', 'backups', 'meta'], 'readwrite');
  const prev = (await tx.objectStore('saves').get(world.id)) as SaveRecord | undefined;
  if (prev) {
    // Rotate: slot 0 newest
    const bstore = tx.objectStore('backups');
    for (let i = BACKUP_SLOTS - 1; i > 0; i--) {
      const older = await bstore.get(`${world.id}:${i - 1}`);
      if (older) await bstore.put(older, `${world.id}:${i}`);
    }
    await bstore.put(prev, `${world.id}:0`);
  }
  await tx.objectStore('saves').put({ id: world.id, meta, world: copy } satisfies SaveRecord);
  await tx.objectStore('meta').put(world.id, 'active');
  await tx.done;
  return meta;
}

export async function listBackups(id: string): Promise<{ key: string; meta: SaveMeta }[]> {
  const d = await db();
  const out: { key: string; meta: SaveMeta }[] = [];
  for (const slot of [...Array.from({ length: BACKUP_SLOTS }, (_, i) => String(i)), 'premigration']) {
    const rec = (await d.get('backups', `${id}:${slot}`)) as SaveRecord | undefined;
    if (rec) out.push({ key: `${id}:${slot}`, meta: rec.meta });
  }
  return out;
}

export async function restoreBackup(key: string): Promise<World> {
  const d = await db();
  const rec = (await d.get('backups', key)) as SaveRecord | undefined;
  if (!rec) throw new Error('Backup not found.');
  const { world } = migrateWorld(rec.world);
  await saveWorld(world);
  return world;
}

export async function deleteSave(id: string) {
  const d = await db();
  await d.delete('saves', id);
  for (const slot of [...Array.from({ length: BACKUP_SLOTS }, (_, i) => String(i)), 'premigration']) await d.delete('backups', `${id}:${slot}`);
  if ((await getActiveId()) === id) await d.delete('meta', 'active');
}

export function exportWorld(world: World) {
  const blob = new Blob([JSON.stringify({ format: 'bench-boss-save', version: 1, exportedAt: new Date().toISOString(), world })], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  const c = world.coaches[world.userCoachId];
  a.href = url;
  a.download = `bench-boss-${(c?.last ?? 'career').toLowerCase()}-season${world.season}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

export async function importWorld(file: File): Promise<World> {
  const text = await file.text();
  let parsed: any;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error('That file is not valid JSON.');
  }
  const raw = parsed?.format === 'bench-boss-save' ? parsed.world : parsed;
  const v = validateWorld(raw);
  if (!v.ok) throw new Error(`Import failed: ${v.errors.join(' ')}`);
  const { world } = migrateWorld(raw);
  await saveWorld(world);
  return world;
}

export async function storageEstimate(): Promise<{ usage: number; quota: number; persisted: boolean } | null> {
  if (!navigator.storage?.estimate) return null;
  const e = await navigator.storage.estimate();
  const persisted = navigator.storage.persisted ? await navigator.storage.persisted() : false;
  return { usage: e.usage ?? 0, quota: e.quota ?? 0, persisted };
}

export async function requestPersistence(): Promise<boolean> {
  if (!navigator.storage?.persist) return false;
  return navigator.storage.persist();
}
