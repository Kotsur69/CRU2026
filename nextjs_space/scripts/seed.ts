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

async function seedSampleContracts() {
  const [docType, status, company, location, domain, nature, currency, owner] =
    await Promise.all([
      prisma.documentType.findFirst({ where: { code: slug("Umowa") } }),
      prisma.contractStatus.findFirst({ where: { code: slug("Obowiązująca") } }),
      prisma.company.findFirst({ where: { code: slug("AMDSP") } }),
      prisma.location.findFirst({ where: { code: slug("Katowice") } }),
      prisma.domain.findFirst({ where: { code: slug("Usługi") } }),
      prisma.contractNature.findFirst({ where: { code: slug("Kosztowa") } }),
      prisma.currency.findFirst({ where: { code: "pln" } }),
      prisma.user.findFirst({ where: { login: "admin" } }),
    ]);

  const contractor = await prisma.contractor.upsert({
    where: { id: "seed-contractor-1" },
    update: {},
    create: { id: "seed-contractor-1", name: "Przykładowy Kontrahent Sp. z o.o.", nip: "6340197453" },
  });

  const samples = [
    { identifier: "AMDSP/DYS/2026/0001", contractNumber: "U/2026/0001", subject: "Usługi serwisowe hali produkcyjnej", amount: "120000.00" },
    { identifier: "AMDSP/DYS/2026/0002", contractNumber: "U/2026/0002", subject: "Dostawa materiałów biurowych", amount: "24500.00" },
    { identifier: "AMDSP/DYS/2026/0003", contractNumber: "U/2026/0003", subject: "Transport wewnętrzny — logistyka", amount: "89000.00" },
  ];

  for (const s of samples) {
    await prisma.contract.upsert({
      where: { identifier: s.identifier },
      update: {},
      create: {
        identifier: s.identifier,
        contractNumber: s.contractNumber,
        subject: s.subject,
        amount: s.amount,
        dateStart: new Date("2026-01-15"),
        dateEnd: new Date("2027-01-14"),
        paymentTerm: "30 dni",
        documentTypeId: docType?.id,
        statusId: status?.id,
        companyId: company?.id,
        locationId: location?.id,
        domainId: domain?.id,
        natureId: nature?.id,
        currencyId: currency?.id,
        obsc: false,
        contractors: { connect: { id: contractor.id } },
        ownerIds: owner ? { connect: { id: owner.id } } : undefined,
        createdById: owner?.id,
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
