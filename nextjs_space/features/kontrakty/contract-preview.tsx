import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { contractorLabel, formatDate, formatDateTime, formatMoney, userLabel } from "@/lib/format";
import { Badge } from "@/components/ui/badge";
import { Fact, Field, FlagChip, Section } from "@/components/ui/section";
import { endUrgency } from "@/lib/contract-status";
import { currentActor, canEditContract } from "@/lib/authz";
import { compareIdentifiers } from "@/lib/contracts/identifier";
import {
  MODULE_PATH,
  REGISTER_LABEL,
  moduleStatusTone,
  modulePath,
  registerOf,
  type RegisterModule,
} from "@/lib/contracts/modules";
import { contractorLabelWithNip } from "@/lib/contractors";
import { partitionRelations } from "@/lib/contracts/relations";
import { buttonClass } from "@/components/ui/button";
import { ContractActions } from "./contract-actions";
import { NOTES_SHOWN, NotesThread } from "./notes-thread";
import { OpinionRound } from "./opinion-round";
import { AttachmentList } from "@/components/ui/attachment-list";
import { AttachmentDelete, AttachmentUpload } from "./attachment-controls";

/**
 * Podgląd rekordu `contract` — jeden ekran dla Umów, Projektów i Działu ryzyka
 * (docs/features/05, 09). Legacy trzyma trzy moduły w jednej tabeli, więc treść i
 * etykiety są wspólne; różnice między modułami są strukturalne (paleta statusu, obieg
 * FAU, powiązania, pola zawsze puste w ryzyku) i wynikają z modułu, nie z rekordu.
 *
 * Kolejność pól w sekcjach idzie za audytem (§1.4, 34 pola); pola bez wartości
 * pokazują „—", żeby układ był stały między rekordami.
 */

const PERSON = { id: true, firstName: true, lastName: true, login: true } as const;

/** Tyle aneksów widać od razu; długi ogon (rekord: 58) rozwija „pokaż wszystkie". */
const ANNEXES_SHOWN = 10;

type Person = { id: number; firstName: string | null; lastName: string | null; login: string | null };

/** Stopka audytu pokazuje login, jak legacy („mborowiecka"); nazwisko jest w podpowiedzi. */
function AccountName({ user }: { user: Person | null }) {
  if (!user) return null;
  return <span title={userLabel(user)}>{user.login ?? userLabel(user)}</span>;
}

interface LinkedRecord {
  id: number;
  identifier: string | null;
  module: "CONTRACT" | "PROJECT" | "RISK" | "LEGACY_2021";
}

function RecordLink({ record }: { record: LinkedRecord }) {
  return (
    <Link href={`${modulePath(record.module)}/${record.id}`} className="text-primary hover:underline">
      {record.identifier ?? `#${record.id}`}
    </Link>
  );
}

/** Lista powiązanych rekordów rozdzielona średnikami — tak pole „Project" pokazuje legacy. */
function RecordLinks({ records }: { records: LinkedRecord[] }) {
  if (records.length === 0) return null;
  return (
    <span>
      {records.map((r, i) => (
        <span key={r.id}>
          <RecordLink record={r} />
          {i < records.length - 1 ? "; " : ""}
        </span>
      ))}
    </span>
  );
}

export interface ContractPreviewProps {
  /** Legacy `contract.id`, already validated by the calling route. */
  id: number;
  /** Rejestr trasy — rekord z innego modułu nie renderuje się pod cudzym adresem. */
  module: RegisterModule;
  /** `?aneksy=wszystkie` — pełna lista aneksów zamiast pierwszych dziesięciu. */
  showAllAnnexes?: boolean;
  /** `?notatki=wszystkie` — cały wątek notatek. */
  showAllNotes?: boolean;
}

