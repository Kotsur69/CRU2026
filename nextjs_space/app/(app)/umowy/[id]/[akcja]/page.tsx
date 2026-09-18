import { RecordActionPage } from "@/features/kontrakty/record-action-page";

export const dynamic = "force-dynamic";

export default function UmowaAkcjaPage(props: {
  params: { id: string; akcja: string };
  searchParams: Record<string, string | undefined>;
}) {
  return <RecordActionPage {...props} basePath="/umowy" />;
}
