import type { SimRequest, SimResponse } from './ops';
import { runOp } from './ops';

let worker: Worker | null = null;
let seq = 0;
const pending = new Map<number, { resolve: (r: SimResponse) => void; reject: (e: Error) => void; onProgress?: (d: number, t: number) => void }>();

function getWorker(): Worker | null {
  if (worker) return worker;
  if (typeof Worker === 'undefined') return null;
  try {
    worker = new Worker(new URL('./sim.worker.ts', import.meta.url), { type: 'module' });
    worker.onmessage = (e) => {
      const { id, res, error, progress } = e.data;
      const p = pending.get(id);
      if (!p) return;
      if (progress) {
        p.onProgress?.(progress.done, progress.total);
        return;
      }
      pending.delete(id);
      if (error) p.reject(new Error(error));
      else p.resolve(res);
    };
    worker.onerror = () => {
      worker = null;
    };
    return worker;
  } catch {
    return null;
  }
}

/** Run a simulation op off the main thread (falls back to inline if workers are unavailable). */
export function runSim(req: SimRequest, onProgress?: (done: number, total: number) => void): Promise<SimResponse> {
  const w = getWorker();
  if (!w) return Promise.resolve(runOp(req, onProgress));
  const id = ++seq;
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject, onProgress });
    w.postMessage({ id, req });
  });
}
