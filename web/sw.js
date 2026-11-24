// 레인로그 서비스 워커: 앱 파일을 기기에 저장해 두고 오프라인에서도 열리게 한다.
// 배포할 때 __BUILD__ 가 커밋 해시로 바뀌어 새 버전이 설치된다.
const CACHE = 'lanelog-__BUILD__';
const ASSETS = [
  './', './index.html', './style.css', './app.js', './store.js', './sync.js', './qr.js', './manifest.webmanifest',
  './icons/icon.svg', './icons/icon-192.png', './icons/icon-512.png', './icons/maskable-512.png',
  './icons/shortcut-new-96.png', './icons/shortcut-week-96.png',
];

self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(ASSETS.map(url => new Request(url, { cache: 'reload' })))));
});

self.addEventListener('activate', event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k.startsWith('lanelog-') && k !== CACHE).map(k => caches.delete(k)))));
});

self.addEventListener('message', event => {
  if (event.data === 'skip-waiting') self.skipWaiting();
});

self.addEventListener('fetch', event => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return; // GitHub API 등 외부 요청은 그대로 보낸다
  if (req.mode === 'navigate') {
    event.respondWith(caches.match('./index.html').then(hit => hit || fetch(req)));
    return;
  }
  event.respondWith(caches.match(req, { ignoreSearch: true }).then(hit => hit || fetch(req)));
});
