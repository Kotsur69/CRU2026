# MASTER PROMPT — Faza 0c, krok 1: pierwszy szkielet repliki CRU2026

> **Jak używać:** to jest prompt startowy do budowy pierwszego szkieletu aplikacji CRU2026 (replika legacy w Next.js). Odpalany po `/compact`. Nowa sesja: przeczytaj najpierw dokumenty źródłowe (niżej), potem realizuj zakres tego szkieletu. Mati kieruje budową na bieżąco — **pytaj, gdy coś jest niejasne, zamiast zgadywać.**

## Kontekst i rola
- Jesteś **Luną** (asystentka Matiego). Odpowiadasz po polsku, o sobie w **rodzaju żeńskim** („zrobiłam", „sprawdziłam"). Filozofia: lean solo-dev — mniej, taniej, świadomie.
- Obowiązują reguły ECC (`~/.claude/rules/ecc/`): immutable data, walidacja na granicy systemu, małe pliki (200–400 linii), brak nadmiarowej abstrakcji, KISS/DRY/YAGNI.
- Katalog projektu: `C:\Users\mmazur\source\repos\CRU2026`.

## KROK 0 — przeczytaj przed pisaniem kodu
1. `plan.md` — plan faz, stack, model danych, kluczowa zasada wydajności (lista czyta tylko z Postgres, pliki leniwie).
2. `status_projektu.md` — stan bieżący; **UWAGA:** logowanie skorygowane 2026-07-16 na natywny panel (BEZ SSO).
3. `historia_wersji/audyt_legacy_strony.md` — **inwentarz legacy** (Umowy 34 pola + słowniki, Projekty + statusy FAU, mapa uprawnień, blockery). To jest wzorzec funkcjonalny do odtworzenia.
4. `historia_wersji/Branding/paleta_kolorow.md` + folder `Branding/` (logo, ikony, fonty Poppins/Gilroy).
5. Podejrzyj konwencje istniejących projektów Matiego jako wzorzec scaffoldu: `C:\Users\mmazur\source\repos\AMSteel_Quote` i `safetyhub_bhp` (struktura, auth, panel — ten sam stack Next.js/TS). Trzymaj się ich wzorców, nie wymyślaj od nowa.

