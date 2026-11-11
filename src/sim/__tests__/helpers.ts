import { createWorld, DEFAULT_SETTINGS, DEFAULT_STRATEGY, startingJobOptions, takeStartingJob, type UniverseSize } from '../generate';
import type { World } from '../types';

export function makeWorld(seed = 12345, size: UniverseSize = 'standard', role: 'head' | 'assistant' = 'head'): World {
  const w = createWorld({
    name: 'Test',
    seed,
    size,
    settings: { ...DEFAULT_SETTINGS, gameMode: 'instant' },
    coach: {
      first: 'Test',
      last: 'Coach',
      age: 38,
      background: 'Analytics department',
      skills: { recruiting: 55, development: 55, tactics: 55, gameMgmt: 50, relationships: 50, academics: 50, programBuilding: 50 },
      traits: ['developer'],
      style: { ...DEFAULT_STRATEGY },
    },
  });
  takeStartingJob(w, startingJobOptions(w, role)[0], role);
  return w;
}
