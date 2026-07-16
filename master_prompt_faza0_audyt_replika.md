# Master Prompt - Faza 0: Audyt i replika legacy strony CRU2026

Ten dokument to gotowy do wklejenia prompt dla agenta (Claude Code / innego coding-agenta), który ma wykonać Fazę 0 z `plan.md`: audyt istniejącej wewnętrznej strony CRU2026 i zbudowanie 1:1 replikowanego szkieletu w nowym stacku, zanim ruszy budowa pełnego rejestru.

---

## Kontekst projektu

CRU2026 to wewnętrzny system ArcelorMittal do zarządzania umowami - docelowo scentralizowany, przeszukiwalny rejestr umów (metadane + załączniki) z kalendarzem końca umów i automatycznymi przypomnieniami o decyzji „zakończyć czy odnowić". To wyłącznie własny, wewnętrzny system - bez raportowania do rządowego Centralnego Rejestru Umów. Jedyny element związany z administracją państwową to wyszukiwarka REGON (GUS), używana tylko do autouzupełniania danych kontrahenta.

Docelowy stack: Next.js 14 (App Router) + TypeScript, PostgreSQL hostowany w Abacus (wyłącznie metadane, nigdy pliki), Microsoft Entra ID (SSO + katalog użytkowników), Microsoft Graph API do maili z przypomnieniami. Docelowe miejsce przechowywania plików (skany/PDF umów) jest **obecnie niezdecydowane**: SharePoint miał być stałym rozwiązaniem, ale użytkownicy zgłaszają, że jest kapryśny i wolny; firma równolegle rozmawia z AWS (bez znanego terminu). Na tę chwilę zakładamy, że pliki leżą na fizycznym serwerze w Bytomiu - techniczne rozwiązanie integracji zostawiamy do ustalenia po stronie Abacus. Pełne szczegóły architektury: patrz `plan.md` i `status_projektu.md` w tym repo.

**Dlaczego Faza 0 istnieje:** Istnieje już działająca legacy strona (`index.php` i powiązane podstrony), dostępna wyłącznie przez link w sieci wewnętrznej ArcelorMittal (np. `10.222.x.x/index.php/...`). Nie ma dostępu do jej kodu źródłowego - umowa lifetime support nie obejmuje dostępu do repo/serwera. Jedyny dostępny kanał to działająca aplikacja przez przeglądarkę. Zamiast budować rejestr od zera, najpierw odtwarzamy funkcjonalność legacy strony 1:1 jako fundament, na którym dopiero nadbudowywane są kolejne fazy (rejestr rozszerzony, REGON, przypomnienia, import historyczny, itd.).

## Twoje zadanie

Wykonaj trzy kroki Fazy 0 po kolei, **nie przeskakuj do kodowania przed akceptacją kroku 0b**:

### 0a - Audyt (walkthrough legacy strony)

