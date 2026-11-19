// Meclis service worker: uygulama dosyalarını saklar, böylece Meclis
// "uygulama olarak yükle" ile kurulabilir ve hızlı açılır.
// Yeni sürüm yayınlanınca SURUM değeri değiştirilir.
const SURUM = 'meclis-2.0.0';
const DOSYALAR = [
  './',
  './index.html',
  './css/stil.css',
  './manifest.webmanifest',
  './simge.svg',
  './simge-maskeli.svg',
  './js/uygulama.js',
  './js/saglayicilar.js',
  './js/meclis.js',
  './js/depolama.js',
  './js/sifreleme.js',
  './js/ayarlar.js',
  './js/sihirbaz.js',
  './js/metin.js',
  './js/durum.js',
  './js/dosyalar.js',
  './js/projeler.js',
  './js/proje-arayuz.js',
  './js/eklenti-baglanti.js'
];

self.addEventListener('install', (olay) => {
  olay.waitUntil(caches.open(SURUM).then((c) => c.addAll(DOSYALAR)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (olay) => {
  olay.waitUntil(
    caches.keys()
      .then((adlar) => Promise.all(adlar.filter((a) => a !== SURUM).map((a) => caches.delete(a))))
      .then(() => self.clients.claim())
  );
});

// Sadece kendi dosyalarımızı yanıtlarız; yapay zeka isteklerine hiç dokunmayız.
// Önce ağdan dener (güncel sürüm gelsin), ağ yoksa saklanan kopyayı verir.
self.addEventListener('fetch', (olay) => {
  const istek = olay.request;
  if (istek.method !== 'GET') return;
  const url = new URL(istek.url);
  if (url.origin !== self.location.origin) return;
  olay.respondWith(
    fetch(istek)
      .then((yanit) => {
        const kopya = yanit.clone();
        caches.open(SURUM).then((c) => c.put(istek, kopya));
        return yanit;
      })
      .catch(() => caches.match(istek))
  );
});
