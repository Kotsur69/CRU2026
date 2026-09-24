import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAdmin } from "@/lib/authz";
import { userLabel, yesNo } from "@/lib/format";
import { intParam } from "@/lib/utils";
import { NAV_ITEMS } from "@/lib/nav";
import { MODULE_PATH, type RegisterModule } from "@/lib/contracts/modules";
import { BLANK_OPTION_NAME } from "@/lib/contracts/dictionaries";
import { Badge } from "@/components/ui/badge";
import { Field, Section } from "@/components/ui/section";
import { loadLocationDetail, type Grantee } from "@/features/lokalizacje/queries";
import { formatCount, isUnused, recordsLabel } from "@/features/lokalizacje/usage";
import {
  GrantForm,
  LocationEditForm,
  RevokeForm,
  type PersonOption,
} from "@/features/lokalizacje/location-admin";

export const dynamic = "force-dynamic";

/**
 * Jedna lokalizacja: „kto widzi Katowice i ile to rekordów" — pytanie, na które lista
 * nie odpowiada (docs/features/22). Oba mechanizmy dostępu są pokazane osobno, bo to,
 * jak się łączą, rozstrzyga dopiero autoryzacja odczytu (spec 03, Q63).
 */

function registerLabel(module: RegisterModule): string {
  return NAV_ITEMS.find((n) => n.href === MODULE_PATH[module])?.label ?? MODULE_PATH[module];
}

/** Legacy dopisuje `[na]` do konta nieaktywnego; rekord z katalogu ma aktywność nieznaną. */
function personOption(user: Grantee): PersonOption {
  const label = userLabel(user);
  return {
    id: user.id,
    label: !user.active && !user.isPlaceholder ? `${label} [na]` : label,
    placeholder: user.isPlaceholder,
  };
}

function GranteeEntry({ user }: { user: Grantee }) {
  return (
    <>
      <Link href={`/dostepy/${user.id}`} className="text-primary hover:underline">
        {userLabel(user)}
      </Link>
      {user.isAdmin && (
        <span title="Administrator widzi wszystkie rekordy — zawężenie do lokalizacji go nie dotyczy.">
          <Badge tone="warning">administrator</Badge>
        </span>
      )}
      {user.isPlaceholder ? (
        <Badge tone="neutral">rekord z katalogu</Badge>
      ) : (
        !user.active && <Badge tone="neutral">nieaktywny</Badge>
      )}
    </>
  );
}

