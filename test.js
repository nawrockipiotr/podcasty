/* ------------------------------------------------------------------
   test.js — testy formatywne po odcinku
   Wymaga: player.js (globalne `odcinki`, `biezacy`, `sasiad`, `zaladuj`).

   KONTRAKT IDENTYFIKATORÓW (nie zmieniać):
     test-start, test (.otwarty), test-postep, test-pasek, test-pytanie,
     test-warianty, test-zamknij, test-wstecz, test-dalej,
     test-wynik (.widoczny), test-wynik-liczba, test-wynik-opis, test-przeglad,
     test-powtorz, test-jeszcze-raz, test-do-odcinka, test-nastepny.
   Znaczniki generowane przez ten plik:
     .wariant (.poprawny, .bledny),
     .przeglad-pytanie (.zle) > .przeglad-tresc, .przeglad-odp
       > .przeglad-zla, .przeglad-dobra
   Brakujące elementy są ignorowane.
   ------------------------------------------------------------------ */
'use strict';

const TEST_USTAWIENIA = {
  feedback: 'natychmiastowy',   // 'natychmiastowy' | 'odroczony'
  autoPrzejscie: false,         // true = przejście po czasie, false = przyciskiem „Następne pytanie"
  pauza: 1400,                  // ms podświetlenia przy natychmiastowym (tylko gdy autoPrzejscie)
  ile: 8,                       // pytań w podejściu
  haptyka: true,                // wibracja przy wyborze i nawigacji (Android; iOS nie wspiera Vibration API)
  zrodlo: 'quizy.json',
};

