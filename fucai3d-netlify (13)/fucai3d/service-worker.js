// service-worker.js — PWA 离线缓存
// 缓存策略:cache-first(命中返回缓存,miss 走网络)
const CACHE = 'fc3d-v3';  // v5.8.11:改名强制刷新缓存(最新期 2026219)
const ASSETS = [
  '/',
  '/index.html',
  '/sub.html',
  '/manifest.json',
  '/icon.svg',
  '/favicon.ico',
  '/css/style.css',
  '/js/main.js',
  '/js/data.js',
  '/js/formulas.js',
  '/js/auth.js',
  '/js/countdown.js',
  '/js/dataFetcher.js',
  '/js/netlifyBackend.js',
  '/js/tokenAuth.js',
  '/js/latest.js',
  '/js/autoUpdater.js',
  '/js/myBets.js'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE).then((cache) => {
      return cache.addAll(ASSETS);
    }).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))
      );
    }).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  // 只处理 GET 请求
  if (event.request.method !== 'GET') return;
  // 不缓存 Netlify Functions(让它们走网络,保证最新)
  if (event.request.url.includes('/.netlify/functions/')) return;
  // 不缓存 latest.json(总是拿最新)
  if (event.request.url.includes('/latest.json')) return;
  // 关键 JS 文件不缓存(避免老版本)
  if (event.request.url.includes('/js/main.js') ||
      event.request.url.includes('/js/auth.js') ||
      event.request.url.includes('/js/latest.js') ||
      event.request.url.includes('/js/formulas.js') ||
      event.request.url.includes('/js/tokenAuth.js')) {
    event.respondWith(fetch(event.request));
    return;
  }

  event.respondWith(
    caches.match(event.request).then((cached) => {
      if (cached) {
        // cache 命中,返回缓存(并后台更新)
        fetch(event.request).then((response) => {
          if (response && response.status === 200) {
            caches.open(CACHE).then((cache) => cache.put(event.request, response.clone()));
          }
        }).catch(() => {});
        return cached;
      }
      // cache miss,走网络
      return fetch(event.request).then((response) => {
        if (response && response.status === 200) {
          const clone = response.clone();
          caches.open(CACHE).then((cache) => cache.put(event.request, clone));
        }
        return response;
      }).catch(() => {
        // 网络失败,返回离线 fallback
        if (event.request.destination === 'document') {
          return caches.match('/index.html');
        }
      });
    })
  );
});
