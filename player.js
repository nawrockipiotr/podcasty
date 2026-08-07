/* =====================================================================
   player.js — rdzeń funkcjonalny odtwarzacza podcastów CSRI
   =====================================================================

   TEN PLIK PRZENIEŚ DO CLAUDE DESIGN BEZ ZMIAN.

   Zawiera całą logikę, która decyduje o tym, że strona zachowuje się jak
   natywna aplikacja: MediaSession (ekran blokady, słuchawki), wznawianie
   odsłuchu, prędkość odtwarzania, tryb offline. Design ma zbudować warstwę
   HTML i CSS, a nie przepisywać tę logikę od nowa.

   KONTRAKT — plik szuka elementów po tych identyfikatorach.
   Brakujące elementy są ignorowane, więc możesz pominąć te, których
   Twój układ nie ma.

     lista               kontener listy odcinków
     szukaj              <input> wyszukiwarki
     filtry              kontener przycisków filtrów modułów
     nazwa-serii         tytuł serii
     podpis-serii        podpis pod tytułem
     logo                <img> okładki serii
     mini                pasek mini-playera (klasa `widoczny` = pokazany)
     mini-okladka        <img>
     mini-tytul          tytuł w mini-playerze
     mini-podtytul       gość i data — w kursie CSRI PUSTE, zaprojektuj układ bez tego wiersza
     mini-play           przycisk odtwarzania w mini-playerze
     mini-postep         <i> paska postępu (sterowany przez style.width)
     mini-otworz         obszar klikalny otwierający pełny ekran
     pelny               panel pełnoekranowy (klasa `otwarty` = pokazany)
     pelny-okladka-img   <img> dużej okładki
     pelny-tytul         tytuł odcinka
     pelny-podtytul      gość i data — w kursie CSRI PUSTE
     pelny-opis-tresc    pełny opis
     pelny-seria         nazwa serii w nagłówku panelu
     suwak               <input type="range" min=0 max=1000>
     czas-teraz          bieżąca pozycja
     czas-koniec         długość odcinka
     play                główny przycisk odtwarzania
     cofnij / dalej      skoki −15 s i +30 s
     predkosc            przełącznik prędkości
     pobierz             przycisk trybu offline
     nastepny            przejście do kolejnej pozycji na liście
     zamknij             zwinięcie panelu
     udostepnij          udostępnianie
     komunikat           „toast" (klasa `widoczny`)
     audio               <audio preload="metadata" playsinline>

   Elementy .odcinek na liście generuje ten plik. Jeśli chcesz inny układ
   karty odcinka, podmień wyłącznie funkcję `szablonOdcinka`.
   ===================================================================== */

'use strict';

const KLUCZ_POSTEP = 'csri-podcast-postep-v1';
const KLUCZ_USTAWIENIA = 'csri-podcast-ustawienia-v1';
const PREDKOSCI = [1, 1.25, 1.5, 1.75, 2];
const SKOK_WSTECZ = 15;
const SKOK_WPRZOD = 30;

const IKONA_PLAY = '<svg viewBox="0 0 24 24"><path d="M8 5v14l11-7L8 5Z"/></svg>';
const IKONA_PAUZA = '<svg viewBox="0 0 24 24"><path d="M6 19h4V5H6v14Zm8-14v14h4V5h-4Z"/></svg>';

const $ = (id) => document.getElementById(id);
const audio = $('audio');

let odcinki = [];       // kolejność wg seria.kolejnosc: rosnąco (kurs) lub malejąco (podcast)
let widoczne = [];      // po filtrze i wyszukiwaniu
let biezacy = null;     // indeks w `odcinki`
let seria = {};
let aktywnyFiltr = 'wszystkie';
let przeciaganie = false;

/* ------------------------------------------------------------------
   Trwały stan
   ------------------------------------------------------------------ */
const wczytaj = (k, d) => { try { return JSON.parse(localStorage.getItem(k)) || d; } catch { return d; } };
const zapisz = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} };

let postep = wczytaj(KLUCZ_POSTEP, {});
let ustawienia = wczytaj(KLUCZ_USTAWIENIA, { predkosc: 1, ostatni: null });

