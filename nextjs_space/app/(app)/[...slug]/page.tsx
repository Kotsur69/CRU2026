import { ModulePlaceholder } from "@/components/module-placeholder";
import { NAV_ITEMS } from "@/lib/nav";

// Catch-all dla modułów jeszcze niebudowanych (Ryzyko, Supply chain, ... ).
// Trasy konkretne (umowy, projekty) mają pierwszeństwo nad tym catch-all.
export default function ModuleCatchAll({
  params,
}: {
  params: { slug: string[] };
}) {
  const href = "/" + (params.slug?.[0] ?? "");
  const item = NAV_ITEMS.find((n) => n.href === href);
  return <ModulePlaceholder title={item?.label ?? "Moduł w budowie"} />;
}
