"use client";

import { Suspense } from "react";
import Link from "next/link";
import { signOut, useSession } from "next-auth/react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { LogOut } from "lucide-react";
import { navItemsFor } from "@/lib/nav";
import { NotificationBell } from "./notification-bell";
import { cn } from "@/lib/utils";

const LOCALES = ["pl", "en"] as const;

// Przełącznik języka zrobiony POPRAWNIE (legacy miał bug PL→?lang=en).
function LangSwitch() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const current = (params.get("lang") ?? "pl").toLowerCase();

  const setLang = (lang: string) => {
    const next = new URLSearchParams(params.toString());
    next.set("lang", lang);
    router.replace(`${pathname}?${next.toString()}`);
  };

  return (
    <div className="flex items-center gap-1 text-sm">
      {LOCALES.map((l) => (
        <button
          key={l}
          onClick={() => setLang(l)}
          className={cn(
            "rounded px-2 py-1 uppercase transition",
            current === l
              ? "bg-white/20 font-semibold text-white"
              : "text-white/70 hover:text-white",
          )}
        >
          {l}
        </button>
      ))}
    </div>
  );
}

export function Topbar() {
  const { data: session } = useSession();
  const pathname = usePathname();

  return (
    <header className="bg-brand-gradient text-white shadow">
      <div className="flex h-14 items-center justify-between px-6">
        <div className="font-heading text-lg font-semibold tracking-wide">
          AMDS CRU
        </div>
        <div className="flex items-center gap-4">
          {/* useSearchParams() forces a client bailout; without this boundary the
              statically rendered routes fail to prerender. */}
          <Suspense fallback={<div className="h-7 w-16" aria-hidden />}>
            <LangSwitch />
          </Suspense>
          {session && <NotificationBell />}
          {session?.user?.name && (
            <span className="hidden text-sm text-white/80 sm:inline">
              {session.user.name}
            </span>
          )}
          <button
            onClick={() => signOut({ callbackUrl: "/login" })}
            className="flex items-center gap-1.5 rounded bg-white/15 px-3 py-1.5 text-sm transition hover:bg-white/25"
          >
            <LogOut className="h-4 w-4" />
            Wyloguj
          </button>
        </div>
      </div>

      <nav
        aria-label="Nawigacja główna"
        className="flex items-center gap-1 overflow-x-auto border-t border-white/15 px-4 py-1.5"
      >
        {navItemsFor(session?.user?.role === "admin").map((item) => {
          const active = pathname.startsWith(item.href);
          const Icon = item.icon;

          if (!item.ready) {
            return (
              <span
                key={item.href}
                title={`${item.label} — moduł w budowie`}
                className="flex shrink-0 cursor-not-allowed items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs text-white/40"
              >
                <Icon className="h-3.5 w-3.5" />
                {item.label}
              </span>
            );
          }

          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex shrink-0 items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70",
                active
                  ? "bg-white/20 font-medium text-white"
                  : "text-white/75 hover:bg-white/10 hover:text-white",
              )}
            >
              <Icon className="h-3.5 w-3.5" />
              {item.label}
            </Link>
          );
        })}
      </nav>
    </header>
  );
}