/* ------------------------------------------------------------------
   Formatowanie
   ------------------------------------------------------------------ */
function czas(s) {
  if (!isFinite(s) || s < 0) return '–:––';
  const sek = Math.floor(s % 60), min = Math.floor(s / 60) % 60, godz = Math.floor(s / 3600);
  const dwa = (n) => String(n).padStart(2, '0');
  return godz ? `${godz}:${dwa(min)}:${dwa(sek)}` : `${min}:${dwa(sek)}`;
}

function dlugoscOpisowa(s) {
  if (!isFinite(s) || s <= 0) return '';
  const m = Math.round(s / 60);
  return m >= 60 ? `${Math.floor(m / 60)} godz. ${m % 60} min` : `${m} min`;
}

function dataOpisowa(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  return isNaN(d) ? '' : d.toLocaleDateString('pl-PL', { day: 'numeric', month: 'long', year: 'numeric' });
}

let timerKomunikatu;
function powiedz(tekst) {
  const el = $('komunikat');
  if (!el) return;
  el.textContent = tekst;
  el.classList.add('widoczny');
  clearTimeout(timerKomunikatu);
  timerKomunikatu = setTimeout(() => el.classList.remove('widoczny'), 2600);
}

const ustaw = (id, tekst) => { const el = $(id); if (el) el.textContent = tekst; };
const ustawSrc = (id, url) => { const el = $(id); if (el && url) el.src = url; };

/* ------------------------------------------------------------------
   Wczytanie danych
   ------------------------------------------------------------------ */
async function start() {
  let dane;
  try {
    const odp = await fetch('episodes.json', { cache: 'no-cache' });
    if (!odp.ok) throw new Error(`HTTP ${odp.status}`);
    dane = await odp.json();
  } catch (e) {
    if ($('lista')) $('lista').innerHTML =
      `<p class="pusto">Nie udało się wczytać listy odcinków.<br><small>${e.message}</small></p>`;
    return;
  }

  seria = dane.seria || {};
  odcinki = (dane.odcinki || []).filter((o) => o && o.id && o.audio);

  // Podcast tematyczny: najnowsze na górze. Kurs: od pierwszego odcinka,
  // bo kolejność jest częścią programu. Steruje tym seria.kolejnosc.
  const rosnaco = seria.kolejnosc === 'rosnaco';
  odcinki.sort((a, b) => {
    const poDacie = (b.data || '').localeCompare(a.data || '');
    const poNumerze = (b.numer || 0) - (a.numer || 0);
    return rosnaco ? -(poDacie || poNumerze) : (poDacie || poNumerze);
  });

  if (seria.tytul) { ustaw('nazwa-serii', seria.tytul); ustaw('pelny-seria', seria.tytul); document.title = seria.tytul; }
  if (seria.podpis) ustaw('podpis-serii', seria.podpis);
  if (seria.okladka) ustawSrc('logo', seria.okladka);

  audio.playbackRate = ustawienia.predkosc;
  ustaw('predkosc', String(ustawienia.predkosc).replace('.', ',') + '×');

  zbudujFiltry();
  rysujListe();

  if (ustawienia.ostatni) {
    const i = odcinki.findIndex((o) => o.id === ustawienia.ostatni);
    if (i >= 0) zaladuj(i, false);   // przywróć, ale NIE odtwarzaj automatycznie
  }
  if (location.hash) przejdzDoHasha();
}

/* ------------------------------------------------------------------
   Filtry sezonów
   ------------------------------------------------------------------ */
function zbudujFiltry() {
  const kontener = $('filtry');
  if (!kontener) return;
  const grupy = [...new Set(odcinki.map((o) => o.sezon).filter(Boolean))];
  if (grupy.length < 2) { kontener.style.display = 'none'; return; }

  kontener.innerHTML = ['wszystkie', ...grupy].map((g) =>
    `<button class="filtr" data-filtr="${g}" aria-pressed="${g === aktywnyFiltr}">${
      g === 'wszystkie' ? 'Wszystkie' : g}</button>`).join('');

  kontener.onclick = (e) => {
    const b = e.target.closest('.filtr');
    if (!b) return;
    aktywnyFiltr = b.dataset.filtr;
    [...kontener.children].forEach((x) => x.setAttribute('aria-pressed', x.dataset.filtr === aktywnyFiltr));
    rysujListe();
  };
}

