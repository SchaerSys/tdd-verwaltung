import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { eq } from "drizzle-orm";
import { persons } from "@tdd/db";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { hasPermission } from "@/lib/rbac";
import { storageDir } from "@/lib/einwilligung";

/** Unterschrift (PNG) der Person – nur Buero, nur aus dem Upload-Verzeichnis. */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user || !hasPermission(user.role, "person:write")) return new Response("Forbidden", { status: 403 });
  const { id } = await params;
  const p = (await db().select({ ref: persons.consentSignatureRef }).from(persons).where(eq(persons.id, id)).limit(1))[0];
  if (!p?.ref || !/^consent\/[a-f0-9-]+\.png$/.test(p.ref)) return new Response("Nicht vorhanden", { status: 404 });
  try {
    const buf = await readFile(join(storageDir(), p.ref));
    return new Response(buf, { headers: { "Content-Type": "image/png", "Cache-Control": "private, no-store" } });
  } catch { return new Response("Nicht vorhanden", { status: 404 }); }
}