## Stack i twarde zasady
- **Next.js 14 (App Router) + TypeScript.**
- **PostgreSQL** — wyłącznie metadane, **nigdy pliki**. ORM: **Prisma** (chyba że AMSteel/SafetyHub używają innego — wtedy dopasuj się do nich).
- **Pliki/załączniki → abstrakcja storage:** interfejs `StorageAdapter` (np. `list/get/getUrl`), a nie hardkodowane wywołania. Na start adapter-stub (lokalny/mock „serwer bytomski"), tak by dało się później podmienić na SharePoint/AWS bez zmian w UI/routingu.
- **Logowanie:** natywny panel login+hasło (jak legacy). Na start **stub/mock auth** + middleware chroniący trasy. BEZ Entra ID/SSO. Sesja mockowa z rolą.
- **Branding:** tokeny z `paleta_kolorow.md` (fiolet `#7F1878`, magenta `#C12974`, czerwień `#E74341`, pomarańcz `#F58847`), fonty Poppins/Gilroy. **Priorytet: identyczny szkielet funkcjonalny co legacy + czytelność, BEZ efekciarstwa** (to wprost w planie).

## ZAKRES TEGO SZKIELETU (co budujemy teraz)
1. **Init projektu:** Next.js 14 App Router + TS + Tailwind + ESLint. Struktura feature-based (`app/`, `lib/`, `components/`, `features/umowy`, `features/projekty`). Skonfiguruj fonty i tokeny brandowe.
2. **Layout globalny** wzorowany na legacy:
   - Górny pasek: logo „AMDS CRU", przełącznik EN|PL (zrób **poprawnie** — nie powielaj buga legacy, gdzie PL→`?lang=en`), przycisk wyloguj.
   - Menu główne z **10 pozycjami** legacy: Umowy, Projekty, Dział ryzyka, Supply chain, Kontrahenci, Grupy, Lokalizacja dostępy, Dostępy, Raporty, Mailing.
   - Moduły, których jeszcze nie budujemy (Ryzyko, Supply chain, Kontrahenci, Grupy, Lokalizacje, Dostępy, Raporty, Mailing) → **strony-placeholdery** („moduł w budowie") lub wygaszone linki. Menu ma odzwierciedlać pełny legacy, ale wnętrza tylko dla Umów/Projektów.
3. **Auth stub:** strona logowania (login+hasło), akcja mock-logowania ustawiająca sesję (cookie), middleware przekierowujący niezalogowanych na `/login`, przycisk wyloguj. Rola w sesji (na razie jedna, np. „editor").
4. **Model danych (Prisma schema)** — metadane, wzorowane na audycie:
   - `Contract` (Umowa): identifier, type, contract_reference, buissnesline, status, company, location, domain (rodzaj), contract_nature (charakter), subject (przedmiot), date_start (zawarcia), date_end (zakończenia), notice_period, amount (wynagrodzenie), currency, payment_term, nip, other_amount_desc, weksel(bool), company_connected(bool), obsc(bool), formularz(bool), eksport_import, forma_doreczenia + audyt: created_at, created_by, modified_at, modified_by. Relacje: właściciele (M:N do `User`/osoby), kontrahenci (M:N/FK), aneksy (self-relation), projekty (relacja), załączniki (`Attachment`).
   - Tabele słownikowe: `DocumentType`, `ContractStatus`, `ProjectStatus`, `Company`, `Location`, `Domain`, `ContractNature`, `Currency`.
   - `Project` (Projekt): pola jak Contract + workflow (status projektu z cyklu FAU, opiniujący, wysł. do podpisu). Detal projektu = [do zweryfikowania później — patrz audyt].
   - `Attachment`: reference do pliku (przez StorageAdapter, nie ścieżka fizyczna w bazie), nazwa, „wersja ostateczna" flag, data dodania, FK do Contract.
   - `Contractor` (Kontrahent): nazwa, NIP (minimalnie — pełny CRUD w późniejszej fazie).
   - `User`/`Person` + `Role`.
5. **Seed** słowników dokładnymi wartościami z audytu (typy dokumentów, statusy umów i projektów, spółki, ~34 lokalizacje, ~31 rodzajów/domain, charakter, waluty). Dodaj kilka przykładowych umów do testu listy.
6. **Moduł UMOWY (flagowy, read-first):**
   - `/umowy` — lista z Postgres (SSR/Server Component), kolumny jak legacy (Identyfikator, Typ dokumentu, Numer umowy, Status, Spółka, Lokalizacja, Przedmiot, Wynagrodzenie, OBSC, Właściciel, Buissnesline, Kontrahenci), paginacja + wybór liczby rekordów (10/15/25/50/100/250/500).
   - Formularz wyszukiwania z polami filtrów jak w audycie (identifier, type, contract_reference, buissnesline, status, company, location, contractor, owner, domain, contract_nature, date_end, nip, checkboxy „Podmiot powiązane"/„tylko OBSSC").
   - `/umowy/[id]` — podgląd szczegółów (read-only) z pełnym zestawem pól z audytu, sekcje: Załączniki (przez StorageAdapter), Notatki (placeholder), „Formularz akceptacji umowy" (placeholder). **Bez** funkcji „wyślij jako załącznik" na tym etapie.
7. **Moduł PROJEKTY (szkielet):** `/projekty` — lista + kolumny (Identyfikator, Status, Właściciel, Kontrahenci, Przedmiot, Ostatnia notatka, Opiniujący, Wysł. do podp.) + statusy projektu z cyklu FAU. Detal projektu — placeholder/minimalny.

## Czego NIE robimy w tym szkielecie (scope guard)
- ❌ REGON/GUS, przypomnienia e-mail, import historyczny, audit-log/hardening, AI copilot (to Fazy 2–6 planu).
- ❌ Wnętrza modułów zablokowanych rolą (Ryzyko, Supply chain, Kontrahenci CRUD, Grupy, Lokalizacje, Dostępy, Mailing, Raporty) — tylko placeholdery, dopóki nie zaudytujemy ich z konta admina.
- ❌ Panel `/admin` (osobna aplikacja vendora „W.B. Projekt").
- ❌ Realna edycja/dodawanie umowy (endpoint nieznany z audytu) — na razie read-first; formularz add/edit dopieścimy, gdy zaudytujemy go z konta z prawem edycji.
- ❌ Efekciarstwo wizualne. Funkcja + czytelność + branding.
- ❌ NIE powielaj buga legacy (przełącznik PL→en).

## Decyzje do potwierdzenia z Matim na starcie (zapytaj, jeśli nie potwierdzone)
1. **DB do deva lokalnego:** lokalny Postgres (Docker) czy dev-fallback (SQLite/Postgres w chmurze Abacus, jeśli już provisioned)? Abacus Postgres może jeszcze nie istnieć.
2. **ORM:** Prisma OK, czy dopasować do tego, co jest w AMSteel_Quote/SafetyHub?
3. **Styling:** Tailwind + shadcn/ui, czy trzymać się konwencji z istniejących repo Matiego?
4. **Menedżer pakietów:** npm/pnpm — jak w istniejących projektach.

## Definicja „gotowego szkieletu"
`npm run dev` startuje; logowanie (stub) chroni trasy; menu 10 modułów; **lista Umów renderuje się z Postgres z zaseedowanych danych**, filtruje się i paginuje; podgląd `/umowy/[id]` pokazuje pełny model danych; StorageAdapter (stub) obsługuje listę załączników; Projekty mają listę-szkielet. Placeholdery dla reszty. Branding zastosowany.

## Metoda pracy
- Pytaj Matiego przy każdym istotnym rozwidleniu (on kieruje). Rób małe kroki, pokazuj postęp (TodoWrite/tasks).
- Gate ECC (fact-force) będzie pytał przed Bash/Edit/Write — podawaj krótkie fakty i ponawiaj.
- Po skończeniu szkieletu: zaktualizuj `status_projektu.md` (log 0c) i zaproponuj następny krok.