/* ------------------------------------------------------------------
   Lista — podmień `szablonOdcinka`, jeśli chcesz inny układ karty
   ------------------------------------------------------------------ */
function szablonOdcinka(o, indeks) {
  const p = postep[o.id];
  const dlugosc = (p && p.dlugosc) || o.dlugosc || 0;

  let stopka;
  if (p && p.skonczony) {
    stopka = '<span class="znacznik-koniec">Odsłuchany</span>';
  } else if (p && p.czas > 30 && dlugosc) {
    const proc = Math.min(100, (p.czas / dlugosc) * 100);
    stopka = `<span class="pasek-postepu"><i style="width:${proc}%"></i></span>
              <span>zostało ${dlugoscOpisowa(dlugosc - p.czas)}</span>`;
  } else {
    stopka = `<span>${dlugoscOpisowa(dlugosc)}</span>`;
  }

  const okladka = o.okladka || seria.okladka || '';
  // Kod z Kampusa (A.01, P.64) pozwala studentowi dopasować odcinek do sekcji
  // kursu. Gdy go nie ma, wracamy do zwykłej numeracji.
  const oznaczenie = o.kod || (o.numer ? `Odc. ${o.numer}` : '');
  const metryczka = [oznaczenie, dataOpisowa(o.data)].filter(Boolean).join(' · ');

  return `<button class="odcinek" data-i="${indeks}" aria-current="${indeks === biezacy}">
      <span class="okladka">${okladka ? `<img src="${okladka}" alt="" loading="lazy">` : ''}
        <span class="wskaznik"></span></span>
      <span class="odcinek-tresc">
        <span class="odcinek-meta">${metryczka}</span>
        <span class="odcinek-tytul">${o.tytul || 'Bez tytułu'}</span>
        ${o.opis ? `<span class="odcinek-opis">${o.opis}</span>` : ''}
        <span class="odcinek-stopka">${stopka}</span>
      </span>
    </button>`;
}

function rysujListe() {
  const kontener = $('lista');
  if (!kontener) return;
  const fraza = ($('szukaj') ? $('szukaj').value : '').trim().toLowerCase();

  widoczne = odcinki.filter((o) => {
    if (aktywnyFiltr !== 'wszystkie' && o.sezon !== aktywnyFiltr) return false;
    if (!fraza) return true;
    return [o.tytul, o.opis, o.opis_pelny, o.gosc, (o.tagi || []).join(' ')]
      .filter(Boolean).join(' ').toLowerCase().includes(fraza);
  });

  kontener.innerHTML = widoczne.length
    ? widoczne.map((o) => szablonOdcinka(o, odcinki.indexOf(o))).join('')
    : `<p class="pusto">${fraza ? 'Nic nie pasuje do zapytania.' : 'Brak odcinków w tej kategorii.'}</p>`;
}

/* ------------------------------------------------------------------
   Ładowanie odcinka
   ------------------------------------------------------------------ */
function zaladuj(i, odtworz) {
  const o = odcinki[i];
  if (!o) return;
  biezacy = i;
  ustawienia.ostatni = o.id;
  zapisz(KLUCZ_USTAWIENIA, ustawienia);

  audio.src = o.audio;
  audio.playbackRate = ustawienia.predkosc;

  const p = postep[o.id];
  if (p && !p.skonczony && p.czas > 15) {
    audio.currentTime = p.czas;
    powiedz(`Wznowiono od ${czas(p.czas)}`);
  }

  const okladka = o.okladka || seria.okladka || '';
  const podtytul = [o.gosc, dataOpisowa(o.data)].filter(Boolean).join(' · ');

  ustawSrc('mini-okladka', okladka);
  ustawSrc('pelny-okladka-img', okladka);
  ustaw('mini-tytul', o.tytul || '');
  ustaw('mini-podtytul', podtytul);
  ustaw('pelny-tytul', o.tytul || '');
  ustaw('pelny-podtytul', podtytul);
  ustaw('pelny-opis-tresc', o.opis_pelny || o.opis || 'Brak opisu.');
  ustaw('czas-koniec', czas(o.dlugosc || NaN));
  if ($('mini')) $('mini').classList.add('widoczny');

  ustawMediaSession(o, okladka);
  odswiezPrzyciskPobierania(o);
  rysujListe();

  if (odtworz) audio.play().catch(() => powiedz('Dotknij ▶, aby odtworzyć'));
}

