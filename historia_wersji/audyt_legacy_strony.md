# Audyt legacy strony CRU — Faza 0a

> **Cel dokumentu:** pełny inwentarz funkcji istniejącej legacy strony CRU do odtworzenia w replice (Faza 0c). To NIE jest kod — to lista obserwacji z przeglądarki. Wszystko, czego nie da się zaobserwować z UI (logika serwerowa, inne role), jest oznaczone jako **[NIEZNANE / do dopytania]**.
>
> **Źródło:** wyłącznie obserwacja przez przeglądarkę (chrome-devtools MCP), konto Mati (Mateusz Mazur).
> **Data audytu:** 2026-07-16.
> **Adres legacy:** `http://10.222.125.213/cru/index.php/` (sieć wewnętrzna ArcelorMittal).
> **Status:** w toku — moduł Umowy skończony, pozostałe w trakcie.

---

## 0. Informacje ogólne (całościowe)

- **Nazwa w UI:** nagłówek „AMDS CRU" (logo), tytuł karty „Centralny Rejestr Umów" / na ekranie logowania „AMDS Quotation System". Nagłówek formularza logowania: „Witaj w systemie CRU!".
- **Framework:** wygląda na **CakePHP** — wzorzec URL `index.php/{controller}/{action}/{id}`. Frontend tabel oparty na **jTable** (wtyczka jQuery + jQuery UI dialogs). Multiselecty/autocomplete typu chosen/select2.
- **Logowanie:** **natywny formularz login + hasło** (`/cru/index.php/users/login`), własna tabela użytkowników, link „Zapomniałem hasła!" → `/admin/index.php/forgot_password`. **NIE ma Entra ID / SSO / redirectu do Microsoft.** (Sprostowanie względem `plan.md`, który błędnie zakładał SSO — patrz `status_projektu.md`, wpis 2026-07-16.) Login legacy pozostaje poza zakresem odtwarzania (docelowo Entra ID SSO w przyszłości), ale fakt istnienia natywnego panelu jest odnotowany.
- **Wylogowanie:** `/cru/index.php/users/logout`.
- **Język:** przełącznik EN | PL w prawym górnym rogu. **[BUG legacy]** oba linki (EN i PL) wskazują na `?lang=en` — przełącznik PL jest zepsuty.
- **Osobna ścieżka `/admin/`** (inny katalog niż `/cru/`) — ujawniona przez link forgot_password. Prawdopodobnie oddzielny panel administracyjny. **[do zbadania — task #8]**
- **Menu główne (10 pozycji):** Umowy, Projekty, Dział ryzyka, Supply chain, Kontrahenci, Grupy, Lokalizacja dostępy, Dostępy, Raporty (dropdown), Mailing.
- **Skala danych:** `record_id` oglądanej umowy = **20611** → w bazie jest rzędu ~20 tys.+ rekordów historycznych. Raport projektów paginowany do limitów 4000/5000 → tysiące projektów.
- **⚠️ Funkcja wysyłki (NIE dotykać w audycie):** w podglądzie umowy jest link **„wyślij jako załącznik"** → `/cru/index.php/files/sendattachment/{attachment_id}` — wysyła plik umowy mailem. Mati wprost prosił, żeby tego nie klikać. Odnotowane, omijane.

---

## 1. Moduł UMOWY (`/cru/index.php/contract`) — RDZEŃ SYSTEMU

### 1.1 Routing
| URL | Funkcja |
|-----|---------|
| `/contract` | Lista umów + formularz wyszukiwania (jTable, „CRU List") |
| `/contract/preview/{id}` | Podgląd szczegółów umowy (popup 1000×600, read-only) — otwierany ikoną ołówka przez JS `openPreview2` (`window.open`) |
| `/contract/attachments/{attachment_id}` | Pobranie/otwarcie pliku załącznika (PDF) |
| `/contract/acceptform/{id}` | „Formularz akceptacji umowy" (workflow akceptacji) |
| `/files/show/{id}/` | (iframe w podglądzie) lista załączników umowy |
| `/files/sendattachment/{attachment_id}` | ⚠️ „wyślij jako załącznik" (mail) — NIE dotykać |
| `/remarks/index/{id}` | (iframe w podglądzie) notatki/uwagi do umowy |

**[NIEZNANE]** endpoint dodawania/edycji umowy (add/edit). Ikona w wierszu („Edit Record") faktycznie wywołuje `openPreview2` → otwiera **podgląd**, nie edycję inline. Ścieżka realnej edycji/dodania (np. `/contract/add`, `/contract/edit/{id}`) niezweryfikowana — **do dopytania / sprawdzenia z uprawnieniami edytora.**

### 1.2 Formularz wyszukiwania (filtry listy)
Pola (name w nawiasie): Identyfikator (`identifier`), Typ dokumentu (`type`), Numer umowy (`contract_reference`), buissnesline (`buissnesline_id`), Status (`status_id`), Spółka (`company_id`), Lokalizacja (`location_id`), Kontrahenci (`contractor`), Właściciel umowy (`owner`), Rodzaj umowy (`domain_id`), Charakter umowy (`contract_nature_id`), Data zakończenia (`date_end`), NIP (`nip`), checkbox „Podmiot powiązane" (`company_connected`), checkbox „tylko OBSSC" (`obsc`). Przycisk „szukaj".

### 1.3 Kolumny tabeli listy
Identyfikator, Typ dokumentu, Numer umowy, Status, Spółka, Lokalizacja, Przedmiot umowy, Wynagrodzenie, OBSC, Właściciel umowy, Buissnesline, Kontrahenci + 2 ikony akcji (ołówek=podgląd, spinacz=wskaźnik załącznika `/cru/media/img/attachment.png`).
Paginacja: `<< < 1 > >>`, „Idź do strony", „Liczba rekordów" (10/15/25/50/100/250/500, domyślnie 15), „Wyświetlanie od X do Y z Z rekordów".

### 1.4 Pełny model danych umowy (z widoku `/contract/preview/{id}`)
| Pole (etykieta) | Przykład / typ | Uwagi |
|---|---|---|
| Buissnesline | DYSTRYBUCJA / SSC | enum |
| Forma doręczenia | (brak danych) | enum/text |
| Identyfikator | AMDSP/DYS/2026/0006 | auto-generowany kod (spółka/BL/rok/nr) |
| Aneksy do umowy | relacja | lista aneksów podpiętych do tej umowy |
| Project | AMDSP/DYS/2025/P0481; | relacja do projektu/-ów (może wiele) |
| Aneks do umowy | relacja | wskazanie umowy nadrzędnej (gdy rekord jest aneksem) |
| Typ dokumentu | Umowa | enum (patrz słowniki) |
| Weksel | Nie | boolean |
| Numer umowy | text | `contract_reference` |
| Status | Zakończona | enum: Obowiązująca / Zakończona |
| Spółka | AMDSP | enum |
| Lokalizacja | Katowice | enum (~34 lokalizacje) |
| Rodzaj umowy | Usługi | enum (domain, ~31 wartości) |
| Przedmiot umowy | text długi | opis |
| Data zawarcia | 2025-12-18 | data (start) |
| Data zakończenia | 2026-01-09 | data (napędza przypomnienia w docelowym systemie) |
| Okres wypowiedzenia | „specyficzne" | enum/text |
| Wynagrodzenie | 0.00 | kwota |
| Waluta | PLN | enum |
| Termin płatności | text długi | opis |
| Kontrahenci | Hotel Lamberton Sp. z o.o. NIP: 1182274493 | relacja (z NIP) |
| Podmiot powiązane | Nie | boolean |
| Inne określenie wynagrodzenia | „9 369,75 zł brutto" | text (gdy kwota nietypowa) |
| Charakter umowy | Kosztowa | enum: Bezkosztowa/Kosztowa/Przychodowa |
| Eksport/Import | brak | enum |
| Formularz | Tak | boolean |
| Uwagi | (puste) | text |
| OBSC | Nie | boolean |
| Właściciel umowy | Włodek Karolina; Mazur Mateusz | relacja (wielu właścicieli) |
| Data rejestracji | 2026-01-16 13:30:30 | audit (auto) |
| Zarejestrowano przez | mborowiecka | audit — login użytkownika |
| Data modyfikacji | 2026-07-16 10:16:06 | audit (auto) |
| Modyfikowano przez | mgolosz | audit — login użytkownika |

### 1.5 Sekcje powiązane w podglądzie
- **Załączniki** (iframe `/files/show/{id}/`): etykieta „Wersja ostateczna:", link do PDF (`/contract/attachments/{aid}`), link ⚠️ „wyślij jako załącznik". → **integracja z plikami** (docelowo abstrakcja storage). Pliki fizyczne pod `/cru/media/…` na serwerze legacy.
- **Notatki** (iframe `/remarks/index/{id}`): przycisk „dodaj notatkę", stan „Brak uwag". Tytuł iframe: „System Zarządzania Ofertami" — **[do dopytania]** sugeruje współdzielenie modułu remarks z innym systemem ofertowym.
- **Formularz akceptacji umowy** (`/contract/acceptform/{id}`) + przycisk „…-pdf": **workflow akceptacji umowy** (generowanie PDF formularza akceptacji). **[NIEZNANE]** pełna logika akceptacji/statusów zatwierdzania — do dopytania.
- **„zadaj pytanie"** (przycisk): funkcja Q&A do umowy. **[NIEZNANE]** dokąd trafia pytanie (mail? wewnętrzne?) — do dopytania.

### 1.6 Słowniki (wyenumerowane z dropdownów) — do odtworzenia jako tabele słownikowe
- **Typ dokumentu (`type`):** Aneks, Kontrakt, List intencyjny, Porozumienie, Przetarg, Umowa, Umowa ramowa, Zlecenie
- **Buissnesline:** SSC, Dystrybucja
- **Status (`status_id`):** Obowiązująca, Zakończona
- **Spółka (`company_id`):** AMC, AMDP, AMDSP, HK POM, SSC, ST
- **Lokalizacja (`location_id`, ~34):** BCS, Białystok, Bydgoszcz, Bytom, Centrala, Centrala Katowice, Częstochowa, Dąbrowa Górnicza I, Dąbrowa Górnicza II, Gdańsk, Katowice, Kielce, Konin, Kraków, Kuków Folwark, Lublin, Łazy, Łódź, Mielec, Olkusz, Olsztyn, Opole, Piła, Rawa Mazowiecka, Rzeszów, Skawina, Słupsk, Starachowice, Suwałki, Szczecin, Świętochłowice, Wałbrzych, Warszawa, Wrocław
- **Rodzaj umowy (`domain_id`, ~31):** Finanse/Księgowość, Flota, Handlowe, Handlowe - Zbrojarnia, Informatyka/Teleinformatyka, Inne, Jakościowe, Kolejowe, Leasing, Logistyczne, Media, Najem/Dzierżawa, Ochrona środowiska, Personalne, Porozumienie, Prawne, Reklama, Skład konsygnacyjny, Transport/Spedycja, Umowa agencyjna, Umowa bonusowa, Umowa o poufności, Umowa pośrednictwa, Umowa powierzenia (RODO), Umowa prowizyjna, Umowa serwisowa, Usługi, Utrzymanie ruchu, Windykacja, Zakupy - materiały handlowych, Zakupy - nieprodukcyjne
- **Charakter umowy (`contract_nature_id`):** Bezkosztowa, Kosztowa, Przychodowa
- **Waluta:** PLN (+ inne — [do potwierdzenia pełnej listy])
- **Właściciel umowy (`owner`):** słownik osób (pracownicy), setki pozycji; sufiks „[na]" = prawdopodobnie „nieaktywny". Format „Nazwisko Imię".
- **Kontrahenci (`contractor`):** słownik z tysiącami firm (autocomplete), z NIP.

### 1.7 Uprawnienia (widoczne z konta Mati)
Konto Mati widzi wszystkie 10 pozycji menu, ale realny dostęp ma tylko do **Umowy** i **Projekty** — patrz mapa uprawnień w sekcji 10. Nie testujemy innych ról (brak dostępu, zgodnie z zasadami).

---

## 2. Moduł PROJEKTY (`/cru/index.php/project`) — dostęp OK, ale 0 rekordów w widoku Mati

**Czym jest projekt:** to encja **przed-umowna** — proces doprowadzenia do podpisania umowy (opiniowanie → wysłanie do podpisu → obieg FAU → umowa/rezygnacja). Projekt „staje się" umową po zakończeniu obiegu. Silnie pokrywa się polami z Umową + dokłada workflow akceptacji.

### 2.1 Routing
- `/project` — lista (jTable, „Project List").
- **[NIEZNANE]** endpoint podglądu/edycji projektu. Na stronie zdefiniowane są funkcje `openPreview`/`openPreview2` wskazujące na `/contract/preview/...` (współdzielone z umowami); możliwe, że projekt ma osobny `/project/preview/{id}` — niezweryfikowane (0 rekordów w widoku Mati, brak wiersza do kliknięcia).

### 2.2 Formularz wyszukiwania
Pola: Identyfikator (`identifier`), **drugi identyfikator (`identifier2`)** [do wyjaśnienia — może zakres „od–do" albo id alternatywny], Numer umowy (`contract_reference`), NIP (`nip`), checkbox „Podmiot powiązane" (`company_connected`), + selecty: `type`, `buissnesline_id`, `status_id`, `company_id`, `location_id`, `contractor`, `owner`, `domain_id` (te same słowniki co Umowy, poza statusem).

### 2.3 Kolumny listy
Identyfikator, Status, Właściciel umowy, Kontrahenci, Przedmiot umowy, **Ostatnia notatka**, **Opiniujący**, **Wysł. do podp.** (wysłane do podpisu). Ostatnie trzy kolumny to elementy workflow, których nie ma na liście umów.

### 2.4 Statusy projektu (`status_id`) — WŁASNY cykl życia (inny niż umowy)
- Projekt - w toku
- Projekt - wysłane do podpisu
- Projekt - rozpoczęto obieg FAU
- Projekt - zakończono obieg FAU
- Projekt - zakończony
- Projekt - zrealizowany brak umowy
- Projekt - anulowany

**FAU = Formularz Akceptacji Umowy** — ten sam obiekt co „Formularz akceptacji umowy" w podglądzie umowy (`/contract/acceptform/{id}`). „Obieg FAU" = wewnętrzny obieg akceptacyjny dokumentu przed podpisem. Powiązane: raport „zaległe opinie" (`/raport/opinions`) i kolumna „Opiniujący".

### 2.5 Pełny model danych projektu
**[NIEZNANE / do zweryfikowania na rekordzie]** — pełny zestaw pól detalu projektu (0 rekordów w widoku Mati). Zakładany wstępnie: pola jak w Umowie + pola workflow (opiniujący, daty wysłania do podpisu, obieg FAU). Do potwierdzenia gdy będzie dostęp do projektu z rekordami.

---

## 3.–8. Moduły ZAMKNIĘTE dla konta Mati (`Access deny!`)

Wszystkie poniższe zwróciły komunikat **„Access deny!"** / „access deny" z konta Mati — czyli są bramkowane rolą, a to konto ich nie ma. Wnętrza NIE da się zaudytować z tego konta (zgodnie z zasadami: nie zgadujemy, nie logujemy się na inne role).

| Moduł | URL | Wynik z konta Mati |
|---|---|---|
| Dział ryzyka | `/cru/index.php/risk` | ⛔ Access deny! |
| Supply chain | `/cru/index.php/supplychain` | ⛔ Access deny! |
| Kontrahenci | `/cru/index.php/contractor` | ⛔ access deny |
| Grupy | `/cru/index.php/groups` | ⛔ access deny |
| Lokalizacja dostępy | `/cru/index.php/locations` | ⛔ access deny |
| Dostępy | `/cru/index.php/access` | ⛔ Access deny! |
| Mailing | `/cru/index.php/mailmanagments/index` | ⛔ Access deny! |
| Raporty (wszystkie) | `/cru/index.php/raport/*` | ⛔ access deny (test: `/raport/umowy`) |

**Co wiemy pośrednio (z menu / linków, bez wejścia do środka):**
- **Kontrahenci** — słownik firm (widoczny pośrednio jako dropdown `contractor` w Umowach/Projektach; tysiące pozycji, z NIP). Prawdopodobnie tu jest CRUD kontrahentów. Docelowo tu wejdzie integracja REGON (Faza 2 planu).
- **Grupy / Lokalizacja dostępy / Dostępy** — moduły uprawnień/administracji (grupy użytkowników, przypisanie lokalizacji, dostępy). To odpowiednik modelu ról legacy.
- **Mailing** (`/mailmanagments`) — zarządzanie mailami (prawdopodobnie szablony/wysyłki/przypomnienia). Powiązane z docelową Fazą 3 planu (przypomnienia e-mail).
- **Raporty** — dropdown z gotowymi raportami/eksportami: `/raport/umowy`, `/raport/projekty?limit=&offset=` (paginowany do 4000/5000 → tysiące projektów), `/raport/ryzyka`, `/raport/kontrahenci`, `/raport/supplychain`, `/raport/opinions` („zaległe opinie"). To widoki/eksporty danych zbiorczych.
- **Dział ryzyka / Supply chain** — osobne rejestry/moduły procesowe. Przeznaczenie **[NIEZNANE]** — brak dostępu. Istnienie raportów `/raport/ryzyka` i `/raport/supplychain` sugeruje, że to pełnoprawne rejestry z własnymi danymi.

---

## 9. Panel `/admin` — OSOBNA aplikacja vendora („W.B. Projekt")

- `http://10.222.125.213/admin/index.php` → redirect na `/admin/index.php/users/login`, **tytuł „W.B. Projekt"**.
- Własny, niezależny system logowania (Login/Hasło + linki „new user"/`users/register`, „list"/`users`, „(logout)"). Sesja CRU Mati **nie** przechodzi — to odrębna aplikacja/auth.
- Interpretacja: `/admin` to **backend administracyjny dostawcy oprogramowania** (prawdopodobnie „W.B. Projekt" = firma/autor systemu), zarządzający całą platformą (która hostuje CRU oraz — patrz tytuł iframe notatek „System Zarządzania Ofertami" — także moduł ofertowy).
- **Poza zakresem repliki** — to nie jest część aplikacji użytkownika CRU, tylko panel vendora. Nie odtwarzamy.

---

## 10. Mapa uprawnień konta Mati (kluczowe ograniczenie audytu)

| Dostęp | Moduły |
|---|---|
| ✅ Pełny odczyt | **Umowy** (`/contract`) |
| ✅ Dostęp, 0 rekordów w widoku | **Projekty** (`/project`) |
| ⛔ Access deny | Ryzyko, Supply chain, Kontrahenci, Grupy, Lokalizacje, Dostępy, Mailing, Raporty |
| 🔒 Osobna aplikacja | `/admin` („W.B. Projekt", własny login) |

**Wniosek:** konto Mati to **rola ograniczona** (nie admin) — realnie audytowalne 1:1 są tylko **Umowy** i **Projekty**. Żeby zinwentaryzować pozostałe moduły „na maks" (pola, słowniki, workflow, CRUD), potrzebny jest **dostęp z konta o wyższych uprawnieniach** (admin/edytor z dostępem do tych modułów). To realny sufit tego, co widać z obecnego konta — patrz sekcja 11.

---

## 11. Otwarte pytania / blockery / rzeczy do dopytania

1. **[BLOCKER dla pełnej Fazy 0a]** Dostęp do modułów Ryzyko / Supply chain / Kontrahenci / Grupy / Lokalizacje / Dostępy / Mailing / Raporty — czy Mati może dostać konto admina lub czy ktoś z dostępem może przejść ze mną te ekrany? Bez tego zostają jako „istnieją, ale wnętrze nieznane".
2. **Model ról/uprawnień legacy** — jak działa (grupy + lokalizacje + dostępy)? Kluczowe dla odtworzenia autoryzacji w replice.
3. **Endpoint dodawania/edycji umowy i projektu** — nie zaobserwowany (ikona „Edit Record" otwiera podgląd, nie edycję). Jak wygląda formularz dodawania/edycji? (Prawdopodobnie wymaga konta z prawem edycji.)
4. **Workflow FAU (akceptacja umowy)** — pełna logika obiegu: kto opiniuje, jakie kroki, jak generowany PDF, przejścia statusów projektu. Widoczne fragmenty: „Formularz akceptacji umowy", „obieg FAU", „Opiniujący", „zaległe opinie".
5. **Funkcja „zadaj pytanie"** w podglądzie umowy — dokąd trafia (mail? wewnętrzny wątek?).
6. **Moduł „remarks" / iframe „System Zarządzania Ofertami"** — czy notatki są współdzielone z osobnym systemem ofertowym? Jak to się ma do CRU?
7. **Pole `identifier2` w wyszukiwarce projektów** — znaczenie.
8. **Pełna lista walut** i pełne słowniki modułów zamkniętych (statusy ryzyka, supply chain itd.).
9. **Załączniki** — pełny mechanizm (typy plików, „Wersja ostateczna" vs inne wersje, gdzie fizycznie leżą — `/cru/media/…`). Istotne dla abstrakcji storage w replice.
10. **Bug legacy do NIEodtwarzania:** przełącznik PL wskazuje na `?lang=en` (zepsuty) — w replice zrobić poprawnie.

> **Status audytu:** walkthrough zakończony w zakresie dostępnym z konta Mati. Umowy — kompletnie. Projekty — struktura + workflow (bez detalu rekordu). Pozostałe moduły — zablokowane rolą, opisane pośrednio. Dalszy postęp zależy od dostępu z konta o wyższych uprawnieniach (blocker #1).
