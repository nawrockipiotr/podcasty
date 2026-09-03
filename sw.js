/* Service worker odtwarzacza podcastów CSRI.
   Dwie oddzielne pamięci podręczne:
     csri-powloka-vN  — pliki aplikacji, odświeżane przy każdym wdrożeniu
     csri-audio-v1    — pobrane odcinki, NIGDY nie czyszczone automatycznie
   Podbij numer POWLOKA po każdej zmianie w index.html / player.js. */

const POWLOKA = 'csri-powloka-v14';
const AUDIO = 'csri-audio-v1';
/* pdf.worker.min.js (1,1 MB) musi być tu razem z rdzeniem: bez workera czytnik
   rozdziału nie otworzy się offline, a pobranie odcinka z lekturą było warunkiem. */
const PLIKI = ['./', 'index.html', 'player.js', 'lektury.js', 'episodes.json', 'lektury.json',
  'manifest.webmanifest', 'pdfjs/pdf.min.js', 'pdfjs/pdf.worker.min.js'];

/* Do pamięci podręcznej trafiają wyłącznie udane odpowiedzi.
   Bez tego jeden 404 — wdrożenie w toku, chwilowy brak sieci, tunel w metrze —
   zostaje zapisany i jest serwowany do końca życia tej wersji cache.
   Odczytu nie naprawia ani odświeżenie strony, ani ponowne wejście. */
const wartoZapisac = (odp) => odp && odp.ok && odp.status === 200 && odp.type !== 'opaque';

function zapisz(zadanie, odp) {
  if (!wartoZapisac(odp)) return;
  const kopia = odp.clone();
  caches.open(POWLOKA).then((c) => c.put(zadanie, kopia)).catch(() => {});
}

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(POWLOKA)
      /* Pojedynczo, nie addAll: brak jednego pliku (np. workera pdf.js) nie może
         wywrócić całej instalacji powłoki. */
      .then((c) => Promise.all(PLIKI.map((u) => c.add(u).catch(() => {}))))
      .catch(() => {})
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

  /* Audio: najpierw pamięć podręczna (odcinki pobrane na offline).
     Zapytania częściowe (Range) tylko tutaj omijają workera — inaczej psuje się
     przewijanie nagrania. Reszta, w tym PDF-y lektur, idzie przez cache, bo od tego
     zależy działanie czytnika bez sieci. */
  if (/\.(mp3|m4a|aac|ogg|opus)$/i.test(new URL(zadanie.url).pathname)) {
    if (zadanie.headers.has('range')) return;
    e.respondWith(caches.match(zadanie).then((traf) => traf || fetch(zadanie)));
    return;
  }

  // episodes.json i lektury.json: najpierw sieć, żeby zmiany pojawiały się od razu.
  if (zadanie.url.includes('episodes.json') || zadanie.url.includes('lektury.json')) {
    e.respondWith(
      fetch(zadanie)
        .then((odp) => { zapisz(zadanie, odp); return odp; })
        .catch(() => caches.match(zadanie))
    );
    return;
  }

  // Reszta powłoki: najpierw pamięć podręczna, w tle odświeżenie.
  e.respondWith(
    caches.match(zadanie).then((traf) => traf || fetch(zadanie).then((odp) => { zapisz(zadanie, odp); return odp; }))
  );
});
