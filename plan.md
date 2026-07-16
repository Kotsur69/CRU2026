# CRU2026 - Plan wdrożenia

## Cel
System do zarządzania umowami (rejestr + załączniki) z kalendarzem końca umów i automatycznymi przypomnieniami o zbliżającym się końcu (czy umowa ma zostać zakończona, czy odnowiona). To wyłącznie własny, wewnętrzny system - bez raportowania do rządowego Centralnego Rejestru Umów (CRU); jedyny element związany z administracją państwową to wyszukiwarka REGON (patrz Faza 2), używana tylko do pobrania danych kontrahenta.

## Założenia skali
- ~100 użytkowników
- ~2000 nowych umów **rocznie** (ok. 1200 kontraktów projektowych + ok. 800 podpisanych umów) - nie miesięcznie
- Dane poufne, ale w ramach już zaakceptowanej klasyfikacji SharePoint; to nie jest system rządowy - dane historyczne w pełni dostępne, leżą na fizycznym serwerze w Bytomiu
- **Plany przyszłościowe (poza obecnym zakresem, nie wcześniej niż za rok):** wdrożenie systemu światowo (poza Polską) - będzie wymagało przemyślenia migracji hostingu na AWS zamiast obecnego Abacus. Nie planujemy tego teraz, tylko odnotowujemy jako kierunek

## Stack techniczny
- Next.js 14 (App Router) + TypeScript
- PostgreSQL (Abacus, managed, w chmurze) - wyłącznie metadane, nigdy pliki. Rozważano hosting na własnym serwerze wewnętrznym po adresie IP (jak legacy `index.php`) - odrzucone, bo to ten sam model, który sprawił, że dziś nikt nie ma dostępu do kodu legacy systemu ani go nie utrzymuje; managed cloud daje automatyczne backupy/uptime. Jeśli trzeba ograniczyć dostęp tylko do sieci firmowej, robi się to firewallem/VPN na Abacus, nie rezygnując z managed hostingu
- **Przechowywanie plików (skany/PDF) - niezdecydowane, na razie serwer bytomski:** SharePoint miał być docelowym miejscem plików, ale użytkownicy zgłaszają, że jest kapryśny i wolny; firma równolegle prowadzi rozmowy z AWS, które mogą stać się docelową infrastrukturą (termin nieznany). Obecnie pliki (nie tylko historyczne - także bieżące) leżą głównie na fizycznym serwerze w Bytomiu. Na tę chwilę zakładamy połączenie aplikacji z serwerem bytomskim jako źródłem plików; szczegóły techniczne tego połączenia (integracja, ewentualna migracja do SharePoint/AWS później) zostawiamy do rozwiązania po stronie Abacus (hosting/dev partner). Postgres w Abacus i tak trzyma wyłącznie metadane, nigdy pliki - ta zasada się nie zmienia niezależnie od tego, gdzie ostatecznie wylądują pliki
- Microsoft Graph API - Entra ID (SSO + katalog użytkowników); SharePoint pozostaje jako opcja na przyszłość, patrz punkt wyżej
- Przypomnienia: scheduled job (cron w ramach hostingu Abacus) + e-mail wysyłany przez Microsoft Graph API (`sendMail`) z dedykowanego adresu (`mateusz.mazur@arcelormittal.com`) - bez Teams webhook, tylko e-mail
- Wizualnie: obowiązkowe użycie brandingu ArcelorMittal (logo, fonty korporacyjne, paleta kolorów) - to wymóg klienta, nie kosmetyka. Assets już dostarczone i posegregowane w `historia_wersji/Branding/` (logo SVG/PNG, ikony SVG, fonty Poppins/Gilroy, grafiki gradientowe). Paleta kolorów zmierzona z pikseli oficjalnych assetów (nie oficjalny brand guide, ale wiarygodne przybliżenie) - patrz `historia_wersji/Branding/paleta_kolorow.md`: fiolet `#7F1878`, magenta `#C12974`, czerwień `#E74341`, pomarańcz `#F58847`. Priorytet UI: nie efekciarstwo, tylko identyczny szkielet funkcjonalny co legacy strona + maksymalna czytelność

## Kluczowa zasada wydajności
Lista/tabela umów renderuje się wyłącznie na podstawie zapytań do Postgres (indeksowane, małe rekordy metadanych) - nigdy nie odpytuje SharePoint przy wyświetlaniu wiersza. Plik PDF z SharePoint pobierany jest leniwie i tylko dla pojedynczego dokumentu, dopiero gdy użytkownik kliknie podgląd/pobieranie. Dzięki temu skala tysięcy rekordów nie wpływa na płynność interfejsu.