(() => {
  const el = (id) => document.getElementById(id);
  const panel = el('test');
  if (!panel) return;

  let quizy = null;
  let pytania = [];      // aktualne podejście
  let krok = 0;
  let odpowiedzi = [];   // {tresc, wybrana, poprawna}
  let blokada = false;
  let timer = null;
  let numerTestu = null; // numer odcinka, do którego należy test
  let wrocFokus = null;

  /* Pamięć wyników — wyłącznie lokalna, jak postęp odsłuchania.
     { [numer]: { najlepszy, ostatni, podejscia, bledy: { trescPytania: licznik } } } */
  const KLUCZ_TESTY = 'csri-testy-v1';
  const wczytajTesty = () => { try { return JSON.parse(localStorage.getItem(KLUCZ_TESTY)) || {}; } catch { return {}; } };
  const zapiszTesty = (v) => { try { localStorage.setItem(KLUCZ_TESTY, JSON.stringify(v)); } catch {} };
  let wyniki = wczytajTesty();

  /* ----------------------------------------------------------------
     Haptyka. Android: Vibration API. iOS: Safari nie ma navigator.vibrate,
     jedyne wejście do Taptic Engine to <input type="checkbox" switch>
     (od iOS 17.4) przełączony PRAWDZIWYM dotknięciem — dlatego pod każdym
     przyciskiem leży niewidoczny switch, który przejmuje dotyk i przekazuje
     akcję dalej. Programowy .click() Apple zablokowało w iOS 26.5.
     ---------------------------------------------------------------- */
  const DRGANIA = { dotyk: 8, poprawna: 14, bledna: [26, 45, 26], wynik: [18, 60, 30] };
  const KLUCZ_HAPTYKA = 'csri-haptyka-v1';
  try {
    const z = localStorage.getItem(KLUCZ_HAPTYKA);
    if (z !== null) TEST_USTAWIENIA.haptyka = z === '1';
  } catch {}
  const maVibrate = () => 'vibrate' in navigator && typeof navigator.vibrate === 'function';
  const toIOS = (() => {
    const ua = navigator.userAgent || '';
    const dotyk = (navigator.maxTouchPoints || 0) > 1;
    return (/iPad|iPhone|iPod/.test(ua) || (/Macintosh/.test(ua) && dotyk)) && !maVibrate();
  })();

  function drgnij(wzor) {
    if (!TEST_USTAWIENIA.haptyka || !maVibrate()) return;
    try { navigator.vibrate(wzor); } catch {}
  }

  /* Nakładka dotykowa dla iOS: label + switch nad przyciskiem. */
  function nalozSwitch(cel, akcja) {
    if (!toIOS || !cel || cel.dataset.hap === '1') return;
    cel.dataset.hap = '1';
    const wrap = document.createElement('span');
    wrap.className = 'hap-wrap';
    if (cel.parentNode) {
      cel.parentNode.insertBefore(wrap, cel);
      wrap.appendChild(cel);
    }
    const label = document.createElement('label');
    label.className = 'hap-switch';
    label.setAttribute('aria-hidden', 'true');
    const inp = document.createElement('input');
    inp.type = 'checkbox';
    inp.setAttribute('switch', '');
    inp.tabIndex = -1;
    label.appendChild(inp);
    label.addEventListener('click', (e) => {
      e.stopPropagation();
      if (cel.disabled) return;
      setTimeout(() => akcja(), 0);
    });
    (wrap.parentNode ? wrap : cel).appendChild(label);
  }

  const mieszaj = (a) => { const t = a.slice(); for (let i = t.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [t[i], t[j]] = [t[j], t[i]]; } return t; };
  const biezacyOdcinek = () => (typeof odcinki !== 'undefined' && typeof biezacy === 'number' ? odcinki[biezacy] : null);

  async function wczytajQuizy() {
    if (quizy) return quizy;
    if (window.QUIZY) { quizy = window.QUIZY; return quizy; }
    const r = await fetch(TEST_USTAWIENIA.zrodlo, { cache: 'no-store' });
    quizy = await r.json();
    return quizy;
  }

  function pulaDla(numer) {
    const q = quizy && quizy[String(numer)];
    return q && Array.isArray(q.pytania) ? q.pytania : [];
  }

  /* Pokaż lub ukryj wejście do testu przy zmianie odcinka. */
  async function odswiezWejscie() {
    const b = el('test-start');
    if (!b) return;
    const o = biezacyOdcinek();
    if (!o) { b.style.display = 'none'; return; }
    try { await wczytajQuizy(); } catch { b.style.display = 'none'; return; }
    const ile = pulaDla(o.numer).length;
    b.style.display = '';
    b.disabled = !ile;
    b.classList.toggle('niegotowy', !ile);
    const tytul = b.querySelector('[data-test-tytul]');
    const podpis = b.querySelector('[data-test-podpis]');
    if (ile) {
      if (tytul) tytul.textContent = 'Sprawdź, ile zapamiętałeś';
      if (podpis) podpis.textContent = 'Test wiedzy z odcinka — ' + Math.min(TEST_USTAWIENIA.ile, ile) + ' pytań, bez oceny';
    } else {
      if (tytul) tytul.textContent = 'Test wiedzy do tego odcinka jest w przygotowaniu';
      if (podpis) podpis.textContent = 'Pozostałe odcinki mają test dostępny';
    }
  }

  function przygotuj(zPytan) {
    const zrodlo = zPytan || mieszaj(pulaDla(numerTestu)).slice(0, TEST_USTAWIENIA.ile);
    pytania = zrodlo.map((p) => {
      const pary = p.warianty.map((t, i) => ({ t, ok: i === p.poprawna }));
      return { tresc: p.tresc, warianty: mieszaj(pary) };
    });
    krok = 0;
    odpowiedzi = [];
  }

  function rysujPytanie() {
    const p = pytania[krok];
    if (!p) return pokazWynik();
    const postep = el('test-postep');
    if (postep) postep.textContent = (krok + 1) + ' / ' + pytania.length;
    const pasek = el('test-pasek');
    if (pasek) pasek.style.width = (krok / pytania.length) * 100 + '%';
    const tresc = el('test-pytanie');
    if (tresc) { tresc.textContent = p.tresc; tresc.focus(); }
    const box = el('test-warianty');
    if (box) {
      box.innerHTML = p.warianty
        .map((w, i) => `<button class="wariant" type="button" data-i="${i}">${w.t}</button>`)
        .join('');
    }
    if (box) Array.from(box.querySelectorAll('.wariant')).forEach((b, i) => nalozSwitch(b, () => wybierz(i)));
    const dana = odpowiedzi[krok];
    blokada = !!dana;
    if (dana) odtworzOdpowiedz(p, dana);
    odswiezNawigacje();
  }

  /* Powrót do pytania, na które już padła odpowiedź: pokazujemy ją bez możliwości zmiany. */
  function odtworzOdpowiedz(p, dana) {
    const guziki = Array.from(document.querySelectorAll('#test-warianty .wariant'));
    guziki.forEach((g) => { g.disabled = true; });
    const dobry = p.warianty.findIndex((w) => w.ok);
    const wybrany = p.warianty.findIndex((w) => w.t === dana.wybrana);
    if (TEST_USTAWIENIA.feedback === 'natychmiastowy') {
      if (guziki[dobry]) guziki[dobry].classList.add('poprawny');
      if (!dana.ok && guziki[wybrany]) guziki[wybrany].classList.add('bledny');
    } else if (guziki[wybrany]) {
      guziki[wybrany].classList.add('wybrany');
    }
  }

  function odswiezNawigacje() {
    const wsteczBtn = el('test-wstecz');
    if (wsteczBtn) {
      wsteczBtn.disabled = krok === 0;
      wsteczBtn.style.visibility = pytania.length > 1 ? 'visible' : 'hidden';
    }
    const dalejBtn = el('test-dalej');
    if (!dalejBtn) return;
    const odpowiedziane = !!odpowiedzi[krok];
    dalejBtn.style.visibility = odpowiedziane ? 'visible' : 'hidden';
    const ostatnie = krok + 1 >= pytania.length;
    const wszystkie = odpowiedzi.filter(Boolean).length === pytania.length;
    dalejBtn.textContent = ostatnie && wszystkie ? 'Zobacz wynik →' : 'Następne pytanie →';
  }

  function wybierz(i) {
    if (blokada) return;
    const p = pytania[krok];
    if (!p || !p.warianty[i]) return;
    blokada = true;
    const dobry = p.warianty.findIndex((w) => w.ok);
    odpowiedzi[krok] = { tresc: p.tresc, wybrana: p.warianty[i].t, poprawna: p.warianty[dobry].t, ok: p.warianty[i].ok };

    const guziki = Array.from(document.querySelectorAll('#test-warianty .wariant'));
    guziki.forEach((g) => { g.disabled = true; });

    drgnij(p.warianty[i].ok ? DRGANIA.poprawna : DRGANIA.bledna);
    if (TEST_USTAWIENIA.feedback === 'natychmiastowy') {
      if (guziki[dobry]) guziki[dobry].classList.add('poprawny');
      if (!p.warianty[i].ok && guziki[i]) guziki[i].classList.add('bledny');
    }
    if (TEST_USTAWIENIA.autoPrzejscie || TEST_USTAWIENIA.feedback !== 'natychmiastowy') {
      timer = setTimeout(dalej, TEST_USTAWIENIA.feedback === 'natychmiastowy' ? TEST_USTAWIENIA.pauza : 0);
    } else if (el('test-dalej')) {
      odswiezNawigacje();
    } else {
      timer = setTimeout(dalej, TEST_USTAWIENIA.pauza);
    }
  }

  function dalej() {
    clearTimeout(timer);
    if (krok + 1 >= pytania.length) {
      if (odpowiedzi.filter(Boolean).length === pytania.length) return pokazWynik();
      const puste = odpowiedzi.findIndex((o, i) => !o && i < pytania.length);
      krok = puste >= 0 ? puste : krok;
      return rysujPytanie();
    }
    krok += 1;
    rysujPytanie();
  }

  function wstecz() {
    clearTimeout(timer);
    if (krok === 0) return;
    krok -= 1;
    rysujPytanie();
  }

  function opisWyniku(dobre, ile) {
    const p = dobre / ile;
    if (p === 1) return 'Cały materiał odcinka masz opanowany. Możesz iść dalej.';
    if (p >= 0.75) return 'Solidnie. Zajrzyj poniżej do tych pytań, w których pamięć zawiodła.';
    if (p >= 0.5) return 'Połowa materiału siedzi. Warto wrócić do fragmentów z pytań poniżej.';
    return 'To dobry moment, żeby przesłuchać odcinek jeszcze raz — pytania poniżej pokazują, czego szukać.';
  }

  function pokazWynik() {
    const udzielone = odpowiedzi.filter(Boolean);
    const dobre = udzielone.filter((o) => o.ok).length;
    const przed = wyniki[numerTestu] || null;
    const poprzedni = przed ? przed.ostatni : null;

    /* Zapis: najlepszy wynik, ostatni wynik, licznik pomyłek per pytanie. */
    const wpis = przed || { najlepszy: 0, ostatni: null, podejscia: 0, bledy: {} };
    wpis.ostatni = dobre;
    wpis.zIlu = udzielone.length;
    wpis.najlepszy = Math.max(wpis.najlepszy || 0, dobre);
    wpis.podejscia = (wpis.podejscia || 0) + 1;
    udzielone.forEach((o) => { if (!o.ok) wpis.bledy[o.tresc] = (wpis.bledy[o.tresc] || 0) + 1; });
    wyniki[numerTestu] = wpis;
    zapiszTesty(wyniki);
    odswiezStatystyki();

    const pasek = el('test-pasek');
    if (pasek) pasek.style.width = '100%';
    const postep = el('test-postep');
    if (postep) postep.textContent = 'Wynik';
    const liczba = el('test-wynik-liczba');
    if (liczba) liczba.textContent = dobre + ' / ' + udzielone.length;
    const opis = el('test-wynik-opis');
    if (opis) opis.textContent = opisWyniku(dobre, udzielone.length);

    const por = el('test-porownanie');
    if (por) {
      if (poprzedni == null) por.textContent = '';
      else if (dobre > poprzedni) por.textContent = 'Poprzednio ' + poprzedni + ' / ' + udzielone.length + ' — lepiej o ' + (dobre - poprzedni);
      else if (dobre === poprzedni) por.textContent = 'Poprzednio tyle samo: ' + poprzedni + ' / ' + udzielone.length;
      else por.textContent = 'Poprzednio ' + poprzedni + ' / ' + udzielone.length;
      por.style.display = poprzedni == null ? 'none' : '';
    }

    /* Pytania mylone w co najmniej dwóch podejściach — wskazówka, co przesłuchać. */
    const slabe = el('test-slabe');
    if (slabe) {
      const lista = Object.entries(wpis.bledy).filter(([, n]) => n >= 2).sort((a, b) => b[1] - a[1]).slice(0, 4);
      slabe.innerHTML = lista.length
        ? '<h3>Wróć do tych fragmentów</h3><ul>' + lista.map(([t, n]) => `<li>${t} <span class="slabe-licznik">${n}×</span></li>`).join('') + '</ul>'
        : '';
      slabe.style.display = lista.length ? '' : 'none';
    }

    const przeglad = el('test-przeglad');
    if (przeglad) {
      przeglad.innerHTML = udzielone.map((o) => `
        <div class="przeglad-pytanie${o.ok ? '' : ' zle'}">
          <p class="przeglad-tresc">${o.tresc}</p>
          <div class="przeglad-odp">
            ${o.ok ? '' : `<p class="przeglad-zla">${o.wybrana}</p>`}
            <p class="przeglad-dobra">${o.poprawna}</p>
          </div>
        </div>`).join('');
    }

    const powtorz = el('test-powtorz');
    if (powtorz) powtorz.style.display = dobre === udzielone.length ? 'none' : '';
    const nast = el('test-nastepny');
    if (nast) nast.style.display = typeof sasiad === 'function' ? '' : 'none';

    drgnij(DRGANIA.wynik);
    const w = el('test-wynik');
    if (w) w.classList.add('widoczny');
    const tresc = el('test-pytanie');
    if (liczba) { liczba.setAttribute('tabindex', '-1'); liczba.focus(); }
    else if (tresc) tresc.focus();
  }

  function ukryjWynik() {
    const w = el('test-wynik');
    if (w) w.classList.remove('widoczny');
    const liczba = el('test-wynik-liczba');
    if (liczba) liczba.removeAttribute('tabindex');
  }

  async function otworz() {
    const o = biezacyOdcinek();
    if (!o) return;
    try { await wczytajQuizy(); } catch { return; }
    if (!pulaDla(o.numer).length) return;
    numerTestu = o.numer;
    wrocFokus = document.activeElement;
    ukryjWynik();
    przygotuj();
    panel.classList.add('otwarty');
    panel.setAttribute('aria-hidden', 'false');
    rysujPytanie();
  }

  function zamknij() {
    clearTimeout(timer);
    panel.classList.remove('otwarty');
    panel.setAttribute('aria-hidden', 'true');
    ukryjWynik();
    if (wrocFokus && wrocFokus.focus) wrocFokus.focus();
  }

  function noweTo(zPytan) {
    ukryjWynik();
    przygotuj(zPytan);
    rysujPytanie();
  }

  /* Licznik odcinków z wykonanym testem + znacznik najlepszego wyniku na kartach listy. */
  function odswiezStatystyki() {
    const ile = Object.keys(wyniki).length;
    const licz = el('pk-testy');
    if (licz) {
      licz.textContent = ile ? 'Test wiedzy wykonany dla ' + ile + ' z 64 odcinków' : '';
      licz.style.display = ile ? '' : 'none';
    }
    odswiezWynikPanelu();
    if (typeof odcinki === 'undefined') return;
    document.querySelectorAll('#lista .odcinek').forEach((b) => {
      const o = odcinki[Number(b.dataset.i)];
      const w = o && wyniki[o.numer];
      let z = b.querySelector('.odcinek-test');
      if (!w) { if (z) z.remove(); return; }
      if (!z) {
        z = document.createElement('span');
        z.className = 'odcinek-test';
        const st = b.querySelector('.odcinek-stopka');
        if (!st) return;
        st.appendChild(z);
      }
      z.textContent = 'test ' + w.najlepszy + '/' + (w.zIlu || TEST_USTAWIENIA.ile);
      z.title = 'Najlepszy wynik z ' + w.podejscia + (w.podejscia === 1 ? ' podejścia' : ' podejść');
    });
  }

  /* Podsumowanie w panelu odcinka — wynik widoczny bez wchodzenia w test. */
  function odswiezWynikPanelu() {
    const box = el('pelny-test-wynik');
    if (!box) return;
    const o = biezacyOdcinek();
    const w = o && wyniki[o.numer];
    if (!w) { box.style.display = 'none'; box.textContent = ''; return; }
    const zIlu = w.zIlu || TEST_USTAWIENIA.ile;
    const podejscia = w.podejscia === 1 ? '1 podejście' : w.podejscia + (w.podejscia < 5 ? ' podejścia' : ' podejść');
    box.innerHTML = 'Twój najlepszy wynik: <b>' + w.najlepszy + ' / ' + zIlu + '</b>'
      + '<span class="pw-sep">·</span>ostatnio ' + w.ostatni + ' / ' + zIlu
      + '<span class="pw-sep">·</span>' + podejscia;
    box.style.display = '';
  }

  const listaEl = el('lista');
  if (listaEl) {
    let planowane = false;
    new MutationObserver(() => {
      if (planowane) return;
      planowane = true;
      requestAnimationFrame(() => { planowane = false; odswiezStatystyki(); });
    }).observe(listaEl, { childList: true });
  }

  const podepnijTest = (id, fn) => { const b = el(id); if (b) b.onclick = fn; };

  podepnijTest('test-start', () => { drgnij(DRGANIA.dotyk); otworz(); });
  podepnijTest('test-zamknij', () => { drgnij(DRGANIA.dotyk); zamknij(); });
  podepnijTest('test-dalej', () => { if (blokada) { drgnij(DRGANIA.dotyk); dalej(); } });
  podepnijTest('test-wstecz', () => { if (krok > 0) { drgnij(DRGANIA.dotyk); wstecz(); } });
  podepnijTest('test-do-odcinka', () => { drgnij(DRGANIA.dotyk); zamknij(); });
  podepnijTest('test-jeszcze-raz', () => { drgnij(DRGANIA.dotyk); noweTo(); });
  podepnijTest('test-powtorz', () => {
    drgnij(DRGANIA.dotyk);
    const zle = odpowiedzi.filter((o) => o && !o.ok).map((o) => o.tresc);
    const pula = pulaDla(numerTestu).filter((p) => zle.includes(p.tresc));
    noweTo(pula.length ? pula : undefined);
  });
  podepnijTest('test-nastepny', () => {
    drgnij(DRGANIA.dotyk);
    zamknij();
    if (typeof sasiad === 'function') sasiad(1);
    setTimeout(() => { odswiezWejscie(); }, 60);
  });

  /* Przełącznik wibracji — student może je wyłączyć. */
  function odswiezHaptyke() {
    const b = el('test-haptyka');
    if (!b) return;
    const on = !!TEST_USTAWIENIA.haptyka;
    b.setAttribute('aria-pressed', on ? 'true' : 'false');
    b.textContent = on ? 'Wibracje włączone' : 'Wibracje wyłączone';
    b.title = on ? 'Wyłącz wibracje przy odpowiedziach' : 'Włącz wibracje przy odpowiedziach';
    document.body.classList.toggle('bez-haptyki', !on);
  }
  function przelaczHaptyke() {
    TEST_USTAWIENIA.haptyka = !TEST_USTAWIENIA.haptyka;
    try { localStorage.setItem(KLUCZ_HAPTYKA, TEST_USTAWIENIA.haptyka ? '1' : '0'); } catch {}
    if (TEST_USTAWIENIA.haptyka) drgnij(DRGANIA.poprawna);
    odswiezHaptyke();
  }
  podepnijTest('test-haptyka', przelaczHaptyke);
  odswiezHaptyke();
  nalozSwitch(el('test-haptyka'), przelaczHaptyke);

  nalozSwitch(el('test-start'), () => otworz());
  nalozSwitch(el('test-zamknij'), () => zamknij());
  nalozSwitch(el('test-dalej'), () => { if (blokada) dalej(); });
  nalozSwitch(el('test-wstecz'), () => { if (krok > 0) wstecz(); });
  ['test-powtorz', 'test-jeszcze-raz', 'test-do-odcinka', 'test-nastepny'].forEach((id) => {
    const b = el(id);
    if (b) nalozSwitch(b, () => b.onclick && b.onclick());
  });

  const box = el('test-warianty');
  if (box) box.addEventListener('click', (e) => {
    const b = e.target.closest('.wariant');
    if (b) wybierz(Number(b.dataset.i));
  });

  document.addEventListener('keydown', (e) => {
    if (!panel.classList.contains('otwarty')) return;
    if (e.key === 'Escape') { e.preventDefault(); return zamknij(); }
    const w = el('test-wynik');
    if (w && w.classList.contains('widoczny')) return;
    if (e.key === 'ArrowLeft') { e.preventDefault(); return wstecz(); }
    if (e.key === 'ArrowRight' && blokada) { e.preventDefault(); return dalej(); }
    if (blokada && (e.key === 'Enter' || e.key === ' ')) {
      if (document.activeElement && document.activeElement.id === 'test-dalej') return;
      e.preventDefault();
      return dalej();
    }
    if (e.key >= '1' && e.key <= '4') { e.preventDefault(); wybierz(Number(e.key) - 1); }
  });

  /* Zmiana odcinka: odśwież wejście do testu. */
  if (typeof window.zaladuj === 'function') {
    const oryg = window.zaladuj;
    window.zaladuj = function (...a) { const r = oryg.apply(this, a); odswiezWejscie(); return r; };
  }
  const pelny = el('pelny');
  if (pelny) new MutationObserver(() => { if (pelny.classList.contains('otwarty')) odswiezWejscie(); })
    .observe(pelny, { attributes: true, attributeFilter: ['class'] });

  document.addEventListener('DOMContentLoaded', () => { odswiezWejscie(); odswiezStatystyki(); });
  odswiezWejscie();
  odswiezStatystyki();
})();
