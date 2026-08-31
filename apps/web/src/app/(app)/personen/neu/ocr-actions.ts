"use server";

import { writeFile, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { scanDocuments } from "@tdd/db";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { hasPermission } from "@/lib/rbac";
import { audit } from "@/lib/audit";
import { runOcr, extractDocxText, extractFields, type ExtractedFields } from "@/lib/ocr";

export interface OcrResult {
  ok: boolean;
  error?: string;
  fields?: ExtractedFields;
  confidence?: number;
  scanId?: string;
}

function extFor(type: string): string {
  if (type.includes("png")) return "png";
  if (type.includes("jpeg") || type.includes("jpg")) return "jpg";
  if (type.includes("webp")) return "webp";
  return "bin";
}

/** Foto/Scan (Bild → OCR) ODER Word-Datei (.docx → Textauszug) → Feld-Vorbefüllung. */
export async function ocrForm(formData: FormData): Promise<OcrResult> {
  const user = await getCurrentUser();
  if (!user || !hasPermission(user.role, "person:write")) return { ok: false, error: "Keine Berechtigung" };

  const file = formData.get("image");
  if (!(file instanceof File) || file.size === 0) return { ok: false, error: "Keine Datei" };

  const name = file.name.toLowerCase();
  const isImage = file.type.startsWith("image/");
  const isDocx = name.endsWith(".docx") || file.type.includes("wordprocessingml");
  if (!isImage && !isDocx) {
    return { ok: false, error: "Nur Foto/Scan (Bild) oder Word-Datei (.docx) werden unterstützt." };
  }

  const buf = Buffer.from(await file.arrayBuffer());

  // Quelle auf verschlüsseltem Volume ablegen (nicht öffentlich erreichbar)
  const dir = join(process.env.STORAGE_DIR ?? "./data/uploads", "scans");
  await mkdir(dir, { recursive: true });
  const fileRef = `scans/${randomUUID()}.${isDocx ? "docx" : extFor(file.type)}`;
  await writeFile(join(process.env.STORAGE_DIR ?? "./data/uploads", fileRef), buf);

  let text = "", confidence = 0;
  try {
    if (isDocx) { text = await extractDocxText(buf); confidence = 100; }
    else { const r = await runOcr(buf); text = r.text; confidence = r.confidence; }
  } catch (e) {
    return { ok: false, error: (isDocx ? "Word-Auslesen" : "OCR") + " fehlgeschlagen: " + (e instanceof Error ? e.message : "unbekannt") };
  }

  const fields = extractFields(text);

  const retention = new Date(Date.now() + 90 * 864e5).toISOString().slice(0, 10);
  const ins = await db().insert(scanDocuments).values({
    fileRef, docType: "VEREINSFORMULAR", ocrText: text, ocrConfidence: confidence,
    uploadedBy: user.id, retentionUntil: retention,
  }).returning({ id: scanDocuments.id });

  await audit({ actorUserId: user.id, action: "ocr.scan", entityType: "scan_document", entityId: ins[0]!.id, after: { confidence } });

  return { ok: true, fields, confidence: Math.round(confidence), scanId: ins[0]!.id };
}
