import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import { createHash } from 'node:crypto';
import { readdirSync } from 'node:fs';

/**
 * Emits a versioned service worker that precaches every file in the build,
 * so the game runs fully offline after the first visit. No third-party
 * runtime, no network calls during play.
 */
function offlineServiceWorker(): Plugin {
  return {
    name: 'bench-boss-offline-sw',
    apply: 'build',
    generateBundle(_options, bundle) {
      const files = new Set<string>(['./', './index.html']);
      for (const name of Object.keys(bundle)) files.add('./' + name);
      try {
        for (const f of readdirSync('public')) if (f !== 'sw.js') files.add('./' + f);
      } catch {
        /* no public dir */
      }
      const list = [...files].sort();
      const version = createHash('sha256').update(list.join('|')).digest('hex').slice(0, 12);
      const source = `/* Bench Boss offline service worker (generated) */
const CACHE = 'bench-boss-${version}';
const PRECACHE = ${JSON.stringify(list)};
self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((c) => c.addAll(PRECACHE)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE && k.startsWith('bench-boss-')).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});
self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== self.location.origin) return;
  if (req.mode === 'navigate') {
    event.respondWith(fetch(req).catch(() => caches.match('./index.html', { ignoreSearch: true, ignoreVary: true })));
    return;
  }
  event.respondWith(
    caches.match(req, { ignoreSearch: true, ignoreVary: true }).then((hit) => hit || fetch(req).then((res) => {
      if (res.ok) { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(req, copy)); }
      return res;
    }))
  );
});
`;
      this.emitFile({ type: 'asset', fileName: 'sw.js', source });
    },
  };
}

export default defineConfig({
  base: './',
  plugins: [react(), offlineServiceWorker()],
  worker: { format: 'es' },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
    testTimeout: 120000,
  },
} as any);
