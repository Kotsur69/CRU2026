import { redirect } from "next/navigation";

// Ekran startowy → moduł flagowy (Umowy).
export default function HomePage() {
  redirect("/umowy");
}