/* ------------------------------------------------------------------
   MediaSession — ekran blokady telefonu i przyciski na słuchawkach.
   To jest element, który odróżnia „stronę z audio" od aplikacji.
   ------------------------------------------------------------------ */
function ustawMediaSession(o, okladka) {
  if (!('mediaSession' in navigator)) return;
  const abs = (u) => (u ? new URL(u, location.href).href : '');

  navigator.mediaSession.metadata = new MediaMetadata({
    title: o.tytul || '',
    artist: o.gosc || seria.podpis || '',
    album: seria.tytul || 'Podcasty CSRI',
    artwork: okladka
      ? ['96x96', '256x256', '512x512'].map((sizes) => ({ src: abs(okladka), sizes, type: 'image/jpeg' }))
      : [],
  });

  const akcje = {
    play: () => audio.play(),
    pause: () => audio.pause(),
    seekbackward: (d) => skok(-(d.seekOffset || SKOK_WSTECZ)),
    seekforward: (d) => skok(d.seekOffset || SKOK_WPRZOD),
    previoustrack: () => sasiad(-1),   // pozycja wyżej na liście
    nexttrack: () => sasiad(1),        // pozycja niżej na liście
    seekto: (d) => {
      if (d.fastSeek && audio.fastSeek) audio.fastSeek(d.seekTime);
      else audio.currentTime = d.seekTime;
    },
  };
  for (const [nazwa, fn] of Object.entries(akcje)) {
    try { navigator.mediaSession.setActionHandler(nazwa, fn); } catch {}
  }
}

/* ------------------------------------------------------------------
   Sterowanie
   ------------------------------------------------------------------ */
const przelacz = () => (audio.paused ? audio.play().catch(() => {}) : audio.pause());
const skok = (o) => { audio.currentTime = Math.max(0, Math.min(audio.duration || 1e9, audio.currentTime + o)); };

/* Poruszamy się po liście tak, jak ją widać: krok +1 to pozycja niżej,
   −1 to pozycja wyżej. Działa niezależnie od kierunku sortowania. */
function sasiad(krok) {
  const poz = widoczne.indexOf(odcinki[biezacy]);
  const nowy = widoczne[poz + krok];
  if (nowy) zaladuj(odcinki.indexOf(nowy), true);
  else powiedz(krok > 0 ? 'To ostatni odcinek na liście' : 'To pierwszy odcinek na liście');
}

function podepnij(id, zdarzenie, fn) { const el = $(id); if (el) el[zdarzenie] = fn; }

podepnij('play', 'onclick', przelacz);
podepnij('mini-play', 'onclick', (e) => { e.stopPropagation(); przelacz(); });
podepnij('cofnij', 'onclick', () => skok(-SKOK_WSTECZ));
podepnij('dalej', 'onclick', () => skok(SKOK_WPRZOD));
podepnij('nastepny', 'onclick', () => sasiad(1));

podepnij('predkosc', 'onclick', () => {
  const i = (PREDKOSCI.indexOf(ustawienia.predkosc) + 1) % PREDKOSCI.length;
  ustawienia.predkosc = PREDKOSCI[i];
  audio.playbackRate = ustawienia.predkosc;
  ustaw('predkosc', String(ustawienia.predkosc).replace('.', ',') + '×');
  zapisz(KLUCZ_USTAWIENIA, ustawienia);
});

if ($('lista')) $('lista').addEventListener('click', (e) => {
  const b = e.target.closest('.odcinek');
  if (!b) return;
  const i = +b.dataset.i;
  if (i === biezacy) przelacz(); else zaladuj(i, true);
  otworzPelny();
});

