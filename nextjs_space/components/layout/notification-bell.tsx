"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Bell } from "lucide-react";

/**
 * Dzwonek z liczbą nieprzeczytanych (docs/features/15). Liczba odświeża się przy każdej
 * nawigacji — bez odpytywania w tle: kilka powiadomień tygodniowo nie uzasadnia
 * websocketu.
 */
export function NotificationBell() {
  const pathname = usePathname();
  const [unread, setUnread] = useState<number | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/powiadomienia/licznik", { signal: controller.signal, cache: "no-store" })
      .then((res) => (res.ok ? res.json() : null))
      .then((data: { unread: number } | null) => {
        if (data) setUnread(data.unread);
      })
      .catch(() => {
        // Przerwane przy kolejnej nawigacji albo brak sesji — dzwonek zostaje bez liczby.
      });
    return () => controller.abort();
  }, [pathname]);

  const label = unread ? `Powiadomienia: ${unread} nieprzeczytanych` : "Powiadomienia";
  return (
    <Link
      href="/powiadomienia"
      title={label}
      aria-label={label}
      className="relative flex h-8 w-8 items-center justify-center rounded transition hover:bg-white/15"
    >
      <Bell className="h-5 w-5" />
      {unread ? (
        <span className="absolute -right-1 -top-1 min-w-[1.25rem] rounded-full bg-brand-orange px-1 text-center text-[11px] font-semibold leading-5 text-white">
          {unread > 99 ? "99+" : unread}
        </span>
      ) : null}
    </Link>
  );
}
