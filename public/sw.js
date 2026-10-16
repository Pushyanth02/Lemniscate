/* Lemniscate offline shell — v2.
 *
 * v2: cache-generation bump so any client that ever cached the pre-v2
 * shell (including pre-remediation `/_next/` chunks) drops those caches
 * on activate and re-fetches the current build — see the release
 * checklist in AUDIT_REMEDIATION_REPORT.md §11.
 * Goals, in priority order:
 *   1. Never serve stale reading data: documents, annotations, and every
 *      same-origin request stay network-first; the cache answers only when
 *      the network is gone.
 *   2. Make the whole app work with the network gone: after one online
 *      visit, the shell, the hashed build assets, the self-hosted fonts,
 *      and the static art are all cached, so an offline reload renders
 *      fully (AI features fall back to the on-device LOA engines, which
 *      never needed the network).
 *   3. Stay invisible in development: HMR and dev requests always try the
 *      network first, exactly as before.
 *
 * Cross-origin traffic (the AI providers) is never intercepted; it passes
 * straight through to the browser, untouched.
 */
const VERSION = "lemniscate-v2";

/* Immutable, content-addressed or versioned assets: cache-first. */
const IMMUTABLE = [
  /^\/_next\//,
  /^\/assets\//,
  /^\/fonts\//,
  /^\/pdf\.worker\.min\.mjs$/,
  /^\/icon\.svg$/,
  /^\/favicon\.svg$/,
  /^\/apple-touch-icon\.png$/,
  /^\/logo\.svg$/,
  /^\/og\.jpg$/,
  /^\/noise\.svg$/,
  /^\/robots\.txt$/,
  /^\/sitemap\.xml$/,
  /^\/llms\.txt$/,
];

self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const names = await caches.keys();
      await Promise.all(
        names.filter((n) => n !== VERSION).map((n) => caches.delete(n)),
      );
      await self.clients.claim();
    })(),
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  const path = url.pathname;

  /* Immutable assets: cache-first, refresh on miss. */
  if (IMMUTABLE.some((re) => re.test(path))) {
    event.respondWith(
      (async () => {
        const cache = await caches.open(VERSION);
        const hit = await cache.match(req);
        if (hit) return hit;
        const res = await fetch(req);
        if (res && res.status === 200) cache.put(req, res.clone());
        return res;
      })(),
    );
    return;
  }

  /* Navigations (the single-page shell): network-first so dev and deploys
   * always serve the freshest document; when offline, the last good shell
   * answers. The shell is stored under "/" (the app's only real route). */
  if (req.mode === "navigate") {
    event.respondWith(
      (async () => {
        const cache = await caches.open(VERSION);
        try {
          const res = await fetch(req);
          if (res && res.status === 200) cache.put("/", res.clone());
          return res;
        } catch {
          const shell = (await cache.match("/")) || (await cache.match(req));
          if (shell) return shell;
          return new Response(
            "Lemniscate is offline and this page was never cached. Reconnect once, then reload.",
            { status: 503, headers: { "Content-Type": "text/plain; charset=utf-8" } },
          );
        }
      })(),
    );
    return;
  }

  /* Everything else same-origin GET (API reads, dev assets): network-first
   * with a cache fallback; never proactively cached, so data is never stale. */
  event.respondWith(
    (async () => {
      try {
        return await fetch(req);
      } catch {
        const cache = await caches.open(VERSION);
        const hit = await cache.match(req);
        if (hit) return hit;
        return new Response("offline", {
          status: 503,
          headers: { "Content-Type": "text/plain; charset=utf-8" },
        });
      }
    })(),
  );
});
