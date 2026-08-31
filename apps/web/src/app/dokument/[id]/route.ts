import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { eq } from "drizzle-orm";
import { scanDocuments } from "@tdd/db";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { hasPermission } from "@/lib/rbac";

const MIME: Record<string, string> = {
  pdf: "application/pdf", png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg",
  webp: "image/webp", docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
};

/** Sicherer Dokument-Download – nur mit document:view (Admin). Ausgabe/Läden/Erfassung nie. */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return new Response("Unauthorized", { status: 401 });
  if (!hasPermission(user.role, "document:view")) return new Response("Forbidden", { status: 403 });

  const { id } = await params;
  const rows = await db().select({ fileRef: scanDocuments.fileRef }).from(scanDocuments).where(eq(scanDocuments.id, id)).limit(1);
  const doc = rows[0];
  if (!doc) return new Response("Not found", { status: 404 });

  // Pfad-Sicherheit: nur relative fileRefs unter scans/
  if (doc.fileRef.includes("..")) return new Response("Bad request", { status: 400 });
  const abs = join(process.env.STORAGE_DIR ?? "./data/uploads", doc.fileRef);
  try {
    const buf = await readFile(abs);
    const ext = doc.fileRef.split(".").pop()?.toLowerCase() ?? "bin";
    return new Response(new Uint8Array(buf), {
      headers: { "content-type": MIME[ext] ?? "application/octet-stream", "content-disposition": `inline; filename="${id}.${ext}"` },
    });
  } catch {
    return new Response("Datei nicht gefunden", { status: 404 });
  }
}
