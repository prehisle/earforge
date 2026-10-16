// 离线缓存：
// - 预缓存：构建时 vite.config.ts 把本次构建的全部文件（含按需加载的页面分块）写进 PRECACHE，
//   并把 BUILD 换成文件列表的哈希。sw.js 因此每次发布都会变化，浏览器安装新版本时一次性缓存全部分块，
//   即使从没打开过的页面（统计、曲库、设置……）离线时也能打开；启用后删除旧版本的缓存。
// - 路径都相对 sw.js 所在目录（ROOT），部署在子路径（如 /earforge/）下同样适用。
// - 页面导航走网络优先（保证更新），失败时用缓存的首页 ROOT；其余同源资源缓存优先，未命中则联网并顺手缓存。
// - 采样钢琴（tonejs.github.io，返回 Access-Control-Allow-Origin: *）单独缓存、缓存优先，应用升级时保留。
const BUILD = 'dev';
const PRECACHE = [];
const CACHE = `earforge-v3-${BUILD}`;
const SAMPLE_CACHE = 'earforge-samples-v1';
const SAMPLE_PREFIX = 'https://tonejs.github.io/audio/salamander/';
const ROOT = new URL('./', self.location).href;

self.addEventListener('install', (e) => {
  const urls = ['./', './manifest.webmanifest', './favicon.svg', ...PRECACHE].map((u) => new URL(u, ROOT).href);
  // cache: 'reload' 绕过 HTTP 缓存，确保存进去的是本次构建的文件
  e.waitUntil(
    caches.open(CACHE).then((c) => c.addAll([...new Set(urls)].map((u) => new Request(u, { cache: 'reload' })))),
  );
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
          // 必须同步 clone：返回后响应体会被页面读取
          if (res.ok) {
            const copy = res.clone();
            caches.open(CACHE).then((c) => c.put(ROOT, copy));
          }
          return res;
        })
        .catch(() => caches.match(ROOT)),
    );
    return;
  }
  // 缓存优先（预缓存的分块都在这里命中）；未命中则联网，成功的同源响应顺手缓存
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
