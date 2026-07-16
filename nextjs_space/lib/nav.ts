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

// 10 pozycji menu legacy (audyt sekcja 0). Budujemy Umowy + Projekty; reszta = placeholder.
export const NAV_ITEMS: NavItem[] = [
  { label: "Umowy", href: "/umowy", icon: FileText, ready: true },
  { label: "Projekty", href: "/projekty", icon: FolderKanban, ready: true },
  { label: "Dział ryzyka", href: "/ryzyko", icon: ShieldAlert, ready: false },
  { label: "Supply chain", href: "/supply-chain", icon: Truck, ready: false },
  { label: "Kontrahenci", href: "/kontrahenci", icon: Users, ready: false },
  { label: "Grupy", href: "/grupy", icon: UsersRound, ready: false },
  { label: "Lokalizacja dostępy", href: "/lokalizacje", icon: MapPin, ready: false },
  { label: "Dostępy", href: "/dostepy", icon: KeyRound, ready: false },
  { label: "Raporty", href: "/raporty", icon: BarChart3, ready: false },
  { label: "Mailing", href: "/mailing", icon: Mail, ready: false },
];
