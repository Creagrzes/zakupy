# Zakupy 3.0 — wspólne listy zakupów, pakowania i zadań

Aplikacja na telefon (PWA) do wspólnych list, synchronizowanych **na żywo** między osobami,
działająca też **bez internetu**. Backend: Cloudflare Worker + Durable Object (bez bazy do zakładania).

## Co potrafi

**Trzy rodzaje list:** 🛒 Zakupy · 🎒 Pakowanie · ✅ Zadania.

**Zagnieżdżanie bez limitu (bagaż → kieszeń → rzeczy)**
- Dodaj „Plecak:” (dwukropek albo przycisk 📁) — od razu dodajesz *do środka* plecaka.
- W plecaku dodaj „Mała kieszeń:”, a w niej „Ładowarka”, „Słuchawki”… Pasek „Dodajesz do: Plecak › Mała kieszeń” pozwala wrócić poziom wyżej jednym dotknięciem.
- Każdy bagaż ma pierścień postępu (np. 3/7), można go zwinąć, odhaczyć w całości, otworzyć osobno (widok tylko zawartości z okruszkami), przenieść, zduplikować z zawartością albo zapisać jako szablon.
- Rzeczy przenosisz między kieszeniami przeciągając (uchwyt ⋮⋮, upuść *na* bagaż = do środka) albo przez „Przenieś do…”.
- Spakowana kieszeń sama się zwija; „🔄 Od nowa” odznacza wszystko przed kolejnym wyjazdem.

**Pisanie zamiast klikania**
- Szybkie dodawanie rozumie: `2 kg ziemniaki @Lidl #warzywa (młode) !` → ilość, jednostka, sklep, kategoria, notatka, „ważne”. Pod polem widać podgląd, co zostało rozpoznane.
- Wklej kilka linijek naraz — każda staje się pozycją, wcięcia tworzą zagnieżdżenie.
- **✍️ Pisz tekstem**: cała lista jako edytowalny konspekt (przyciski ⇥/⇤ do wcięć na telefonie). Zapis zachowuje odhaczenia, ceny i przypisania.
- Notatnik: dowolna notatka (np. przepis) → jednym dotknięciem lista zakupów/pakowania albo dopisanie do istniejącej.

**Zakupy**
- Automatyczne kategorie i emoji (ok. 150 reguł po polsku), grupowanie po kategoriach (w kolejności alejek, ustawialnej) lub sklepach, filtr sklepu.
- Sekcja „🧺 W koszyku”, tryb sklepu (duże przyciski, ekran nie gaśnie), ceny i budżet, podpowiedzi „często dodawane” z zapamiętaną kategorią/sklepem.
- Dopisanie czegoś, co już jest: propozycja „+1”; coś już kupionego wraca na listę.

**Wygoda na telefonie**
- Przesuń w prawo = odhacz, w lewo = usuń (z „Cofnij”). Cofanie także po usunięciu listy i czyszczeniu odhaczonych.
- Arkusze od dołu zamykane gestem i przyciskiem „wstecz” Androida, pasek dodawania nad klawiaturą (iOS i Android), bezpieczne strefy iPhone'a, jasny/ciemny/automatyczny motyw, wibracje.
- Instalacja na ekranie głównym; aplikacja otwiera się offline, zmiany czekają w kolejce i wysyłają się same.

**Razem**
- Zmiany widać u wszystkich od razu, kropka statusu połączenia, kto jest online, dymki „Ola spakowała Ładowarkę”, kto odhaczył, przypisanie osoby, historia zmian listy.
- Osoby konfigurowalne (nie tylko dwie na sztywno), szablony własne + gotowe (weekend z plecakiem, wakacje z walizką, basen, tygodniowe zakupy, grill, przeprowadzka), archiwum, przypinanie, duplikowanie, łączenie list, terminy („za 3 dni”), wyszukiwanie wszędzie (także w kieszeniach), statystyki, kopia zapasowa JSON (pobierz / wczytaj).

## Struktura

```
public/            pliki dla przeglądarki (serwowane jako statyczne zasoby)
  index.html, css/app.css, sw.js, manifest.webmanifest, icons/
  js/core.js       wspólny rdzeń: operacje na stanie, parser tekstu, drzewo, kategorie, migracja
  js/store.js      synchronizacja (WebSocket, kolejka offline, pamięć podręczna)
  js/ui.js, ctx.js, app.js, views/*.js   interfejs
src/worker.js      Worker + Durable Object (importuje ten sam public/js/core.js)
test/              testy rdzenia (node --test)
```

Każda zmiana to „operacja” przepuszczana przez `applyOp()` z `core.js` — najpierw natychmiast
na telefonie, potem na serwerze, który rozsyła ją do pozostałych. Ten sam kod po obu stronach
gwarantuje identyczny wynik. Durable Object używa WebSocket Hibernation (tani w utrzymaniu)
i zapisuje każdą listę pod osobnym kluczem.

## Wdrożenie

Tak jak poprzednio: wrzuć zawartość repozytorium do podłączonego repo (Cloudflare zbuduje
Workera sam) albo lokalnie `npm install && npx wrangler deploy`.

- Nazwa Workera, binding `LIST_ROOM` i klasa `ListRoom` są **bez zmian**, więc dane zostają.
- **Migracja danych ze starej wersji dzieje się automatycznie** przy pierwszym uruchomieniu:
  listy, produkty, szablony, ulubione, historia i notatki (HTML → tekst, kafelki dopisane na końcu)
  trafiają do nowego formatu. Stare listy „Do wzięcia” stają się listami „Pakowanie”.
  Oryginalne dane zostają zachowane w magazynie pod kluczami `v2bak:*`.
- Imię wybrane w starej wersji jest przejmowane.

### Opcjonalnie: klucz dostępu
Domyślnie (jak wcześniej) każdy, kto zna adres, ma dostęp. Aby to zamknąć, dodaj w Cloudflare
(Worker → Settings → Variables and Secrets) sekret `ACCESS_KEY`. Aplikacja poprosi o niego raz
na każdym urządzeniu.

## Rozwój lokalnie

```
npm install
npm run dev     # http://localhost:8787
npm test        # testy rdzenia
```
