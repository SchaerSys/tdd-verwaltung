"use server";

import { revalidatePath } from "next/cache";
import { writeFile, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { and, eq, isNull } from "drizzle-orm";
import { antraege, antragDocuments, persons, personLocationAssignments, scanDocuments } from "@tdd/db";
import { normalizeName, normalizeAddress, koelnerPhonetik } from "@tdd/core";
import { getCurrentUser } from "@/lib/auth";
import { hasPermission } from "@/lib/rbac";
import { withOrg } from "@/lib/org";
import { audit } from "@/lib/audit";
import { generateBescheidPdf } from "@/lib/bescheid";
import { fmtDate } from "@/lib/format";
import { sendMail } from "@/lib/mail";

function extFor(name: string, type: string): string {
  const m = name.toLowerCase().match(/\.([a-z0-9]{2,4})$/);
  if (m) return m[1]!;
  if (type.includes("pdf")) return "pdf";
  if (type.includes("png")) return "png";
  if (type.includes("jpeg")) return "jpg";
  return "bin";
}

/** Dokument zu einem Antrag hochladen (Ausweis/ZMR/Kontoauszüge …). RLS-gescoped. */
export async function addAntragDocument(formData: FormData): Promise<void> {
  const user = await getCurrentUser();
  if (!user || !hasPermission(user.role, "antrag:manage") || !user.organizationId) throw new Error("Keine Berechtigung");
  const antragId = String(formData.get("antragId") ?? "");
  const docType = String(formData.get("docType") ?? "SONSTIGES");
  const file = formData.get("file");
  if (!antragId || !(file instanceof File) || file.size === 0) throw new Error("Keine Datei");

  const buf = Buffer.from(await file.arrayBuffer());
  const dir = join(process.env.STORAGE_DIR ?? "./data/uploads", "scans");
  await mkdir(dir, { recursive: true });
  const fileRef = `scans/${randomUUID()}.${extFor(file.name, file.type)}`;
  await writeFile(join(process.env.STORAGE_DIR ?? "./data/uploads", fileRef), buf);

  const retention = new Date(Date.now() + 90 * 864e5).toISOString().slice(0, 10);
  await withOrg(user.organizationId, (tx) =>
    tx.insert(antragDocuments).values({ antragId, fileRef, docType, uploadedBy: user.id, retentionUntil: retention }));

  await audit({ actorUserId: user.id, action: "antrag.document.add", entityType: "antrag", entityId: antragId, after: { docType } });
  revalidatePath(`/portal/${antragId}`);
}

interface TransferInfo {
  positive: boolean;
  personId?: string;
  email?: string | null;
  name?: string;
  birthDate?: string | null;
  address?: string | null;
}

export async function decideAntrag(formData: FormData): Promise<void> {
  const user = await getCurrentUser();
  if (!user || !hasPermission(user.role, "antrag:manage") || !user.organizationId) throw new Error("Keine Berechtigung");

  const antragId = String(formData.get("antragId") ?? "");
  const decision = String(formData.get("decision") ?? "");
  const reason = (formData.get("reason") as string | null) || null;
  if (decision !== "POSITIV" && decision !== "NEGATIV") throw new Error("Ungültige Entscheidung");
  const orgId = user.organizationId;

  const info: TransferInfo | null = await withOrg(orgId, async (tx) => {
    const rows = await tx.select().from(antraege).where(eq(antraege.id, antragId)).limit(1);
    const a = rows[0];
    if (!a) throw new Error("Antrag nicht gefunden (oder andere Organisation).");
    if (a.transferredPersonId) return null;

    await tx.update(antraege).set({
      status: decision, decisionReason: reason, decidedBy: user.id, decidedAt: new Date(), updatedAt: new Date(),
    }).where(eq(antraege.id, antragId));

    if (decision !== "POSITIV") return { positive: false };

    // ── Systemübergreifende Übergabe an TDD (Person „Übernahme ausstehend") ──
    const lnNorm = normalizeName(a.lastName);
    const fnNorm = normalizeName(a.firstName);
    const existing = await tx.select({ id: persons.id }).from(persons).where(and(
      eq(persons.lastNameNorm, lnNorm), eq(persons.firstNameNorm, fnNorm),
      a.birthDate ? eq(persons.birthDate, a.birthDate) : isNull(persons.birthDate),
      isNull(persons.deletedAt),
    )).limit(1);

    let personId: string;
    if (existing[0]) {
      personId = existing[0].id;
    } else {
      const ins = await tx.insert(persons).values({
        firstName: a.firstName, lastName: a.lastName, address: a.address, postalCode: a.postalCode, city: a.city,
        birthDate: a.birthDate, phone: a.phone, email: a.email,
        householdSize: (a.adults ?? 1) + (a.childrenU12 ?? 0) + (a.childrenO12 ?? 0),
        childrenCount: (a.childrenU12 ?? 0) + (a.childrenO12 ?? 0),
        languageId: a.languageId, originId: a.originId,
        lastNameNorm: lnNorm, firstNameNorm: fnNorm, addressNorm: normalizeAddress(a.address),
        lastNamePhon: koelnerPhonetik(lnNorm), firstNamePhon: koelnerPhonetik(fnNorm),
        sourceAntragId: antragId, sourceOrganizationId: orgId, takeoverPending: true,
        createdBy: user.id, updatedBy: user.id,
      }).returning({ id: persons.id });
      personId = ins[0]!.id;
      if (a.intendedLocationId) {
        await tx.insert(personLocationAssignments).values({ personId, locationId: a.intendedLocationId });
      }
    }

    const docs = await tx.select().from(antragDocuments).where(eq(antragDocuments.antragId, antragId));
    for (const d of docs) {
      await tx.insert(scanDocuments).values({
        personId, fileRef: d.fileRef, docType: d.docType, uploadedBy: user.id, retentionUntil: d.retentionUntil,
      });
    }

    await tx.update(antraege).set({ transferredPersonId: personId }).where(eq(antraege.id, antragId));
    return {
      positive: true, personId, email: a.email, name: `${a.firstName} ${a.lastName}`,
      birthDate: a.birthDate, address: [a.address, a.postalCode, a.city].filter(Boolean).join(", "),
    };
  });

  await audit({ actorUserId: user.id, action: `antrag.${decision.toLowerCase()}`, entityType: "antrag", entityId: antragId });

  // ── Bescheid-PDF + E-Mail an den Antragsteller (nach Commit) ──
  if (info?.positive && info.personId) {
    try {
      const pdf = await generateBescheidPdf({
        name: info.name!, birthDate: info.birthDate, address: info.address,
        organization: user.organizationName ?? "TDD", date: fmtDate(new Date()), positive: true,
      });
      // PDF als Dokument ablegen (nur für TDD-Admin sichtbar)
      const dir = join(process.env.STORAGE_DIR ?? "./data/uploads", "scans");
      await mkdir(dir, { recursive: true });
      const fileRef = `scans/${randomUUID()}.pdf`;
      await writeFile(join(process.env.STORAGE_DIR ?? "./data/uploads", fileRef), pdf);
      const retention = new Date(Date.now() + 365 * 864e5).toISOString().slice(0, 10);
      const { db } = await import("@/lib/db");
      const { scanDocuments: sd } = await import("@tdd/db");
      await db().insert(sd).values({ personId: info.personId, fileRef, docType: "BESCHEID", uploadedBy: user.id, retentionUntil: retention });

      if (info.email) {
        const mail = await sendMail({
          to: info.email,
          subject: "Tischlein deck dich – Positiver Bescheid",
          text: `Guten Tag ${info.name},\n\nIhr Antrag wurde positiv beschieden. Im Anhang finden Sie Ihren Bescheid.\nBitte bringen Sie diesen zur zuständigen TDD-Ausgabestelle mit, um Ihre Berechtigungskarte zu erhalten.\n\nFreundliche Grüße\nTischlein deck dich`,
          attachments: [{ filename: "TDD-Bescheid.pdf", content: pdf }],
        });
        await audit({ actorUserId: user.id, action: mail.sent ? "antrag.mail.sent" : "antrag.mail.pending", entityType: "antrag", entityId: antragId, after: { to: info.email, sent: mail.sent, info: mail.info } });
      }
    } catch { /* Bescheid/Mail-Fehler nicht die Entscheidung rückabwickeln */ }
  }

  revalidatePath(`/portal/${antragId}`);
  revalidatePath("/portal");
}
