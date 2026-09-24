import Link from "next/link";

// Stopka paginacji rejestru — legacy pokazuje „Wyświetlanie od X do Y z Z rekordów"
// pod każdą siatką (audyt 1.3), więc układ jest wspólny dla wszystkich modułów.
// „Idź do strony" to też pole z legacy: przy 10 000 rekordów para poprzednia/następna
// nie jest nawigacją.
export interface PaginationProps {
  basePath: string;
  searchParams: Record<string, string | undefined>;
  page: number;
  pageSize: number;
  total: number;
}

export function Pagination({ basePath, searchParams, page, pageSize, total }: PaginationProps) {
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const from = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const to = Math.min(total, page * pageSize);

  const kept = Object.entries(searchParams).filter(
    (entry): entry is [string, string] =>
      entry[0] !== "page" && typeof entry[1] === "string" && entry[1] !== "",
  );

  const hrefForPage = (target: number) => {
    const q = new URLSearchParams(kept);
    q.set("page", String(target));
    return `${basePath}?${q.toString()}`;
  };

  return (
    <div className="mt-4 flex flex-wrap items-center justify-between gap-2 text-sm text-muted-foreground">
      <span>
        {total > 0 ? (
          <>
            Pokazano{" "}
            <strong className="text-foreground">
              {from}–{to}
            </strong>{" "}
            z <strong className="text-foreground">{total}</strong>
          </>
        ) : (
          "Brak wyników"
        )}
      </span>
      {totalPages > 1 && (
        <div className="flex flex-wrap items-center gap-2">
          {page > 1 && (
            <Link
              href={hrefForPage(page - 1)}
              className="rounded-md border px-3 py-1 transition hover:bg-muted"
            >
              ← Poprzednia
            </Link>
          )}
          <span className="px-1">
            Strona {page} z {totalPages}
          </span>
          {page < totalPages && (
            <Link
              href={hrefForPage(page + 1)}
              className="rounded-md border px-3 py-1 transition hover:bg-muted"
            >
              Następna →
            </Link>
          )}
          <form method="get" action={basePath} className="flex items-center gap-1">
            {kept.map(([key, value]) => (
              <input key={key} type="hidden" name={key} value={value} />
            ))}
            <label className="flex items-center gap-1">
              <span>Idź do strony</span>
              <input
                type="number"
                name="page"
                min={1}
                max={totalPages}
                defaultValue={page}
                className="w-20 rounded-md border border-input px-2 py-1 text-sm text-foreground"
              />
            </label>
            <button type="submit" className="rounded-md border px-2 py-1 transition hover:bg-muted">
              OK
            </button>
          </form>
        </div>
      )}
    </div>
  );
}
