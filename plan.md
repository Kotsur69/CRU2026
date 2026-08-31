# CRU2026 — Plan wdrożenia

> **KIERUNEK 2026-08-31 (obowiązujący).** Korekta kierunku z 31.07. Nowa aplikacja **nie pracuje już na bazie legacy** — budujemy **własną bazę PostgreSQL** i **migrujemy do niej dane** ze zrzutu `cru.sql`. Stack: **Next.js 14 (App Router) + TypeScript + Prisma**. Adobe Acrobat Sign pozostaje główną nową funkcją. Konsekwencja dla cutoveru: zamiast nadpisywania plików `.php` na żywej bazie robimy **równoległy bieg + datowany cutover danych**. Poprzednie ujęcia: kierunek 31.07 („nadpisujemy `.php`, ta sama baza MySQL, bez migracji"), pivot 17.07 (strangler) i greenfield 15.07 — wszystkie **nieaktualne**, zapis historyczny w `status_projektu.md` i w gicie. Master-prompty Fazy 0 (`master_prompt_faza0_audyt_replika.md`, `master_prompt_faza0c_szkielet.md`) są nieaktualne.

## Dlaczego zmiana (podstawa techniczna)
Zrzut `cru.sql` (45,7 MB, 447 528 linii, 35 tabel) pokazał trzy rzeczy, które przesądziły sprawę:

1. **Serwer legacy to MySQL 5.1.73.** Prisma wymaga MySQL 5.6+. Praca wprost na tej bazie oznaczałaby porzucenie Prismy albo utrzymywanie ręcznego SQL-a przeciwko silnikowi bez wsparcia od 2013 r. To niezależny od preferencji argument techniczny.
2. **`users` w CRU to VIEW, nie tabela.** Widok czyta z zewnętrznej bazy katalogowej `am_admin` (`users JOIN users_systems WHERE system_id = 7`), której w zrzucie nie ma. Nie dostaliśmy żadnych loginów, nazwisk ani hashy haseł — tylko całkowite `user_id` referencjonowane z umów, opinii i notatek. **Tożsamość musimy przejąć na własność**, niezależnie od reszty decyzji.
3. **Umowy, Projekty i Dział ryzyka to jedna tabela.** Dyskryminatorem jest `contract_status.project` (0 = Umowy, 1 = Projekty, 2 = Dział ryzyka). Nie ma osobnej encji „projekt". To zamyka otwarte pytanie o „schemat modułu `/project`".

Dodatkowo zrzut wyjaśnił `Access deny` na ośmiu modułach: tabela `access` definiuje 10 wymiarów widoczności, a `useraccess(user_id, key, access_id)` przydziela je punktowo. Moduł Projekty (`access_id = 9`) ma dziś nadanych **5 użytkowników** — konto Mati nie było wśród nich.

## Cel
Przejąć rolę istniejącego systemu CRU (CakePHP + MySQL 5.1, serwer w Bytomiu `10.222.125.213`) i zastąpić go aplikacją utrzymywaną wewnętrznie: **Next.js + PostgreSQL**, z **jednorazową migracją danych historycznych** ze zrzutu MySQL. Bez utraty historii — klucze główne z legacy zachowujemy 1:1, żeby przez cały okres równoległego biegu dało się rekoncyliować rekord po rekordzie.

Drugi, równorzędny cel: **masowe elektroniczne podpisywanie umów przez Adobe Acrobat Sign**. Umowa idzie w chmurze do podpisu przez kolejne „ważne osoby" (multi-signer, podpis prawnie honorowany), **bez pobierania pliku** na komputer podpisującego — podpis na stronie w przeglądarce. Po skompletowaniu podpisów podpisany PDF wraca do naszego storage.

Kolejność jest świadoma: **najpierw wartość (podpis), na końcu cutover**. Cutover to najbardziej nieodwracalny krok w całym projekcie i nie robimy go, zanim nowa aplikacja nie udowodni się na zmigrowanych danych produkcyjnych.

## Architektura
- **Frontend + backend:** Next.js 14 (App Router) + TypeScript, Server Components do odczytu, Server Actions do zapisu. Jedna aplikacja, jedno repo (`nextjs_space/`).
- **ORM:** Prisma 6.7. Schemat w `nextjs_space/prisma/schema.prisma` — 29 modeli odwzorowujących 35 tabel legacy.
- **Baza:** **własny PostgreSQL 16.** Dev lokalnie (przenośne binaria w `~/pgsql`, bez uprawnień administratora), prod w Dockerze (`postgres:16-alpine`, `docker-compose.yml`). Baza trzyma **wyłącznie metadane**, nigdy plików.
- **Migracja danych:** ETL w `nextjs_space/scripts/legacy/` (`dump-parser.ts` + `import.ts`, `yarn db:import`). Parser strumieniowy, świadomy cudzysłowów; obsługuje sentinele `0000-00-00` (22 384 wystąpienia), trójstanowe boole `-1/0/1` i soft delete. Klucze legacy zachowane.
- **Tożsamość:** własna. `User.id` = legacy id z katalogu `am_admin`; import tworzy rekordy-zaślepki (`isPlaceholder`) dla każdego referencjonowanego id, nieaktywne i bez hasła, do czasu aż dostaniemy eksport katalogu. NextAuth (credentials + bcrypt).
- **Pliki umów:** baza trzyma tylko metadane załącznika (`Attachment.storageKey` = legacy `path`, czyli `attachments/<md5>.pdf`). Bajty za `StorageAdapter` — dev: eksport bytomski w `nextjs_space/storage-local/attachments/` (49 GB, katalog w `.gitignore`, `STORAGE_LOCAL_ROOT="./storage-local"`); prod: do rozstrzygnięcia (serwer bytomski / SharePoint / AWS). Zmiana magazynu nie dotyka schematu. Uwaga: dla 7 plików legacy zapisało na dysku ucięte rozszerzenie, więc adapter rozwiązuje klucz **po stemie md5**, gdy trafienie 1:1 zawiedzie.
- **Podpis:** Adobe Acrobat Sign — hosted link (odbiorcy dostają maila, podpisują w przeglądarce Adobe), odbiorcy w kolejności, webhook oddaje podpisany PDF. Embedded signing = opcjonalny polish na później, NIE na start.
- **Wygoda po naszej stronie:** lista umów z checkboxami (bulk-select) + preset odbiorców + jeden przycisk „Wyślij do podpisu" + dashboard statusów (wysłane / u kogo teraz / podpisane).
- **Hosting:** dev lokalnie u Mati → prod w **Dockerze** (`docker compose`), Nginx reverse proxy. **NIE na prywatnym komputerze.** ⚠️ **Do rozstrzygnięcia:** wewnętrzny serwer w Katowicach czy serwer bytomski.
- **Sieć:** aplikacja i baza po naszej stronie; z Bytomia potrzebujemy już tylko **plików PDF** i (jednorazowo) zrzutów danych do kolejnych przebiegów migracji. Publicznie wystawiony **jeden endpoint HTTPS** (Let's Encrypt, osobna domena) — wyłącznie dla Adobe.
- **Sekrety** (`DATABASE_URL`, `NEXTAUTH_SECRET`, klucze Adobe) w `.env`, nigdy w kodzie i nigdy w gicie.

## Zasady integralności i bezpieczeństwa migracji
Nie piszemy już do produkcyjnej bazy legacy — ryzyko przenosi się z „rozjechania CakePHP" na „rozjechanie się dwóch rejestrów w czasie". Stąd:

1. **Klucze główne z legacy zachowane 1:1.** Każdy rekord w Postgresie da się zestawić z rekordem w MySQL po id. To jedyny sposób na sensowną rekoncyliację podczas równoległego biegu.
2. **Import jest idempotentny i powtarzalny.** Kolejne zrzuty można wgrywać ponownie; ETL wymusza kolejność zależności, deduplikuje tabele łączące i **zeruje wiszące klucze obce, licząc je** (ostatni przebieg: 93 na 457 542 wiersze — `mailing_lists.mailing_group_id` 54, `contract_has_location.contract_id` 25, `contract.parent_id` 8, `contract.buissnesline_id` 4, `opiniontypes.group_id` 1, `contract_users.user_id` 1).
3. **Kolumny o niepotwierdzonej semantyce przenosimy, nie kasujemy** (`bill`, `sps_id`, `sps_last_version`). Skasowanej kolumny nie da się odtworzyć po cutoverze.
4. **Weryfikacja zgodności przed cutoverem:** liczności per tabela, sumy kwot per rok, próbki rekordów porównane ekran-w-ekran ze starym UI. Osobno **rekoncyliacja plików**: `yarn db:verify-files` zestawia każdy `Attachment.storageKey` z magazynem i kończy się kodem 1, jeśli czegoś brakuje.
5. **Backup PDF** przed nadpisaniem podpisaną wersją; nadpisanie atomowe.
6. **Data cutoveru jest twarda.** Od ustalonego momentu rejestracja nowych umów idzie **wyłącznie** do nowego systemu; legacy przechodzi w tryb tylko-do-odczytu. Delta z okresu równoległego biegu domigrowana ostatnim przebiegiem ETL.
7. **Legacy zostaje żywe (read-only) przez ustalony okres karencji** jako punkt odniesienia — nie kasujemy go w dniu cutoveru.
8. **Pełna kopia katalogu aplikacji `.php` i bazy MySQL przed cutoverem** — to jedyny egzemplarz kodu legacy, jaki istnieje (brak repo, brak dostępu do źródeł vendora). Kopia off-site, zweryfikowana.

## Fazy

### Faza 0 — Dostęp i prereki (BLOKUJĄCA, częściowo odblokowana)
- ✅ **Zrzut bazy legacy — mamy.** `cru.sql` (schemat + dane) zdjął z listy blokad zrzut schematu, model modułu `/project` i pytanie o hashing haseł (nie ma hashy — `users` to widok na zewnętrzny katalog).
- ✅ **Katalog PDF — mamy.** Eksport `CRU260811` (39 280 plików, 49 GB) pokrywa **99,98 %** rekordów `Attachment`. Zostaje 8 rekordów bez pliku i 17 plików bez rekordu — wypisuje je `yarn db:verify-files`.
- **Nadal potrzebne z Bytomia:** zgoda na docelowe wygaszenie aplikacji legacy oraz wyjaśnienie 8 brakujących załączników.
- **Nowe:** **eksport katalogu użytkowników `am_admin`** (id, login, imię, nazwisko, e-mail, status) — bez tego wszyscy użytkownicy są zaślepkami i nikt poza kontem serwisowym się nie zaloguje.
- Adobe: konto Acrobat Sign z dostępem API (business/enterprise, OAuth server-to-server) + sandbox developerski. **Płatny prereq — potwierdzić, czy firma ma.**
- Poziom podpisu z działem prawnym (zwykły e-podpis eIDAS vs kwalifikowany QES).
- Security/compliance sign-off (poufne dane; **uwaga: przy własnym Postgresie na infrastrukturze firmowej temat rezydencji danych dotyczy już tylko chmury Adobe**, nie samego rejestru).

### Faza 1 — Baza, schemat, migracja
- PostgreSQL 16 postawiony lokalnie (dev) i w Dockerze (prod).
- `prisma migrate` — schemat wdrożony.
- `yarn db:import` — pełny przebieg ETL na `cru.sql`, raport liczności i wiszących kluczy.
- Auth: NextAuth (credentials + bcrypt), konto serwisowe do bootstrapu; konta użytkowników po eksporcie katalogu.

### Faza 2 — Odtworzenie modułów Umowy i Projekty (read)
- Lista, filtry, podgląd rekordu, aneksy, załączniki, obieg FAU — czytane z Postgresa.
- Weryfikacja zgodności 1:1 ze starym UI (zasada 4 wyżej).

### Faza 3 — Zapisy i pełny cykl życia umowy
- Dodawanie/edycja umów, aneksów, kontrahentów, załączników, notatek, opinii.
- Audit log (`ContractHistory`) — legacy ma własną historię zmian, utrzymujemy ją dalej.

### Faza 4 — Adobe Acrobat Sign
- Bulk checkbox-select umów + **preset odbiorców** (kolejność podpisów).
- PDF ze storage → agreement w Adobe → wysyłka (maile z linkiem).
- Webhook „completed" → pobranie podpisanego PDF → backup + zapis nowej wersji.
- Dashboard statusów: wysłane / u kogo teraz / podpisane.

### Faza 5 — Cutover: równoległy bieg i datowany przełącznik
- Równoległy bieg: oba systemy widoczne, nowy zasilany kolejnymi przebiegami ETL, rekoncyliacja po id.
- Data cutoveru: rejestracja nowych umów tylko w nowym systemie, legacy → read-only.
- Ostatni przebieg ETL domigrowuje deltę z okresu równoległego.
- Pełna kopia katalogu `.php` i bazy MySQL (zasada 8), okno serwisowe, komunikacja do ~100 użytkowników, dyżur po przełączeniu, karencja legacy w trybie read-only.

### Faza 6 — Pozostałe moduły i utwardzenie
- Odtworzenie modułów, których audyt nie objął (Dział ryzyka, Supply chain, Kontrahenci, Grupy, Lokalizacja dostępy, Dostępy, Raporty, Mailing). **Zakres jest już znany ze schematu** — wszystkie mają odpowiedniki w `schema.prisma`; wycena przestała być niemożliwa.
- Deploy produkcyjny (Docker), HTTPS + domena dla endpointu Adobe, przełączenie Adobe z sandboxa na produkcję.
- Testy end-to-end, weryfikacja backupów, security review (reguły ECC).
- (Opcjonalnie później) embedded signing zamiast hosted link — polish, nie na start.

## Poza zakresem tego kierunku
Nie robimy teraz: Entra ID SSO, integracji REGON/GUS, przypomnień e-mail o końcu umów, AI Copilota. Uwaga: przy własnej bazie i własnej tożsamości **żadna z tych rzeczy nie jest już blokowana architekturą** — to kwestia priorytetu, nie wykonalności. Historia decyzji: `status_projektu.md` i git.

## Otwarte pytania / prereki
- **Eksport katalogu `am_admin`** (nowe, blokujące logowanie realnych użytkowników).
- 8 załączników obecnych w bazie, ale nieobecnych w eksporcie plików — do wyjaśnienia z administratorami serwera bytomskiego.
- Zgoda vendora („W.B. Projekt") na wygaszenie jego aplikacji — czy „lifetime support" ma zapisy, które to blokują.
- Gdzie stoi produkcja: wewnętrzny serwer w Katowicach czy serwer bytomski.
- Docelowy magazyn plików: serwer bytomski / SharePoint / AWS (`StorageAdapter` izoluje tę decyzję).
- Konto Adobe API + licencja (płatny prereq).
- Poziom podpisu (zwykły vs QES) — dział prawny.
- Model „ważnych osób" podpisujących — stały preset czy definiowany per-umowa? (wpływa na UI Fazy 4)
- Semantyka kolumn `bill`, `sps_id`, `sps_last_version` — przeniesione „na wszelki wypadek", do potwierdzenia z użytkownikami.
