/* ------------------------------------------------------------------
   lektury.js — baner rozdziału podręcznika w panelu odcinka.
   Wymaga: player.js (globalne `odcinki`, `biezacy`).

   KONTRAKT IDENTYFIKATORÓW: pelny-lektura (kontener, treść generowana).
   Dane: lektury.json — wpis na odcinek { numer, rozdzial, podrecznik,
   tytul, autor, grupa[], url, stron, bajty }. Brak `url` albo
   rozdzial === 'brak' → baner nie powstaje (bez stanu wyłączonego).
   ------------------------------------------------------------------ */
'use strict';

const LEKTURY_USTAWIENIA = {
  zrodlo: 'lektury.json',
  baza: '',   // przedrostek doklejany do `url` z danych, np. adres repozytorium
};

(() => {
  const el = (id) => document.getElementById(id);
  const kontener = el('pelny-lektura');
  if (!kontener) return;

  let dane = null;
  const biezacyOdcinek = () => (typeof odcinki !== 'undefined' && typeof biezacy === 'number' ? odcinki[biezacy] : null);

  async function wczytaj() {
    if (dane) return dane;
    if (window.LEKTURY) { dane = window.LEKTURY; return dane; }
    const r = await fetch(LEKTURY_USTAWIENIA.zrodlo, { cache: 'no-store' });
    const lista = await r.json();
    dane = {};
    lista.forEach((w) => { dane[String(w.numer)] = w; });
    return dane;
  }

  const megabajty = (b) => {
    if (!b) return '';
    const mb = b / 1048576;
    return (mb < 0.1 ? Math.round(b / 1024) + ' KB' : mb.toFixed(1).replace('.', ',') + ' MB');
  };
  const odmianaStron = (n) => n + (n === 1 ? ' strona' : (n % 10 >= 2 && n % 10 <= 4 && (n % 100 < 10 || n % 100 > 20) ? ' strony' : ' stron'));

  /* „35–37” dla grupy ciągłej, „56, 58–61” dla przerywanej. */
  function zakres(grupa) {
    if (!Array.isArray(grupa) || grupa.length < 2) return '';
    const g = grupa.slice().sort((a, b) => a - b);
    const bloki = [];
    let od = g[0], do_ = g[0];
    for (let i = 1; i < g.length; i++) {
      if (g[i] === do_ + 1) { do_ = g[i]; continue; }
      bloki.push(od === do_ ? String(od) : od + '–' + do_);
      od = do_ = g[i];
    }
    bloki.push(od === do_ ? String(od) : od + '–' + do_);
    return bloki.join(', ');
  }

  const PODRECZNIKI = {
    Klincewicz: 'Klincewicz (red.), Zarządzanie, organizacje i organizowanie, WN WZ UW 2016',
    Bogdanienko: 'Bogdanienko (red.), Organizacja i zarządzanie w zarysie, WN WZ UW 2010',
  };

  /* Ten sam znak co equalizer na okładce, tylko leżący.
     Grubość 20 i promień 10 to 3,91% z 512 i jego połowa — wartości zmierzone
     z okładki (.fale i). Kolor #d8bc44 stąd samo. Odstęp środków 36,5 = 7,13%.
     Szerokości wierszy z okladka-lektury.svg. Statyczna: bez warstwy przygaszonej. */
  /* Mała ikona to osobny rysunek, nie przeskalowana okładka: przy 28 px wiersze
     z viewBoxa 512 miałyby 0,9 px i zlałyby się w smugę. Zachowana jest proporcja
     equalizera (grubość : przerwa = 20 : 16,5) i pełne zaokrąglenie końców;
     wierszy jest pięć zamiast siedmiu, żeby grubość wyszła ponad 2 px. */
  const WIERSZE = [19, 15.6, 19, 17, 11.2];
  const IKONA = '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">'
    + WIERSZE.map((szer, i) =>
        `<rect x="2.5" y="${1.75 + i * 4.5}" width="${szer}" height="2.5" rx="1.25"></rect>`).join('')
    + '</svg>';

  const bezwzgledny = (u) => /^(https?:)?\/\//i.test(u || '');
  const sprawdzone = {};
  const swieze = {};         // krótkotrwały bufor wyników sprawdzania
  /* Względna ścieżka istnieje tylko wtedy, gdy plik faktycznie leży obok strony —
     w standalone i w iframe na innej domenie nie leży. Sprawdzamy, żeby nie
     obiecywać studentowi PDF-a, który zwróci 404. */
  async function dostepny(url) {
    const pelny = LEKTURY_USTAWIENIA.baza + url;
    if (bezwzgledny(pelny)) return 'jest';
    /* Zapamiętujemy tylko „brak” (404 się nie zmieni). Pozytywu NIE — inaczej
       raz udana odpowiedź maskuje późniejszy realny brak pliku, jak w paczce
       standalone, gdzie katalogu z rozdziałami nie ma wcale.
       Zapytanie lekkie (Range: pierwszy bajt) — bez pobierania calosci,
       bo baner rysuje sie przy kazdym otwarciu panelu. */
    if (sprawdzone[pelny] === 'brak') return 'brak';
    /* Bufor na 3 s: panel odświeża się kilka razy przy otwarciu, a każde
       zapytanie o plik ma swój koszt — bez tego robi się lawina. */
    const teraz = Date.now();
    if (swieze[pelny] && teraz - swieze[pelny].czas < 3000) return swieze[pelny].stan;
    let stan = 'blad';
    try {
      /* Najpierw pamięć podręczna: offline, z pobranym rozdziałem, baner ma powstać. */
      if (self.caches) {
        const traf = await caches.match(pelny);
        if (traf && traf.ok) { swieze[pelny] = { czas: teraz, stan: 'jest' }; return 'jest'; }
      }
      if (navigator.onLine === false) { swieze[pelny] = { czas: teraz, stan: 'blad' }; return 'blad'; }
      const r = await fetch(pelny, { method: 'GET' });
      if (r.status === 404 || r.status === 403) { sprawdzone[pelny] = 'brak'; return 'brak'; }
      stan = r.ok ? 'jest' : 'blad';
    } catch { stan = 'blad'; }
    swieze[pelny] = { czas: teraz, stan };
    return stan;
  }

  function rysuj() {
    const o = biezacyOdcinek();
    const w = o && dane ? dane[String(o.numer)] : null;
    if (!w || w.rozdzial === 'brak' || !w.url) {
      kontener.style.display = 'none';
      kontener.innerHTML = '';
      return;
    }
    /* Klincewicz ma rozdziały numerowane, Bogdanienko nazwane — „Rozdział Projektowanie” nie brzmi. */
    const numerowany = /^[0-9]/.test(String(w.rozdzial));
    const glowa = numerowany ? 'Rozdział ' + w.rozdzial : w.rozdzial;
    const nazwa = w.tytul ? glowa + ' — ' + w.tytul : glowa;
    /* Dopóki `zaslepka` stoi w danych, plik jest wygenerowanym wypełniaczem —
       student musi to wiedzieć przed kliknięciem. Znika po wgraniu rozdziałów. */
    const koszt = ['PDF', w.stron ? odmianaStron(w.stron) : '', megabajty(w.bajty),
      w.zaslepka ? 'plik przykładowy' : ''].filter(Boolean).join(' · ');
    const zak = zakres(w.grupa);
    const zrodlo = [w.autor, PODRECZNIKI[w.podrecznik] || w.podrecznik].filter(Boolean).join(' · ');

    kontener.innerHTML = `
      <button class="lektura-baner${w.zaslepka ? ' przykladowy' : ''}" type="button" data-url="${LEKTURY_USTAWIENIA.baza + w.url}" data-nazwa="${nazwa}" data-archiwum="${w.urlArchive || ''}">
        <span class="lektura-ikona">${IKONA}</span>
        <span class="lektura-tresc">
          <b class="lektura-nazwa">${nazwa}</b>
          <span class="lektura-koszt">${koszt}</span>
          ${zak ? `<span class="lektura-zakres">wspólna dla odcinków ${zak}</span>` : ''}
          ${zrodlo ? `<span class="lektura-zrodlo">${zrodlo}</span>` : ''}
        </span>
        <span class="lektura-strzalka" aria-hidden="true">→</span>
      </button>`;
    const baner = kontener.querySelector('.lektura-baner');
    if (baner) baner.addEventListener('click', () => otworzCzytnik(baner.dataset.url, baner.dataset.nazwa, baner.dataset.archiwum));
    kontener.style.display = '';
  }

  /* ------------------------------------------------------------------
     Czytnik w aplikacji. Nie iframe/embed/object — iOS Safari renderuje
     w nich PDF jako obraz PIERWSZEJ strony i reszty nie da się przewinąć.
     pdf.js rysuje każdą stronę na własnym canvasie, więc działa wszędzie.
     Odtwarzanie nie ginie, bo nie ma nawigacji — panel nakłada się na widok.
     ------------------------------------------------------------------ */
  const PDFJS_WERSJA = '3.2.146';
  const WORKER_LOKALNY = 'pdfjs/pdf.worker.min.js';
  const WORKER_CDN = 'https://cdn.jsdelivr.net/npm/pdfjs-dist@' + PDFJS_WERSJA + '/legacy/build/pdf.worker.min.js';
  let workerWybrany = null;
  async function workerDo() {
    if (workerWybrany) return workerWybrany;
    try {
      if (self.caches) {
        const traf = await caches.match(WORKER_LOKALNY);
        if (traf && traf.ok) { workerWybrany = WORKER_LOKALNY; return workerWybrany; }
      }
      const r = await fetch(WORKER_LOKALNY, { method: 'HEAD' });
      if (r.ok) { workerWybrany = WORKER_LOKALNY; return workerWybrany; }
    } catch {}
    console.warn('[lektury] Brak ' + WORKER_LOKALNY + ' — czytnik użyje CDN i nie zadziała offline.');
    const nota = document.getElementById('czytnik-nota');
    if (nota) { nota.textContent = 'Czytnik pobiera silnik z sieci — offline będzie niedostępny'; nota.style.display = ''; }
    workerWybrany = WORKER_CDN;
    return workerWybrany;
  }

  /* Powiększenie czytnika: 1 = szerokość kolumny. Zapamiętane, bo kto raz powiększył,
     ten czyta tak dalej. Strony renderujemy ponownie zamiast skalować bitmapę — inaczej
     tekst rozmywa się przy 1,5×. */
  const KLUCZ_ZOOM = 'pz-czytnik-zoom';
  const KROKI_ZOOM = [0.85, 1, 1.25, 1.5, 1.85];
  let zoom = (() => { const z = parseFloat(localStorage.getItem(KLUCZ_ZOOM)); return KROKI_ZOOM.includes(z) ? z : 1; })();
  let stronRazem = 0;
  let generacja = 0;         // każde otwarcie i zamknięcie unieważnia poprzedni render
  let pdfBiezacy = null;
  let dogonBiezacy = null;   // handler resize — musi dać się odpiąć
  let kanwyBiezace = [];     // bitmapy stron — bez wyczyszczenia nie zwolnią się
  const czytnik = () => el('lektura-czytnik');

  /* Bez tego każde otwarcie rozdziału zostawia na window handler trzymający
     w domknięciu cały dokument i komplet canvasów (15 stron × ~15 MB). */
  function zwolnijCzytnik() {
    if (dogonBiezacy) { window.removeEventListener('resize', dogonBiezacy); dogonBiezacy = null; }
    const box = el('czytnik-strony');
    if (box) box.onscroll = null;
    kanwyBiezace.forEach((c) => { c.width = 0; c.height = 0; });
    kanwyBiezace = [];
    if (pdfBiezacy) { try { pdfBiezacy.destroy(); } catch {} pdfBiezacy = null; }
  }

  async function otworzCzytnik(url, nazwa, archiwum) {
    const panel = czytnik();
    if (!panel) { window.open(url, '_blank', 'noopener'); return; }
    zwolnijCzytnik();
    const moja = ++generacja;
    /* Ścieżka względna nie prowadzi nigdzie poza aplikacją — martwy link
       jest gorszy niż jego brak. */
    const zewn = el('czytnik-zewnetrznie');
    if (zewn) {
      /* Lustro na Internet Archive tylko jako link w nowej karcie — pdf.js go nie
         odczyta, bo archive.org nie daje CORS. */
      const poza = archiwum || (bezwzgledny(url) ? url : '');
      if (poza) { zewn.href = poza; zewn.style.display = ''; }
      else { zewn.removeAttribute('href'); zewn.style.display = 'none'; }
    }
    const tytul = el('czytnik-tytul');
    if (tytul) tytul.textContent = nazwa || 'Rozdział';
    const box = el('czytnik-strony');
    if (box) box.innerHTML = '<p id="czytnik-stan">Wczytywanie rozdziału…</p>';
    panel.classList.add('otwarty');
    panel.setAttribute('aria-hidden', 'false');
    document.body.classList.add('czytnik-otwarty');

    if (typeof pdfjsLib === 'undefined') { pokazStan('Nie udało się wczytać czytnika. Otwórz rozdział w przeglądarce ↗'); return; }
    /* Worker musi być tej samej wersji co rdzeń (pdf.js sprawdza apiVersion).
       Lokalny plik jest warunkiem pracy offline; CDN tylko awaryjnie. */
    pdfjsLib.GlobalWorkerOptions.workerSrc = await workerDo();
    try {
      const pdf = await pdfjsLib.getDocument({ url, withCredentials: false }).promise;
      /* Zamknięcie w trakcie wczytywania: dokument nie należy już do nikogo —
         sprzątanie po nim wykonujemy tutaj, bo zwolnijCzytnik() go nie widzi. */
      if (moja !== generacja) { try { pdf.destroy(); } catch {} return; }
      pdfBiezacy = pdf;
      await rysujStrony(pdf, moja);
    } catch (e) {
      if (moja === generacja) pokazStan(bezwzgledny(url) || archiwum
        ? 'Nie udało się otworzyć pliku. Otwórz rozdział w przeglądarce ↗'
        : 'Nie udało się otworzyć pliku — rozdziału nie ma w tej wersji aplikacji.');
    }
  }

  function pokazStan(tekst) {
    const box = el('czytnik-strony');
    if (box) box.innerHTML = '<p id="czytnik-stan">' + tekst + '</p>';
  }

  /* Strony rysowane leniwie — 30 stron naraz to kilkaset MB pamięci na telefonie.
     Pierwsze trzy rysujemy bezwarunkowo: IntersectionObserver z własnym rootem
     nie odpala się wiarygodnie w kontenerze flex z overflow, a student nie może
     zobaczyć białej kartki bez żadnego komunikatu. */
  async function rysujStrony(pdf, moja) {
    const box = el('czytnik-strony');
    if (!box) return;
    box.innerHTML = '';
    const szer = Math.min((box.clientWidth || 700) - 24, 820) * zoom;
    stronRazem = pdf.numPages;
    const kanwy = [];
    kanwyBiezace = kanwy;

    /* Handlery przypinamy TERAZ, przed pierwszym await. Gdyby student zamknął
       czytnik w trakcie wczytywania, zwolnijCzytnik() ma co odpiąć; przypięcie
       po pętli oznaczałoby, że przerwany render nie zostawia śladu do sprzątania. */
    const rysuj1 = async (c) => {
      if (!c || c.dataset.gotowa || moja !== generacja) return;
      c.dataset.gotowa = '1';
      try {
        const strona = await pdf.getPage(Number(c.dataset.strona));
        if (moja !== generacja) return;
        const skala = szer / strona.getViewport({ scale: 1 }).width;
        const vp = strona.getViewport({ scale: skala * Math.min(window.devicePixelRatio || 1, 2) });
        c.width = Math.round(vp.width);
        c.height = Math.round(vp.height);
        await strona.render({ canvasContext: c.getContext('2d'), viewport: vp }).promise;
      } catch { c.dataset.gotowa = ''; }
    };

    /* Licznik bierze stronę, która zajmuje górną trzecią widoku — to ta, którą się czyta. */
    const ustawLicznik = () => {
      const licz = el('czytnik-licznik');
      if (!licz || !kanwy.length) return;
      const y = box.scrollTop + box.clientHeight * 0.3;
      let n = 0;
      kanwy.forEach((c, i) => { if (c.offsetTop <= y) n = i; });
      licz.textContent = (n + 1) + '/' + stronRazem;
    };

    const dogon = () => {
      if (moja !== generacja) return;
      ustawLicznik();
      const gorna = box.scrollTop - 400;
      const dolna = box.scrollTop + box.clientHeight + 1200;
      kanwy.forEach((c) => {
        if (c.dataset.gotowa) return;
        const g = c.offsetTop, d = c.offsetTop + c.offsetHeight;
        if (d >= gorna && g <= dolna) rysuj1(c);
      });
    };
    box.onscroll = dogon;
    dogonBiezacy = dogon;
    window.addEventListener('resize', dogon);

    for (let i = 1; i <= pdf.numPages; i++) {
      const s = await pdf.getPage(i);
      if (moja !== generacja) return;
      const v = s.getViewport({ scale: szer / s.getViewport({ scale: 1 }).width });
      const c = document.createElement('canvas');
      c.dataset.strona = String(i);
      c.width = Math.round(v.width);
      c.height = Math.round(v.height);
      c.style.width = Math.round(v.width) + 'px';
      c.setAttribute('aria-label', 'Strona ' + i + ' z ' + pdf.numPages);
      box.appendChild(c);
      kanwy.push(c);
    }

    for (const c of kanwy.slice(0, 3)) { if (moja !== generacja) return; await rysuj1(c); }
    if (moja !== generacja) return;

    dogon();
    ustawLicznik();
  }

  function zamknijCzytnik() {
    const panel = czytnik();
    if (!panel) return;
    generacja++;
    panel.classList.remove('otwarty');
    panel.setAttribute('aria-hidden', 'true');
    document.body.classList.remove('czytnik-otwarty');
    zwolnijCzytnik();
    setTimeout(() => { const b = el('czytnik-strony'); if (b) b.innerHTML = ''; }, 320);
  }

  /* Powiększenie: pozycję w dokumencie zachowujemy proporcjonalnie, żeby student
     nie wracał na początek rozdziału po każdym kliknięciu. */
  async function ustawZoom(kierunek) {
    const i = KROKI_ZOOM.indexOf(zoom);
    const nowy = KROKI_ZOOM[Math.min(KROKI_ZOOM.length - 1, Math.max(0, i + kierunek))];
    if (!nowy || nowy === zoom || !pdfBiezacy) return;
    const box = el('czytnik-strony');
    const udzial = box && box.scrollHeight ? box.scrollTop / box.scrollHeight : 0;
    zoom = nowy;
    try { localStorage.setItem(KLUCZ_ZOOM, String(zoom)); } catch {}
    odswiezZoom();
    await rysujStrony(pdfBiezacy, generacja);
    if (box) box.scrollTop = udzial * box.scrollHeight;
  }

  function odswiezZoom() {
    const mniej = el('czytnik-mniej');
    const wiecej = el('czytnik-wiecej');
    const i = KROKI_ZOOM.indexOf(zoom);
    if (mniej) mniej.disabled = i <= 0;
    if (wiecej) wiecej.disabled = i >= KROKI_ZOOM.length - 1;
  }

  const bMniej = el('czytnik-mniej');
  if (bMniej) bMniej.onclick = () => ustawZoom(-1);
  const bWiecej = el('czytnik-wiecej');
  if (bWiecej) bWiecej.onclick = () => ustawZoom(1);
  odswiezZoom();

  const zamknijBtn = el('czytnik-zamknij');
  if (zamknijBtn) zamknijBtn.onclick = zamknijCzytnik;
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && czytnik() && czytnik().classList.contains('otwarty')) { e.preventDefault(); zamknijCzytnik(); }
  });

  /* Widoczny stan zamiast cichego zniknięcia: student wie, że rozdział istnieje,
     tylko nie udało się go teraz sprawdzić. */
  function rysujBlad(w) {
    const nazwa = /^[0-9]/.test(String(w.rozdzial)) ? 'Rozdział ' + w.rozdzial : w.rozdzial;
    kontener.innerHTML = `
      <div class="lektura-baner blad">
        <span class="lektura-ikona">${IKONA}</span>
        <span class="lektura-tresc">
          <b class="lektura-nazwa">${nazwa}</b>
          <span class="lektura-koszt">Nie udało się sprawdzić pliku — brak połączenia?</span>
        </span>
        <button class="lektura-ponow" type="button">Spróbuj ponownie</button>
      </div>`;
    kontener.style.display = '';
    const b = kontener.querySelector('.lektura-ponow');
    if (b) b.addEventListener('click', () => {
      Object.keys(sprawdzone).forEach((k) => delete sprawdzone[k]);
      b.textContent = 'Sprawdzam…';
      odswiez();
    });
  }

  async function odswiez() {
    try { await wczytaj(); } catch { kontener.style.display = 'none'; return; }
    const o = biezacyOdcinek();
    const w = o && dane ? dane[String(o.numer)] : null;
    if (!w || w.rozdzial === 'brak' || !w.url) { kontener.style.display = 'none'; kontener.innerHTML = ''; return; }
    const stan = await dostepny(w.url);
    if (stan === 'brak') { kontener.style.display = 'none'; kontener.innerHTML = ''; return; }
    if (stan === 'blad') { rysujBlad(w); return; }
    rysuj();
  }

  const pelny = el('pelny');
  if (pelny) new MutationObserver(() => { if (pelny.classList.contains('otwarty')) odswiez(); })
    .observe(pelny, { attributes: true, attributeFilter: ['class'] });
  if (typeof window.zaladuj === 'function') {
    const oryg = window.zaladuj;
    window.zaladuj = function (...a) { const r = oryg.apply(this, a); odswiez(); return r; };
  }
  document.addEventListener('DOMContentLoaded', odswiez);
  odswiez();
})();
