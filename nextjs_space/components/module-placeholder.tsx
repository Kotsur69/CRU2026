import { Construction } from "lucide-react";

export function ModulePlaceholder({ title }: { title: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-24 text-center">
      <Construction className="h-10 w-10 text-brand-orange" />
      <h1 className="font-heading text-xl font-semibold">{title}</h1>
      <p className="max-w-md text-sm text-muted-foreground">
        Moduł istnieje w systemie legacy, ale jego wnętrze nie zostało jeszcze
        odtworzone. Wymaga audytu z konta z odpowiednimi uprawnieniami.
      </p>
    </div>
  );
}
