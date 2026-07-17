# Lista zakupów – wersja 2 (realtime + wszystkie funkcje)

To jest duża rozbudowa poprzedniej wersji. Najważniejsza zmiana pod
maską: zamiast bazy KV (i odświeżania co 4 sekundy) aplikacja używa teraz
**Durable Objects** — to jak mini-serwer, który trzyma cały stan Waszej
listy w pamięci i wysyła zmiany do obu telefonów **natychmiast** przez
WebSocket, bez odświeżania.

Struktura plików (bez zmian względem poprzedniej wersji):
- `public/` — pliki, które widzi przeglądarka (`index.html`, `style.css`, `script.js`)
- `src/worker.js` — cała logika backendu (listy, produkty, sklepy, szablony, historia, statystyki, WebSocket)
- `wrangler.jsonc` — konfiguracja Cloudflare

## Krok 1: Podmień pliki w repozytorium na GitHubie

1. Wejdź do swojego repozytorium `zakupy` na GitHubie
2. Usuń stare pliki: `index.html`, `style.css`, `script.js` (jeśli leżą luzem),
   stary folder `functions` (jeśli jeszcze istnieje), stary `wrangler.jsonc`
3. Kliknij **Add file → Upload files**
4. Przeciągnij całą zawartość tego paczki, czyli:
   - folder `public` (ze środkiem)
   - folder `src` (ze środkiem)
   - plik `wrangler.jsonc`
5. **Commit changes**

## Krok 2: Wdróż ponownie

Wróć do panelu Cloudflare, do swojego Workera `zakupy` → zakładka
**Deployments** → poczekaj na nowy build (commit na GitHubie sam go
wywoła, bo repo jest już podłączone) albo uruchom go ręcznie.

**Nie musisz już zakładać żadnego namespace'u KV ani niczego wklejać.**
Durable Object o nazwie `ListRoom` zostanie utworzony automatycznie przy
pierwszym wdrożeniu — to właśnie robi sekcja `migrations` w
`wrangler.jsonc`. Jeśli w panelu Cloudflare zostały jeszcze ustawienia
starego namespace'u KV (`SHOPPING_LIST`), możesz je bezpiecznie usunąć
w **Settings → Bindings** Workera — nowy kod już z nich nie korzysta.

## Krok 3: Gotowe

Otwórz adres swojego Workera (`zakupy.twoja-nazwa.workers.dev`) na
telefonie — swoim i drugiej osoby. Wybierzcie swoje imiona przy
pierwszym uruchomieniu. Od teraz każda zmiana (dodanie produktu,
odhaczenie, nowa lista...) pojawia się u drugiej osoby **od razu**, bez
odświeżania.

## Co zrobiono z całej listy życzeń

Zrobione w całości: wiele list (z kolorem/ikoną), produkty z ilością/
jednostką/sklepem/kategorią/notatką/ceną, oznaczanie kupionych,
zarządzanie sklepami i jednostkami (własne też), filtrowanie po sklepie,
grupowanie po kategorii, szablony list, łączenie list, archiwum,
historia zmian, wyszukiwanie (listy/produkty/sklepy), ulubione produkty
z podpowiedziami przy wpisywaniu, przeciąganie kolejności produktów,
tryb zakupów (duże przyciski), statystyki, ustawienia (imię, sklepy,
jednostki, jasny/ciemny motyw, wyczyszczenie danych lokalnych),
przypięte listy, emoji przy produktach, szybkie dodawanie (Enter po
Enter), duplikowanie list, budżet listy, przypisanie produktu do osoby,
ponowne dodanie z ulubionych jednym kliknięciem.

Zrobione w wersji uproszczonej (uczciwie o tym mówiąc):
- **Powiadomienia** — tylko "w aplikacji": dyskretny toast, gdy druga
  osoba coś zmieni, o ile masz appkę akurat otwartą. Prawdziwe
  powiadomienia systemowe (zablokowany ekran, zamknięta appka)
  wymagają Web Push + zgody użytkownika na powiadomienia — to osobny
  temat na później, bo wymaga dodatkowej konfiguracji po stronie
  Cloudflare i przeglądarki.
- **Offline** — appka kolejkuje Twoje zmiany lokalnie, gdy nie masz
  internetu, i wysyła je automatycznie po powrocie zasięgu. To *nie*
  jest jeszcze pełna instalowalna aplikacja (PWA) działająca "od zera"
  bez internetu — to również osobny, mniejszy krok na później
  (dodanie manifestu i service workera), jeśli chcecie.

## Jeśli coś nie działa

- Zakładka **Deployments** w Twoim Workerze pokaże pasek postępu build
  albo błąd, jeśli coś poszło nie tak.
- Otwórz konsolę przeglądarki (F12 → Console) — jeśli WebSocket się nie
  łączy, zobaczysz tam czerwony błąd, który można mi wkleić.
- Jeśli zobaczysz na GitHubie Pull Request otwarty automatycznie przez
  Cloudflare z konfiguracją — zmerguj go (to normalne przy pierwszym
  podłączeniu repo).
