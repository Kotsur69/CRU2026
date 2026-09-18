import type { Tone } from "@/components/ui/badge";

/** Ton badge'a dla statusu umowy (Obowiązująca = zielony, Zakończona = wygaszony). */
export function statusTone(name?: string | null): Tone {
  if (!name) return "neutral";
  const n = name.toLowerCase();
  if (n.includes("obowiąz")) return "success";
  if (n.includes("zakończ")) return "neutral";
  return "info";
}

/** Ton badge'a dla statusu projektu (workflow FAU — inny cykl niż umowa). */
export function projectStatusTone(name?: string | null): Tone {
  if (!name) return "neutral";
  const n = name.toLowerCase();
  if (n.includes("anulowan")) return "danger";
  if (n.includes("zrealizowany brak umowy")) return "warning";
  if (n.includes("wysłane") || n.includes("obieg")) return "info"; // w tym "zakończono obieg FAU" — jeszcze nie finalny
  if (n.includes("zakończ")) return "success";
  return "neutral"; // w toku
}

/** Ton badge'a dla statusu rekordu Działu ryzyka (aktywny / w sądzie / zakończony). */
export function riskStatusTone(name?: string | null): Tone {
  if (!name) return "neutral";
  const n = name.toLowerCase();
  if (n.includes("w sądzie")) return "danger";
  if (n.includes("aktywny")) return "warning";
  if (n.includes("zakończ")) return "neutral";
  return "info";
}

const DAY_MS = 86_400_000;
const SOON_DAYS = 30; // ≤ 30 dni → pilne (czerwony)
const WATCH_DAYS = 90; // ≤ 90 dni → obserwacja (bursztyn)

export interface EndInfo {
  /** Liczba dni do końca (ujemna = po terminie). */
  days: number;
  /** Ton sygnalizacji; `neutral` = nic pilnego. */
  tone: Tone;
  /** Krótka etykieta względna, np. „za 12 dni"; `null` gdy nic nie sygnalizujemy. */
  label: string | null;
  expired: boolean;
}

/** Odmiana „dzień/dni" (PL): 1 → dzień, reszta → dni. */
function dniLabel(days: number): string {
  return days === 1 ? "dzień" : "dni";
}

/**
 * Sygnalizacja wygasania umowy — sedno domeny (śledzenie końca umów).
 * Umowy zakończone nie są „pilne": nie krzyczymy kolorem, tylko oznaczamy fakt po terminie.
 */
export function endUrgency(
  dateEnd: Date | null | undefined,
  statusName?: string | null,
): EndInfo | null {
  if (!dateEnd) return null;
  const days = Math.ceil((dateEnd.getTime() - Date.now()) / DAY_MS);
  const done = (statusName ?? "").toLowerCase().includes("zakończ");

  if (done) {
    return { days, tone: "neutral", label: null, expired: days < 0 };
  }
  if (days < 0) return { days, tone: "danger", label: "po terminie", expired: true };
  if (days === 0) return { days, tone: "danger", label: "kończy się dziś", expired: false };
  if (days <= SOON_DAYS) {
    return { days, tone: "danger", label: `za ${days} ${dniLabel(days)}`, expired: false };
  }
  if (days <= WATCH_DAYS) {
    return { days, tone: "warning", label: `za ${days} ${dniLabel(days)}`, expired: false };
  }
  return { days, tone: "neutral", label: null, expired: false };
}