1. Otwórz stronę pod adresem IP dostarczonym przez użytkownika (poproś o niego, jeśli go nie masz - bez niego nie da się zacząć). Użyj narzędzia przeglądarkowego (np. chrome-devtools MCP) do nawigacji i robienia zrzutów ekranu/snapshotów DOM.
2. Przejdź przez **każdy** ekran i funkcję, jakie uda się znaleźć - nawiguj po wszystkich linkach, menu, zakładkach, na koncie do którego Mati ma dostęp. Logowanie **nie jest częścią audytu** - patrz sekcja „Logowanie" niżej.
3. Dla każdego ekranu spisz:
   - **Routing/URL** i jego miejsce w hierarchii strony
   - **Formularze**: wszystkie pola, typy danych, walidacje, zachowanie po submit
   - **Logika biznesowa**: widoczne reguły, przejścia statusów, obliczenia, warunki wyświetlania
   - **Uprawnienia/role**: opisz tylko to, co widać z poziomu dostępnego konta - bez zakładania czy testowania innych ról (patrz „Logowanie" niżej, dlaczego)
   - **Integracje**: upload plików, wysyłka maili, eksporty, cokolwiek co wygląda na połączenie z innym systemem
   - **Wygląd/UX**: układ, kolory, nawigacja - jako punkt odniesienia (branding ArcelorMittal ostatecznie i tak nadpisze wygląd wg wytycznych brandowych, gdy będą dostępne)
4. Zapisz wynik w `historia_wersji/audyt_legacy_strony.md` - pełna, uporządkowana lista funkcji do odtworzenia (nie kod, tylko inwentarz).

**Logowanie - poza zakresem audytu.** Logowanie do legacy strony odbywa się przez Microsoft (przekierowanie na stronę logowania organizacji ArcelorMittal, Entra ID). Mati nie ma dostępu administracyjnego do tej strony logowania i nie może nią manipulować (np. tworzyć kont testowych dla innych ról). Traktuj login jako dany/zewnętrzny - nie audytuj go, nie testuj różnych ról przez logowanie się na różne konta, nie zakładaj żadnych zmian w tym mechanizmie. Docelowa aplikacja i tak ma używać Entra ID SSO (zgodnie z `plan.md`), więc na tym etapie to i tak nie wymaga odtwarzania - jedynie podpięcia pod istniejący firmowy SSO.

### 0b - Zakres kopii (wymaga akceptacji przed kodowaniem)

1. Na bazie audytu z 0a przygotuj `historia_wersji/zakres_kopii_faza0.md`: jasny podział na:
   - co wchodzi w zakres repliki 1:1 (Faza 0c)
   - co jest legacy-only i świadomie pomijamy (i dlaczego)
   - co nakłada się z późniejszymi fazami planu (np. REGON, przypomnienia e-mail, import historyczny) i zostaje odłożone do tamtych faz, żeby nie duplikować pracy
2. **Zatrzymaj się tutaj i poczekaj na jawną akceptację użytkownika (Mati)** zakresu, zanim napiszesz jakikolwiek kod produkcyjny.

### 0c - Implementacja repliki

Dopiero po akceptacji 0b:

1. Zbuduj replikę w Next.js 14 (App Router) + TypeScript - ten sam stack co reszta planu, bez utrzymywania równoległego PHP.
2. Metadane umów → Postgres (Abacus) - schemat wzorowany na modelu danych ze szkicu w `plan.md` (Umowa, Zalacznik, Uzytkownik/Rola), rozszerzony o pola znalezione w audycie.
3. Pliki/załączniki → zbuduj **abstrakcję storage** (interfejs, nie hardkodowane wywołania), tak żeby backend mógł docelowo wskazywać na serwer bytomski, SharePoint albo AWS bez zmian w routingu/UI. Na start zaimplementuj adapter zakładający serwer bytomski jako źródło (albo lokalny stub, jeśli detale połączenia z serwerem bytomskim nie są jeszcze znane - zapytaj użytkownika, jeśli brakuje danych do połączenia).
4. Logowanie → nie odtwarzasz legacy logowania (patrz sekcja „Logowanie - poza zakresem audytu" w 0a). Podepnij standardowe Entra ID SSO; jeśli app registration jeszcze nie istnieje (patrz `status_projektu.md` → zależności od IT), użyj stub/mock logowania na start - nie blokuj implementacji na braku realnego SSO.
5. Cel: pełny parytet funkcjonalny z legacy stroną zgodnie z zaakceptowanym zakresem z 0b - to jest punkt wyjścia, na którym dopiero nadbudowywane są kolejne fazy (rejestr rozszerzony, REGON, przypomnienia, import historyczny).

## Twarde ograniczenia - nie wprowadzaj scope creep

Poniższe **nie** wchodzi w zakres Fazy 0 - to kolejne fazy planu, nie dokładaj ich teraz nawet jeśli wydają się „przy okazji":
- Integracja z wyszukiwarką REGON/GUS (Faza 2)
- Automatyczne przypomnienia e-mail o końcu umowy (Faza 3)
- Narzędzie do importu danych historycznych z serwera bytomskiego (Faza 4)
- Audit log / testy obciążeniowe / hardening (Faza 5)
- Asystent AI / Copilot Studio (Faza 6)
- Cokolwiek związanego z rządowym Centralnym Rejestrem Umów - ten projekt tego nie robi w ogóle

## Zasady pracy

- Nie masz dostępu do kodu legacy strony - wszystko, co wiesz o jej działaniu, pochodzi wyłącznie z obserwacji przez przeglądarkę. Jeśli czegoś nie da się zaobserwować (np. logika serwerowa niewidoczna w UI), zaznacz to w audycie jako „nieznane/do dopytania", zamiast zgadywać.
- Trzymaj się stacku i zasad z `plan.md` / `status_projektu.md` (immutable data, walidacja na granicy systemu, brak nadmiarowej abstrakcji) - to samo repo, te same reguły ECC co reszta projektów Mati.
- Branding ArcelorMittal jest wymogiem finalnym, ale nie blokuje Fazy 0 - użyj neutralnego/placeholder stylu, jeśli wytycznych brandowych jeszcze nie ma.
- Jeśli w trakcie audytu natrafisz na coś, co zmienia założenia z `plan.md`/`status_projektu.md` (np. nieznana wcześniej funkcja, inny model uprawnień niż zakładany), zatrzymaj się i zgłoś to użytkownikowi zamiast po cichu improwizować zakres.

## Czego potrzebujesz od użytkownika, zanim zaczniesz

- Adres IP / URL legacy strony w sieci wewnętrznej
- Potwierdzenie, czy masz uruchomione narzędzie przeglądarkowe (Chrome + chrome-devtools MCP - potwierdzone działające w tej sesji) skonfigurowane z dostępem do sieci wewnętrznej, w której leży legacy strona
- Zalogowana sesja Mati na jego własnym koncie (logowanie samo w sobie nie jest audytowane - patrz sekcja „Logowanie" w kroku 0a)
