import { cn } from "@/lib/utils";

// Tony semantyczne dla oznaczeń (status umowy, sygnalizacja wygasania, cechy).
// Kolor NIGDY nie niesie znaczenia sam — badge zawsze ma też tekst (WCAG color-not-only).
export type Tone = "neutral" | "success" | "warning" | "danger" | "info" | "brand";

const TONE: Record<Tone, string> = {
  neutral: "bg-slate-100 text-slate-600 ring-slate-500/20",
  success: "bg-emerald-50 text-emerald-700 ring-emerald-600/20",
  warning: "bg-amber-50 text-amber-800 ring-amber-600/25",
  danger: "bg-red-50 text-red-700 ring-red-600/20",
  info: "bg-sky-50 text-sky-700 ring-sky-600/20",
  brand: "bg-accent text-accent-foreground ring-primary/20",
};

export function Badge({
  tone = "neutral",
  className,
  children,
}: {
  tone?: Tone;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset",
        TONE[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}
