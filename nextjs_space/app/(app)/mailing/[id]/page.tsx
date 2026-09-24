import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/authz";
import { ASSIGNEE_SELECT } from "@/lib/contract-access";
import {
  AMBIGUITY_LABEL,
  CONFIDENCE_LABEL,
  PLACEHOLDER_LOGIN_PREFIX,
  conventionKeys,
  proposalsForContact,
  proposeMatches,
  type Confidence,
  type ContactProposal,
  type LoginEntry,
} from "@/lib/mailing/match";
import { loadMatchInputs } from "@/lib/mailing/sources";
import { Badge, type Tone } from "@/components/ui/badge";
import { Field, Section } from "@/components/ui/section";
import { ContactAddress, MatchedUser } from "@/components/mailing/contact-fields";

export const dynamic = "force-dynamic";

const CONFIDENCE_TONE: Record<Confidence, Tone> = {
  high: "success",
  medium: "info",
  low: "warning",
};

/**
 * Karta kontaktu. Spec przewiduje tu akcję „ustaw / wyczyść dopasowanie" — nie ma jej:
 * przypisanie nazwiska i adresu do konta wymaga zgody (Q67), więc strona pokazuje tylko
 * propozycję, liczoną tą samą regułą co skrypt `scripts/legacy/match-mailing-to-users.ts`.
 */
export default async function MailingContactPage({ params }: { params: { id: string } }) {
  await requireAdmin();

  // Route params are untrusted: the legacy primary key is an integer, nothing else.
  const id = Number.parseInt(params.id, 10);
  if (!Number.isSafeInteger(id) || id <= 0) notFound();

  const contact = await prisma.mailingContact.findUnique({
    where: { id },
    include: { mailingGroup: true, user: { select: ASSIGNEE_SELECT } },
  });
  if (!contact) notFound();

  const keys = conventionKeys(contact);
  const expected = [...new Set([...keys.name, ...keys.address])];

  let proposals: ContactProposal<LoginEntry>[] = [];
  let placeholders = 0;
  if (!contact.user) {
    const { logins, contacts } = await loadMatchInputs(prisma);
    proposals = proposalsForContact(proposeMatches(logins, contacts), contact.id);
    if (proposals.length === 0) {
      placeholders = await prisma.user.count({
        where: { login: { startsWith: PLACEHOLDER_LOGIN_PREFIX } },
      });
    }
  }

  const name =
    [contact.firstName, contact.lastName].filter(Boolean).join(" ") || `Kontakt #${contact.id}`;

  return (
    <div className="max-w-4xl space-y-5">
      <div>
        <Link href="/mailing" className="text-sm text-muted-foreground hover:text-foreground">
          ← Mailing
        </Link>
        <div className="mt-2 flex flex-wrap items-center gap-3">
          <h1 className="font-heading text-2xl font-semibold">{name}</h1>
          <Badge tone={contact.user ? "success" : "neutral"}>
            {contact.user ? "dopasowany do konta" : "brak dopasowania"}
          </Badge>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
        <Section title="Kontakt">
          <dl>
            <Field label="Imię">{contact.firstName}</Field>
            <Field label="Nazwisko">{contact.lastName}</Field>
            <Field label="E-mail">
              <ContactAddress email={contact.email} />
            </Field>
            <Field label="Grupa">{contact.mailingGroup?.name}</Field>
            <Field label="Nr kontaktu w CRU">
              <span className="tabular-nums">{contact.id}</span>
            </Field>
          </dl>
        </Section>

        <Section title="Dopasowanie do konta">
          <dl>
            <Field label="Konto">
              <MatchedUser user={contact.user} />
            </Field>
            <Field label="Login wg konwencji">
              {expected.length === 0 ? null : (
                <>
                  <span className="font-mono text-xs">{expected.join(", ")}</span>
                  {keys.partial.length > 0 && (
                    <span className="mt-1 block text-xs text-muted-foreground">
                      części nazwiska: {keys.partial.join(", ")}
                    </span>
                  )}
                </>
              )}
            </Field>
          </dl>

          {!contact.user && (
            <div className="mt-4 border-t pt-3">
              <h3 className="text-sm font-medium">Propozycja</h3>
              {proposals.length === 0 ? (
                <p className="mt-1 text-sm text-muted-foreground">
                  Żadne konto nie ma dziś takiego loginu.
                  {placeholders > 0 && (
                    <>
                      {" "}
                      Konta z loginem zastępczym {PLACEHOLDER_LOGIN_PREFIX}…: {placeholders} —
                      prawdziwe loginy przyjdą z eksportem katalogu użytkowników.
                    </>
                  )}
                </p>
              ) : (
                <ul className="mt-2 space-y-2 text-sm">
                  {proposals.map((p) => (
                    <li key={p.login.login} className="flex flex-wrap items-center gap-2">
                      {p.login.userId === null ? (
                        <span className="font-mono text-xs">{p.login.login}</span>
                      ) : (
                        <Link
                          href={`/dostepy/${p.login.userId}`}
                          className="font-mono text-xs text-primary hover:underline"
                        >
                          {p.login.login}
                        </Link>
                      )}
                      <Badge tone={CONFIDENCE_TONE[p.confidence]}>
                        pewność {CONFIDENCE_LABEL[p.confidence]}
                      </Badge>
                      <span className="text-muted-foreground">
                        {p.reason ? `niejednoznaczne: ${AMBIGUITY_LABEL[p.reason]}` : "jednoznaczne"}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
              <p className="mt-3 text-xs text-muted-foreground">
                Propozycja jest tylko do wglądu. Przypisanie kontaktu do konta czeka na decyzję,
                czy spis mailingowy może zasilać dane użytkowników — do tego czasu aplikacja
                niczego tu nie zapisuje.
              </p>
            </div>
          )}
        </Section>
      </div>
    </div>
  );
}