## Model danych (szkic)
- **Umowa (Contract):** strony, przedmiot, wartość, waluta, typ, status, daty obowiązywania (data zakończenia napędza przypomnienia), osoba odpowiedzialna za decyzję o zakończeniu/odnowieniu (referencja do Entra ID), decyzja (do ustalenia / odnowić / zakończyć)
- **Zalacznik (Attachment):** referencja do pliku (docelowy storage niezdecydowany - na razie serwer bytomski, patrz Stack techniczny), nazwa, data dodania
- **Uzytkownik/Rola:** administrator / edytor / przeglądający, powiązany z kontem Entra ID
- **Powiadomienie (NotificationLog):** kiedy wysłane, do kogo, kanał, powiązana umowa

## Fazy

### Faza 0 - Audyt i replika istniejącej strony (blokująca, NOWA)
Kontekst: istnieje już działająca legacy strona (`index.php` i powiązane podstrony), dostępna tylko przez link w sieci wewnętrznej (np. `10.222.x.x/index.php/...`). Nie mamy dostępu do kodu źródłowego (lifetime support, brak dostępu do repo/serwera) - tylko do działającej aplikacji przez przeglądarkę.

**0a. Audyt (walkthrough legacy strony)**
- Mati przechodzi przez wszystkie ekrany/funkcje starej strony (linki, screenshots)
- Spisujemy: strony/routing, formularze i pola, logikę biznesową, uprawnienia/role, integracje, wygląd/UX
- Wynik: dokument audytu (np. `historia_wersji/audyt_legacy_strony.md`) - pełna lista funkcji do odtworzenia

**0b. Zakres kopii (do akceptacji przed kodowaniem)**
- Na bazie audytu: osobny dokument z zakresem repliki 1:1 (co dokładnie wchodzi w zakres Fazy 0, co jest legacy-only i pomijamy)
- Zaakceptowanie zakresu przez Mati przed startem implementacji

**0c. Implementacja repliki**
- Odtworzenie funkcji z audytu w Next.js/TypeScript (ten sam stack co reszta planu, nie utrzymujemy PHP równolegle)
- Cel: 1:1 parytet funkcjonalny ze starą stroną jako punkt wyjścia - dopiero na tej bazie budujemy dalsze fazy (rejestr, przypomnienia o końcu umów itd.)

### Faza 1 - Setup (blokująca)
- Zgłoszenie do IT: app registration Entra ID (`Files.ReadWrite` dla SharePoint + `User.Read`/sign-in dla SSO)
- Provisioning Postgres w Abacus
- Scaffold repo Next.js, wzorce z AMSteel_Quote / SafetyHub (auth, panel admina, struktura)

### Faza 2 - Rejestr umów (core)
- CRUD umów, pola metadanych
- Upload/podpięcie plików - docelowy storage niezdecydowany (na razie serwer bytomski, patrz Stack techniczny); integracja połączenia po stronie Abacus
- Lista, wyszukiwanie, filtrowanie (typ, kontrahent, data, wartość, status)
- Logowanie przez Entra ID SSO, role dostępu
- Podgląd dokumentu: ikona „oko" przy każdej umowie - otwiera podgląd PDF w aplikacji lub pozwala pobrać oryginał. Mechanizm zależny od finalnego storage: jeśli pliki zostaną w SharePoint, Graph API `/preview` (tymczasowy, osadzalny URL); dla serwera bytomskiego wymaga osobnego rozwiązania - do ustalenia z Abacus
- **Integracja z wyszukiwarką REGON (GUS BIR1 API):** po wpisaniu numeru REGON kontrahenta, automatyczne uzupełnienie danych (nazwa, adres, NIP itd.) z rejestru GUS (`wyszukiwarkaregon.stat.gov.pl`) - zamiast ręcznego wpisywania wszystkiego jak obecnie. Wymaga klucza użytkownika API od GUS (rejestracja na stronie usługi)