export default async function LokalizacjaPage({ params }: { params: { id: string } }) {
  await requireAdmin();

  const id = intParam(params.id);
  if (id === undefined) notFound();
  const detail = await loadLocationDetail(id);
  if (!detail) notFound();

  const { location, usage, userGrants, scopeGrants, candidates } = detail;
  const isBlank = location.name === BLANK_OPTION_NAME;

  return (
    <div className="max-w-4xl space-y-5">
      <div>
        <Link href="/lokalizacje" className="text-sm text-muted-foreground hover:text-foreground">
          ← Lokalizacje i dostępy
        </Link>
        <div className="mt-2 flex flex-wrap items-center gap-3">
          <h1 className="font-heading text-2xl font-semibold">{location.name}</h1>
          <Badge tone={location.active ? "success" : "neutral"}>
            {location.active ? "Aktywna" : "Wyłączona"}
          </Badge>
          {isUnused(usage) && <Badge tone="neutral">nieużywana</Badge>}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
        <Section title="Dane">
          <dl>
            <Field label="Nazwa">{location.name}</Field>
            <Field label="Aktywna">{yesNo(location.active)}</Field>
            <Field label="Identyfikator">{location.id}</Field>
          </dl>
          {/* 41% rejestru wskazuje tę pozycję — nie może czytać się jak nazwa miejsca. */}
          {isBlank && (
            <p className="mt-3 rounded-md border border-amber-600/25 bg-amber-50 px-3 py-2 text-sm text-amber-900">
              Pozycja słownikowa oznaczająca brak danych — {recordsLabel(usage.primary)}.
            </p>
          )}
        </Section>

        <Section title="Wykorzystanie">
          <dl>
            <Field label="Jako lokalizacja główna">{recordsLabel(usage.primary)}</Field>
            <Field label="Jako lokalizacja dodatkowa">{recordsLabel(usage.linked)}</Field>
            <Field label="W obu naraz">{recordsLabel(usage.both)}</Field>
          </dl>
          <p className="mt-2 text-xs text-muted-foreground">
            Pole „Lokalizacja" i tabela powiązań <code>contract_has_location</code> rzadko się
            pokrywają — powiązanie zwykle wskazuje inne miejsce niż lokalizacja główna.
            „Dodatkowa" liczy wszystkie wiersze tabeli powiązań, także rekordów usuniętych.
          </p>
          <p className="mt-3 text-sm text-muted-foreground">W rejestrach (główna lub dodatkowa):</p>
          <ul className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-sm">
            {usage.registers.map((r) => (
              <li key={r.module}>
                <Link
                  href={`${MODULE_PATH[r.module]}?location=${location.id}`}
                  className="text-primary hover:underline"
                >
                  {registerLabel(r.module)}:{" "}
                  <span className="tabular-nums">{formatCount(r.count)}</span>
                </Link>
              </li>
            ))}
          </ul>
        </Section>
      </div>

      <Section title={`Dostęp — użytkownicy (${userGrants.length})`}>
        <p className="mb-3 text-xs text-muted-foreground">
          Starszy mechanizm: tabela <code>users_locations</code>. Przypisanie zawęża, a nie
          rozszerza — kto nie ma żadnego, nie jest ograniczony lokalizacją; kto ma, ma widzieć
          rekordy tylko z przypisanych. Rejestry zaczną to stosować wraz z autoryzacją odczytu.
        </p>
        {userGrants.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Nikt nie ma przypisanej tej lokalizacji.
          </p>
        ) : (
          <ul className="divide-y divide-border/60">
            {userGrants.map((u) => (
              <li key={u.id} className="flex flex-wrap items-center gap-2 py-1.5 text-sm">
                <GranteeEntry user={u} />
                <span className="ml-auto">
                  <RevokeForm
                    locationId={location.id}
                    locationName={location.name}
                    userId={u.id}
                    userName={userLabel(u)}
                  />
                </span>
              </li>
            ))}
          </ul>
        )}
        <GrantForm locationId={location.id} people={candidates.map(personOption)} />
      </Section>

      <Section title={`Dostęp — zakresy (${scopeGrants.length})`}>
        <p className="mb-3 text-xs text-muted-foreground">
          Nowszy mechanizm: wymiar „Lokalizacja" w metamodelu dostępów (<code>access</code>,{" "}
          <code>useraccess</code>). Tylko do odczytu — zakresy należą do modułu Dostępy. Czy
          łączą się z przypisaniami powyżej przez „i", czy „lub", rozstrzyga autoryzacja
          odczytu (Q63).
        </p>
        {scopeGrants.length === 0 ? (
          <p className="text-sm text-muted-foreground">Żaden zakres nie wskazuje tej lokalizacji.</p>
        ) : (
          <ul className="divide-y divide-border/60">
            {scopeGrants.map((u) => (
              <li key={u.id} className="flex flex-wrap items-center gap-2 py-1.5 text-sm">
                <GranteeEntry user={u} />
              </li>
            ))}
          </ul>
        )}
      </Section>

      <Section title="Zmień nazwę / aktywność">
        {isBlank ? (
          <p className="text-sm text-muted-foreground">
            Tej pozycji nie zmieniamy: formularz nowego wpisu odnajduje ją po nazwie i ustawia
            jako domyślną lokalizację.
          </p>
        ) : (
          <LocationEditForm
            locationId={location.id}
            name={location.name}
            active={location.active}
          />
        )}
      </Section>
    </div>
  );
}
