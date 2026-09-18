import { NewRecordPage } from "@/features/kontrakty/form-page";

export const dynamic = "force-dynamic";

export default function NowyProjektPage() {
  return <NewRecordPage kind="PROJECT" basePath="/projekty" />;
}