### Faza 3 - Koniec umowy i przypomnienia o odnowieniu
- Przypisanie osoby odpowiedzialnej za decyzję o zakończeniu/odnowieniu danej umowy (z katalogu Entra ID)
- Zadanie cykliczne skanujące zbliżające się daty zakończenia umów (np. 90/30/7 dni przed końcem)
- Wysyłka e-mail przez Microsoft Graph API (`sendMail`), z dedykowanego adresu `mateusz.mazur@arcelormittal.com` - pytanie/przypomnienie: czy umowa ma zostać zakończona, czy odnowiona
- IT: Exchange Application Access Policy ograniczająca appkę do wysyłki tylko z tej jednej skrzynki (domyślnie app-only `Mail.Send` pozwala wysyłać jako dowolna skrzynka w tenantcie)
- Widok kalendarza / listy nadchodzących końców umów w aplikacji, z możliwością oznaczenia decyzji (odnowić/zakończyć) bezpośrednio przy umowie

### Faza 4 - Import danych historycznych
- Narzędzie do migracji istniejących umów (Excel + skany) do rejestru i SharePoint
- Dane historyczne dostępne w całości - leżą na fizycznym serwerze w Bytomiu, brak barier prawnych/dostępowych (to nie jest system rządowy)
- Manualne dodawanie nowych umów równolegle
- Decyzja: metadane wpisywane ręcznie przy imporcie, czy automatyczna ekstrakcja z PDF (OCR/document AI) - wymaga osobnej wyceny nakładu pracy, nie blokuje Fazy 2/3

### Faza 5 - Utwardzenie
- Audit log, weryfikacja backupów
- Test obciążeniowy przy ~100 użytkownikach i tysiącach rekordów
- Przegląd bezpieczeństwa (per reguły ECC - sekcja security.md)

### Faza 6 - Asystent AI / Copilot (kosmetyczna, niski priorytet, zablokowana do czasu potwierdzenia licencji)
- Cel: „latająca" ikonka asystenta na stronie - pomaga użytkownikowi zrozumieć umowę (streszczenie „o czym jest ta umowa"), tłumaczenie treści umowy na inny język, ogólna pomoc po stronie UI
- Podejście: Microsoft Copilot Studio - własny agent z SharePoint jako natywnym źródłem wiedzy (grounding bezpośrednio na plikach umów, bez budowania własnego RAG), publikacja jako widget web chat (gotowy JS snippet embedowany w Next.js, launcher w postaci ikony od razu wbudowany)
- Blokada: firma ma opłacony M365 Copilot (licencja per-seat), ale to NIE to samo co Copilot Studio (osobny model licencjonowania: capacity/consumption) - wymaga potwierdzenia z IT, czy obecna licencja pokrywa też Copilot Studio, czy trzeba osobno wykupić
- Nie blokuje żadnej innej fazy - czysto dodatkowa warstwa na końcu, po ustabilizowaniu rejestru i reszty funkcji

## Otwarte pytania
- Zakres funkcjonalny legacy strony (index.php) - do ustalenia podczas audytu Fazy 0
- Dokładna lista typów umów i pól rejestru - do ustalenia z zespołem
- Ręczne wprowadzanie metadanych vs. automatyczna ekstrakcja z treści PDF - do potwierdzenia z użytkownikiem, wpływa na zakres Fazy 4
- Licencjonowanie Copilot Studio - czy pokrywa je istniejąca licencja M365 Copilot, czy wymaga osobnego zakupu (blokuje Fazę 6)
- Klucz API do usługi REGON (GUS BIR1) - kto występuje o rejestrację, blokuje integrację w Fazie 2
- Czy e-maile z przypomnieniami mają wychodzić z osobistego adresu `mateusz.mazur@arcelormittal.com`, czy lepiej z dedykowanej skrzynki współdzielonej (np. `cru2026-notifications@arcelormittal.com`) - osobisty adres wiąże wysyłkę systemową z jedną osobą, warto potwierdzić świadomie
- ~~Wytyczne brandowe ArcelorMittal (logo, fonty, paleta kolorów)~~ - **dostarczone 2026-07-15**, patrz `historia_wersji/Branding/`. Paleta kolorów to przybliżenie zmierzone z assetów, nie oficjalny brand guide - podmienić, jeśli dokładne wartości hex/CMYK się pojawią
- **Docelowe miejsce przechowywania plików umów (SharePoint vs. serwer bytomski vs. AWS)** - SharePoint niepewny (użytkownicy zgłaszają, że jest kapryśny/wolny), firma rozmawia z AWS o przyszłej infrastrukturze (termin nieznany). Na razie zakładamy połączenie z serwerem bytomskim, a techniczne rozwiązanie integracji zostawiamy Abacusowi. Blokuje ostateczny kształt Fazy 2 (upload/podgląd) i Fazy 4 (import historyczny) - do potwierdzenia, gdy będzie jasność co do AWS
