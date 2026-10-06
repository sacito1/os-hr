/* OS HR app shell: caches only this small launcher page + icons.
   HR data is never cached — it always loads live from the online system. */
var CACHE = 'os-hr-v2';
var SHELL = ['./', './index.html', './manifest.json', './icon-192.png', './icon-512.png', './apple-touch-icon.png', './favicon.png'];
var EXEC = 'https://script.google.com/macros/s/AKfycbwUwRF_ePYsDm5eJRDKfgdxxq_4ts2hBYUrZ63QiyJnRMgwN-OvLPCw0cscYm604g526A/exec';

self.addEventListener('install', function (e) {
  e.waitUntil(caches.open(CACHE).then(function (c) { return c.addAll(SHELL); }).then(function () { return self.skipWaiting(); }));
});

self.addEventListener('activate', function (e) {
  e.waitUntil(caches.keys().then(function (keys) {
    return Promise.all(keys.map(function (k) { return k === CACHE || k === 'os-hr-seen' ? null : caches.delete(k); }));
  }).then(function () { return self.clients.claim(); }));
});

self.addEventListener('fetch', function (e) {
  var req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== self.location.origin) return; // HR system itself is never touched
  if (req.mode === 'navigate') {
    e.respondWith(fetch(req).then(function (res) {
      var copy = res.clone(); caches.open(CACHE).then(function (c) { c.put('./index.html', copy); });
      return res;
    }).catch(function () { return caches.match('./index.html'); }));
    return;
  }
  e.respondWith(caches.match(req).then(function (hit) { return hit || fetch(req); }));
});

/* ---------- แจ้งเตือน: ระบบส่งสัญญาณมา แล้วดึงข้อความล่าสุดจากระบบ HR ---------- */
function hex40(s) {
  return crypto.subtle.digest('SHA-256', new TextEncoder().encode(s)).then(function (b) {
    return Array.from(new Uint8Array(b)).map(function (x) { return ('0' + x.toString(16)).slice(-2); }).join('').slice(0, 40);
  });
}
function seenGet() { return caches.open('os-hr-seen').then(function (c) { return c.match('/seen'); }).then(function (r) { return r ? r.json() : []; }).catch(function () { return []; }); }
function seenPut(a) { return caches.open('os-hr-seen').then(function (c) { return c.put('/seen', new Response(JSON.stringify(a.slice(-60)))); }).catch(function () {}); }

self.addEventListener('push', function (e) {
  e.waitUntil(self.registration.pushManager.getSubscription().then(function (sub) {
    if (!sub) return [];
    return hex40(sub.endpoint).then(function (h) { return fetch(EXEC + '?pull=' + h, { cache: 'no-store' }); }).then(function (r) { return r.json(); });
  }).catch(function () { return []; }).then(function (items) {
    return seenGet().then(function (seen) {
      items = Array.isArray(items) ? items : [];
      var fresh = items.filter(function (it) { return seen.indexOf(it.id) < 0; });
      if (!fresh.length) fresh = items.length ? [items[0]] : [{ id: 'x', title: 'OS HR', body: 'มีการแจ้งเตือนใหม่ · အသိပေးချက်အသစ်', tag: 'oshr' }];
      return seenPut(seen.concat(fresh.map(function (it) { return it.id; }))).then(function () {
        return Promise.all(fresh.reverse().map(function (it) {
          return self.registration.showNotification(it.title || 'OS HR', { body: it.body || '', tag: it.tag || it.id, icon: 'icon-192.png', badge: 'icon-192.png', data: { url: './' } });
        }));
      });
    });
  }));
});

self.addEventListener('notificationclick', function (e) {
  e.notification.close();
  e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function (ws) {
    for (var i = 0; i < ws.length; i++) { if ('focus' in ws[i]) return ws[i].focus(); }
    return self.clients.openWindow('./');
  }));
});
