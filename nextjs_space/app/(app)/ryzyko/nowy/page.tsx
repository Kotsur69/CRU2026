import { NewRecordPage } from "@/features/kontrakty/form-page";

export const dynamic = "force-dynamic";

export default function NowyWpisRyzykaPage() {
  return <NewRecordPage kind="RISK" basePath="/ryzyko" />;
}
