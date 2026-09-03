/* ------------------------------------------------------------------
   kopia.js — przenoszenie postępu między urządzeniami.

   Postęp odsłuchania, ustawienia i wyniki testów żyją w localStorage,
   czyli w JEDNEJ przeglądarce na JEDNYM urządzeniu. Ten plik nie zmienia
   tego modelu — daje tylko jawny zapis do pliku i wczytanie z pliku,
   żeby student mógł przenieść stan na telefon lub odzyskać go po
   wyczyszczeniu danych przeglądarki.

   Identyfikatory: kopia-zapisz, kopia-wczytaj, kopia-plik.
   ------------------------------------------------------------------ */
'use strict';

(() => {
  /* Eksport obejmuje wszystkie klucze aplikacji — nazwy stałych żyją w kilku
     miejscach (player.js, warstwa prezentacji, motyw), więc bierzemy je po prefiksie,
     żeby kopia nie rozjechała się z aplikacją przy kolejnych zmianach. */
  const PREFIKSY = ['csri-', 'pz-', 'wzuw-'];
  const klucze = () => Object.keys(localStorage).filter((k) => PREFIKSY.some((p) => k.startsWith(p)));
  const el = (id) => document.getElementById(id);

  function zapisz() {
    const dane = { wersja: 2, data: new Date().toISOString(), stan: {} };
    klucze().forEach((k) => { dane.stan[k] = localStorage.getItem(k); });
    const blob = new Blob([JSON.stringify(dane, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'podstawy-zarzadzania-postep.json';
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 4000);
    if (typeof powiedz === 'function') powiedz('Kopia postępu zapisana');
  }

  async function wczytaj(plik) {
    try {
      const dane = JSON.parse(await plik.text());
      if (!dane || !dane.stan) throw new Error('zły format');
      const wpisy = Object.entries(dane.stan)
        .filter(([k]) => PREFIKSY.some((p) => k.startsWith(p)));
      if (!wpisy.length) throw new Error('brak danych');
      const kiedy = dane.data ? new Date(dane.data).toLocaleDateString('pl-PL') : 'nieznanej daty';
      const zgoda = confirm(
        'Wczytać kopię z ' + kiedy + '?\n\n' +
        'Zastąpi ona obecny postęp odsłuchania i wyniki testów zapisane w tej przeglądarce. ' +
        'Tej operacji nie można cofnąć.'
      );
      if (!zgoda) return;
      wpisy.forEach(([k, v]) => localStorage.setItem(k, v));
      location.reload();
    } catch {
      if (typeof powiedz === 'function') powiedz('Nie udało się wczytać pliku z postępem');
    }
  }

  const bz = el('kopia-zapisz');
  if (bz) bz.onclick = zapisz;
  const bw = el('kopia-wczytaj');
  const pole = el('kopia-plik');
  if (bw && pole) {
    bw.onclick = () => { pole.value = ''; pole.click(); };
    pole.onchange = () => { if (pole.files && pole.files[0]) wczytaj(pole.files[0]); };
  }
})();
