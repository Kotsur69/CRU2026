import { Topbar } from "@/components/layout/topbar";
import { MainNav } from "@/components/layout/main-nav";

// Shell zalogowanej aplikacji: topbar + menu 10 modułów + treść.
export default function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-screen flex-col">
      <Topbar />
      <div className="flex flex-1 items-start">
        <MainNav />
        <main className="min-w-0 flex-1 overflow-x-auto p-6">{children}</main>
      </div>
    </div>
  );
}
