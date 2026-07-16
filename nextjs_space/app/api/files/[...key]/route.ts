import { NextResponse, type NextRequest } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { getStorage } from "@/lib/storage";

// Proxy pobierania załączników przez StorageAdapter (adapter lokalny nie ma URL publicznego).
export async function GET(
  _req: NextRequest,
  { params }: { params: { key: string[] } },
) {
  const session = await getServerSession(authOptions);
  if (!session) {
    return new NextResponse("Unauthorized", { status: 401 });
  }

  const key = params.key.map(decodeURIComponent).join("/");
  const storage = getStorage();

  if (!(await storage.exists(key))) {
    return new NextResponse("Not found", { status: 404 });
  }

  const [buffer, stat] = await Promise.all([
    storage.getBuffer(key),
    storage.stat(key),
  ]);

  return new NextResponse(buffer, {
    headers: {
      "Content-Type": stat?.mimeType ?? "application/octet-stream",
      "Content-Disposition": `inline; filename="${stat?.filename ?? "plik"}"`,
    },
  });
}
