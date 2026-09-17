import { desc, eq } from "drizzle-orm";
import { antraege, cards, distributions, locations, lookupValues, personLocationAssignments, persons, scanDocuments } from "@tdd/db";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { hasPermission } from "@/lib/rbac";
import { audit } from "@/lib/audit";
import { mandant } from "@/lib/mandant";
import { fmtDate, fmtDateTime } from "@/lib/format";

export const dynamic = "force-dynamic";

/**
 * Auskunft nach Art. 15 DSGVO fuer eine Person: alle gespeicherten Daten als lesbare Textdatei
 * (Stammdaten, Zuordnung, Karten, Ausgaben/Zahlungen, Dokumente als Verzeichnis, Herkunftsantrag).
 * Nur Buero (person:write); jede Auskunft wird protokolliert.
 */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user || !hasPermission(user.role, "person:write")) return new Response("Forbidden", { status: 403 });
  const { id } = await params;
  const d = db();
  const p = (await d.select().from(persons).where(eq(persons.id, id)).limit(1))[0];
  if (!p) return new Response("Nicht gefunden", { status: 404 });
  const [m, zuordnungen, karten, ausgaben, dokumente, werte] = await Promise.all([
    mandant(),
    d.select({ loc: locations.name, von: personLocationAssignments.validFrom, bis: personLocationAssignments.validTo, aktiv: personLocationAssignments.isActive })
      .from(personLocationAssignments).innerJoin(locations, eq(personLocationAssignments.locationId, locations.id)).where(eq(personLocationAssignments.personId, id)),
    d.select().from(cards).where(eq(cards.personId, id)).orderBy(desc(cards.createdAt)),
    d.select({ at: distributions.distributedAt, loc: locations.name, due: distributions.amountDue, paid: distributions.amountPaid, art: distributions.buchungsart, note: distributions.note })
      .from(distributions).innerJoin(locations, eq(distributions.locationId, locations.id)).where(eq(distributions.personId, id)).orderBy(desc(distributions.distributedAt)),
    d.select({ typ: scanDocuments.docType, hochgeladen: scanDocuments.uploadedAt, frist: scanDocuments.retentionUntil }).from(scanDocuments).where(eq(scanDocuments.personId, id)),
    d.select({ id: lookupValues.id, label: lookupValues.label }).from(lookupValues),
  ]);
  const label = (vid: number | null) => werte.find((w) => w.id === vid)?.label ?? "—";
  const antrag = p.sourceAntragId ? (await d.select({ at: antraege.createdAt, status: antraege.status, org: antraege.organizationId }).from(antraege).where(eq(antraege.id, p.sourceAntragId)).limit(1))[0] : null;
  const eur = (v: string | null) => v == null ? "—" : Number(v).toLocaleString("de-AT", { style: "currency", currency: "EUR" });
  const z: string[] = [];
  z.push(`AUSKUNFT NACH ART. 15 DSGVO`, `Verantwortlicher: ${m.name}`, `Erstellt: ${fmtDateTime(new Date())} durch ${user.displayName}`, ``);
  z.push(`1. STAMMDATEN`, `Name: ${p.firstName} ${p.lastName}`, `Geburtsdatum: ${p.birthDate ? fmtDate(p.birthDate) : "—"}`, `Adresse: ${[p.address, p.postalCode, p.city].filter(Boolean).join(", ") || "—"}`,
    `Telefon: ${p.phone ?? "—"}`, `E-Mail: ${p.email ?? "—"}`, `Haushalt: ${p.householdSize ?? "—"} Personen, davon Kinder ${p.childrenCount ?? "—"}`, `Sprache: ${label(p.languageId)}`, `Herkunft der Meldung: ${label(p.originId)}`,
    `Status: ${p.status}`, `Foto gespeichert: ${p.photoRef ? "ja" : "nein"}`, `Notiz: ${p.note ?? "—"}`, `Einwilligung am: ${p.consentAt ? fmtDateTime(p.consentAt) : "—"}`, `Aufgenommen am: ${fmtDateTime(p.createdAt)}`, `Aufbewahrung bis: ${p.retentionUntil ? fmtDate(p.retentionUntil) : "—"}`,
    `Gruppe / Familiennummer: ${p.gruppe ?? "—"} / ${p.ausgabeNumber ?? "—"}`, ``);
  z.push(`2. ZUORDNUNG ZU AUSGABESTELLEN`, ...(zuordnungen.length ? zuordnungen.map((a) => `- ${a.loc}: seit ${fmtDate(a.von)}${a.bis ? ` bis ${fmtDate(a.bis)}` : ""}${a.aktiv ? " (aktiv)" : ""}`) : ["- keine"]), ``);
  z.push(`3. BERECHTIGUNGSKARTEN`, ...(karten.length ? karten.map((k) => `- ${k.cardNumber}: ${k.status}, gültig ${fmtDate(k.validFrom)} – ${fmtDate(k.validTo)}${k.blockReason ? `, Sperrgrund: ${k.blockReason}` : ""}`) : ["- keine"]), ``);
  z.push(`4. AUSGABEN UND ZAHLUNGEN (${ausgaben.length})`, ...(ausgaben.length ? ausgaben.map((a) => `- ${fmtDateTime(a.at)} ${a.loc}: ${a.art}, fällig ${eur(a.due)}, bezahlt ${eur(a.paid)}${a.note ? `, ${a.note}` : ""}`) : ["- keine"]), ``);
  z.push(`5. DOKUMENTE (Verzeichnis, Inhalte auf Anfrage)`, ...(dokumente.length ? dokumente.map((x) => `- ${x.typ}, hochgeladen ${fmtDateTime(x.hochgeladen)}, Löschung ${x.frist ? fmtDate(x.frist) : "—"}`) : ["- keine"]), ``);
  z.push(`6. HERKUNFT`, antrag ? `Übernommen aus Antrag vom ${fmtDateTime(antrag.at)} (Status ${antrag.status}, Organisation-ID ${antrag.org})` : `Direkt aufgenommen${p.sourceOrganizationId ? ` (Organisation-ID ${p.sourceOrganizationId})` : ""}`, ``);
  z.push(`7. EMPFÄNGER UND ZWECKE`, `Verarbeitung ausschließlich zur Prüfung der Anspruchsberechtigung, Kartenverwaltung und Dokumentation der Lebensmittelausgabe.`,
    `Empfänger: ${m.name}; technischer Betrieb durch Schär Systems (Auftragsverarbeiter, EU-Hosting Hetzner). Keine Weitergabe an Dritte.`,
    `Rechte: Berichtigung, Löschung, Einschränkung, Widerspruch, Beschwerde bei der Datenschutzbehörde. Kontakt: ${m.kontaktEmail ?? "siehe Datenschutzinformation"}.`);
  await audit({ actorUserId: user.id, action: "person.auskunft", entityType: "person", entityId: id });
  const name = `Auskunft_${p.lastName}_${p.firstName}_${new Date().toISOString().slice(0, 10)}.txt`.replace(/[^\w.-]/g, "_");
  return new Response("﻿" + z.join("\r\n"), { headers: { "Content-Type": "text/plain; charset=utf-8", "Content-Disposition": `attachment; filename="${name}"`, "Cache-Control": "no-store" } });
}