if ($('szukaj')) $('szukaj').addEventListener('input', rysujListe);

/* ------------------------------------------------------------------
   Tryb offline (Cache API)
   ------------------------------------------------------------------ */
podepnij('pobierz', 'onclick', async () => {
  const o = odcinki[biezacy];
  const btn = $('pobierz');
  if (!o || !btn) return;
  if (!('caches' in window)) return powiedz('Ta przeglądarka nie obsługuje trybu offline');

  btn.dataset.stan = 'trwa';
  btn.textContent = 'Pobieram…';
  try {
    const c = await caches.open('csri-audio-v1');
    await c.add(o.audio);
    btn.dataset.stan = 'gotowe';
    btn.textContent = 'Offline ✓';
    powiedz('Odcinek dostępny bez internetu');
  } catch {
    delete btn.dataset.stan;
    btn.textContent = 'Pobierz';
    powiedz('Nie udało się pobrać odcinka');
  }
});

async function odswiezPrzyciskPobierania(o) {
  const btn = $('pobierz');
  if (!btn) return;
  delete btn.dataset.stan;
  btn.textContent = 'Pobierz';
  if (!('caches' in window) || !o) return;
  try {
    const c = await caches.open('csri-audio-v1');
    if (await c.match(o.audio)) { btn.dataset.stan = 'gotowe'; btn.textContent = 'Offline ✓'; }
  } catch {}
}

/* ------------------------------------------------------------------
   Udostępnianie i głębokie linkowanie
   ------------------------------------------------------------------ */
podepnij('udostepnij', 'onclick', async () => {
  const o = odcinki[biezacy];
  if (!o) return;
  const url = `${location.origin}${location.pathname}#${o.id}`;
  try {
    if (navigator.share) await navigator.share({ title: o.tytul, text: seria.tytul || 'Podcasty CSRI', url });
    else { await navigator.clipboard.writeText(url); powiedz('Link skopiowany'); }
  } catch {}
});

function przejdzDoHasha() {
  const id = decodeURIComponent(location.hash.slice(1));
  const i = odcinki.findIndex((o) => o.id === id);
  if (i >= 0) { zaladuj(i, true); otworzPelny(); }
}
window.addEventListener('hashchange', przejdzDoHasha);

/* ------------------------------------------------------------------
   Panel pełnoekranowy
   ------------------------------------------------------------------ */
function otworzPelny() {
  const p = $('pelny');
  if (!p) return;
  p.classList.add('otwarty');
  p.setAttribute('aria-hidden', 'false');
}
function zamknijPelny() {
  const p = $('pelny');
  if (!p) return;
  p.classList.remove('otwarty');
  p.setAttribute('aria-hidden', 'true');
}
podepnij('mini-otworz', 'onclick', otworzPelny);
podepnij('mini-okladka', 'onclick', otworzPelny);
podepnij('zamknij', 'onclick', zamknijPelny);

// gest: przeciągnięcie panelu w dół go zamyka
if ($('pelny')) {
  let startY = null;
  $('pelny').addEventListener('touchstart', (e) => {
    startY = $('pelny').scrollTop <= 0 ? e.touches[0].clientY : null;
  }, { passive: true });
  $('pelny').addEventListener('touchend', (e) => {
    if (startY !== null && e.changedTouches[0].clientY - startY > 90) zamknijPelny();
    startY = null;
  }, { passive: true });
}

/* ------------------------------------------------------------------
   Suwak
   ------------------------------------------------------------------ */
if ($('suwak')) {
  $('suwak').addEventListener('input', () => {
    przeciaganie = true;
    if (isFinite(audio.duration)) ustaw('czas-teraz', czas(($('suwak').value / 1000) * audio.duration));
  });
  $('suwak').addEventListener('change', () => {
    if (isFinite(audio.duration)) audio.currentTime = ($('suwak').value / 1000) * audio.duration;
    przeciaganie = false;
  });
}

/* ------------------------------------------------------------------
   Zdarzenia elementu <audio>
   ------------------------------------------------------------------ */
