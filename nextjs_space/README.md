# CRU2026 — replika rejestru umów (szkielet)

Wewnętrzny rejestr umów ArcelorMittal (odtworzenie legacy „AMDS CRU"). Next.js 14
(App Router) + TypeScript + Prisma/PostgreSQL. Baza trzyma **wyłącznie metadane** —
pliki idą przez abstrakcję `StorageAdapter` (docelowo fizyczny serwer Bytom).

## Wymagania
- Node 18+ i **yarn**
- Docker (lokalny Postgres) — albo własny Postgres pod `DATABASE_URL`

## Uruchomienie (dev)

### Najszybciej — jeden skrypt (Windows/PowerShell)
```powershell
cd nextjs_space
.\start.ps1                 # env -> deps -> Postgres -> schemat -> seed -> dev
# .\start.ps1 -Fresh        # wymuś ponowny seed bazy
# .\start.ps1 -NoDev        # przygotuj wszystko, ale nie odpalaj serwera
```
Skrypt jest idempotentny — pomija kroki już wykonane. App wstaje na **http://localhost:3100**.

### Ręcznie (krok po kroku)
```bash
# 1. Zależności
yarn install

# 2. Konfiguracja
cp .env.example .env        # w razie potrzeby zmień DATABASE_URL / NEXTAUTH_SECRET

# 3. Baza (lokalny Postgres w Dockerze)
docker compose up -d

# 4. Schemat + dane słownikowe i przykładowe
yarn db:push                # utwórz tabele wg prisma/schema.prisma
yarn db:seed                # słowniki z audytu + user admin + 3 umowy

# 5. Start
yarn dev                    # http://localhost:3100
```

Logowanie testowe: **admin / admin123** (natywny login, bez SSO).

## Co jest w szkielecie
- Natywny login (NextAuth Credentials + bcrypt) i ochrona tras (`middleware.ts`).
- Layout: topbar „AMDS CRU" (przełącznik PL|EN — bez buga legacy), menu 10 modułów.
- **Umowy** (flagowy, read-first): lista z Postgresa + wyszukiwarka + paginacja
  (10–500 / stronę); podgląd `/umowy/[id]` z pełnym modelem 34 pól + sekcja Załączniki.
- **Projekty**: lista-szkielet.
- Pozostałe 8 modułów legacy: placeholdery („moduł w budowie").
- `StorageAdapter` (adapter lokalny symulujący serwer plików) + trasa `/api/files/*`.
- Branding: paleta ArcelorMittal, fonty Poppins/Gilroy.

## Czego NIE ma (świadomie — kolejne fazy)
REGON/GUS, przypomnienia e-mail, import historyczny, audit-log, AI copilot,
edycja/dodawanie umowy (read-first), funkcja „wyślij jako załącznik", panel `/admin`.

## Struktura
```
app/            # trasy (login, (app) shell, umowy, projekty, api)
components/      # layout (topbar, nav), placeholder, providers
features/umowy/  # formularz wyszukiwania
lib/             # prisma, auth, storage (adapter), nav, format, utils
prisma/          # schema.prisma
scripts/seed.ts  # seed idempotentny (słowniki z audytu)
```
