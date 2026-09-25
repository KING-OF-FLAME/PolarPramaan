/* PolarPramaan offline packs service worker.
 * Caches ONLY the URLs listed in a public pack manifest after an explicit user
 * action. It never caches workspace/admin pages, authenticated responses or
 * anything not saved by the user. */
const PREFIX = 'pp-pack-';
const ALLOWED = [/^\/offline\/[a-z0-9-]+\/exhibit/, /^\/api\/media\/[0-9a-f-]{36}$/, /^\/api\/packs\/[a-z0-9-]+$/];
const LIMIT = 5 * 1024 * 1024;

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));

function allowed(url) {
  const u = new URL(url, self.location.origin);
  return u.origin === self.location.origin && ALLOWED.some((re) => re.test(u.pathname));
}

async function savePack({ slug, version, urls }, port) {
  const name = `${PREFIX}${slug}-v${version}`;
  for (const k of await caches.keys()) if (k.startsWith(`${PREFIX}${slug}-`) && k !== name) await caches.delete(k);
  const cache = await caches.open(name);
  let bytes = 0;
  const failed = [];
  let saved = 0;
  for (const url of urls) {
    if (!allowed(url)) {
      failed.push({ url, reason: 'not an allowed pack URL' });
      continue;
    }
    try {
      const res = await fetch(url, { credentials: 'omit', cache: 'no-store' });
      if (!res.ok) {
        failed.push({ url, reason: `HTTP ${res.status}` });
        continue;
      }
      const blob = await res.clone().blob();
      if (bytes + blob.size > LIMIT) {
        failed.push({ url, reason: 'pack size limit (5 MB) reached' });
        continue;
      }
      bytes += blob.size;
      await cache.put(url, res);
      saved++;
    } catch (err) {
      failed.push({ url, reason: 'network error' });
    }
  }
  const meta = { slug, version, savedAt: new Date().toISOString(), bytes, count: saved, failed };
  await cache.put(`/__pack-meta/${slug}`, new Response(JSON.stringify(meta), { headers: { 'content-type': 'application/json' } }));
  port.postMessage({ ok: true, ...meta });
}

async function removePack({ slug }, port) {
  let removed = 0;
  for (const k of await caches.keys()) if (k.startsWith(`${PREFIX}${slug}-`)) removed += (await caches.delete(k)) ? 1 : 0;
  port.postMessage({ ok: true, removed });
}

async function packStatus({ slug }, port) {
  for (const k of await caches.keys()) {
    if (!k.startsWith(`${PREFIX}${slug}-`)) continue;
    const c = await caches.open(k);
    const m = await c.match(`/__pack-meta/${slug}`);
    if (m) return port.postMessage({ ok: true, saved: true, ...(await m.json()) });
  }
  port.postMessage({ ok: true, saved: false });
}

self.addEventListener('message', (e) => {
  const port = e.ports[0];
  if (!port || !e.data || typeof e.data !== 'object') return;
  if (e.data.type === 'save-pack') e.waitUntil(savePack(e.data, port));
  else if (e.data.type === 'remove-pack') e.waitUntil(removePack(e.data, port));
  else if (e.data.type === 'pack-status') e.waitUntil(packStatus(e.data, port));
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET' || !allowed(req.url)) return; // everything else goes straight to the network
  e.respondWith(
    (async () => {
      const cached = await caches.match(req.url);
      const isMedia = new URL(req.url).pathname.startsWith('/api/media/');
      if (cached && isMedia) return cached;
      try {
        const ctl = new AbortController();
        const t = setTimeout(() => ctl.abort(), 4000);
        const res = await fetch(req, { signal: ctl.signal });
        clearTimeout(t);
        return res;
      } catch (err) {
        if (cached) return cached;
        return new Response('Offline and not saved in a pack.', { status: 503, headers: { 'content-type': 'text/plain' } });
      }
    })(),
  );
});
