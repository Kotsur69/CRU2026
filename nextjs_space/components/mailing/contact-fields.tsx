import Link from "next/link";
import { userLabel } from "@/lib/format";
import { addressIssue } from "@/lib/mailing/address";
import { Badge } from "@/components/ui/badge";

/** Adres kontaktu; brak adresu i adres podejrzany o obcięcie są oznaczone słowem, nie kolorem. */
export function ContactAddress({ email }: { email: string | null }) {
  const issue = addressIssue(email);
  if (issue === "missing") return <Badge tone="warning">brak adresu</Badge>;
  return (
    <span className="inline-flex flex-wrap items-center gap-1.5">
      <span className="break-all">{email}</span>
      {issue === "suspect" && (
        <span title="Adres ma 50 znaków — tyle mieściło pole w CRU — albo nie kończy się domeną. Mógł zostać ucięty.">
          <Badge tone="warning">adres do sprawdzenia</Badge>
        </span>
      )}
    </span>
  );
}

/** Zatwierdzone dopasowanie kontaktu do konta użytkownika (`MailingContact.userId`). */
export function MatchedUser({
  user,
}: {
  user: { id: number; firstName: string | null; lastName: string | null; login: string | null } | null;
}) {
  if (!user) return <span className="text-muted-foreground">brak dopasowania</span>;
  return (
    <Link href={`/dostepy/${user.id}`} className="text-primary hover:underline">
      {userLabel(user)}
    </Link>
  );
}
