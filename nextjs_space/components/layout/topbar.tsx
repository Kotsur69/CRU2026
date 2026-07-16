"use client";

import { signOut, useSession } from "next-auth/react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { LogOut } from "lucide-react";
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

  return (
    <header className="flex h-14 items-center justify-between bg-brand-gradient px-6 text-white shadow">
      <div className="font-heading text-lg font-semibold tracking-wide">
        AMDS CRU
      </div>
      <div className="flex items-center gap-4">
        <LangSwitch />
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
    </header>
  );
}
