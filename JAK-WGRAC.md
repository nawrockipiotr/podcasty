# Jak to wgrać — bez Terminala

Wszystko robisz w przeglądarce, na koncie GitHub, które już masz.

## 1. Nowe repozytorium

Wejdź na **github.com/new**.

- Nazwa: `podcasty` (będzie widoczna w adresie)
- Widoczność: **Public** — GitHub Pages działa za darmo tylko dla publicznych
- Nie zaznaczaj „Add a README file"

Kliknij **Create repository**.

## 2. Wgraj pliki

Na pustej stronie repozytorium kliknij **uploading an existing file**.

Otwórz ten folder w Finderze, zaznacz **całą zawartość** (⌘A) — łącznie z podfolderem `audio` — i przeciągnij na stronę GitHuba.

64 nagrania po około 4 MB plus pliki aplikacji. Wgrywanie potrwa kilka minut, pasek postępu jest na dole. Nie zamykaj karty.

Gdy skończy, na dole strony kliknij **Commit changes**.

> Jeśli przeglądarka zaprotestuje przy przeciąganiu podfolderu, wgraj najpierw pliki z głównego poziomu, zatwierdź, potem wejdź w **Add file → Upload files** jeszcze raz i przeciągnij sam folder `audio`.

## 3. Włącz GitHub Pages

**Settings** (zakładka u góry repozytorium) → **Pages** (menu po lewej).

- Source: **Deploy from a branch**
- Branch: **main**, katalog: **/ (root)**
- **Save**

Po dwóch, trzech minutach strona działa pod adresem:

```
https://TWOJA-NAZWA-UŻYTKOWNIKA.github.io/podcasty/
```

Odśwież stronę Settings → Pages, jeśli adres jeszcze się nie pokazał.

## 4. Sprawdź na telefonie

Otwórz ten adres na telefonie. Uruchom odcinek, przewiń suwakiem na środek, zgaś ekran — dźwięk ma lecieć dalej, a na ekranie blokady ma pojawić się okładka i przyciski.

Potem: menu udostępniania → **Dodaj do ekranu początkowego**. Ikona pojawi się między aplikacjami, a strona odpali się bez paska przeglądarki.

## 5. Podepnij w Kampusie

Dodaj zasób typu **URL** (nie „strona HTML", nie osadzenie w ramce) wskazujący na adres strony, z opcją otwierania w nowym oknie.

W opisie zasobu napisz: „Otwórz na telefonie i dodaj do ekranu początkowego, żeby słuchać jak w aplikacji podcastowej".

Do pojedynczego odcinka linkujesz przez `#odc-012` na końcu adresu — przydatne, gdy chcesz przypisać konkretne nagranie do konkretnych zajęć.

## Dodanie odcinków później

**Add file → Upload files**, przeciągnij nowe MP3 do folderu `audio`, potem popraw `episodes.json` przez ołówek w interfejsie GitHuba. Po zmianie w `index.html` albo `player.js` podbij numer `POWLOKA` w `sw.js`, inaczej studenci z zainstalowaną aplikacją zobaczą starą wersję.