export async function ContractPreview({
  id,
  module,
  showAllAnnexes = false,
  showAllNotes = false,
}: ContractPreviewProps) {
  const c = await prisma.contract.findUnique({
    where: { id },
    include: {
      documentType: true,
      status: true,
      businessline: true,
      company: true,
      primaryLocation: true,
      locations: { include: { location: true } },
      domain: true,
      nature: true,
      trade: true,
      currency: true,
      noticePeriod: true,
      deliveryMethod: true,
      contractor: true,
      debtor: true,
      acceptanceForm: true,
      parent: {
        select: {
          id: true,
          identifier: true,
          module: true,
          // Rodzeństwo aneksu — „który aneks jest aktualny" to pytanie przy 58 zmianach.
          annexes: { where: { isDeleted: false }, select: { id: true, identifier: true, module: true } },
        },
      },
      // `parentId` niesie i aneksy, i projekty, z których umowa powstała — jedno wczytanie,
      // podział w pamięci po module dziecka (docs/features/07, 09).
      annexes: {
        where: { isDeleted: false },
        select: {
          id: true,
          identifier: true,
          module: true,
          dateBegin: true,
          salary: true,
          currency: { select: { code: true } },
          documentType: { select: { name: true } },
          status: { select: { name: true } },
        },
      },
      attachments: { orderBy: [{ isFinal: "desc" }, { id: "asc" }] },
      userAccess: { orderBy: { readOnly: "asc" }, include: { user: { select: PERSON } } },
      // Wszystkie prośby, także wycofane — sekcja obiegu chowa je pod „pokaż wycofane".
      opinions: {
        orderBy: { id: "asc" },
        include: { opinionType: true, user: { select: PERSON } },
      },
      remarkEntries: {
        where: { active: true },
        orderBy: { createdAt: "desc" },
        include: { user: { select: PERSON } },
      },
      opinionsRequestedBy: { select: PERSON },
      registeredBy: { select: PERSON },
      modifiedBy: { select: PERSON },
    },
  });

  // Rekord spoza rejestru trasy to 404, jak rekord nieistniejący — zła ścieżka dawała
  // zły odnośnik powrotny, złe przyciski i złą paletę statusu (docs/features/05).
  if (!c || c.isDeleted || registerOf(c.module) !== module) notFound();

  const isRisk = module === "RISK";
  const isProject = module === "PROJECT";
  const backHref = MODULE_PATH[module];

  const actor = await currentActor();
  const canEdit = actor !== null && (await canEditContract(actor, c.id));
  const frozen = !c.isEditable && !actor?.isAdmin;

  const money = formatMoney(c.salary?.toString(), c.currency?.code?.toUpperCase());
  const end = endUrgency(c.dateEnd, c.status?.name);
  // Every contract_users row is an assignee — "Właściciel umowy" in legacy. `onlyRead`
  // grades editing rights within that set (see lib/contract-access.ts).
  const owners = c.userAccess.map((a) => userLabel(a.user));
  const editors = c.userAccess.filter((a) => !a.readOnly).map((a) => userLabel(a.user));
  const reviewers = Array.from(
    new Set(
      c.opinions.filter((o) => o.active).map((o) => (o.user ? userLabel(o.user) : null)).filter(Boolean),
    ),
  ) as string[];
  // The primary location FK and the many-to-many table are both populated in legacy.
  const locations = Array.from(
    new Set(
      [c.primaryLocation?.name, ...c.locations.map((l) => l.location.name)].filter(
        (n): n is string => Boolean(n),
      ),
    ),
  );
  const relations = partitionRelations({
    module: c.module,
    parent: c.parent,
    // Kolejność po numerze aneksu, liczbowo — `/A10` po `/A2` (docs/features/11).
    children: [...c.annexes].sort((a, b) => compareIdentifiers(a.identifier, b.identifier)),
  });
  const siblings = relations.annexOf
    ? (c.parent?.annexes ?? [])
        .filter((a) => a.id !== c.id && a.module === c.module)
        .sort((a, b) => compareIdentifiers(a.identifier, b.identifier))
    : [];
  const shownAnnexes = showAllAnnexes ? relations.annexes : relations.annexes.slice(0, ANNEXES_SHOWN);
  const counterparty = c.contractor ? contractorLabelWithNip(c.contractor) : null;
  const debtor = c.debtor ? contractorLabelWithNip(c.debtor) : null;
  // Obieg FAU: zawsze na projektach, na umowach tylko gdy są wpisy (40 rekordów), w
  // Dziale ryzyka nigdy (docs/features/09).
  const showOpinions = isProject || (!isRisk && (c.opinions.length > 0 || c.acceptanceForm !== null));

  return (
    <div className="max-w-5xl space-y-5">
      {/* Nagłówek */}
      <div>
        <Link href={backHref} className="text-sm text-muted-foreground hover:text-foreground">
          ← {REGISTER_LABEL[module]}
        </Link>
        <div className="mt-2 flex flex-wrap items-center gap-3">
          <h1 className="font-heading text-2xl font-semibold">{c.identifier ?? `#${c.id}`}</h1>
          {c.status ? (
            <Badge tone={moduleStatusTone(c.module, c.status.name)}>{c.status.name}</Badge>
          ) : (
            <Badge tone="warning">brak statusu</Badge>
          )}
          {c.documentType?.name && <Badge tone="brand">{c.documentType.name}</Badge>}
          {relations.annexOf && (
            <Badge tone="info">
              Aneks do <RecordLink record={relations.annexOf} />
            </Badge>
          )}
          {relations.resultingContract && (
            <Badge tone="success">
              Umowa: <RecordLink record={relations.resultingContract} />
            </Badge>
          )}
        </div>
        {!isRisk && c.description && <p className="mt-2 text-muted-foreground">{c.description}</p>}
      </div>

      {/* Pasek akcji — jak w legacy pod podglądem umowy (audyt 1.5). */}
      <ContractActions
        recordId={c.id}
        basePath={backHref}
        canEdit={canEdit}
        frozen={frozen}
        // Aneksy są cechą umów i projektów; rekordy Działu ryzyka ich nie mają, a aneks
        // nie dostaje własnych aneksów (docs/features/11).
        allowAnnexes={!isRisk && !relations.annexOf}
      />

      {/* Kluczowe fakty */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        <Fact label="Spółka">{c.company?.shortName}</Fact>
        {isRisk ? (
          <Fact label="Dłużnik">
            {c.debtor
              ? c.debtorId === c.contractorId
                ? "— (ten sam co kontrahent)"
                : contractorLabel(c.debtor)
              : "—"}
          </Fact>
        ) : (
          <Fact label="Lokalizacja">
            {locations.length ? locations[0] : "—"}
            {locations.length > 1 && (
              <span className="text-muted-foreground"> +{locations.length - 1}</span>
            )}
          </Fact>
        )}
        <Fact label="Kontrahenci">{c.contractor ? contractorLabel(c.contractor) : "—"}</Fact>
        <Fact label={isRisk ? "Kwota" : "Wynagrodzenie"} emphasize>
          <span className="tabular-nums">{money}</span>
        </Fact>
        <Fact label="Okres obowiązywania">
          <span className="tabular-nums">
            {formatDate(c.dateBegin)} – {formatDate(c.dateEnd)}
          </span>
          {end?.label && (
            <div className="mt-1">
              <Badge tone={end.tone}>{end.label}</Badge>
            </div>
          )}
        </Fact>
      </div>

      {/* Sekcje szczegółowe */}
      <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
        {isProject && (
          <Section title="Workflow projektu">
            <dl>
              <Field label="Status">{c.status?.name}</Field>
              <Field label="Koordynator obiegu">
                {c.opinionsRequestedBy ? userLabel(c.opinionsRequestedBy) : null}
              </Field>
              <Field label="Opiniujący">{reviewers.length ? reviewers.join(", ") : null}</Field>
              <Field label="Data wysłania do podpisu">
                {c.sentOn && <span className="tabular-nums">{formatDate(c.sentOn)}</span>}
              </Field>
              <Field label="Ostatnia notatka">{c.remarkEntries[0]?.body}</Field>
            </dl>
          </Section>
        )}

        <Section title="Klasyfikacja">
          <dl>
            <Field label="Buissnesline">{c.businessline?.name}</Field>
            <Field label="Typ dokumentu">{c.documentType?.name}</Field>
            <Field label="Numer umowy">{c.contractReference}</Field>
            <Field label={isRisk ? "Rodzaj" : "Rodzaj umowy"}>{c.domain?.name}</Field>
            {!isRisk && <Field label="Charakter umowy">{c.nature?.name}</Field>}
            <Field label="Lokalizacje">{locations.length ? locations.join(", ") : null}</Field>
          </dl>
        </Section>

        <Section title={isRisk ? "Kwota" : "Przedmiot i wynagrodzenie"}>
          <dl>
            {!isRisk && <Field label="Przedmiot umowy">{c.description}</Field>}
            <Field label={isRisk ? "Kwota" : "Wynagrodzenie"}>
              <span className="tabular-nums">{money}</span>
            </Field>
            <Field label="Waluta">{c.currency?.code?.toUpperCase()}</Field>
            <Field label="Inne określenie wynagrodzenia">{c.specificSalaryTerms}</Field>
            <Field label="Termin płatności">{c.paymentTerm}</Field>
          </dl>
        </Section>

        <Section title="Terminy">
          <dl>
            <Field label="Data zawarcia">
              {c.dateBegin && <span className="tabular-nums">{formatDate(c.dateBegin)}</span>}
            </Field>
            <Field label="Data zakończenia">
              {/* Brak daty JEST zapisem „na czas nieokreślony" — tak czyta to legacy. */}
              {c.dateEnd === null ? (
                "na czas nieokreślony"
              ) : (
                <span className="tabular-nums">{formatDate(c.dateEnd)}</span>
              )}
              {end?.label && (
                <Badge tone={end.tone} className="ml-2">
                  {end.label}
                </Badge>
              )}
            </Field>
            <Field label="Okres wypowiedzenia">{c.noticePeriod?.name}</Field>
            <Field label="Data wysłania do podpisu">
              {c.sentOn && <span className="tabular-nums">{formatDate(c.sentOn)}</span>}
            </Field>
          </dl>
        </Section>

        <Section title="Dostawa i handel">
          <dl>
            <Field label="Forma doręczenia">{c.deliveryMethod?.name}</Field>
            {!isRisk && <Field label="Eksport/Import">{c.trade?.name}</Field>}
            <Field label="Opis OBSC">{c.obscDescription}</Field>
          </dl>
        </Section>

        <Section title="Strony">
          <dl>
            <Field label="Kontrahenci">{counterparty}</Field>
            {/* Dłużnik nie jest w podglądzie legacy — pokazujemy go, bo 14 215 rekordów go
                ma, a jego znaczenie poza Działem ryzyka jest otwarte (Q40). */}
            <Field label="Dłużnik">{debtor}</Field>
            <Field label="Właściciel umowy">{owners.length ? owners.join("; ") : null}</Field>
            <Field label="Prawo edycji">{editors.length ? editors.join("; ") : null}</Field>
          </dl>
        </Section>

        <Section title="Cechy">
          <div className="flex flex-wrap gap-2">
            <FlagChip on={c.bill} label="Weksel" />
            <FlagChip on={c.companiesConnected} label="Podmiot powiązane" />
            <FlagChip on={c.tempForm} label="Formularz" />
            <FlagChip on={c.obsc} label="OBSC" />
            {/* Poza podglądem legacy — 204 rekordy ją mają (docs/features/09). */}
            <FlagChip on={c.insuranceGuarantee} label="Gwarancja/ubezpieczenie" />
          </div>
        </Section>

        {/* Powiązania — trzy pola legacy z jednej relacji `parentId` (audyt §1.4, pola 4–6).
            W ryzyku `parentId` jest pusty na wszystkich 406 rekordach. */}
        {!isRisk && (
          <Section title="Powiązania">
            <dl>
              {isProject ? (
                <>
                  <Field label="Umowa">
                    {relations.resultingContract && (
                      <RecordLink record={relations.resultingContract} />
                    )}
                  </Field>
                  {relations.parentProject && (
                    <Field label="Projekt nadrzędny">
                      <RecordLink record={relations.parentProject} />
                    </Field>
                  )}
                  <Field label="Projekty aneksów">
                    {relations.annexes.length > 0 ? <RecordLinks records={relations.annexes} /> : null}
                  </Field>
                </>
              ) : (
                <>
                  <Field label="Aneks do umowy">
                    {relations.annexOf && <RecordLink record={relations.annexOf} />}
                  </Field>
                  {relations.annexOf ? (
                    <Field label="Pozostałe aneksy umowy">
                      {siblings.length > 0 ? <RecordLinks records={siblings} /> : null}
                    </Field>
                  ) : (
                    <Field label="Aneksy do umowy">
                      {relations.annexes.length > 0 ? (
                        <a href="#aneksy" className="text-primary hover:underline">
                          {relations.annexes.length} — lista poniżej
                        </a>
                      ) : null}
                    </Field>
                  )}
                  {/* Etykieta po angielsku, jak w legacy (audyt §1.4, pole 5). */}
                  <Field label="Project">
                    {relations.projects.length > 0 ? <RecordLinks records={relations.projects} /> : null}
                  </Field>
                </>
              )}
            </dl>
          </Section>
        )}
      </div>

      {/* Aneksy do umowy — tabela, nie lista po przecinku: ogon sięga 58 aneksów. Sekcji
          nie ma, gdy aneksów nie ma (docs/features/11). */}
      {module === "CONTRACT" && relations.annexes.length > 0 && (
        <section id="aneksy" className="rounded-lg border bg-card p-5 shadow-sm">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <h2 className="font-heading text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Aneksy do umowy ({relations.annexes.length})
            </h2>
            {canEdit && (
              <div className="flex flex-wrap gap-2">
                <Link href={`${backHref}/${c.id}/aneks`} className={buttonClass("secondary")}>
                  Dodaj aneks
                </Link>
                <Link href={`${backHref}/${c.id}/projekt-aneksu`} className={buttonClass("secondary")}>
                  Stwórz projekt aneksu
                </Link>
              </div>
            )}
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-left text-xs uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="py-1 pr-3 font-semibold">Identyfikator</th>
                  <th className="py-1 pr-3 font-semibold">Typ dokumentu</th>
                  <th className="py-1 pr-3 font-semibold">Status</th>
                  <th className="py-1 pr-3 font-semibold">Data zawarcia</th>
                  <th className="py-1 text-right font-semibold">Wynagrodzenie</th>
                </tr>
              </thead>
              <tbody>
                {shownAnnexes.map((a) => (
                  <tr key={a.id} className="border-t border-border/60">
                    <td className="py-1.5 pr-3">
                      <RecordLink record={a} />
                    </td>
                    <td className="py-1.5 pr-3">{a.documentType?.name ?? "—"}</td>
                    <td className="py-1.5 pr-3">
                      {a.status ? (
                        <Badge tone={moduleStatusTone(a.module, a.status.name)}>{a.status.name}</Badge>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td className="py-1.5 pr-3 tabular-nums">{formatDate(a.dateBegin)}</td>
                    <td className="py-1.5 text-right tabular-nums">
                      {formatMoney(a.salary?.toString(), a.currency?.code?.toUpperCase())}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {relations.annexes.length > shownAnnexes.length && (
            <Link href={`${backHref}/${c.id}?aneksy=wszystkie#aneksy`} className="mt-2 inline-block text-sm text-primary hover:underline">
              pokaż wszystkie ({relations.annexes.length})
            </Link>
          )}
        </section>
      )}

      {/* Uwagi — zawsze widoczne: legacy wypisuje etykietę także pustą. */}
      <Section title="Uwagi">
        {c.remarks ? (
          <p className="whitespace-pre-line text-sm">{c.remarks}</p>
        ) : (
          <p className="text-sm text-muted-foreground">Brak uwag.</p>
        )}
      </Section>

      {/* Notatki — wątek z legacy `remarks` i „dodaj notatkę" (docs/features/14). */}
      <Section title="Notatki" id="notatki">
        <NotesThread
          recordId={c.id}
          notes={showAllNotes ? c.remarkEntries : c.remarkEntries.slice(0, NOTES_SHOWN)}
          total={c.remarkEntries.length}
          moreHref={`${backHref}/${c.id}?notatki=wszystkie#notatki`}
          actorId={actor?.id ?? null}
          composer={actor !== null}
        />
      </Section>

      {/* Załączniki (przez StorageAdapter, docs/features/18). Funkcja „wyślij jako
          załącznik" świadomie POMINIĘTA — wykluczenie w README. */}
      <Section title={`Załączniki (${c.attachments.length})`} id="zalaczniki">
        {canEdit && (
          <div className="mb-3">
            <AttachmentUpload contractId={c.id} />
          </div>
        )}
        <AttachmentList
          attachments={c.attachments}
          deleteButton={
            canEdit
              ? (a) => <AttachmentDelete id={a.id} name={a.name ?? a.storageKey ?? `#${a.id}`} />
              : undefined
          }
        />
      </Section>

      {/* Obieg FAU (docs/features/16) — z akcjami na projektach, tylko do odczytu gdzie indziej. */}
      {showOpinions && (
        <OpinionRound
          recordId={c.id}
          opinions={c.opinions}
          coordinator={c.opinionsRequestedBy}
          actor={actor}
          canEdit={canEdit}
          readOnly={!isProject}
          acceptanceForm={
            c.acceptanceForm && (
              <dl className="mb-4">
                <Field label="Procedura MDR">{c.acceptanceForm.mdrProcedure ? "Tak" : "Nie"}</Field>
                <Field label="Weryfikacja wstępna">
                  {c.acceptanceForm.initialVerification ? "Tak" : "Nie"}
                </Field>
                <Field label="Formularz wysłany">{c.acceptanceForm.formSent ? "Tak" : "Nie"}</Field>
                <Field label="Akceptacja właściciela">
                  {c.acceptanceForm.ownerAccepted
                    ? `Tak · ${formatDateTime(c.acceptanceForm.ownerAcceptedAt)}`
                    : "Nie"}
                </Field>
              </dl>
            )
          }
        />
      )}

      {/* Audyt — legacy podaje znacznik czasu co do sekundy i LOGIN autora (audyt §1.4). */}
      <Section title="Audyt">
        <dl>
          <Field label="Data rejestracji">
            <span className="tabular-nums">{formatDateTime(c.registeredAt)}</span>
          </Field>
          <Field label="Zarejestrowano przez">
            {c.registeredBy && <AccountName user={c.registeredBy} />}
          </Field>
          {/* Stopka prowadzi do pełnej historii zmian (docs/features/13). */}
          <Field label="Data modyfikacji">
            {c.modifiedAt && (
              <Link href={`${backHref}/${c.id}/historia`} className="tabular-nums text-primary hover:underline">
                {formatDateTime(c.modifiedAt)}
              </Link>
            )}
          </Field>
          <Field label="Modyfikowano przez">
            {c.modifiedBy && (
              <Link href={`${backHref}/${c.id}/historia`} className="text-primary hover:underline">
                <AccountName user={c.modifiedBy} />
              </Link>
            )}
          </Field>
        </dl>
      </Section>
    </div>
  );
}
