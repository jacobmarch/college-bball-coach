import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import { listBackups, listSaves, loadSave, saveWorld } from './db';
import { makeWorld } from '../sim/__tests__/helpers';

describe('IndexedDB persistence', () => {
  it('saves, loads, and rotates backups', async () => {
    const w = makeWorld(31, 'slice');
    await saveWorld(w);
    w.week = 3;
    await saveWorld(w);
    w.week = 4;
    await saveWorld(w);
    const saves = await listSaves();
    expect(saves[0].id).toBe(w.id);
    const loaded = await loadSave(w.id);
    expect(loaded.week).toBe(4);
    const backups = await listBackups(w.id);
    expect(backups.length).toBe(2);
  });
});
