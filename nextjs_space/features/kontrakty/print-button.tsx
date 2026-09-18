"use client";

import { Button } from "@/components/ui/button";

/** Druk/PDF robi przeglądarka — nie generujemy pliku po stronie serwera. */
export function PrintButton() {
  return (
    <Button variant="primary" onClick={() => window.print()}>
      Drukuj / zapisz PDF
    </Button>
  );
}
