/* Service worker odtwarzacza podcastów CSRI.
   Dwie oddzielne pamięci podręczne:
     csri-powloka-vN  — pliki aplikacji, odświeżane przy każdym wdrożeniu
     csri-audio-v1    — pobrane odcinki, NIGDY nie czyszczone automatycznie
   Podbij numer POWLOKA po każdej zmianie w index.html / player.js. */

const POWLOKA = 'csri-powloka-v12';
const AUDIO = 'csri-audio-v1';
const PLIKI = ['./', 'index.html', 'player.js', 'episodes.json', 'manifest.webmanifest'];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(POWLOKA)
      .then((c) => c.addAll(PLIKI))
      .catch(() => {})          // brak pojedynczego pliku nie może zablokować instalacji
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((klucze) => Promise.all(
        klucze.filter((k) => k !== POWLOKA && k !== AUDIO).map((k) => caches.delete(k))
      ))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const zadanie = e.request;
  if (zadanie.method !== 'GET') return;

  // Audio: najpierw pamięć podręczna (odcinki pobrane na offline).
  // Zapytania częściowe (Range) przepuszczamy do sieci — inaczej psuje się przewijanie.
  if (/\.(mp3|m4a|aac|ogg|opus)$/i.test(new URL(zadanie.url).pathname)) {
    if (zadanie.headers.has('range')) return;
    e.respondWith(caches.match(zadanie).then((traf) => traf || fetch(zadanie)));
    return;
  }

  // episodes.json: najpierw sieć, żeby nowe odcinki pojawiały się od razu.
  if (zadanie.url.includes('episodes.json')) {
    e.respondWith(
      fetch(zadanie)
        .then((odp) => {
          const kopia = odp.clone();
          caches.open(POWLOKA).then((c) => c.put(zadanie, kopia)).catch(() => {});
          return odp;
        })
        .catch(() => caches.match(zadanie))
    );
    return;
  }

  // Reszta powłoki: najpierw pamięć podręczna, w tle odświeżenie.
  e.respondWith(
    caches.match(zadanie).then((traf) => traf || fetch(zadanie).then((odp) => {
      const kopia = odp.clone();
      caches.open(POWLOKA).then((c) => c.put(zadanie, kopia)).catch(() => {});
      return odp;
    }))
  );
});
