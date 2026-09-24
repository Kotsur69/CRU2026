import Link from "next/link";
import { redirect } from "next/navigation";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { currentActor } from "@/lib/authz";
import { formatDateTime, userLabel } from "@/lib/format";
import { pageParam, pageSizeParam } from "@/lib/utils";
import { buttonClass } from "@/components/ui/button";
import { Pagination } from "@/components/ui/pagination";
import { cn } from "@/lib/utils";
import { markAllRead, markRead } from "@/features/powiadomienia/actions";

export const dynamic = "force-dynamic";

type SP = Record<string, string | undefined>;

const DEFAULT_PAGE_SIZE = 25;
/** Legacy `shoutboxview` ucina treść notatki do 150 znaków. */
const EXCERPT = 150;

/**
 * Skrzynka powiadomień (docs/features/15). Legacy ma ją jako widok `shoutboxview`:
 * nieprzeczytane, najnowsze pierwsze — po dacie NOTATKI, nie powiadomienia — z wycinkiem
 * 150 znaków. Archiwum („Wszystkie") jest nasze: nie móc znaleźć czegoś już przeczytanego
 * jest gorsze niż dłuższa lista.
 *
 * Legacy łączy tabele złączeniami wewnętrznymi, więc powiadomienie bez notatki albo umowy
 * po cichu znika. U nas zostaje i pokazuje nagrobek — ukrywanie to sposób na zgubienie
 * sprawy, o której nikt nie wie.
 */
export default async function PowiadomieniaPage({ searchParams }: { searchParams: SP }) {
  const actor = await currentActor();
  if (!actor) redirect("/login");

  const showAll = searchParams.widok === "wszystkie";
  const page = pageParam(searchParams.page);
  const pageSize = pageSizeParam(searchParams.pageSize, DEFAULT_PAGE_SIZE);

  const where: Prisma.ShoutboxRecipientWhereInput = {
    userId: actor.id,
    ...(showAll ? {} : { isRead: false }),
  };

  const [unread, total, rows] = await Promise.all([
    prisma.shoutboxRecipient.count({ where: { userId: actor.id, isRead: false } }),
    prisma.shoutboxRecipient.count({ where }),
    prisma.shoutboxRecipient.findMany({
      where,
      // Najnowsze po dacie notatki, jak w legacy; wiersz bez notatki — po id na końcu.
      orderBy: [{ shoutbox: { remark: { createdAt: "desc" } } }, { id: "desc" }],
      skip: (page - 1) * pageSize,
      take: pageSize,
      select: {
        id: true,
        isRead: true,
        readAt: true,
        shoutbox: {
          select: {
            message: { select: { name: true } },
            contract: { select: { id: true, identifier: true, isDeleted: true } },
            remark: {
              select: {
                body: true,
                createdAt: true,
                user: { select: { id: true, firstName: true, lastName: true, login: true } },
              },
            },
          },
        },
      },
    }),
  ]);

  const tab = (active: boolean) =>
    cn(
      "rounded-md px-3 py-1.5 text-sm transition",
      active ? "bg-primary text-primary-foreground" : "border hover:bg-muted",
    );

  return (
    <div className="max-w-4xl">
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-heading text-2xl font-semibold">Powiadomienia</h1>
          <p className="text-sm text-muted-foreground">
            Nieprzeczytane: <strong className="text-foreground">{unread}</strong>
          </p>
        </div>
        {unread > 0 && (
          <form action={markAllRead}>
            <button type="submit" className={buttonClass("secondary")}>
              oznacz wszystkie jako przeczytane
            </button>
          </form>
        )}
      </div>

      <div className="mb-4 flex gap-2">
        <Link href="/powiadomienia" className={tab(!showAll)}>
          Nieprzeczytane
        </Link>
        <Link href="/powiadomienia?widok=wszystkie" className={tab(showAll)}>
          Wszystkie
        </Link>
      </div>

      {rows.length === 0 ? (
        <p className="rounded-lg border bg-card p-5 text-sm text-muted-foreground shadow-sm">
          {showAll ? "Brak powiadomień." : "Brak nowych powiadomień."}
        </p>
      ) : (
        <ul className="divide-y rounded-lg border bg-card shadow-sm">
          {rows.map((r) => {
            const note = r.shoutbox.remark;
            const contract = r.shoutbox.contract;
            const gone = !contract || contract.isDeleted;
            // Własne notatki wyciszamy — do tego służyło `myid` w widoku legacy.
            const mine = note?.user?.id === actor.id;
            const body = note?.body ?? "";
            const excerpt = body.length > EXCERPT ? `${body.slice(0, EXCERPT)}…` : body;
            return (
              <li
                key={r.id}
                className={cn("flex gap-3 px-4 py-3", r.isRead && "text-muted-foreground")}
              >
                <span
                  aria-label={r.isRead ? "przeczytane" : "nieprzeczytane"}
                  className={cn(
                    "mt-1.5 h-2 w-2 shrink-0 rounded-full",
                    r.isRead ? "bg-transparent" : "bg-primary",
                  )}
                />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 text-sm">
                    <span className="tabular-nums text-xs">
                      {note ? formatDateTime(note.createdAt) : "—"}
                    </span>
                    {gone ? (
                      <span className="italic">umowa usunięta</span>
                    ) : (
                      // Zwykłe <a>: <Link> robiłby prefetch, a otwarcie oznacza przeczytanie.
                      <a
                        href={`/powiadomienia/${r.id}`}
                        className={cn("text-primary hover:underline", !r.isRead && "font-semibold")}
                      >
                        {contract.identifier ?? `#${contract.id}`}
                      </a>
                    )}
                    <span className="text-xs">{r.shoutbox.message?.name ?? "powiadomienie"}</span>
                  </div>
                  <p
                    className={cn(
                      "mt-1 whitespace-pre-line break-words text-sm",
                      !r.isRead && !mine && "text-foreground",
                      mine && "text-muted-foreground",
                    )}
                  >
                    {note ? excerpt || "(pusta notatka)" : "notatka usunięta"}
                  </p>
                  <div className="mt-1 flex flex-wrap items-center justify-between gap-2 text-xs">
                    <span>
                      {note?.user ? userLabel(note.user) : "—"}
                      {mine && " (Ty)"}
                      {r.readAt && ` · przeczytano ${formatDateTime(r.readAt)}`}
                    </span>
                    {!r.isRead && (
                      <form action={markRead}>
                        <input type="hidden" name="id" value={r.id} />
                        <button type="submit" className="text-primary hover:underline">
                          oznacz jako przeczytane
                        </button>
                      </form>
                    )}
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      <Pagination
        basePath="/powiadomienia"
        searchParams={searchParams}
        page={page}
        pageSize={pageSize}
        total={total}
      />
    </div>
  );
}
