# PixFormat — Specyfikacja techniczna

Konwerter formatów zdjęć działający w 100% w przeglądarce. Dokument powstał na
podstawie wywiadu technicznego przeprowadzonego 2026-09-15.

## 1. Cel i zakres

PixFormat to darmowe, open-source'owe narzędzie webowe do zmiany formatu
plików graficznych. Robi jedną rzecz dobrze: konwertuje obraz z jednego
formatu na drugi, z opcjonalną kontrolą jakości kompresji. Nie oferuje
zmiany rozmiaru (resize), kadrowania ani edycji obrazu.

**Grupa docelowa:** casualowi użytkownicy (np. ktoś kto chce przekonwertować
zdjęcia HEIC z iPhone'a na JPEG przed wysłaniem mailem) — nie fotografowie
profesjonalni, nie deweloperzy szukający API.

## 2. Architektura

### 2.1 Przetwarzanie wyłącznie po stronie klienta

Cała konwersja odbywa się w przeglądarce użytkownika. **Żaden plik nigdy nie
jest wysyłany na żaden serwer.** To fundamentalna decyzja produktowa i
architektoniczna:

- Zero kosztów infrastruktury (brak serwera przetwarzającego, brak storage).
- Pełna prywatność — narzędzie działa nawet przy braku zaufania do operatora
  strony, bo weryfikowalnie nic nie opuszcza urządzenia (można to sprawdzić
  w zakładce Network w DevTools — brak requestów z plikami).
- Aplikacja może być w pełni statyczna (HTML/CSS/JS) i hostowana na darmowym
  hostingu statycznym, bez backendu.

### 2.2 Silnik konwersji: natywne Canvas API

Konwersja realizowana wyłącznie przez natywne API przeglądarki
(`<canvas>`, `CanvasRenderingContext2D.drawImage()`,
`HTMLCanvasElement.toBlob()`) — **bez dodatkowych bibliotek WASM** (np.
kodeków ze Squoosh). To świadomy kompromis prostota/funkcjonalność:

- Zero dodatkowych zależności, minimalny rozmiar bundla, brak opóźnienia
  na ładowanie ciężkich modułów WASM.
- **Konsekwencja:** brak możliwości enkodowania AVIF (żadna przeglądarka
  nie wspiera `canvas.toBlob('image/avif')` — canvas potrafi tylko
  dekodować/wyświetlać AVIF, nie zapisywać). Patrz sekcja 3.
- **Konsekwencja:** brak natywnej obsługi wieloklatkowych animacji
  (GIF/animowany WebP) — canvas operuje na pojedynczej klatce.

### 2.3 Batch processing z Web Workers

Wiele plików przetwarzanych jest równolegle na osobnych wątkach (Web
Workers), aby nie blokować głównego wątku UI podczas konwersji dużych
zdjęć.

- Wymaga `OffscreenCanvas` w workerze do wykonania `drawImage`/`toBlob`
  poza głównym wątkiem.
- **Baseline wsparcia przeglądarek: tylko nowoczesne evergreen (ostatnie
  ~2 wersje Chrome/Edge/Firefox/Safari).** Brak fallbacku dla starszych
  przeglądarek bez `OffscreenCanvas` — świadomie ograniczamy zasięg na
  rzecz prostoty kodu.
- Miękkie ostrzeżenie w UI przy batchu >20 plików informujące o możliwym
  spowolnieniu przeglądarki (nie blokuje działania, tylko informuje).

## 3. Wspierane formaty

| Format | Wejście | Wyjście | Uwagi |
|---|---|---|---|
| JPEG | ✅ | ✅ | Format stratny, suwak jakości. `canvas.toBlob('image/jpeg')` |
| PNG | ✅ | ✅ | Bezstratny. `canvas.toBlob('image/png')` |
| WebP | ✅ | ✅ | Format stratny, suwak jakości. `canvas.toBlob('image/webp')` |
| GIF | ✅ | ❌ | **Tylko jako wejście** — patrz 3.1b. Zawsze dekodowany do 1 klatki (patrz 3.2) |
| BMP | ✅ | ✅ | Bezstratny. **Ręczny encoder** — patrz 3.1b |
| AVIF | ✅ | ❌ | **Tylko jako wejście** — canvas nie potrafi enkodować AVIF |

### 3.1b Korekta: `canvas.toBlob()` nie wspiera GIF/BMP

Weryfikacja techniczna (2026-09-16) wykazała błąd założenia w oryginalnej
specyfikacji: `HTMLCanvasElement.toBlob()` / `toDataURL()` **gwarantuje**
wsparcie tylko dla `image/png`, `image/jpeg` i `image/webp`. Żądanie
`image/gif` lub `image/bmp` w żadnej głównej przeglądarce nie enkoduje do
tych formatów — silently zwraca PNG, co skutkowałoby plikiem
`zdjecie.gif`, który w rzeczywistości jest PNG-iem pod inną nazwą.

Decyzja korygująca:

- **BMP jako wyjście: zostaje**, ale realizowany przez ręcznie napisany
  encoder (odczyt pikseli z `ImageData`, zapis surowego formatu BMP
  bajt-po-bajcie: nagłówek `BITMAPFILEHEADER` + `BITMAPINFOHEADER` +
  wiersze pikseli BGR z paddingiem do 4 bajtów). BMP to prosty,
  nieskompresowany format rastrowy — nie wymaga żadnej biblioteki, więc
  jest to zgodne z zasadą zero-dependency z §2.2/§8.
- **GIF jako wyjście: usunięty z zakresu.** Poprawne enkodowanie GIF
  wymaga kompresji LZW, co realistycznie oznacza bibliotekę zewnętrzną —
  sprzeczne z decyzją architektoniczną o zero dodatkowych zależności.
  GIF pozostaje **tylko formatem wejściowym** (konwertowalny na
  JPEG/PNG/WebP/BMP), symetrycznie do traktowania AVIF w §3.1.

Świadomie pominięte: HEIC/HEIF (problem licencyjny patentów HEVC + brak
natywnego dekodowania w części przeglądarek), formaty RAW (CR2/NEF/ARW —
wymagają specjalistycznych bibliotek), TIFF, SVG, ICO. Może to być
rozszerzone w przyszłości, ale poza obecnym zakresem MVP.

### 3.1 AVIF — wejście bez wyjścia

Użytkownik może wgrać plik AVIF i przekonwertować go na dowolny inny
wspierany format, ale **nie może wybrać AVIF jako formatu docelowego** —
opcja ta nie pojawia się na liście formatów wyjściowych. UI powinno to
jasno komunikować (np. AVIF nieobecne w dropdownie formatu docelowego, bez
potrzeby dodatkowego tłumaczenia dlaczego).

### 3.2 Animacje — zawsze spłaszczane

Animowane GIF-y i animowane WebP są zawsze konwertowane do pojedynczej,
statycznej klatki (pierwszej klatki). Brak obsługi wieloklatkowego
dekodowania/enkodowania — świadome uproszczenie zamiast dodawania kolejnej
biblioteki do dekodowania klatek. UI powinno ostrzec użytkownika, że
animacja zostanie utracona (np. mały komunikat przy wgraniu wykrytego
animowanego pliku).

## 4. Metadane EXIF

**Domyślnie: zawsze usuwane.** Decyzja podjęta po zidentyfikowaniu
problemu technicznego: `canvas.toBlob()` i tak zawsze usuwa EXIF przy
re-enkodowaniu (canvas nie przenosi żadnych metadanych), więc próba ich
zachowania wymagałaby ręcznej binarnej reinjekcji bloku EXIF do wyniku —
co działa tylko dla wyjścia JPEG (PNG/WebP/GIF/BMP nie mają tego samego
kontenera metadanych co JPEG). Zamiast łatać to niespójne, format-zależne
zachowanie, przyjęto jedno proste i spójne z architekturą privacy-first
rozwiązanie: **metadane (GPS, model aparatu, data, itd.) są zawsze usuwane
z pliku wynikowego, dla wszystkich formatów.**

Orientacja obrazu nie jest problemem — przeglądarki automatycznie
stosują EXIF orientation przy dekodowaniu obrazu na `<img>`/canvas, więc
piksele w wyniku są już poprawnie obrócone niezależnie od utraty
metadanych.

## 5. Kontrola jakości/kompresji

Zamiast opcji zmiany rozmiaru (resize), aplikacja oferuje suwak jakości
kompresji dla formatów stratnych.

- Suwak jakości **zawsze widoczny** w UI, ale **wyłączony (disabled)**
  gdy wybrany format docelowy nie wspiera kompresji stratnej (PNG, BMP,
  GIF) — mniej "skaczący" interfejs niż dynamiczne pokazywanie/ukrywanie.
- Aktywny wyłącznie dla JPEG i WebP jako formatu docelowego.
- Wartość domyślna: **85%**.
- Zakres: standardowy 0–100% (lub 0.0–1.0 przekazywane do
  `canvas.toBlob(callback, mimeType, quality)`).

## 6. Interfejs użytkownika

### 6.1 Upload plików

Dwa równoległe sposoby wgrywania plików:
1. **Strefa drag & drop** — duży obszar z komunikatem "przeciągnij i
   upuść pliki tutaj".
2. **Przycisk "Wybierz plik"** — klasyczny `<input type="file" multiple>`
   otwierający systemowy eksplorator, ważne dla dostępności i
   użytkowników mobilnych.

Bez wsparcia dla wklejania ze schowka (Ctrl+V) i importu z URL (poza
zakresem MVP — import z URL wiązałby się dodatkowo z problemami CORS przy
pobieraniu obrazów z zewnętrznych serwerów).

### 6.2 Lista plików

Lista tekstowa (nazwa pliku + rozmiar), **bez miniaturek podglądu** —
świadoma decyzja dla wydajności przy większych batchach (generowanie
miniatur dla każdego pliku to dodatkowy koszt renderowania, którego można
uniknąć skoro narzędzie ma być szybkie i lekkie).

Nazwa pliku wynikowego: oryginalna nazwa + sufiks formatu, np.
`wakacje.heic` → `wakacje-jpg.jpg`. Unika nadpisania oryginału przy
zapisie do tego samego folderu.

### 6.3 Feedback podczas konwersji

Jeden zbiorczy pasek postępu ("X z Y plików ukończonych") — bez
statusu per plik. Prostsze niż śledzenie stanu każdego pliku osobno,
kosztem szczegółowości przy debugowaniu pojedynczych błędów (patrz 6.4).

### 6.4 Obsługa błędów w batchu

Po zakończeniu całego batcha wyświetlane jest zbiorcze podsumowanie:
liczba sukcesów, liczba niepowodzeń, oraz lista nazw plików które zawiodły
wraz z krótkim powodem (np. "nieobsługiwany format", "uszkodzony plik").
Błędy pojedynczych plików nie przerywają przetwarzania pozostałych plików
w batchu.

### 6.5 Dostarczanie wyników

Każdy przekonwertowany plik pobierany jest **osobno** (brak zbiorczego
ZIP-a) — najprostsza implementacja bez zależności od bibliotek do
budowania archiwów (np. JSZip) w przeglądarce. Świadomy kompromis: słabsze
UX przy dużych batchach, ale minimalizuje zależności zewnętrzne.

### 6.6 Design wizualny

- Tylko jasny motyw (bez trybu ciemnego) — jeden spójny zestaw kolorów,
  mniej pracy projektowej dla prostego, sporadycznie używanego narzędzia.
- Wyłącznie w języku polskim, bez i18n.
- Brak trybu PWA/offline — zwykła strona internetowa bez service workera
  i manifestu; wystarczy otworzyć w przeglądarce.

## 7. Prywatność i telemetria

**Brak jakiejkolwiek analityki i telemetrii użycia.** Spójne z
przekazem "Twoje zdjęcia nigdy nie opuszczają urządzenia" — jeśli dane
użytkownika nigdy nie trafiają na serwer, nie ma sensu śledzić jego
zachowania w żaden sposób (żadnych cookies, żadnego Google
Analytics/Plausible, zero requestów do zewnętrznych usług).

## 8. Stack technologiczny (rekomendacja)

Użytkownik poprosił o rekomendację — poniżej wybór wraz z uzasadnieniem.

**Vanilla TypeScript + Vite** (bez frameworka UI typu React/Svelte).

Uzasadnienie: każda wcześniejsza decyzja w tym projekcie idzie w stronę
minimalizmu i zera zbędnych zależności (Canvas zamiast WASM, brak AVIF
zamiast dodatkowej biblioteki, brak PWA, brak analityki, brak ZIP-a).
Framework UI dodałby kilkadziesiąt–kilkaset KB bundla dla interfejsu,
który sprowadza się do: strefy drop, listy plików, jednego dropdownu
formatu, jednego suwaka i paska postępu — zbyt mało złożoności stanu, by
uzasadnić narzut frameworka. Vite zapewnia wygodny dev server i build bez
narzucania architektury.

## 9. Hosting i dystrybucja (rekomendacja)

Użytkownik poprosił o rekomendację — poniżej wybór wraz z uzasadnieniem.

**GitHub Pages.** Projekt jest statyczny (brak backendu), open-source i
najpewniej trzymany w repozytorium GitHub — GitHub Pages jest zero-config
(deploy bezpośrednio z repo przez GitHub Actions), darmowy, i nie wymaga
zakładania dodatkowego konta poza GitHubem. Alternatywa: Cloudflare Pages,
jeśli w przyszłości pojawi się potrzeba własnej domeny z automatycznym
HTTPS i lepszym cachowaniem — ale dla obecnego zakresu GitHub Pages
wystarcza.

## 10. Licencja

**MIT.** Najbardziej permisywna, standardowa dla małych narzędzi
open-source — pozwala na dowolne użycie i modyfikacje bez dodatkowych
ograniczeń.

## 11. Świadomie pominięte / poza zakresem MVP

Poniższe tematy zostały przedyskutowane i świadomie wykluczone z zakresu,
żeby utrzymać projekt prosty i spójny z filozofią "jedno narzędzie, jedna
rzecz, dobrze":

- Konta użytkowników, logowanie, limity/płatności (SaaS).
- Zmiana rozmiaru (resize) obrazu.
- Obsługa formatów RAW, TIFF, SVG, ICO, HEIC/HEIF.
- Zachowanie animacji GIF/WebP.
- Pobieranie zbiorcze jako ZIP.
- Miniaturki podglądu przed/po konwersji.
- Tryb ciemny, wielojęzyczność (i18n).
- PWA / działanie offline.
- Jakakolwiek analityka/telemetria.
- Twarde wykrywanie/obsługa limitów rozmiaru canvas przeglądarki (bardzo
  duże zdjęcia, np. 50MP+ — mogą się nie udać bez czytelnego komunikatu;
  zaakceptowane ryzyko jako rzadki edge case).
- Import przez URL, wklejanie ze schowka.

## 12. Otwarte pytania na przyszłość

Nieujęte w MVP, ale warte rozważenia przy rozwoju projektu:
- Czy w przyszłości dodać opcjonalny WASM encoder tylko dla AVIF jako
  format wyjściowy (lazy-loaded, żeby nie obciążać podstawowego bundla)?
- Czy dodać próg/komunikat dla zdjęć przekraczających limity canvas
  przeglądarki, jeśli w praktyce okaże się to częstym zgłoszeniem?
- Czy warto rozważyć eksport ZIP jako opcjonalne ulepszenie przy realnym
  feedbacku od użytkowników konwertujących duże batch'e?
