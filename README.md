# CRU2026 — Rejestr umów (AMDS CRU)

Wewnętrzny system zarządzania umowami ArcelorMittal, który zastępuje legacy
„AMDS CRU” (CakePHP + MySQL 5.1, serwer w Bytomiu). Własna baza PostgreSQL z danymi
zmigrowanymi ze starego systemu, nowoczesny stack, a jako główna nowa funkcja —
masowe podpisywanie umów przez Adobe Acrobat Sign (później). **NIE** jest połączony
z żadnym państwowym rejestrem umów.

> 🔒 **Repozytorium prywatne — wewnętrzne.** Zawiera strukturę organizacyjną
> (spółki, lokalizacje) oraz materiały z audytu systemu legacy. Nie upubliczniać.

## Status (2026-10-07) — wersja 0.3, testy wewnętrzne

- **Wersja testowa:** https://cru-2026-deployed.vercel.app — Vercel + baza Neon
  (Frankfurt, UE). Dostęp tylko dla kilku zaufanych testerów (konta `test1`–`test5`).
- **Dane:** zmigrowane ze zrzutu legacy — ok. 20 tys. rekordów (10 735 aktywnych umów),
  kontrahenci, słowniki. Załączniki (39 281 plików, 48 GB) są w OneDrive; adapter
  SharePoint jest gotowy, ale w wersji testowej pliki są wyłączone do czasu zgody IT
  (patrz [Na co czekamy od IT](#na-co-czekamy-od-it)).
- **Co dalej:** zgoda IT i dostęp do plików przez Graph → uprawnienia do odczytu
  (specyfikacja 03) → decyzja o docelowym hostingu.

## Na co czekamy od IT

Prośba wysłana 2026-10-07 (przez przełożonego). Bez niej aplikacja widzi w bazie, że
załącznik istnieje, ale nie może go otworzyć ani pobrać.

| # | Prośba | Po co |
|---|---|---|
| 1 | Witryna SharePoint „CRU2026” (albo biblioteka w istniejącej witrynie) | Miejsce na załączniki niezależne od jednej osoby (dziś leżą tymczasowo na OneDrive Mati) |
| 2 | Rejestracja aplikacji „CRU2026 Files” w Entra ID (single tenant, client secret lub certyfikat) | Tożsamość aplikacji w Microsoft 365 — sami nie mamy uprawnień do jej utworzenia |
| 3 | Uprawnienie Microsoft Graph **`Sites.Selected` (Application)** + admin consent + grant **`read`** tylko na witrynę z pkt 1 | Aplikacja czyta wyłącznie tę jedną witrynę — nic nie zapisuje, nie usuwa i nie widzi innych dokumentów |
| 4 | Akceptacja wersji testowej na Vercel + Neon (region UE) | Dane umów u zewnętrznych dostawców na czas testów |

Od IT wracają trzy wartości: **Directory (tenant) ID**, **Application (client) ID** i
**client secret** (z datą wygaśnięcia). Sekret trafia wyłącznie do ustawień Vercela —
nigdy do czatu, maila ani repozytorium.

## Włączenie załączników (dla osoby wdrażającej)

Kod jest gotowy (`nextjs_space/lib/storage/sharepoint-adapter.ts`, tylko odczyt).
Po odpowiedzi IT:

1. **Pliki:** wgraj folder `attachments` (39 281 plików, nazwy bez zmian — muszą
   zgadzać się z kluczami w bazie) do biblioteki dokumentów witryny. Źródło: OneDrive
   `CRU2026\attachments` albo `nextjs_space/storage-local/attachments`.
2. **Vercel → Settings → Environment Variables:**

   | Zmienna | Wartość |
   |---|---|
   | `STORAGE_DRIVER` | `sharepoint` (zamiast `none`) |
   | `GRAPH_TENANT_ID` | Directory (tenant) ID od IT |
   | `GRAPH_CLIENT_ID` | Application (client) ID od IT |
   | `GRAPH_CLIENT_SECRET` | client secret od IT — typ **Secret** |
   | `GRAPH_SITE_URL` | adres witryny, np. `https://arcelormittal.sharepoint.com/sites/CRU2026` |
   | `GRAPH_ROOT_FOLDER` | folder w bibliotece, w którym leży `attachments/` (puste = katalog główny biblioteki) |
3. **Redeploy** (Deployments → najnowszy → ⋯ → Redeploy).
4. **Sprawdzenie:** zaloguj się, otwórz umowę z załącznikiem i kliknij plik — powinien
   się pobrać. Błąd 502 „Magazyn plików chwilowo nie odpowiada” = złe dane od IT albo
   brak grantu na witrynę (szczegóły w Vercel → Logs).
5. **Kalendarz:** client secret wygasa (zwykle 6–24 mies.) — przed datą wygaśnięcia
   poproś IT o nowy i podmień `GRAPH_CLIENT_SECRET`.

Wgrywanie nowych plików pozostaje wyłączone (komunikat 503), dopóki aplikacja nie
dostanie także uprawnienia do zapisu. Wycofanie: `STORAGE_DRIVER=none` + Redeploy.
Pełny runbook: [`docs/deployment.md`](docs/deployment.md).

Szczegóły: [`status_projektu.md`](status_projektu.md) (stan i log),
[`docs/deployment.md`](docs/deployment.md) (wdrożenie i bezpieczeństwo),
[`plan.md`](plan.md) (fazy), raporty wersji w `historia_wersji/Historia wersji/`.

## Co działa

| Obszar | Zakres |
|---|---|
| Rejestry | **Umowy, Projekty, Dział ryzyka** — filtry, stronicowanie, wybór kolumn, podgląd rekordu |
| Formularz | Dodawanie i edycja wpisu: aneksy, załączniki, kontrahent, właściciel, lokalizacje; generowanie numeru umowy, uprawnienia do zapisu |
| Moduły pomocnicze (odczyt) | Kontrahenci, Grupy, Lokalizacje, Dostępy, Raporty, Mailing |
| Logowanie | Natywny login + hasło (bcrypt), blokada po 5 błędnych próbach, limit z IP, dziennik prób, sesje 8 h / 12 h, unieważnianie sesji po zmianie hasła |
| Moje konto | Każdy użytkownik zmienia swoje imię, nazwisko i hasło (`/konto`) |
| Pliki | Pobieranie tylko zarejestrowanych załączników, bezpieczne typy w przeglądarce; magazyn wymienny (`STORAGE_DRIVER`: `local` / `none` / `sharepoint` — ten ostatni czeka na IT) |
| Bezpieczeństwo strony | CSP, HSTS, zakaz osadzania w ramkach i inne nagłówki |

**Jeszcze nie ma:** uprawnienia do odczytu per umowa (spec 03 — do tego czasu każdy
zalogowany widzi wszystko), załączniki w wersji chmurowej, podpis Adobe Sign, historia
zmian / notatki / obieg opinii (dane są w bazie, ekranów brak), eksport do Excela,
panel administracji kontami, logowanie kontami firmowymi.

## Dokumentacja funkcji

[`docs/features/`](docs/features/) — 34 specyfikacje (każda funkcja starego systemu:
co robiła, jakie dane, co odtwarzamy, co zmieniamy, jak sprawdzić) i lista pytań
otwartych w [`docs/features/README.md`](docs/features/README.md).

## Struktura repo
```
nextjs_space/          # aplikacja (Next.js 14 + TypeScript + Prisma + PostgreSQL)
docs/deployment.md     # wdrożenie, zmienne, bezpieczeństwo, runbook
docs/features/         # 34 specyfikacje funkcji
historia_wersji/       # raporty wersji, audyt legacy, branding, opis aplikacji
plan.md                # plan faz
status_projektu.md     # stan projektu + log sesji
cru.sql                # zrzut bazy legacy (lokalnie, poza gitem)
```

## Stack
Next.js 14 (App Router) · React 18 · TypeScript · Tailwind · Prisma 6 + PostgreSQL ·
NextAuth (Credentials, bez SSO) · `StorageAdapter` na pliki · Vercel + Neon (test).
Branding ArcelorMittal.

## Uruchomienie lokalne (dev)
Cała aplikacja żyje w [`nextjs_space/`](nextjs_space/):
```powershell
cd nextjs_space
.\start.ps1          # env -> deps -> Postgres (pgportable) -> rola/baza -> schemat -> seed -> dev
```
Aplikacja: **http://localhost:3100**. Konto `admin` dostaje hasło z `SEED_ADMIN_PASSWORD`
w `nextjs_space/.env`; nowe hasło: `yarn users:reset-password admin`.

> Lokalna baza to migawka z 2026-10-05, **niesynchronizowana** z bazą testową w Neon.
> Na tej maszynie Postgres to przenośny **pgportable** (bez uprawnień administratora).
> Pliki załączników lokalnie: `nextjs_space/storage-local/attachments` (poza gitem).
> Szczegóły i wariant ręczny: [`nextjs_space/README.md`](nextjs_space/README.md).

## Wdrożenie
Push na `main` → Vercel buduje nową wersję (jeśli nie ruszy sam: Deployments →
Create Deployment → `main`). Migracje bazy na Neon uruchamiamy ręcznie przed
wdrożeniem. Pełna procedura: [`docs/deployment.md`](docs/deployment.md).
