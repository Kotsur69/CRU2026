import { RecordActionPage } from "@/features/kontrakty/record-action-page";

export const dynamic = "force-dynamic";

export default function RyzykoAkcjaPage(props: {
  params: { id: string; akcja: string };
  searchParams: Record<string, string | undefined>;
}) {
  return <RecordActionPage {...props} module="RISK" />;
}
