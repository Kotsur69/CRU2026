import {
  FileText, FolderKanban, ShieldAlert, Truck, Users, UsersRound,
  MapPin, KeyRound, BarChart3, Mail, type LucideIcon,
} from "lucide-react";

export interface NavItem {
  label: string;
  href: string;
  icon: LucideIcon;
  /** false = moduł jeszcze niebudowany (placeholder / wygaszony). */
  ready: boolean;
}

// 10 pozycji menu legacy (audyt sekcja 0). Wszystkie poza Supply chain mają pokrycie
// w danych z `cru.sql` i własny rejestr. Supply chain zostaje placeholderem: dump nie
// niesie dla niego żadnej tabeli, a audyt nie mógł wejść do modułu (Access deny),
// więc nie ma czego odtwarzać bez zgadywania.
export const NAV_ITEMS: NavItem[] = [
  { label: "Umowy", href: "/umowy", icon: FileText, ready: true },
  { label: "Projekty", href: "/projekty", icon: FolderKanban, ready: true },
  { label: "Dział ryzyka", href: "/ryzyko", icon: ShieldAlert, ready: true },
  { label: "Supply chain", href: "/supply-chain", icon: Truck, ready: false },
  { label: "Kontrahenci", href: "/kontrahenci", icon: Users, ready: true },
  { label: "Grupy", href: "/grupy", icon: UsersRound, ready: true },
  { label: "Lokalizacja dostępy", href: "/lokalizacje", icon: MapPin, ready: true },
  { label: "Dostępy", href: "/dostepy", icon: KeyRound, ready: true },
  { label: "Raporty", href: "/raporty", icon: BarChart3, ready: true },
  { label: "Mailing", href: "/mailing", icon: Mail, ready: true },
];
