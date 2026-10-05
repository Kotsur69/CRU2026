import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { currentActor } from "@/lib/authz";
import { FormSection } from "@/components/ui/form";
import { MIN_PASSWORD_LENGTH } from "@/lib/password-policy";
import { PasswordForm, ProfileForm } from "@/features/konto/account-forms";

export const dynamic = "force-dynamic";

/** "Moje konto" — every signed-in user edits only their own name and password here. */
export default async function AccountPage() {
  const actor = await currentActor();
  if (!actor) redirect("/login");

  const user = await prisma.user.findUnique({
    where: { id: actor.id },
    select: { login: true, firstName: true, lastName: true, lastLoginAt: true, passwordChangedAt: true },
  });
  if (!user) redirect("/login");

  const formatDate = (d: Date | null) =>
    d ? d.toLocaleString("pl-PL", { dateStyle: "medium", timeStyle: "short" }) : "—";

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <h1 className="font-heading text-2xl font-semibold">Moje konto</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Login: <strong className="text-foreground">{user.login}</strong>
          {" · "}ostatnie logowanie: {formatDate(user.lastLoginAt)}
          {" · "}hasło zmienione: {formatDate(user.passwordChangedAt)}
        </p>
      </div>

      <FormSection title="Dane osobowe">
        <ProfileForm firstName={user.firstName ?? ""} lastName={user.lastName ?? ""} />
      </FormSection>

      <FormSection title="Zmiana hasła">
        <p className="mb-2 text-sm text-muted-foreground">
          Zmiana hasła wyloguje Cię ze wszystkich urządzeń.
        </p>
        <PasswordForm login={user.login ?? ""} minLength={MIN_PASSWORD_LENGTH} />
      </FormSection>
    </div>
  );
}
