/// <reference lib="webworker" />
import { runOp, type SimRequest } from './ops';

self.onmessage = (e: MessageEvent<{ id: number; req: SimRequest }>) => {
  const { id, req } = e.data;
  try {
    const res = runOp(req, (done, total) => (self as unknown as Worker).postMessage({ id, progress: { done, total } }));
    (self as unknown as Worker).postMessage({ id, res });
  } catch (err) {
    (self as unknown as Worker).postMessage({ id, error: err instanceof Error ? err.message : String(err) });
  }
};
