import { NewRecordPage } from "@/features/kontrakty/form-page";

export const dynamic = "force-dynamic";

export default function NowaUmowaPage() {
  return <NewRecordPage kind="CONTRACT" basePath="/umowy" />;
}
