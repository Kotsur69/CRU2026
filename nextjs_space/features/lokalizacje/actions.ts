"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/authz";
import { userLabel } from "@/lib/format";
import { intParam } from "@/lib/utils";
import { BLANK_OPTION_NAME } from "@/lib/contracts/dictionaries";

/**
 * Akcje administratora w module Lokalizacje (docs/features/22): przypisania
 * `users_locations` oraz nazwa i aktywność pozycji słownika. Każda akcja sama woła
 * `requireAdmin` — to, że formularze widzi tylko administrator, nie jest zabezpieczeniem.
 *
 * Zakresów `useraccess` z wymiarem LOCATION tu nie ruszamy: należą do modułu Dostępy,
 * a to, jak oba mechanizmy się łączą, rozstrzyga autoryzacja odczytu (spec 03, Q63).
 * Dodawania i usuwania lokalizacji nie ma — 35 pozycji w czternaście lat, żadnej usuniętej.
 */

export interface LocationActionState {
  error?: string;
  notice?: string;
}

/** Legacy `contract_location.location` to `varchar(45)`. */
const NAME_MAX = 45;

function field(formData: FormData, name: string): string | undefined {
  const value = formData.get(name);
  return typeof value === "string" ? value : undefined;
}

function revalidateLocation(locationId: number, userId?: number) {
  revalidatePath("/lokalizacje");
  revalidatePath(`/lokalizacje/${locationId}`);
  if (userId !== undefined) revalidatePath(`/dostepy/${userId}`);
}

/** „Przyznaj dostęp" — nowy wiersz `users_locations`. */
export async function grantLocation(
  _state: LocationActionState,
  formData: FormData,
): Promise<LocationActionState> {
  await requireAdmin();
  const locationId = intParam(field(formData, "locationId"));
  const userId = intParam(field(formData, "userId"));
  if (locationId === undefined) return { error: "Nieprawidłowe żądanie." };
  if (userId === undefined) return { error: "Wybierz użytkownika." };

  const [location, user] = await Promise.all([
    prisma.location.findUnique({ where: { id: locationId }, select: { id: true } }),
    prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, firstName: true, lastName: true, login: true },
    }),
  ]);
  if (!location) return { error: "Lokalizacja nie istnieje." };
  if (!user) return { error: "Nie ma takiego użytkownika." };

  // Klucz tabeli to para (użytkownik, lokalizacja) — ponowne przyznanie niczego nie dubluje.
  const { count } = await prisma.userLocation.createMany({
    data: [{ userId, locationId }],
    skipDuplicates: true,
  });

  revalidateLocation(locationId, userId);
  return count === 0
    ? { error: `${userLabel(user)} ma już dostęp do tej lokalizacji.` }
    : { notice: `Przyznano dostęp: ${userLabel(user)}.` };
}

/** „Odbierz dostęp". Odebranie już odebranego (np. z drugiej karty) nie jest błędem. */
export async function revokeLocation(formData: FormData): Promise<void> {
  await requireAdmin();
  const locationId = intParam(field(formData, "locationId"));
  const userId = intParam(field(formData, "userId"));
  if (locationId === undefined || userId === undefined) {
    throw new Error("Nieprawidłowe żądanie.");
  }

  await prisma.userLocation.deleteMany({ where: { userId, locationId } });
  revalidateLocation(locationId, userId);
}

/**
 * „Zmień nazwę / aktywność". Wyłączona lokalizacja znika z list wyboru w formularzu
 * i filtrach, ale zostaje na rekordach, które już ją mają (lib/contracts/dictionaries.ts).
 */
export async function updateLocation(
  _state: LocationActionState,
  formData: FormData,
): Promise<LocationActionState> {
  await requireAdmin();
  const id = intParam(field(formData, "locationId"));
  if (id === undefined) return { error: "Nieprawidłowe żądanie." };

  const name = (field(formData, "name") ?? "").trim().replace(/\s+/g, " ");
  const active = field(formData, "active") === "1";

  const location = await prisma.location.findUnique({ where: { id } });
  if (!location) return { error: "Lokalizacja nie istnieje." };

  // Formularz nowego wpisu szuka tej pozycji po nazwie, wśród aktywnych, i ustawia ją
  // jako domyślną lokalizację (features/kontrakty/form-page.tsx). Zmiana nazwy albo
  // wyłączenie cicho zmieniłyby każdy nowy rekord.
  if (location.name === BLANK_OPTION_NAME) {
    return { error: 'Pozycji „(brak danych)" nie zmieniamy — to domyślna lokalizacja nowego wpisu.' };
  }

  if (name === "") return { error: "Podaj nazwę." };
  if (name.length > NAME_MAX) return { error: `Nazwa może mieć najwyżej ${NAME_MAX} znaków.` };

  const clash = await prisma.location.findFirst({
    where: { id: { not: id }, name: { equals: name, mode: "insensitive" } },
    select: { id: true },
  });
  if (clash) return { error: "Lokalizacja o tej nazwie już istnieje." };

  if (name === location.name && active === location.active) return { notice: "Bez zmian." };

  await prisma.location.update({
    where: { id },
    data: {
      name,
      active,
      // Legacy `description` powtarza nazwę w każdym wierszu; nie pokazujemy go, ale
      // przy zmianie nazwy trzymamy tę zgodność, zamiast zostawiać starą nazwę.
      description: location.description === location.name ? name : location.description,
    },
  });
  revalidateLocation(id);
  return { notice: "Zapisano." };
}
