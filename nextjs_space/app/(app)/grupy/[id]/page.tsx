import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/authz";
import { formatDateTime, userLabel, userOptionLabel, yesNo } from "@/lib/format";
import {
  formerMembers,
  GROUP_NAME_MAX,
  MEMBERSHIP_ACTION_LABEL,
  sortByLabel,
  splitGroupHistory,
} from "@/lib/groups";
import { Badge } from "@/components/ui/badge";
import { Field, Section } from "@/components/ui/section";
import { GroupEditForm } from "@/features/grupy/group-edit-form";
import { AddMemberForm, RemoveMemberButton } from "@/features/grupy/membership-forms";

export const dynamic = "force-dynamic";

const PERSON_SELECT = {
  id: true,
  firstName: true,
  lastName: true,
  login: true,
  active: true,
  isAdmin: true,
  isPlaceholder: true,
} as const;

const HEAD_CELL = "px-2 py-1.5 font-semibold";
const BODY_CELL = "whitespace-normal break-words px-2 py-1.5 align-top";
const PEOPLE_GRID = "grid grid-cols-1 gap-x-6 gap-y-1 text-sm sm:grid-cols-2 lg:grid-cols-3";

export default async function GrupaPage({ params }: { params: { id: string } }) {
  // Najpierw uprawnienie, potem id: nie-administrator dostaje 404 dla każdego adresu,
  // więc nie da się nawet sprawdzić, czy grupa o danym numerze istnieje.
  await requireAdmin();

  // Route params are untrusted: the legacy primary key is an integer, nothing else.
  const id = Number.parseInt(params.id, 10);
  if (!Number.isSafeInteger(id) || id <= 0) notFound();

  const [g, people, businesslines] = await Promise.all([
    prisma.group.findUnique({
      where: { id },
      include: {
        owner: { select: PERSON_SELECT },
        businessline: true,
        opinionTypes: { orderBy: { id: "asc" } },
        members: { include: { user: { select: PERSON_SELECT } } },
        history: {
          include: {
            user: { select: PERSON_SELECT },
            changedBy: { select: PERSON_SELECT },
          },
        },
      },
    }),
    // Katalog ma ~450 osób — wybór właściciela i nowego członka to zwykły `<select>`,
    // tak jak „Właściciel umowy" w formularzu umowy.
    prisma.user.findMany({ select: PERSON_SELECT }),
    prisma.businessline.findMany({ orderBy: [{ sortOrder: "asc" }, { name: "asc" }] }),
  ]);

  if (!g) notFound();

  const members = sortByLabel(g.members, (m) => userLabel(m.user));
  const memberIds = new Set(g.members.map((m) => m.userId));
  const { changes, legacy } = splitGroupHistory(g.history, (h) => userLabel(h.user));
  const removed = sortByLabel(formerMembers(changes, memberIds), (h) => userLabel(h.user));

  const options = sortByLabel(people, userLabel).map((u) => ({
    id: String(u.id),
    name: userOptionLabel(u),
  }));
  const candidates = options.filter((o) => !memberIds.has(Number(o.id)));
  // Wygaszony buissnesline znika z wyboru, chyba że grupa już go ma.
  const lineOptions = businesslines
    .filter((b) => b.active || b.id === g.businesslineId)
    .map((b) => ({ id: String(b.id), name: b.name }));

  return (
    <div className="max-w-5xl space-y-5">
      <div>
        <Link href="/grupy" className="text-sm text-muted-foreground hover:text-foreground">
          ← Grupy
        </Link>
        <div className="mt-2 flex flex-wrap items-center gap-3">
          <h1 className="font-heading text-2xl font-semibold">{g.name}</h1>
          <Badge tone={g.active ? "success" : "neutral"}>
            {g.active ? "Aktywna" : "Nieaktywna"}
          </Badge>
          {g.businessline && <Badge tone="brand">{g.businessline.name}</Badge>}
        </div>
      </div>

      <Section title="Dane">
        <dl>
          <Field label="Nazwa">{g.name}</Field>
          <Field label="Aktywna">{yesNo(g.active)}</Field>
          <Field label="Właściciel">
            {g.owner && (
              <Link href={`/dostepy/${g.owner.id}`} className="text-primary hover:underline">
                {userLabel(g.owner)}
              </Link>
            )}
          </Field>
          <Field label="Buissnesline">{g.businessline?.name}</Field>
        </dl>
        <GroupEditForm
          group={{
            id: g.id,
            name: g.name,
            active: g.active,
            ownerId: g.ownerId,
            businesslineId: g.businesslineId,
          }}
          people={options}
          businesslines={lineOptions}
          nameMax={GROUP_NAME_MAX}
        />
      </Section>

      {/* Odnośniki do listy zaległych opinii danego rodzaju (`/opinie?type=N`) dojdą razem
          z tym ekranem — spec 16 wstrzymał go do decyzji Q20. Do tego czasu same nazwy. */}
      <Section title={`Rodzaje opinii (${g.opinionTypes.length})`}>
        {g.opinionTypes.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Grupa nie jest podpięta pod żaden rodzaj opinii.
          </p>
        ) : (
          <ul className="space-y-1 text-sm">
            {g.opinionTypes.map((t) => (
              <li key={t.id}>{t.name}</li>
            ))}
          </ul>
        )}
      </Section>

      <Section title={`Członkowie (${members.length})`}>
        {g.active ? (
          <AddMemberForm groupId={g.id} candidates={candidates} />
        ) : (
          <p className="mb-4 rounded-md border border-amber-600/25 bg-amber-50 px-3 py-2 text-sm text-amber-800">
            Grupa jest nieaktywna, więc jej skład jest zamrożony — to jedyny zapis, kto należał
            do niej, gdy działała. Aby dodać lub usunąć członka, najpierw aktywuj grupę
            (Edytuj).
          </p>
        )}
        {members.length === 0 ? (
          <p className="text-sm text-muted-foreground">Grupa nie ma przypisanych osób.</p>
        ) : (
          <ul className={PEOPLE_GRID}>
            {members.map((m) => (
              <li key={m.userId} className="flex min-w-0 items-center gap-2">
                <Link
                  href={`/dostepy/${m.userId}`}
                  className="min-w-0 truncate text-primary hover:underline"
                >
                  {userLabel(m.user)}
                </Link>
                {m.user.isAdmin && <Badge tone="warning">admin</Badge>}
                {!m.user.active && !m.user.isPlaceholder && <Badge>nieaktywny</Badge>}
                {g.active && (
                  <RemoveMemberButton
                    groupId={g.id}
                    userId={m.userId}
                    personName={userLabel(m.user)}
                    groupName={g.name}
                  />
                )}
              </li>
            ))}
          </ul>
        )}
      </Section>

      <Section title={`Byli członkowie (${removed.length + legacy.length})`}>
        {removed.length === 0 && legacy.length === 0 && (
          <p className="text-sm text-muted-foreground">Nikt jeszcze z grupy nie odszedł.</p>
        )}

        {removed.length > 0 && (
          <ul className="mb-5 space-y-1 text-sm">
            {removed.map((h) => (
              <li key={h.id} className="flex flex-wrap items-baseline gap-x-2">
                <Link href={`/dostepy/${h.userId}`} className="text-primary hover:underline">
                  {userLabel(h.user)}
                </Link>
                <span className="text-xs text-muted-foreground">
                  usunięto <span className="tabular-nums">{formatDateTime(h.changedAt)}</span>
                  {h.changedBy && <> · {userLabel(h.changedBy)}</>}
                </span>
              </li>
            ))}
          </ul>
        )}

        {/* Legacy `users_groups_history` to sama para (osoba, grupa). Nie zgadujemy dat
            ani kolejności — lista idzie alfabetem, a nie po id. */}
        {legacy.length > 0 && (
          <div>
            <h3 className="text-sm font-medium">
              legacy — brak dat{" "}
              <span className="font-normal text-muted-foreground">({legacy.length})</span>
            </h3>
            <p className="mb-2 mt-1 text-xs text-muted-foreground">
              Stary system zapisywał tylko, że ktoś był w grupie — bez daty, powodu i autora
              zmiany.
            </p>
            <ul className={PEOPLE_GRID}>
              {legacy.map((h) => (
                <li key={h.id} className="flex min-w-0 items-center gap-2">
                  <Link
                    href={`/dostepy/${h.userId}`}
                    className="min-w-0 truncate text-primary hover:underline"
                  >
                    {userLabel(h.user)}
                  </Link>
                  {memberIds.has(h.userId) && <Badge tone="info">obecnie członek</Badge>}
                </li>
              ))}
            </ul>
          </div>
        )}
      </Section>

      <Section title={`Historia zmian składu (${changes.length})`}>
        {changes.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Każde dodanie i usunięcie członka trafi tutaj — z datą i autorem zmiany.
          </p>
        ) : (
          <div className="overflow-x-auto rounded-md border">
            <table className="w-full text-xs">
              <thead className="bg-muted/60 text-left text-[11px] uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className={HEAD_CELL}>Data</th>
                  <th className={HEAD_CELL}>Zmiana</th>
                  <th className={HEAD_CELL}>Osoba</th>
                  <th className={HEAD_CELL}>Autor zmiany</th>
                </tr>
              </thead>
              <tbody>
                {changes.map((h) => (
                  <tr key={h.id} className="border-t">
                    <td className={`${BODY_CELL} tabular-nums`}>{formatDateTime(h.changedAt)}</td>
                    <td className={BODY_CELL}>
                      {h.action ? MEMBERSHIP_ACTION_LABEL[h.action] : "—"}
                    </td>
                    <td className={BODY_CELL}>
                      <Link href={`/dostepy/${h.userId}`} className="text-primary hover:underline">
                        {userLabel(h.user)}
                      </Link>
                    </td>
                    <td className={BODY_CELL}>{h.changedBy ? userLabel(h.changedBy) : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Section>
    </div>
  );
}