function ikony() {
  const ikona = audio.paused ? IKONA_PLAY : IKONA_PAUZA;
  if ($('play')) $('play').innerHTML = ikona;
  if ($('mini-play')) $('mini-play').innerHTML = ikona;
  if ('mediaSession' in navigator) navigator.mediaSession.playbackState = audio.paused ? 'paused' : 'playing';
}

audio.addEventListener('play', ikony);
audio.addEventListener('pause', () => { ikony(); zapiszPostep(); });

audio.addEventListener('loadedmetadata', () => {
  ustaw('czas-koniec', czas(audio.duration));
  const o = odcinki[biezacy];
  if (o && isFinite(audio.duration) && !o.dlugosc) { o.dlugosc = Math.round(audio.duration); rysujListe(); }
});

let licznik = 0;
audio.addEventListener('timeupdate', () => {
  const d = audio.duration;
  if (!przeciaganie && isFinite(d) && d > 0) {
    const ulamek = audio.currentTime / d;
    if ($('suwak')) $('suwak').value = Math.round(ulamek * 1000);
    if ($('mini-postep')) $('mini-postep').style.width = ulamek * 100 + '%';
    ustaw('czas-teraz', czas(audio.currentTime));
  }
  if (++licznik % 20 === 0) zapiszPostep();   // mniej więcej co 5 sekund
});

audio.addEventListener('ended', () => {
  const o = odcinki[biezacy];
  if (o) {
    postep[o.id] = { czas: 0, dlugosc: o.dlugosc || 0, skonczony: true };
    zapisz(KLUCZ_POSTEP, postep);
    rysujListe();
  }
  sasiad(1);    // automatycznie przejdź do kolejnej pozycji na liście
});

audio.addEventListener('error', () => { if (audio.src) powiedz('Nie udało się wczytać pliku audio'); });

function zapiszPostep() {
  const o = odcinki[biezacy];
  if (!o || !isFinite(audio.duration)) return;
  const skonczony = audio.duration - audio.currentTime < 25;
  postep[o.id] = {
    czas: skonczony ? 0 : Math.floor(audio.currentTime),
    dlugosc: Math.round(audio.duration),
    skonczony,
  };
  zapisz(KLUCZ_POSTEP, postep);
}
window.addEventListener('pagehide', zapiszPostep);
document.addEventListener('visibilitychange', () => { if (document.hidden) zapiszPostep(); });

/* ------------------------------------------------------------------
   Klawiatura (desktop)
   ------------------------------------------------------------------ */
document.addEventListener('keydown', (e) => {
  if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
  const akcje = {
    ' ': przelacz,
    ArrowLeft: () => skok(-SKOK_WSTECZ),
    ArrowRight: () => skok(SKOK_WPRZOD),
    Escape: zamknijPelny,
  };
  if (akcje[e.key]) { e.preventDefault(); akcje[e.key](); }
});

/* ------------------------------------------------------------------
   Tryb osadzenia (Google Sites na csri.wz.uw.edu.pl)
   ------------------------------------------------------------------
   W ramce część możliwości przeglądarki jest niedostępna:
     · MediaSession nie przejmuje sesji multimedialnej → brak ekranu blokady
     · service worker nie działa → brak trybu offline i dodania do ekranu
     · localStorage bywa partycjonowany lub zablokowany (Safari) → wznawianie
       odsłuchu może nie przetrwać zamknięcia karty
   Dlatego osadzenie służy do przeglądania i słuchania na miejscu, a pełne
   doświadczenie daje otwarcie strony samodzielnie. Klasa `w-ramce` na <body>
   pozwala CSS-owi pokazać zachętę do otwarcia w nowej karcie. */
const wRamce = (() => { try { return window.self !== window.top; } catch { return true; } })();
if (wRamce) document.body.classList.add('w-ramce');

/* ------------------------------------------------------------------
   Service worker (PWA) — tylko po HTTPS i poza ramką
   ------------------------------------------------------------------ */
if ('serviceWorker' in navigator && location.protocol === 'https:' && !wRamce) {
  window.addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}));
}

ikony();
start();
