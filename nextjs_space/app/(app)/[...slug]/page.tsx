import { notFound } from "next/navigation";
import { ModulePlaceholder } from "@/components/module-placeholder";
import { NAV_ITEMS } from "@/lib/nav";

// Catch-all tylko dla korzeni modułów jeszcze niebudowanych (dziś: Supply chain).
// Każda inna ścieżka — `/umowy/1/2/3`, `/lokalizacje/5`, `/raporty/x` — to 404, a nie
// „Moduł w budowie" (docs/features/05).
export default function ModuleCatchAll({ params }: { params: { slug: string[] } }) {
  if (params.slug.length !== 1) notFound();
  const item = NAV_ITEMS.find((n) => !n.ready && n.href === `/${params.slug[0]}`);
  if (!item) notFound();
  return <ModulePlaceholder title={item.label} />;
}
