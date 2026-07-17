# CRU2026 — Plan wdrożenia

> **PIVOT 2026-07-17.** Ten plan został przepisany po zwrocie strategicznym. Poprzedni kierunek (greenfield rewrite: własny Postgres w Abacus, replika 1:1 legacy w Next.js, Entra ID SSO, REGON, przypomnienia e-mail, Copilot) został **porzucony**. Zapis historyczny: `status_projektu.md` (sekcja „Zdecydowana architektura (2026-07-15) — HISTORYCZNE" + log 2026-07-17). Master-prompty Fazy 0 (`master_prompt_faza0_audyt_replika.md`, `master_prompt_faza0c_szkielet.md`) są **nieaktualne** (dotyczyły porzuconej repliki).

## Cel
Nie budujemy rejestru od zera i nie przepisujemy legacy. Istniejący system CRU (CakePHP + MySQL, serwer w Bytomiu `10.222.125.213`) zostaje **nietknięty**. Dokładamy **jeden moduł**: masowe elektroniczne podpisywanie umów przez **Adobe Acrobat Sign**, podpięty wyłącznie pod warstwę danych legacy (te same tabele + pliki PDF).

Docelowy przepływ dla użytkownika: umowa idzie w chmurze do podpisu przez kolejne „ważne osoby" (multi-signer, podpis prawnie honorowany), **bez pobierania pliku** na komputer podpisującego — podpis na stronie w przeglądarce. Po skompletowaniu podpisów podpisany PDF wraca i nadpisuje oryginał w storage bytomskim.

## Architektura (zatwierdzona 2026-07-17)
- **Frontend:** React SPA (Vite) + TypeScript.
- **Backend:** Node.js/Express, `mysql2/promise`, read-write wprost do tabel legacy MySQL.
- **Podpis:** Adobe Acrobat Sign — hosted link (odbiorcy dostają maila, podpisują w przeglądarce Adobe), odbiorcy w kolejności, webhook oddaje podpisany PDF. Embedded signing (iframe u nas) = opcjonalny polish na później, NIE na start.
- **Wygoda po naszej stronie (to jest cała robota UX):** lista umów z checkboxami (bulk-select) + preset odbiorców („te same ważne osoby") + jeden przycisk „Wyślij do podpisu" + dashboard statusów (wysłane / u kogo teraz / podpisane).
- **Hosting:** dev na VirtualBox/Debian u Mati → **prod na wewnętrznym serwerze w Katowicach** (sieć firmowa AM), spakowane w **Docker** (`docker compose`), Nginx reverse proxy, pm2/kontenery. **NIE na prywatnym komputerze** (to antipattern, który stworzył legacy — serwer, którego nikt nie utrzymuje).
- **Sieć:** serwer w Katowicach dobija do bazy + PDF w Bytomiu **po sieci firmowej (LAN), bez VPN i bez wystawiania bazy do internetu**. VPN/WireGuard tylko gdyby padło na zewnętrzny VPS. Publicznie wystawiony **jeden endpoint HTTPS** (Let's Encrypt, osobna domena, np. `podpisy.firma.com`) — wyłącznie dla Adobe (strona podpisu + webhook).
- **Auth:** logowanie weryfikowane o istniejącą tabelę `users` legacy (te same konta co dziś, bez równoległej bazy tożsamości). Dodawanie nowych kont — UI po naszej stronie. Hashing haseł legacy do potwierdzenia ze schematu/vendora.
- **Stan kopert Adobe:** własna, nowa tabela (mapowanie umowa ↔ agreement + status) — nie mieszamy w tabelach legacy.
- **Sekrety** (dane bazy, ścieżki PDF, klucze Adobe) w `.env`, nigdy w kodzie.
- **Struktura repo:** jedno repozytorium, `/frontend` + `/backend` osobno, wspólny deploy.

## Zasady integralności przy read-write do legacy
Piszemy wprost do cudzej produkcyjnej bazy CakePHP — więc:
1. **Najpierw schemat, potem jakikolwiek zapis** (`mysqldump --no-data` → mapowanie tabel, relacji HABTM, pól audytu, enumów statusów, generowania `record_id`). Bez tego pierwszy INSERT może rozjechać legacy UI.
2. Wszystkie zapisy w **transakcjach**; pola audytu („modyfikowano przez" = login) ustawiamy ręcznie.
3. Start od **najwęższego zapisu** (zmiana statusu w flow podpisu) + własna tabela na stan Adobe.
4. **Backup PDF** przed nadpisaniem podpisaną wersją; nadpisanie atomowe.
5. Jak się da — test na kopii/stagingu bazy przed produkcją.

## Fazy

### Faza 0 — Dostęp i prereki (BLOKUJĄCA, w toku)
- Dostęp do serwera bytomskiego: konto MySQL (SELECT/INSERT/UPDATE) + zapis do katalogu PDF + `mysqldump --no-data`. Ścieżka: mail → **Łukasz** → admini serwera (mail wysyłany 2026-07-17).
- Ustalenie sposobu połączenia (LAN wewnętrzny vs VPN) — wg odpowiedzi adminów.
- Adobe: konto Acrobat Sign z dostępem API (business/enterprise, OAuth server-to-server) + sandbox developerski. **Płatny prereq — potwierdzić, czy firma ma.**
- Poziom podpisu z działem prawnym (zwykły e-podpis eIDAS vs kwalifikowany QES).
- Security/compliance sign-off (poufne dane + przetwarzanie w chmurze Adobe/RODO).

### Faza 1 — Szkielet i połączenie
- Repo `/frontend` (React/Vite) + `/backend` (Express), Docker, dev na VirtualBoxie.
- Połączenie `mysql2` do legacy (read-only na start): lista projektów/umów z checkboxami.
- Auth: logowanie weryfikowane o `users` legacy; middleware chroniący trasy; UI dodawania kont.

### Faza 2 — Wysyłka do podpisu (Adobe sandbox)
- Bulk checkbox-select umów + **preset odbiorców** (kolejność podpisów).
- Pobranie PDF z Bytomia → utworzenie agreement w Adobe → wysłanie (maile z linkiem).
- Własna tabela: mapowanie umowa ↔ agreement + status.

### Faza 3 — Powrót podpisu i nadpisanie
- Webhook Adobe („completed") → pobranie podpisanego PDF → backup + nadpisanie oryginału w Bytomiu.
- Dashboard statusów: wysłane / u kogo teraz / podpisane.
- (Jeśli wymagane) zapis statusu do tabeli legacy — najwęższy możliwy, wg reguł integralności wyżej.

### Faza 4 — Produkcja i utwardzenie
- Deploy na wewnętrzny serwer w Katowicach (Docker), HTTPS + domena dla endpointu Adobe.
- Przełączenie z sandboxa Adobe na produkcję.
- Audit log, testy end-to-end, weryfikacja backupów, security review (reguły ECC).
- (Opcjonalnie później) embedded signing zamiast hosted link — polish, nie na start.

## Poza zakresem tego kierunku
Wypadło z pivotem (było w starym greenfield planie, teraz NIE robimy): replika 1:1 legacy, własny Postgres/Abacus, Entra ID SSO, integracja REGON/GUS, przypomnienia e-mail o końcu umów, import danych historycznych, AI Copilot. Gdyby któraś z tych rzeczy wróciła — patrz historia w `status_projektu.md` i git.

## Otwarte pytania / prereki
- Dostęp do serwera bytomskiego (blocker #1, w toku).
- Konto Adobe API + licencja (płatny prereq).
- Poziom podpisu (zwykły vs QES) — dział prawny.
- Hashing haseł `users` legacy — do potwierdzenia ze schematu/vendora.
- Pełny schemat modułu `/project` (audyt: 0 rekordów z konta Mati) — rozwiąże `mysqldump`.
- Model „ważnych osób" podpisujących — stały preset czy definiowany per-umowa? (wpływa na UI Fazy 2)
