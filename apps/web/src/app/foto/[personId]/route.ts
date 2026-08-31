import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { eq } from "drizzle-orm";
import { persons } from "@tdd/db";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { hasPermission } from "@/lib/rbac";

const MIME: Record<string, string> = { jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", webp: "image/webp" };

/**
 * Erkennungsfoto einer Person – für die Ausgabe am Tresen sichtbar.
 * Bewusst NICHT an document:view gebunden (Kasse sieht keine Dokumente, aber das Foto).
 * Zugelassen: distribution:record (Kasse) oder person:read (Admin/Erfassung).
 */
export async function GET(_req: Request, { params }: { params: Promise<{ personId: string }> }) {
  const user = await getCurrentUser();
  if (!user) return new Response("Unauthorized", { status: 401 });
  if (!(hasPermission(user.role, "distribution:record") || hasPermission(user.role, "person:read"))) {
    return new Response("Forbidden", { status: 403 });
  }

  const { personId } = await params;
  const rows = await db().select({ photoRef: persons.photoRef }).from(persons).where(eq(persons.id, personId)).limit(1);
  const ref = rows[0]?.photoRef;
  if (!ref) return new Response("Not found", { status: 404 });
  if (ref.includes("..")) return new Response("Bad request", { status: 400 });

  const abs = join(process.env.STORAGE_DIR ?? "./data/uploads", ref);
  try {
    const buf = await readFile(abs);
    const ext = ref.split(".").pop()?.toLowerCase() ?? "bin";
    return new Response(new Uint8Array(buf), {
      headers: { "content-type": MIME[ext] ?? "application/octet-stream", "cache-control": "private, max-age=300" },
    });
  } catch {
    return new Response("Datei nicht gefunden", { status: 404 });
  }
}
