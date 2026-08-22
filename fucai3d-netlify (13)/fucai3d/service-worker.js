// service-worker.js — PWA 离线缓存
// v5.8.12 优化:关键 JS 也走 stale-while-revalidate(秒开,后台更新)
// 缓存策略:cache-first(命中返回缓存,miss 走网络)
const CACHE = 'fc3d-v4';  // v5.8.12:改名强制刷新缓存(stale-while-revalidate 模式)
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
  // 不阻塞 install:后台预缓存就行
  event.waitUntil(
    caches.open(CACHE).then((cache) => {
      return cache.addAll(ASSETS).catch((err) => {
        // 单个资源失败不影响整体
        console.warn('[SW] 预缓存部分失败(继续):', err);
      });
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

  // v5.8.12 优化:stale-while-revalidate 模式
  // - 命中 cache:立即返回 cache(秒开),后台 fetch 更新
  // - miss:走网络,写入 cache
  event.respondWith(
    caches.match(event.request).then((cached) => {
      // 后台 fetch 拿最新(用于下次)
      const fetchPromise = fetch(event.request).then((response) => {
        if (response && response.status === 200) {
          const clone = response.clone();
          caches.open(CACHE).then((cache) => cache.put(event.request, clone));
        }
        return response;
      }).catch(() => null);

      // 命中:立即返回 cache(不等网络)
      if (cached) {
        return cached;
      }
      // miss:返回网络(等)
      return fetchPromise.then(r => r || (event.request.destination === 'document' ? caches.match('/index.html') : new Response('', { status: 504 })));
    })
  );
});
