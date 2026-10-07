import { NextResponse, type NextRequest } from "next/server";
import path from "path";
import { prisma } from "@/lib/prisma";
import { currentActor } from "@/lib/authz";
import { getStorage, StorageBackendError, StorageUnavailableError } from "@/lib/storage";

// Proxy pobierania załączników przez StorageAdapter (adapter lokalny nie ma URL publicznego).

/**
 * Types the browser may render in a tab. Everything else is forced to download:
 * an `.htm`/`.mht` attachment rendered inline would run its scripts on the app's own
 * origin, with the viewer's session — stored XSS straight out of the register.
 */
const INLINE_EXTENSIONS = new Set(["pdf", "png", "jpg", "jpeg"]);

/** RFC 6266/5987 header: ASCII fallback for old clients plus the exact UTF-8 name. */
function contentDisposition(kind: "inline" | "attachment", filename: string): string {
  const ascii = filename.replace(/[^\x20-\x7e]/g, "_").replace(/["\\]/g, "_");
  const encoded = encodeURIComponent(filename).replace(/['()*]/g, (c) =>
    `%${c.charCodeAt(0).toString(16).toUpperCase()}`,
  );
  return `${kind}; filename="${ascii}"; filename*=UTF-8''${encoded}`;
}

/** Display name from the DB row, with the stored file's extension guaranteed. */
function downloadName(name: string | null, key: string): string {
  const ext = path.extname(key).toLowerCase();
  // eslint-disable-next-line no-control-regex
  const base = (name ?? "").replace(/[\x00-\x1f\x7f/\\]/g, "").trim().slice(0, 180) || "plik";
  return ext && !base.toLowerCase().endsWith(ext) ? `${base}${ext}` : base;
}

/**
 * Maps adapter failures to responses. A key rejected by the adapter (path traversal)
 * is a bad request; a broken backend is the server's problem, logged and reported as 502.
 */
function storageErrorResponse(err: unknown): NextResponse {
  const text = (body: string, status: number) =>
    new NextResponse(body, { status, headers: { "Content-Type": "text/plain; charset=utf-8" } });
  if (err instanceof StorageUnavailableError) {
    return text("Załączniki nie są jeszcze dostępne w tej wersji testowej aplikacji.", 503);
  }
  if (err instanceof StorageBackendError) {
    console.error("[api/files] storage backend failed:", err.message);
    return text("Magazyn plików chwilowo nie odpowiada. Spróbuj ponownie za chwilę.", 502);
  }
  return text("Bad request", 400);
}

function decodeKey(segments: string[]): string | null {
  try {
    return segments.map(decodeURIComponent).join("/");
  } catch {
    return null;
  }
}

export async function GET(
  _req: NextRequest,
  { params }: { params: { key: string[] } },
) {
  const actor = await currentActor();
  if (!actor) {
    return new NextResponse("Unauthorized", { status: 401 });
  }

  const key = decodeKey(params.key);
  if (!key) return new NextResponse("Bad request", { status: 400 });

  // Only files registered as attachments are served — never an arbitrary path that
  // happens to exist under the storage root (orphans, stray files).
  // Read authorization per contract (spec 03) plugs in here, once it exists: today
  // every signed-in user may read every record, so every attachment is readable too.
  const attachment = await prisma.attachment.findFirst({
    where: { storageKey: key },
    select: { name: true },
  });
  if (!attachment) return new NextResponse("Not found", { status: 404 });

  const storage = getStorage();

  // Backends that hand out short-lived URLs (SharePoint) serve the bytes themselves:
  // the session and the Attachment row are already checked above, and large files
  // never pass through the app server (Vercel caps responses at ~4.5 MB).
  if (storage.getDirectDownloadUrl) {
    try {
      const url = await storage.getDirectDownloadUrl(key);
      if (!url) return new NextResponse("Not found", { status: 404 });
      const redirect = NextResponse.redirect(url, 302);
      redirect.headers.set("Cache-Control", "private, no-store");
      return redirect;
    } catch (err) {
      return storageErrorResponse(err);
    }
  }

  // Klucz pochodzi z URL-a, więc adapter może go odrzucić (próba wyjścia poza root).
  // To błąd żądania, nie awaria serwera — nie pozwalamy mu wypłynąć jako 500.
  let buffer: Buffer;
  let stat: Awaited<ReturnType<typeof storage.stat>>;
  try {
    stat = await storage.stat(key);
    if (!stat) return new NextResponse("Not found", { status: 404 });
    buffer = await storage.getBuffer(key);
  } catch (err) {
    return storageErrorResponse(err);
  }

  const extension = path.extname(key).slice(1).toLowerCase();
  const isInline = INLINE_EXTENSIONS.has(extension);

  return new NextResponse(buffer, {
    headers: {
      "Content-Type": isInline
        ? (stat.mimeType ?? "application/octet-stream")
        : "application/octet-stream",
      "Content-Disposition": contentDisposition(
        isInline ? "inline" : "attachment",
        downloadName(attachment.name, key),
      ),
      "Content-Length": String(buffer.length),
      "X-Content-Type-Options": "nosniff",
      // Contract documents must not linger in shared or proxy caches.
      "Cache-Control": "private, no-store",
    },
  });
}
