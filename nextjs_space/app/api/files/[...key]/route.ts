import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { getStorage } from "@/lib/storage";
import { canReadContract, currentActor, type Actor } from "@/lib/authz";
import { contentDisposition, isInlineRenderable } from "@/lib/attachments";

/**
 * Pobieranie załącznika przez StorageAdapter (adapter lokalny nie ma publicznego URL).
 *
 * Klucz md5 jest nie do zgadnięcia, ale krąży w linkach, więc sam klucz nie jest prawem
 * dostępu (docs/features/18): klucz → wiersz `Attachment` → rekord, do którego plik
 * należy → prawo odczytu tego rekordu. Odmowa to zawsze 404, nigdy 403 — 403 potwierdza,
 * że plik istnieje.
 */

const notFound = () => new NextResponse("Nie znaleziono.", { status: 404 });

interface AttachmentRow {
  name: string | null;
  fileType: string | null;
  contractId: number | null;
  contractorId: number | null;
  formSession: string | null;
}

/**
 * Plik umowy — kto może czytać umowę; dokument rejestrowy kontrahenta — każdy
 * zalogowany (słownik kontrahentów jest wspólny); wgrywka czekająca na zapis formularza
 * — tylko ten, kto zna token sesji; 42 wiersze bez żadnego rodzica — administrator.
 */
async function mayRead(actor: Actor, row: AttachmentRow, session: string | null): Promise<boolean> {
  if (row.contractId !== null) return canReadContract(actor, row.contractId);
  if (row.contractorId !== null) return true;
  if (row.formSession !== null) return session !== null && row.formSession === session;
  return actor.isAdmin;
}

export async function GET(req: NextRequest, { params }: { params: { key: string[] } }) {
  const actor = await currentActor();
  if (!actor) return new NextResponse("Unauthorized", { status: 401 });

  const key = params.key.map(decodeURIComponent).join("/");
  // Ta sama treść pod dwiema umowami ma jeden klucz (md5), więc wierszy bywa kilka —
  // wystarczy prawo do jednego z nich.
  const rows = await prisma.attachment.findMany({
    where: { storageKey: key },
    select: { name: true, fileType: true, contractId: true, contractorId: true, formSession: true },
  });
  const session = req.nextUrl.searchParams.get("formSession");
  let allowed: AttachmentRow | null = null;
  for (const row of rows) {
    if (await mayRead(actor, row, session)) {
      allowed = row;
      break;
    }
  }
  if (!allowed) return notFound();

  const storage = getStorage();
  // Klucz pochodzi z URL-a, więc adapter może go odrzucić (próba wyjścia poza root).
  // To błąd żądania, nie awaria serwera — nie pozwalamy mu wypłynąć jako 500.
  let buffer: Buffer;
  let stat: Awaited<ReturnType<typeof storage.stat>>;
  try {
    if (!(await storage.exists(key))) return notFound();
    [buffer, stat] = await Promise.all([storage.getBuffer(key), storage.stat(key)]);
  } catch {
    return new NextResponse("Bad request", { status: 400 });
  }

  const fileType = allowed.fileType ?? key.split(".").pop() ?? null;
  const filename = allowed.name ?? stat?.filename ?? "plik";
  return new NextResponse(buffer, {
    headers: {
      "Content-Type": stat?.mimeType ?? "application/octet-stream",
      // Inline tylko PDF i obrazy; reszta — w tym zapisane maile HTML i jeden `.exe`
      // z legacy — zawsze jako plik do zapisania.
      "Content-Disposition": contentDisposition(
        isInlineRenderable(fileType) ? "inline" : "attachment",
        filename,
      ),
      "X-Content-Type-Options": "nosniff",
    },
  });
}
