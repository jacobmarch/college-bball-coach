import type { World } from './types';
import { GAME_VERSION, SCHEMA_VERSION } from './types';

export interface ValidationResult {
  ok: boolean;
  errors: string[];
}

/** Structural checks that catch truncated or corrupted saves before they replace a good one. */
export function validateWorld(w: unknown): ValidationResult {
  const errors: string[] = [];
  const x = w as Partial<World> | null;
  if (!x || typeof x !== 'object') return { ok: false, errors: ['Save is not an object.'] };
  if (typeof x.schemaVersion !== 'number') errors.push('Missing schema version.');
  if (typeof x.seed !== 'number') errors.push('Missing seed.');
  if (!Array.isArray(x.rng) || x.rng.length !== 4) errors.push('Missing RNG state.');
  if (!x.schools || typeof x.schools !== 'object') errors.push('Missing schools.');
  if (!x.players || typeof x.players !== 'object') errors.push('Missing players.');
  if (!x.coaches || !x.userCoachId || !x.coaches[x.userCoachId]) errors.push('Missing user coach.');
  if (!Array.isArray(x.games)) errors.push('Missing schedule.');
  if (errors.length) return { ok: false, errors };
  for (const s of Object.values(x.schools!)) {
    for (const id of s.rosterIds) if (!x.players![id]) errors.push(`${s.name}: roster references missing player ${id}.`);
    if (errors.length > 5) break;
  }
  return { ok: errors.length === 0, errors };
}

type Migration = (w: any) => void;

/** Ordered migrations: index i upgrades schema i+1 -> i+2. */
const MIGRATIONS: Migration[] = [];

export function migrateWorld(raw: any): { world: World; migrated: boolean } {
  let migrated = false;
  if (typeof raw.schemaVersion !== 'number') raw.schemaVersion = 1;
  if (raw.schemaVersion > SCHEMA_VERSION) throw new Error(`This save was made by a newer version of the game (schema ${raw.schemaVersion}).`);
  while (raw.schemaVersion < SCHEMA_VERSION) {
    const m = MIGRATIONS[raw.schemaVersion - 1];
    if (m) m(raw);
    raw.schemaVersion += 1;
    migrated = true;
  }
  // Fill fields added during development so older saves keep loading.
  raw.offseasonReport ??= {};
  raw.flags ??= {};
  raw.gameVersion = GAME_VERSION;
  return { world: raw as World, migrated };
}
