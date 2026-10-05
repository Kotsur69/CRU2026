"use server";

import bcrypt from "bcryptjs";
import { z } from "zod";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { currentActor } from "@/lib/authz";
import { reserveAttempt } from "@/lib/login-guard";
import { passwordProblem } from "@/lib/password-policy";

/**
 * Self-service account actions. Server actions are public endpoints: each one
 * re-reads the session and only ever touches the caller's own row — the user id
 * never comes from the form.
 */

const BCRYPT_ROUNDS = 12;

export interface AccountFormState {
  status: "idle" | "ok" | "error";
  message?: string;
  fieldErrors?: Partial<Record<string, string>>;
}

const NAME = z
  .string()
  .trim()
  .min(1, "Pole jest wymagane.")
  .max(80, "Maksymalnie 80 znaków.")
  .regex(/^[\p{L}][\p{L}\p{M} '.-]*$/u, "Dozwolone są litery, spacja, myślnik i apostrof.");

const profileSchema = z.object({ firstName: NAME, lastName: NAME });

/** A form message instead of a thrown error: the session may have just been revoked
 *  (e.g. a second submit right after a password change). */
const SESSION_EXPIRED: AccountFormState = {
  status: "error",
  message: "Sesja wygasła — zaloguj się ponownie.",
};

export async function updateProfile(
  _prev: AccountFormState,
  formData: FormData,
): Promise<AccountFormState> {
  const actor = await currentActor();
  if (!actor) return SESSION_EXPIRED;
  const parsed = profileSchema.safeParse({
    firstName: formData.get("firstName"),
    lastName: formData.get("lastName"),
  });
  if (!parsed.success) {
    const errors = parsed.error.flatten().fieldErrors;
    return {
      status: "error",
      message: "Popraw zaznaczone pola.",
      fieldErrors: { firstName: errors.firstName?.[0], lastName: errors.lastName?.[0] },
    };
  }

  await prisma.user.update({
    where: { id: actor.id },
    data: { firstName: parsed.data.firstName, lastName: parsed.data.lastName },
  });
  revalidatePath("/", "layout");
  return { status: "ok", message: "Zapisano imię i nazwisko." };
}

export async function changePassword(
  _prev: AccountFormState,
  formData: FormData,
): Promise<AccountFormState> {
  const actor = await currentActor();
  if (!actor) return SESSION_EXPIRED;
  const current = formData.get("currentPassword");
  const next = formData.get("newPassword");
  const confirm = formData.get("confirmPassword");
  if (typeof current !== "string" || typeof next !== "string" || typeof confirm !== "string") {
    return { status: "error", message: "Nieprawidłowe żądanie." };
  }

  const user = await prisma.user.findUnique({
    where: { id: actor.id },
    select: { id: true, login: true, passwordHash: true },
  });
  if (!user?.passwordHash) {
    return { status: "error", message: "To konto nie ma hasła lokalnego." };
  }

  // A stolen, still-open session must not be enough to take the account over: the
  // current password is required, and every check is reserved against the same
  // lockout as the sign-in form before the hash is compared.
  if (!(await reserveAttempt(user.id))) {
    return { status: "error", message: "Zbyt wiele błędnych prób. Spróbuj ponownie za 15 minut." };
  }
  if (!(await bcrypt.compare(current, user.passwordHash))) {
    console.warn(`[konto] wrong current password on password change, userId=${user.id}`);
    return {
      status: "error",
      message: "Popraw zaznaczone pola.",
      fieldErrors: { currentPassword: "Obecne hasło jest nieprawidłowe." },
    };
  }
  // The right current password proves the owner; release the reserved attempt.
  await prisma.user.update({
    where: { id: user.id },
    data: { failedLoginCount: 0, lockedUntil: null },
  });

  const problem = passwordProblem(next, user.login);
  if (problem) {
    return { status: "error", message: "Popraw zaznaczone pola.", fieldErrors: { newPassword: problem } };
  }
  if (next !== confirm) {
    return {
      status: "error",
      message: "Popraw zaznaczone pola.",
      fieldErrors: { confirmPassword: "Hasła nie są identyczne." },
    };
  }
  if (await bcrypt.compare(next, user.passwordHash)) {
    return {
      status: "error",
      message: "Popraw zaznaczone pola.",
      fieldErrors: { newPassword: "Nowe hasło musi różnić się od obecnego." },
    };
  }

  // Bumping sessionVersion signs this account out everywhere, this browser included.
  await prisma.user.update({
    where: { id: user.id },
    data: {
      passwordHash: await bcrypt.hash(next, BCRYPT_ROUNDS),
      passwordChangedAt: new Date(),
      sessionVersion: { increment: 1 },
      failedLoginCount: 0,
      lockedUntil: null,
    },
  });
  return { status: "ok", message: "Hasło zmienione. Zaloguj się ponownie nowym hasłem." };
}
