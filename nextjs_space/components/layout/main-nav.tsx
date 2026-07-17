"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { NAV_ITEMS } from "@/lib/nav";
import { cn } from "@/lib/utils";

export function MainNav() {
  const pathname = usePathname();

  return (
    <nav
      aria-label="Szybka nawigacja"
      className="sticky top-0 flex w-14 shrink-0 flex-col items-center gap-1 border-r bg-muted/40 py-3"
    >
      {NAV_ITEMS.map((item) => {
        const active = pathname.startsWith(item.href);
        const Icon = item.icon;

        if (!item.ready) {
          return (
            <span
              key={item.href}
              title={`${item.label} — moduł w budowie`}
              aria-label={`${item.label} — moduł w budowie`}
              className="flex h-11 w-11 shrink-0 cursor-not-allowed items-center justify-center rounded-md text-muted-foreground/40"
            >
              <Icon className="h-5 w-5" />
            </span>
          );
        }

        return (
          <Link
            key={item.href}
            href={item.href}
            title={item.label}
            aria-label={item.label}
            className={cn(
              "flex h-11 w-11 shrink-0 items-center justify-center rounded-md transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary",
              active
                ? "bg-primary text-primary-foreground"
                : "text-foreground hover:bg-muted",
            )}
          >
            <Icon className="h-5 w-5" />
          </Link>
        );
      })}
    </nav>
  );
}
