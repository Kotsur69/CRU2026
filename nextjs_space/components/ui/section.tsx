import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

/**
 * Prymitywy ekranów szczegółów: karta sekcji, wiersz etykieta–wartość, kafelek faktu
 * i znacznik flagi. Jedno źródło dla podglądu rekordu, kontrahenta, grupy i dostępu.
 */

export function Section({
  title,
  children,
  className,
}: {
  title: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={cn("rounded-lg border bg-card p-5 shadow-sm", className)}>
      <h2 className="mb-3 font-heading text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        {title}
      </h2>
      {children}
    </section>
  );
}

/** Wiersz `<dt>/<dd>`; pusta wartość renderuje „—", żeby układ nie skakał między rekordami. */
export function Field({ label, children }: { label: string; children?: React.ReactNode }) {
  const empty = children === null || children === undefined || children === "";
  return (
    <div className="grid grid-cols-3 gap-3 border-b border-border/60 py-2 last:border-0">
      <dt className="col-span-1 text-sm text-muted-foreground">{label}</dt>
      <dd className="col-span-2 text-sm">{empty ? "—" : children}</dd>
    </div>
  );
}

export function Fact({
  label,
  children,
  emphasize,
}: {
  label: string;
  children: React.ReactNode;
  emphasize?: boolean;
}) {
  return (
    <div className="rounded-lg border bg-card p-3 shadow-sm">
      <div className="text-xs uppercase tracking-wide text-muted-foreground">{label}</div>
      <div
        className={emphasize ? "mt-1 font-heading text-lg font-semibold" : "mt-1 text-sm font-medium"}
      >
        {children ?? "—"}
      </div>
    </div>
  );
}

export function FlagChip({ on, label }: { on: boolean | null; label: string }) {
  // Tri-state in legacy: 1 / 0 / -1 ("nie określono") — null must not read as "no".
  if (on === null) return <Badge tone="neutral">? {label}</Badge>;
  return (
    <Badge tone={on ? "success" : "neutral"}>
      {on ? "✓" : "–"} {label}
    </Badge>
  );
}
