/* =====================================================================
   THE TABLE — service worker
   Makes the toolkit installable and fully offline-capable.
   Strategy:
     • Pages (HTML / navigations): NETWORK-FIRST — when online you always get
       the latest version you've deployed; when offline you get the cached copy.
     • App assets (icons, manifest): CACHE-FIRST.
     • Google Fonts: CACHE-FIRST (so the Cinzel/Spline Sans render offline).
   Your Codex and all tool data live in localStorage, which the service worker
   never touches — caching here only affects the app files, never your data.

   To force a clean refresh of everything after a big update, bump CACHE_VERSION.
   ===================================================================== */
const CACHE_VERSION = 'arcanaforge-v17';

/* App shell precached on install. Missing files are skipped gracefully, so an
   optional tool you haven't added yet won't break the install. */
const SHELL = [
  './',
  './index.html',
  './dashboard.html',
  './codex.html',
  './character-sheets.html',
  './initiative-tracker.html',
  './npc-generator.html',
  './loot-generator.html',
  './shop-generator.html',
  './dungeon-generator.html',
  './environment-generator.html',
  './campaign-notes.html',
  './group-inventory.html',
  './campaign.html',
  './custom-generators.html',
  './manifest.webmanifest',
  './icon-192.png',
  './icon-512.png',
  './icon-512-maskable.png',
  './icon-180.png',
  './favicon.png',
  './arcanaforge-mark.png',
  './arcanaforge-wordmark.png'
];

self.addEventListener('install', e => {
  e.waitUntil((async () => {
    const c = await caches.open(CACHE_VERSION);
    await Promise.allSettled(SHELL.map(u => c.add(new Request(u, { cache: 'reload' }))));
    self.skipWaiting();
  })());
});

self.addEventListener('activate', e => {
  e.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter(k => k !== CACHE_VERSION).map(k => caches.delete(k)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  let url;
  try { url = new URL(req.url); } catch (_) { return; }

  // Google Fonts — cache-first so fonts work offline
  if (url.hostname.includes('fonts.googleapis.com') || url.hostname.includes('fonts.gstatic.com')) {
    e.respondWith(cacheFirst(req));
    return;
  }
  // Only handle our own origin beyond this point
  if (url.origin !== self.location.origin) return;

  // Pages / navigations — network-first
  if (req.mode === 'navigate' || (req.headers.get('accept') || '').includes('text/html')) {
    e.respondWith(networkFirst(req));
    return;
  }
  // Everything else same-origin (icons, manifest) — cache-first
  e.respondWith(cacheFirst(req));
});

async function networkFirst(req) {
  const c = await caches.open(CACHE_VERSION);
  try {
    const res = await fetch(req);
    if (res && res.ok) c.put(req, res.clone());
    return res;
  } catch (_) {
    const hit = await c.match(req);
    return hit || (await c.match('./dashboard.html')) || new Response('Offline', { status: 503, headers: { 'Content-Type': 'text/plain' } });
  }
}

async function cacheFirst(req) {
  const c = await caches.open(CACHE_VERSION);
  const hit = await c.match(req);
  if (hit) return hit;
  try {
    const res = await fetch(req);
    if (res && (res.ok || res.type === 'opaque')) c.put(req, res.clone());
    return res;
  } catch (_) {
    return hit || new Response('', { status: 504 });
  }
}
