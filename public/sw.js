// alvvo finance · service worker: app instalável e tela de "sem conexão".
// Não guarda dados financeiros em cache: só a página offline e o ícone. Notificações ficam prontas para a próxima etapa.
const OFF = 'alvvo-finance-offline-v1';
const KEEP = ['/offline.html', '/icon-192.png'];
self.addEventListener('install', (e) => e.waitUntil(caches.open(OFF).then((c) => c.addAll(KEEP)).catch(() => null).then(() => self.skipWaiting())));
self.addEventListener('activate', (e) => e.waitUntil((async () => {
  for (const k of await caches.keys()) if (k !== OFF) await caches.delete(k);
  await self.clients.claim();
})()));
self.addEventListener('fetch', (e) => {
  if (e.request.mode !== 'navigate') return;
  e.respondWith(fetch(e.request).catch(async () => (await caches.match('/offline.html')) || Response.error()));
});
self.addEventListener('push', (e) => {
  let d = {};
  try { d = e.data ? e.data.json() : {}; } catch { d = { title: 'alvvo finance', body: e.data ? e.data.text() : '' }; }
  e.waitUntil(self.registration.showNotification(d.title || 'alvvo finance', { body: d.body || '', tag: d.tag || undefined, icon: '/icon-192.png', badge: '/badge-72.png', data: { url: d.url || '/' } }));
});
self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  const url = new URL(e.notification.data?.url || '/', self.registration.scope).href;
  e.waitUntil((async () => {
    const all = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const c of all) { if ('focus' in c) { await c.focus(); if ('navigate' in c) return c.navigate(url).catch(() => null); return null; } }
    return self.clients.openWindow(url);
  })());
});
