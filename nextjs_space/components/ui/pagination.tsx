import Link from "next/link";

// Stopka paginacji rejestru — legacy pokazuje „Wyświetlanie od X do Y z Z rekordów"
// pod każdą siatką (audyt 1.3), więc układ jest wspólny dla wszystkich modułów.
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

  const hrefForPage = (target: number) => {
    const q = new URLSearchParams();
    for (const [key, value] of Object.entries(searchParams)) {
      if (typeof value === "string" && value !== "") q.set(key, value);
    }
    q.set("page", String(target));
    return `${basePath}?${q.toString()}`;
  };

  return (
    <div className="mt-4 flex items-center justify-between gap-2 text-sm text-muted-foreground">
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
        <div className="flex items-center gap-2">
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
        </div>
      )}
    </div>
  );
}
