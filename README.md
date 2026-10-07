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
  kontrahenci, słowniki. Załączniki (39 281 plików, 48 GB) są w OneDrive i czekają na
  podpięcie przez Microsoft Graph — w wersji testowej są wyłączone.
- **Co dalej:** zgoda IT i dostęp do plików przez Graph → uprawnienia do odczytu
  (specyfikacja 03) → decyzja o docelowym hostingu.

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
| Pliki | Pobieranie tylko zarejestrowanych załączników, bezpieczne typy w przeglądarce; magazyn wymienny (`STORAGE_DRIVER`: `local` / `none`, docelowo SharePoint) |
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
