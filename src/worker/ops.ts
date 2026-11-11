import type { World } from '../sim/types';
import { advanceWeek, type AdvanceReport } from '../sim/season';
import { offseasonContinue } from '../sim/offseason';
import { createWorld, type NewWorldInput } from '../sim/generate';

export type SimRequest =
  | { op: 'advance'; world: World; weeks: number; stopAtUserGame: boolean }
  | { op: 'offseason'; world: World }
  | { op: 'create'; input: NewWorldInput };

export interface SimResponse {
  world: World;
  reports: AdvanceReport[];
  error?: string;
}

/** Pure operations shared by the worker and the main-thread fallback. */
export function runOp(req: SimRequest, progress?: (done: number, total: number) => void): SimResponse {
  if (req.op === 'create') return { world: createWorld(req.input), reports: [] };
  const world = req.world;
  if (req.op === 'offseason') {
    offseasonContinue(world);
    return { world, reports: [] };
  }
  const reports: AdvanceReport[] = [];
  const startPhase = world.phase;
  for (let i = 0; i < req.weeks; i++) {
    reports.push(advanceWeek(world));
    progress?.(i + 1, req.weeks);
    if (world.phase === 'offseason') break;
    if (req.weeks > 1 && world.phase !== startPhase) break;
    if (req.stopAtUserGame && i < req.weeks - 1) {
      const sid = world.coaches[world.userCoachId]?.contract?.schoolId;
      const hasGame = world.games.some((g) => g.week === world.week && !g.played && (g.homeId === sid || g.awayId === sid));
      if (hasGame && world.settings.gameMode !== 'instant') break;
    }
  }
  return { world, reports };
}
