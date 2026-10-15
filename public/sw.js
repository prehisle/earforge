// 离线缓存：页面走网络优先（保证更新），静态资源走缓存优先。
// 采样钢琴（tonejs.github.io，返回 Access-Control-Allow-Origin: *）单独缓存、缓存优先，应用升级时保留。
const CACHE = 'earforge-v2';
const SAMPLE_CACHE = 'earforge-samples-v1';
const SAMPLE_PREFIX = 'https://tonejs.github.io/audio/salamander/';

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(['/', '/manifest.webmanifest', '/favicon.svg'])));
  self.skipWaiting();
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((k) => k !== CACHE && k !== SAMPLE_CACHE).map((k) => caches.delete(k))),
      ),
  );
  self.clients.claim();
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  if (req.url.startsWith(SAMPLE_PREFIX)) {
    // 只缓存 CORS 成功的完整响应（type 'cors'、200）；opaque 响应读不出内容，也无法判断是否出错，不缓存
    e.respondWith(
      caches.open(SAMPLE_CACHE).then((c) =>
        c.match(req.url).then(
          (hit) =>
            hit ||
            fetch(req.url, { mode: 'cors', credentials: 'omit' }).then((res) => {
              if (res.status === 200 && res.type === 'cors') c.put(req.url, res.clone());
              return res;
            }),
        ),
      ),
    );
    return;
  }
  if (new URL(req.url).origin !== location.origin) return;
  if (req.mode === 'navigate') {
    e.respondWith(
      fetch(req)
        .then((res) => {
          caches.open(CACHE).then((c) => c.put('/', res.clone()));
          return res;
        })
        .catch(() => caches.match('/')),
    );
    return;
  }
  e.respondWith(
    caches.match(req).then(
      (hit) =>
        hit ||
        fetch(req).then((res) => {
          if (res.ok) {
            const copy = res.clone();
            caches.open(CACHE).then((c) => c.put(req, copy));
          }
          return res;
        }),
    ),
  );
});
