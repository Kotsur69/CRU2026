# CRU2026 — Rejestr umów (AMDS CRU)

Wewnętrzny system zarządzania umowami ArcelorMittal — **własny rejestr umów**
(metadane + załączniki), z kalendarzem końca umów i przypomnieniami o
odnowieniu/wypowiedzeniu. Odtworzenie (replika) legacy „AMDS CRU" w nowoczesnym
stacku. **NIE** jest połączony z żadnym państwowym rejestrem umów.

> 🔒 **Repozytorium prywatne — wewnętrzne.** Zawiera strukturę organizacyjną
> (spółki, lokalizacje) oraz materiały z audytu systemu legacy. Nie upubliczniać.

## Status
**Faza 0c — szkielet** (wierne 1:1 odtworzenie funkcjonalne, read-first).
Historia i plan: [`status_projektu.md`](status_projektu.md), [`plan.md`](plan.md).

## Struktura repo
```
nextjs_space/                 # aplikacja (Next.js 14 + TS + Prisma/Postgres)
historia_wersji/              # audyt legacy, branding, opis aplikacji
master_prompt_faza0_*.md      # prompty prowadzące fazy audytu/repliki
master_prompt_faza0c_*.md
plan.md                       # plan faz
status_projektu.md            # log stanu projektu
```

## Stack
Next.js 14 (App Router) · TypeScript · Prisma + **PostgreSQL** (tylko metadane) ·
NextAuth (natywny login, bez SSO) · Tailwind · abstrakcja `StorageAdapter` na pliki
(docelowo fizyczny serwer / SharePoint / S3). Branding ArcelorMittal.

## Uruchomienie (dev)
Cała aplikacja żyje w [`nextjs_space/`](nextjs_space/). Najszybciej:
```powershell
cd nextjs_space
.\start.ps1          # env -> deps -> Postgres(pgportable) -> rola/baza -> schemat -> seed -> dev
```
Aplikacja: **http://localhost:3100** · login **admin / admin123**.
Szczegóły i wariant ręczny: [`nextjs_space/README.md`](nextjs_space/README.md).

> Wymaga lokalnego Postgresa — na tej maszynie przenośny **pgportable**
> (`C:\Users\mmazur\pgportable`, dane w `C:\Users\mmazur\pgdata`); Docker nie jest
> potrzebny. Skrypt sam wykrywa/startuje bazę i zakłada rolę `cru` + bazę `cru2026`.
> Alternatywnie własny `DATABASE_URL`. Pliki załączników **nigdy** nie trafiają do bazy.

## Zakres
**Jest (Faza 0c):** natywny login, layout (10 modułów), moduł **Umowy**
(lista + wyszukiwarka + paginacja + podgląd 34 pól), szkielet **Projektów**,
placeholdery pozostałych modułów, abstrakcja plików, seed słowników z audytu.

**Świadomie NIE ma (kolejne fazy):** REGON/GUS (F2), przypomnienia e-mail (F3),
import historyczny (F4), audit-log/hardening (F5), AI copilot (F6), edycja/dodawanie
umów (read-first), funkcja „wyślij jako załącznik", panel `/admin`, raportowanie do
państwowego CRU.
