/**
 * Seed CRU2026 — idempotentny (upsert po unikalnym `code`/`login`/`identifier`).
 * Wartości słowników pochodzą z historia_wersji/audyt_legacy_strony.md (sekcja 1.6).
 * Uruchom: yarn db:seed
 */
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

/** Prosty, stabilny slug na `code` słownika. */
function slug(input: string): string {
  return input
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

function addDays(base: Date, days: number): Date {
  const d = new Date(base);
  d.setDate(d.getDate() + days);
  return d;
}

// ── Wartości słownikowe (dokładnie z audytu) ─────────────────────────────
const DOCUMENT_TYPES = [
  "Aneks", "Kontrakt", "List intencyjny", "Porozumienie",
  "Przetarg", "Umowa", "Umowa ramowa", "Zlecenie",
];
const CONTRACT_STATUSES = ["Obowiązująca", "Zakończona"];
const PROJECT_STATUSES = [
  "Projekt - w toku", "Wysłane do podpisu", "Rozpoczęto obieg FAU",
  "Zakończono obieg FAU", "Zakończony", "Zrealizowany brak umowy", "Anulowany",
];
const BUSINESSLINES = ["SSC", "Dystrybucja"];
const COMPANIES = ["AMC", "AMDP", "AMDSP", "HK POM", "SSC", "ST"];
const LOCATIONS = [
  "BCS", "Białystok", "Bydgoszcz", "Bytom", "Centrala", "Centrala Katowice",
  "Częstochowa", "Dąbrowa Górnicza I", "Dąbrowa Górnicza II", "Gdańsk",
  "Katowice", "Kielce", "Konin", "Kraków", "Kuków Folwark", "Lublin", "Łazy",
  "Łódź", "Mielec", "Olkusz", "Olsztyn", "Opole", "Piła", "Rawa Mazowiecka",
  "Rzeszów", "Skawina", "Słupsk", "Starachowice", "Suwałki", "Szczecin",
  "Świętochłowice", "Wałbrzych", "Warszawa", "Wrocław",
];
const DOMAINS = [
  "Finanse/Księgowość", "Flota", "Handlowe", "Handlowe - Zbrojarnia",
  "Informatyka/Teleinformatyka", "Inne", "Jakościowe", "Kolejowe", "Leasing",
  "Logistyczne", "Media", "Najem/Dzierżawa", "Ochrona środowiska", "Personalne",
  "Porozumienie", "Prawne", "Reklama", "Skład konsygnacyjny",
  "Transport/Spedycja", "Umowa agencyjna", "Umowa bonusowa", "Umowa o poufności",
  "Umowa pośrednictwa", "Umowa powierzenia (RODO)", "Umowa prowizyjna",
  "Umowa serwisowa", "Usługi", "Utrzymanie ruchu", "Windykacja",
  "Zakupy - materiały handlowych", "Zakupy - nieprodukcyjne",
];
const NATURES = ["Bezkosztowa", "Kosztowa", "Przychodowa"];
const CURRENCIES = ["PLN", "EUR", "USD"];

async function seedDictionaries() {
  const seedOne = async (
    model: {
      upsert: (args: {
        where: { code: string };
        update: { name: string; sortOrder: number };
        create: { code: string; name: string; sortOrder: number };
      }) => Promise<unknown>;
    },
    values: string[],
  ) => {
    for (let i = 0; i < values.length; i++) {
      const name = values[i];
      await model.upsert({
        where: { code: slug(name) },
        update: { name, sortOrder: i },
        create: { code: slug(name), name, sortOrder: i },
      });
    }
  };

  await seedOne(prisma.documentType, DOCUMENT_TYPES);
  await seedOne(prisma.contractStatus, CONTRACT_STATUSES);
  await seedOne(prisma.projectStatus, PROJECT_STATUSES);
  await seedOne(prisma.businessline, BUSINESSLINES);
  await seedOne(prisma.company, COMPANIES);
  await seedOne(prisma.location, LOCATIONS);
  await seedOne(prisma.domain, DOMAINS);
  await seedOne(prisma.contractNature, NATURES);
  await seedOne(prisma.currency, CURRENCIES);
}

async function seedRolesAndUser() {
  const roles = [
    { code: "admin", name: "Administrator" },
    { code: "editor", name: "Edytor" },
    { code: "viewer", name: "Podgląd" },
  ];
  for (const r of roles) {
    await prisma.role.upsert({
      where: { code: r.code },
      update: { name: r.name },
      create: r,
    });
  }
  const editorRole = await prisma.role.findUniqueOrThrow({ where: { code: "editor" } });
  const passwordHash = await bcrypt.hash("admin123", 10);
  await prisma.user.upsert({
    where: { login: "admin" },
    update: { fullName: "Administrator CRU", roleId: editorRole.id },
    create: {
      login: "admin",
      email: "admin@example.local",
      fullName: "Administrator CRU",
      passwordHash,
      roleId: editorRole.id,
    },
  });
}

// ── Definicje przykładowych umów ─────────────────────────────────────────
// `endDays` = liczba dni od DZIŚ do daty zakończenia → różnorodna sygnalizacja
// wygasania (po terminie / ≤30 / ≤90 / dalej). Zakończone są celowo w przeszłości.

interface Sample {
  seq: string;
  num: string;
  subj: string;
  amount: string | null;
  otherAmount?: string;
  type: string;
  status: string;
  company: string;
  loc: string;
  domain: string;
  nature: string;
  currency: string;
  endDays: number;
  contractor: number; // indeks w CONTRACTORS
  obsc?: boolean;
  connected?: boolean;
  weksel?: boolean;
}

const CONTRACTORS = [
  { id: "seed-contractor-1", name: "Przykładowy Kontrahent Sp. z o.o.", nip: "6340197453" },
  { id: "seed-contractor-2", name: "StalTrans Logistyka S.A.", nip: "9542738114" },
  { id: "seed-contractor-3", name: "BiuroMax Sp. j.", nip: "5213099881" },
  { id: "seed-contractor-4", name: "EnergoSerwis Sp. z o.o.", nip: "6252044170" },
  { id: "seed-contractor-5", name: "MediaNet Telekom Sp. z o.o.", nip: "7010223344" },
];

const SAMPLES: Sample[] = [
  { seq: "0001", num: "U/2026/0001", subj: "Usługi serwisowe hali produkcyjnej", amount: "120000.00", type: "Umowa", status: "Obowiązująca", company: "AMDSP", loc: "Katowice", domain: "Usługi", nature: "Kosztowa", currency: "PLN", endDays: 365, contractor: 0 },
  { seq: "0002", num: "U/2026/0002", subj: "Dostawa materiałów biurowych", amount: "24500.00", type: "Umowa", status: "Obowiązująca", company: "AMDSP", loc: "Katowice", domain: "Zakupy - nieprodukcyjne", nature: "Kosztowa", currency: "PLN", endDays: 210, contractor: 2 },
  { seq: "0003", num: "U/2026/0003", subj: "Transport wewnętrzny — logistyka", amount: "89000.00", type: "Umowa", status: "Obowiązująca", company: "AMDSP", loc: "Katowice", domain: "Transport/Spedycja", nature: "Kosztowa", currency: "PLN", endDays: 500, contractor: 1 },
  { seq: "0004", num: "U/2026/0004", subj: "Utrzymanie ruchu — linia cynkownicza", amount: "46000.00", type: "Kontrakt", status: "Obowiązująca", company: "AMDSP", loc: "Dąbrowa Górnicza I", domain: "Utrzymanie ruchu", nature: "Kosztowa", currency: "PLN", endDays: 160, contractor: 3 },
  { seq: "0005", num: "U/2026/0005", subj: "Abonament telekomunikacyjny (łącza)", amount: "8900.00", type: "Umowa", status: "Obowiązująca", company: "AMC", loc: "Warszawa", domain: "Media", nature: "Kosztowa", currency: "PLN", endDays: 21, contractor: 4 },
  { seq: "0006", num: "U/2026/0006", subj: "Umowa ramowa na usługi transportowe", amount: "250000.00", type: "Umowa ramowa", status: "Obowiązująca", company: "AMDP", loc: "Kraków", domain: "Transport/Spedycja", nature: "Kosztowa", currency: "PLN", endDays: 65, contractor: 1 },
  { seq: "0007", num: "U/2026/0007", subj: "Sprzątanie powierzchni biurowych", amount: "15000.00", type: "Zlecenie", status: "Obowiązująca", company: "SSC", loc: "Gdańsk", domain: "Usługi", nature: "Kosztowa", currency: "PLN", endDays: 400, contractor: 2 },
  { seq: "0008", num: "U/2025/0102", subj: "Najem magazynu (zakończony)", amount: "72000.00", type: "Umowa", status: "Zakończona", company: "AMDSP", loc: "Wrocław", domain: "Najem/Dzierżawa", nature: "Kosztowa", currency: "PLN", endDays: -120, contractor: 0 },
  { seq: "0009", num: "U/2026/0009", subj: "Dostęp do internetu — oddział", amount: "3200.00", type: "Umowa", status: "Obowiązująca", company: "AMDSP", loc: "Bytom", domain: "Media", nature: "Kosztowa", currency: "PLN", endDays: 240, connected: true, contractor: 4 },
  { seq: "0010", num: "U/2025/0210", subj: "Obsługa windykacyjna należności", amount: null, otherAmount: "prowizja 8% od odzyskanych kwot", type: "Umowa", status: "Obowiązująca", company: "ST", loc: "Łódź", domain: "Windykacja", nature: "Przychodowa", currency: "PLN", endDays: -8, contractor: 2 },
  { seq: "0011", num: "U/2026/0011", subj: "Leasing floty samochodowej", amount: "54000.00", type: "Kontrakt", status: "Obowiązująca", company: "AMC", loc: "Olsztyn", domain: "Leasing", nature: "Kosztowa", currency: "EUR", endDays: 600, weksel: true, contractor: 3 },
  { seq: "0012", num: "U/2025/0044", subj: "Kampania reklamowa (zakończona)", amount: "12800.00", type: "Umowa", status: "Zakończona", company: "AMDP", loc: "Szczecin", domain: "Reklama", nature: "Kosztowa", currency: "PLN", endDays: -300, contractor: 4 },
  { seq: "0013", num: "U/2026/0013", subj: "Odbiór i utylizacja odpadów przemysłowych", amount: "98000.00", type: "Umowa", status: "Obowiązująca", company: "AMDSP", loc: "Katowice", domain: "Ochrona środowiska", nature: "Kosztowa", currency: "PLN", endDays: 9, obsc: true, contractor: 3 },
  { seq: "0014", num: "U/2026/0014", subj: "Ramowa umowa zakupowa (MRO)", amount: "430000.00", type: "Umowa ramowa", status: "Obowiązująca", company: "SSC", loc: "Dąbrowa Górnicza I", domain: "Zakupy - nieprodukcyjne", nature: "Kosztowa", currency: "PLN", endDays: 30, contractor: 2 },
  { seq: "0015", num: "U/2026/0015", subj: "Umowa o zachowaniu poufności (NDA)", amount: null, otherAmount: "n/d — bezkosztowa", type: "Umowa", status: "Obowiązująca", company: "AMDSP", loc: "Częstochowa", domain: "Personalne", nature: "Bezkosztowa", currency: "PLN", endDays: 88, contractor: 0 },
  { seq: "0016", num: "U/2026/0016", subj: "Wdrożenie i utrzymanie systemu ERP", amount: "210000.00", type: "Umowa", status: "Obowiązująca", company: "AMC", loc: "Warszawa", domain: "Informatyka/Teleinformatyka", nature: "Kosztowa", currency: "PLN", endDays: 730, obsc: true, connected: true, contractor: 4 },
  { seq: "0017", num: "U/2026/0017", subj: "Porozumienie o współpracy handlowej", amount: null, type: "Porozumienie", status: "Obowiązująca", company: "AMDP", loc: "Gdańsk", domain: "Porozumienie", nature: "Bezkosztowa", currency: "PLN", endDays: 55, contractor: 0 },
  { seq: "0018", num: "U/2025/0071", subj: "Spedycja krajowa (zakończona)", amount: "61000.00", type: "Umowa", status: "Zakończona", company: "ST", loc: "Kielce", domain: "Transport/Spedycja", nature: "Kosztowa", currency: "PLN", endDays: -60, contractor: 1 },
  { seq: "0019", num: "U/2026/0019", subj: "Serwis wózków widłowych", amount: "33000.00", type: "Umowa", status: "Obowiązująca", company: "AMDSP", loc: "Katowice", domain: "Umowa serwisowa", nature: "Kosztowa", currency: "PLN", endDays: -40, contractor: 3 },
  { seq: "0020", num: "U/2026/0020", subj: "Leasing maszyn produkcyjnych", amount: "120000.00", type: "Umowa", status: "Obowiązująca", company: "AMDP", loc: "Kraków", domain: "Leasing", nature: "Kosztowa", currency: "EUR", endDays: 160, weksel: true, contractor: 3 },
  { seq: "0021", num: "U/2024/0311", subj: "Usługi medialne (zakończone)", amount: "4500.00", type: "Umowa", status: "Zakończona", company: "SSC", loc: "Wrocław", domain: "Media", nature: "Kosztowa", currency: "PLN", endDays: -500, contractor: 4 },
  { seq: "0022", num: "U/2026/0022", subj: "Zakup materiałów handlowych — stal", amount: "780000.00", type: "Kontrakt", status: "Obowiązująca", company: "AMC", loc: "Bydgoszcz", domain: "Zakupy - materiały handlowych", nature: "Kosztowa", currency: "PLN", endDays: 75, obsc: true, contractor: 2 },
  { seq: "0023", num: "U/2026/0023", subj: "Konserwacja instalacji technicznych", amount: "27000.00", type: "Umowa", status: "Obowiązująca", company: "AMDSP", loc: "Rzeszów", domain: "Utrzymanie ruchu", nature: "Kosztowa", currency: "PLN", endDays: 300, contractor: 3 },
];

async function seedSampleContracts() {
  const [docTypes, statuses, companies, locations, domains, natures, currencies, owner] =
    await Promise.all([
      prisma.documentType.findMany(),
      prisma.contractStatus.findMany(),
      prisma.company.findMany(),
      prisma.location.findMany(),
      prisma.domain.findMany(),
      prisma.contractNature.findMany(),
      prisma.currency.findMany(),
      prisma.user.findFirst({ where: { login: "admin" } }),
    ]);

  const pick = <T extends { code: string }>(arr: T[], name: string): T | undefined =>
    arr.find((x) => x.code === slug(name));
  const cur = (code: string) => currencies.find((x) => x.code === code.toLowerCase());

  const contractors = [];
  for (const cd of CONTRACTORS) {
    contractors.push(
      await prisma.contractor.upsert({ where: { id: cd.id }, update: {}, create: cd }),
    );
  }

  const today = new Date();

  for (const s of SAMPLES) {
    const dateEnd = addDays(today, s.endDays);
    const dateStart = addDays(dateEnd, -365);
    await prisma.contract.upsert({
      where: { identifier: `AMDSP/DYS/2026/${s.seq}` },
      update: {},
      create: {
        identifier: `AMDSP/DYS/2026/${s.seq}`,
        contractNumber: s.num,
        subject: s.subj,
        amount: s.amount ?? undefined,
        otherAmountDesc: s.otherAmount,
        dateStart,
        dateEnd,
        paymentTerm: "30 dni",
        documentTypeId: pick(docTypes, s.type)?.id,
        statusId: pick(statuses, s.status)?.id,
        companyId: pick(companies, s.company)?.id,
        locationId: pick(locations, s.loc)?.id,
        domainId: pick(domains, s.domain)?.id,
        natureId: pick(natures, s.nature)?.id,
        currencyId: cur(s.currency)?.id,
        obsc: s.obsc ?? false,
        companyConnected: s.connected ?? false,
        weksel: s.weksel ?? false,
        contractors: { connect: { id: contractors[s.contractor].id } },
        ownerIds: owner ? { connect: { id: owner.id } } : undefined,
        createdById: owner?.id,
      },
    });
  }

  // Aneks do 0006 (relacja self — pokazuje sekcję „Aneksy" po obu stronach).
  const parent = await prisma.contract.findUnique({
    where: { identifier: "AMDSP/DYS/2026/0006" },
  });
  if (parent) {
    const dateEnd = addDays(today, 65);
    await prisma.contract.upsert({
      where: { identifier: "AMDSP/DYS/2026/0006-A1" },
      update: {},
      create: {
        identifier: "AMDSP/DYS/2026/0006-A1",
        contractNumber: "A/2026/0006-1",
        subject: "Aneks nr 1 — aktualizacja stawek transportowych",
        amount: "30000.00",
        dateStart: addDays(dateEnd, -300),
        dateEnd,
        documentTypeId: pick(docTypes, "Aneks")?.id,
        statusId: pick(statuses, "Obowiązująca")?.id,
        companyId: pick(companies, "AMDP")?.id,
        locationId: pick(locations, "Kraków")?.id,
        domainId: pick(domains, "Transport/Spedycja")?.id,
        natureId: pick(natures, "Kosztowa")?.id,
        currencyId: cur("PLN")?.id,
        parentId: parent.id,
        contractors: { connect: { id: contractors[1].id } },
        ownerIds: owner ? { connect: { id: owner.id } } : undefined,
        createdById: owner?.id,
      },
    });

    // Przykładowe załączniki (StorageAdapter-stub) — zapełniają sekcję „Załączniki".
    await prisma.attachment.upsert({
      where: { id: "seed-att-1" },
      update: {},
      create: {
        id: "seed-att-1",
        contractId: parent.id,
        filename: "umowa_0006_podpisana.pdf",
        storageKey: "umowa_0006_podpisana.pdf",
        mimeType: "application/pdf",
        isFinal: true,
      },
    });
    await prisma.attachment.upsert({
      where: { id: "seed-att-2" },
      update: {},
      create: {
        id: "seed-att-2",
        contractId: parent.id,
        filename: "zalacznik_1_specyfikacja.pdf",
        storageKey: "zalacznik_1_specyfikacja.pdf",
        mimeType: "application/pdf",
        isFinal: false,
      },
    });
  }
}

// ── Definicje przykładowych projektów ────────────────────────────────────
// Projekt w legacy to rekord Umowy w statusie workflow (audyt sekcja 2) — każdy
// przykład tworzy własną, powiązaną Umowę (`Contract.projectId`) niosącą pola
// klasyfikacji/finansów, a pola workflow (opiniujący, notatka, data wysłania)
// żyją na Project. Po jednym przykładzie na każdy z 7 statusów cyklu FAU.

interface ProjectSample {
  seq: string;
  identifier: string;
  status: string;
  reviewer: string | null;
  sentToSignDays: number | null; // ujemne = w przeszłości względem dziś
  lastNote: string;
  subj: string;
  amount: string | null;
  type: string;
  company: string;
  loc: string;
  domain: string;
  nature: string;
  currency: string;
  contractor: number;
  finalized?: boolean; // true = obieg zakończony → Umowa dostaje status "Obowiązująca"
}

// Wartości `status` muszą być dokładnymi nazwami z PROJECT_STATUSES powyżej — tylko
// pierwsza pozycja słownika niesie prefiks „Projekt - ", reszta nie (tak jak w audycie
// legacy skopiowanym 1:1 do PROJECT_STATUSES).
const PROJECT_SAMPLES: ProjectSample[] = [
  { seq: "P01", identifier: "P/2026/0001", status: "Projekt - w toku", reviewer: null, sentToSignDays: null, lastNote: "Czeka na opinię działu prawnego.", subj: "Modernizacja instalacji sprężonego powietrza", amount: "165000.00", type: "Umowa", company: "AMDSP", loc: "Dąbrowa Górnicza I", domain: "Utrzymanie ruchu", nature: "Kosztowa", currency: "PLN", contractor: 3 },
  { seq: "P02", identifier: "P/2026/0002", status: "Wysłane do podpisu", reviewer: "Kowalski Jan", sentToSignDays: -5, lastNote: "Wysłano do podpisu w wersji ostatecznej.", subj: "Umowa serwisowa systemów IT — helpdesk", amount: "88000.00", type: "Umowa", company: "AMC", loc: "Warszawa", domain: "Informatyka/Teleinformatyka", nature: "Kosztowa", currency: "PLN", contractor: 4 },
  { seq: "P03", identifier: "P/2026/0003", status: "Rozpoczęto obieg FAU", reviewer: "Nowak Anna", sentToSignDays: -10, lastNote: "Rozpoczęto obieg FAU — oczekiwanie na akceptacje.", subj: "Dostawa i montaż regałów magazynowych", amount: "54000.00", type: "Zlecenie", company: "SSC", loc: "Gdańsk", domain: "Zakupy - nieprodukcyjne", nature: "Kosztowa", currency: "PLN", contractor: 2 },
  { seq: "P04", identifier: "P/2026/0004", status: "Zakończono obieg FAU", reviewer: "Wiśniewski Piotr", sentToSignDays: -20, lastNote: "Obieg FAU zakończony, oczekiwanie na podpis stron.", subj: "Umowa najmu powierzchni biurowej", amount: "132000.00", type: "Umowa", company: "AMDP", loc: "Kraków", domain: "Najem/Dzierżawa", nature: "Kosztowa", currency: "PLN", contractor: 0 },
  { seq: "P05", identifier: "P/2026/0005", status: "Zakończony", reviewer: "Kowalski Jan", sentToSignDays: -60, lastNote: "Umowa podpisana i zarejestrowana.", subj: "Umowa ramowa na transport hutniczy", amount: "310000.00", type: "Umowa ramowa", company: "ST", loc: "Łódź", domain: "Transport/Spedycja", nature: "Kosztowa", currency: "PLN", contractor: 1, finalized: true },
  { seq: "P06", identifier: "P/2026/0006", status: "Zrealizowany brak umowy", reviewer: "Nowak Anna", sentToSignDays: null, lastNote: "Zrezygnowano z zawarcia umowy — kontrahent wycofał ofertę.", subj: "Wdrożenie systemu monitoringu wizyjnego", amount: "76000.00", type: "Umowa", company: "AMDSP", loc: "Katowice", domain: "Inne", nature: "Kosztowa", currency: "PLN", contractor: 3 },
  { seq: "P07", identifier: "P/2026/0007", status: "Anulowany", reviewer: null, sentToSignDays: null, lastNote: "Projekt anulowany decyzją zamawiającego.", subj: "Kampania promocyjna produktów dystrybucyjnych", amount: "19500.00", type: "Umowa", company: "SSC", loc: "Bydgoszcz", domain: "Reklama", nature: "Kosztowa", currency: "PLN", contractor: 4 },
];

async function seedSampleProjects() {
  const [docTypes, contractStatuses, projectStatuses, companies, locations, domains, natures, currencies, owner] =
    await Promise.all([
      prisma.documentType.findMany(),
      prisma.contractStatus.findMany(),
      prisma.projectStatus.findMany(),
      prisma.company.findMany(),
      prisma.location.findMany(),
      prisma.domain.findMany(),
      prisma.contractNature.findMany(),
      prisma.currency.findMany(),
      prisma.user.findFirst({ where: { login: "admin" } }),
    ]);

  const pick = <T extends { code: string }>(arr: T[], name: string): T | undefined =>
    arr.find((x) => x.code === slug(name));
  const cur = (code: string) => currencies.find((x) => x.code === code.toLowerCase());

  const today = new Date();

  for (const s of PROJECT_SAMPLES) {
    const dateEnd = addDays(today, 365);
    const dateStart = addDays(today, -30);
    const contractData = {
      contractNumber: `U/2026/${s.seq}`,
      subject: s.subj,
      amount: s.amount ?? undefined,
      dateStart,
      dateEnd,
      paymentTerm: "30 dni",
      documentTypeId: pick(docTypes, s.type)?.id,
      statusId: s.finalized ? pick(contractStatuses, "Obowiązująca")?.id : null,
      companyId: pick(companies, s.company)?.id,
      locationId: pick(locations, s.loc)?.id,
      domainId: pick(domains, s.domain)?.id,
      natureId: pick(natures, s.nature)?.id,
      currencyId: cur(s.currency)?.id,
    };
    const contract = await prisma.contract.upsert({
      where: { identifier: `AMDSP/DYS/2026/${s.seq}` },
      update: {
        ...contractData,
        contractors: { set: [{ id: `seed-contractor-${s.contractor + 1}` }] },
      },
      create: {
        identifier: `AMDSP/DYS/2026/${s.seq}`,
        ...contractData,
        contractors: { connect: { id: `seed-contractor-${s.contractor + 1}` } },
        ownerIds: owner ? { connect: { id: owner.id } } : undefined,
        createdById: owner?.id,
      },
    });

    const projectData = {
      subject: s.subj,
      statusId: pick(projectStatuses, s.status)?.id,
      reviewer: s.reviewer,
      lastNote: s.lastNote,
      sentToSign: s.sentToSignDays !== null ? addDays(today, s.sentToSignDays) : null,
    };
    await prisma.project.upsert({
      where: { identifier: s.identifier },
      update: {
        ...projectData,
        contracts: { set: [{ id: contract.id }] },
      },
      create: {
        identifier: s.identifier,
        ...projectData,
        owners: owner ? { connect: { id: owner.id } } : undefined,
        contracts: { connect: { id: contract.id } },
      },
    });
  }
}

async function main() {
  console.log("→ Seed słowników…");
  await seedDictionaries();
  console.log("→ Seed ról i użytkownika admin (admin/admin123)…");
  await seedRolesAndUser();
  console.log("→ Seed przykładowych umów…");
  await seedSampleContracts();
  console.log("→ Seed przykładowych projektów…");
  await seedSampleProjects();
  console.log("✔ Seed zakończony.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
