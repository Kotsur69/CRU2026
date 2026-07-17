"use client";

import { useRouter } from "next/navigation";
import { cn } from "@/lib/utils";

/**
 * Wiersz tabeli klikalny myszką w całości. Dostępność: właściwym celem
 * fokusa/klawiatury pozostaje link (np. identyfikator) wewnątrz wiersza —
 * tu dokładamy jedynie wygodę kliknięcia w dowolne miejsce wiersza.
 * Ignorujemy kliknięcia w zagnieżdżone interaktywne elementy (link/przycisk).
 */
export function ClickableRow({
  href,
  children,
  className,
}: {
  href: string;
  children: React.ReactNode;
  className?: string;
}) {
  const router = useRouter();

  return (
    <tr
      onClick={(e) => {
        if ((e.target as HTMLElement).closest("a,button")) return;
        router.push(href);
      }}
      className={cn(
        "cursor-pointer border-t transition-colors hover:bg-accent/40",
        className,
      )}
    >
      {children}
    </tr>
  );
}
