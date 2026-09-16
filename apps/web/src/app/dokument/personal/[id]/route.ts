import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { eq } from "drizzle-orm";
import { staffDokumente } from "@tdd/db";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { hasPermission } from "@/lib/rbac";

const MIME: Record<string, string> = {
  pdf: "application/pdf", png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg",
  webp: "image/webp", docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
};

/** Personalakte-Dokument – nur Admin (staff:manage + admin:manage). Sachbearbeiter der Portale nie. */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return new Response("Unauthorized", { status: 401 });
  if (!hasPermission(user.role, "staff:manage") || !hasPermission(user.role, "admin:manage")) return new Response("Forbidden", { status: 403 });

  const { id } = await params;
  const rows = await db().select({ fileRef: staffDokumente.fileRef, bezeichnung: staffDokumente.bezeichnung }).from(staffDokumente).where(eq(staffDokumente.id, id)).limit(1);
  const doc = rows[0];
  if (!doc) return new Response("Not found", { status: 404 });
  if (doc.fileRef.includes("..") || !doc.fileRef.startsWith("personal/")) return new Response("Bad request", { status: 400 });
  try {
    const buf = await readFile(join(process.env.STORAGE_DIR ?? "./data/uploads", doc.fileRef));
    const ext = doc.fileRef.split(".").pop()?.toLowerCase() ?? "bin";
    const name = doc.bezeichnung.replace(/[^\w.\-äöüÄÖÜß ]/g, "_");
    return new Response(new Uint8Array(buf), {
      headers: { "content-type": MIME[ext] ?? "application/octet-stream", "content-disposition": `inline; filename="${name}.${ext}"`, "cache-control": "private, no-store" },
    });
  } catch {
    return new Response("Datei nicht gefunden", { status: 404 });
  }
}
