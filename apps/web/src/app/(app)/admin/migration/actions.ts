"use server";

import { eq, isNull } from "drizzle-orm";
import { persons, locations, personLocationAssignments, cards, distributions } from "@tdd/db";
import { normalizeName, normalizeAddress, koelnerPhonetik } from "@tdd/core";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { hasPermission } from "@/lib/rbac";
import { audit } from "@/lib/audit";
import { today } from "@/lib/cards";

async function guard() {
  const user = await getCurrentUser();
  if (!user || !hasPermission(user.role, "admin:manage")) throw new Error("Keine Berechtigung");
  return user;
}

/** Repariert doppelt kodiertes UTF-8 (z. B. „StrÃ¶hle" → „Ströhle"). */
function fixMojibake(s: string): string {
  if (!/[ÃÂ]/.test(s)) return s;
  try { return Buffer.from(s, "latin1").toString("utf8"); } catch { return s; }
}
function clean(v: unknown): string { return fixMojibake(String(v ?? "").trim()); }
function orNull(v: unknown): string | null { const s = clean(v); return s === "" ? null : s; }
function toInt(v: unknown): number | null {
  const s = String(v ?? "").replace(/[^\d-]/g, "");
  if (s === "" || s === "-") return null;
  const n = parseInt(s, 10); return Number.isFinite(n) ? n : null;
}
function toDec(v: unknown): number {
  const n = Number(String(v ?? "0").replace(",", ".").replace(/[^\d.-]/g, ""));
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : 0;
}
function toIso(v: unknown): string | null {
  if (v instanceof Date && !isNaN(v.getTime())) {
    const y = v.getFullYear(), m = String(v.getMonth() + 1).padStart(2, "0"), d = String(v.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  }
  const s = String(v ?? "").trim();
  if (!s) return null;
  let m = /^(\d{4})-(\d{1,2})-(\d{1,2})/.exec(s);
  if (m) return `${m[1]}-${m[2]!.padStart(2, "0")}-${m[3]!.padStart(2, "0")}`;
  m = /^(\d{1,2})\.(\d{1,2})\.(\d{4})/.exec(s);
  if (m) return `${m[3]}-${m[2]!.padStart(2, "0")}-${m[1]!.padStart(2, "0")}`;
  return null;
}
/** „Nachname Vorname" → { lastName, firstName } (erstes Wort = Nachname). */
function splitName(full: string): { lastName: string; firstName: string } {
  const parts = fixMojibake(full).trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return { lastName: "", firstName: "" };
  if (parts.length === 1) return { lastName: parts[0]!, firstName: "" };
  return { lastName: parts[0]!, firstName: parts.slice(1).join(" ") };
}

/** Trennzeichen aus der Kopfzeile erkennen (Komma/Semikolon/Tab). */
function detectDelim(headerLine: string): string {
  const counts: Record<string, number> = { ",": 0, ";": 0, "\t": 0 };
  let inQ = false;
  for (const ch of headerLine) {
    if (ch === '"') inQ = !inQ;
    else if (!inQ && (ch === "," || ch === ";" || ch === "\t")) counts[ch]!++;
  }
  return ([",", ";", "\t"] as const).reduce((best, d) => (counts[d]! > counts[best]! ? d : best), ",");
}

/** Low-level Tokenizer für eine Zeichenfolge (RFC-4180: „" Escape, Zeilenumbrüche im Feld). */
function parseDelim(text: string, delim: string): string[][] {
  const rows: string[][] = [];
  let field = "", row: string[] = [], inQ = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i]!;
    if (inQ) {
      if (c === '"') { if (text[i + 1] === '"') { field += '"'; i++; } else inQ = false; }
      else field += c;
    } else if (c === '"') { inQ = true; }
    else if (c === delim) { row.push(field); field = ""; }
    else if (c === "\n") { row.push(field); rows.push(row); row = []; field = ""; }
    else field += c;
  }
  if (field !== "" || row.length) { row.push(field); rows.push(row); }
  return rows;
}

function toObjects(rows: string[][]): Record<string, string>[] {
  if (!rows.length) return [];
  const headers = rows[0]!.map((h) => h.trim());
  return rows.slice(1)
    .filter((r) => r.some((v) => v.trim() !== ""))
    .map((r) => {
      const o: Record<string, string> = {};
      headers.forEach((h, idx) => { o[h] = r[idx] ?? ""; });
      return o;
    });
}

/** Äußere Hülle „<inhalt>"; entfernen und verdoppelte Anführungszeichen zurücksetzen. */
function unwrap(s: string): string {
  s = s.replace(/\s+$/, "");
  if (s.endsWith(";")) s = s.slice(0, -1);
  if (s.startsWith('"') && s.endsWith('"')) s = s.slice(1, -1);
  return s.replace(/""/g, '"');
}

/**
 * Liest die CSV. Erkennt automatisch das „von Excel neu gespeicherte" Format,
 * bei dem jede Zeile als `"<komma-csv>";` verpackt und innere Quotes verdoppelt sind
 * (inkl. mehrzeiliger Notizen). Fällt sonst auf normales CSV zurück.
 */
function readSheet(buf: Buffer): Record<string, unknown>[] {
  let text = buf.toString("utf8");
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);
  text = text.replace(/\r\n?/g, "\n");
  const allLines = text.split("\n");
  const START = /^"\d+,/;
  const wrapped = allLines.slice(1, 60).some((l) => START.test(l));

  if (!wrapped) {
    const nl = text.indexOf("\n");
    return toObjects(parseDelim(text, detectDelim(nl === -1 ? text : text.slice(0, nl))));
  }

  // Verschachteltes Excel-Format: Datensätze über Start (`"<Zahl>,`) UND Ende (`";`) gruppieren.
  const phys = allLines.filter((l, i) => i === 0 || l.trim() !== "");
  const logical: string[] = [];
  let bufL: string | null = null;
  for (let i = 1; i < phys.length; i++) {
    bufL = bufL === null ? phys[i]! : bufL + "\n" + phys[i]!;
    const t = bufL.replace(/\s+$/, "");
    const ended = t.endsWith('";') || t.endsWith('"'); // Familien enden „…"; · Orte enden „…"
    const nextStartsOrEnd = i + 1 >= phys.length || START.test(phys[i + 1]!);
    if (ended && nextStartsOrEnd) { logical.push(bufL); bufL = null; }
  }
  if (bufL !== null) logical.push(bufL);

  const innerText = [unwrap(phys[0]!), ...logical.map(unwrap)].join("\n");
  return toObjects(parseDelim(innerText, ","));
}
/** Wert einer Spalte über mehrere mögliche Kopfzeilen-Namen (case-insensitive). */
function col(row: Record<string, unknown>, names: string[]): unknown {
  const keys = Object.keys(row);
  for (const n of names) {
    const k = keys.find((key) => key.toLowerCase().trim() === n.toLowerCase());
    if (k) return row[k];
  }
  return null;
}

// ══ ORTE ══════════════════════════════════════════════════════════════════
export interface OrteResult { ok: boolean; message?: string; created: number; updated: number; sample: string[]; }

export async function importOrte(formData: FormData): Promise<OrteResult> {
  const user = await guard();
  const file = formData.get("file");
  if (!(file instanceof File)) return { ok: false, message: "Keine Datei", created: 0, updated: 0, sample: [] };
  const rows = readSheet(Buffer.from(await file.arrayBuffer()));

  const existing = await db().select({ id: locations.id, name: locations.name, code: locations.locationCode }).from(locations);
  const byName = new Map(existing.map((l) => [normalizeName(l.name), l]));
  let maxCode = existing.reduce((m, l) => Math.max(m, l.code), 0);

  let created = 0, updated = 0; const sample: string[] = [];
  for (const r of rows) {
    if (toInt(col(r, ["deleted"])) === 1) continue;
    const name = clean(col(r, ["Name"]));
    if (!name) continue;
    const groups = toInt(col(r, ["Gruppen"])) ?? 8;
    const ex = byName.get(normalizeName(name));
    if (ex) {
      await db().update(locations).set({ groupCount: groups }).where(eq(locations.id, ex.id));
      updated++;
    } else {
      maxCode += 1;
      await db().insert(locations).values({
        name, type: "AUSGABESTELLE", city: name.split(/\s+/)[0] ?? name,
        locationCode: maxCode, groupCount: groups,
      });
      created++;
      if (sample.length < 12) sample.push(`${name} (${groups} Gruppen)`);
    }
  }
  await audit({ actorUserId: user.id, action: "migration.orte", entityType: "location", after: { created, updated } });
  return { ok: true, created, updated, sample };
}

// ══ FAMILIEN ══════════════════════════════════════════════════════════════
interface FamRow {
  oldId: number | null;
  lastName: string; firstName: string; adults: number; children: number;
  ortLabel: string | null; gruppe: number | null; nummer: number | null;
  schulden: number; karte: string | null; lAnwesenheit: string | null;
  note: string | null; address: string | null; phone: string | null;
  blocked: boolean; deleted: boolean; key: string; error: string | null;
}

function parseFamilien(buf: Buffer): FamRow[] {
  return readSheet(buf).map((r) => {
    const { lastName, firstName } = splitName(clean(col(r, ["Name"])));
    const oldId = toInt(col(r, ["ID"]));
    const adults = toInt(col(r, ["Erwachsene"])) ?? 0;
    const children = toInt(col(r, ["Kinder"])) ?? 0;
    const note = orNull(col(r, ["Notizen", "Notiz"]));
    const gruppe = toInt(col(r, ["Gruppe"]));
    const nummer = toInt(col(r, ["Num", "Nummer"]));
    const ortLabel = orNull(col(r, ["Ort"]));
    const deleted = toInt(col(r, ["deleted"])) === 1;
    return {
      oldId,
      lastName, firstName, adults, children, ortLabel,
      gruppe: gruppe && gruppe > 0 ? gruppe : null,
      nummer: nummer && nummer > 0 ? nummer : null,
      schulden: toDec(col(r, ["Schulden"])),
      karte: toIso(col(r, ["Karte"])), lAnwesenheit: toIso(col(r, ["lAnwesenheit", "letzte Anwesenheit"])),
      note, address: orNull(col(r, ["Adresse"])), phone: orNull(col(r, ["Telefonnummer", "Telefon"])),
      blocked: !!note && /gesperrt/i.test(note),
      deleted,
      key: `${normalizeName(lastName)}|${normalizeName(firstName)}|${normalizeName(ortLabel ?? "")}|${gruppe ?? ""}|${nummer ?? ""}`,
      error: !lastName ? "Name fehlt" : null,
    };
  });
}

export interface FamAnalyze {
  ok: boolean; message?: string;
  total: number; importable: number; deleted: number; blocked: number; noOrt: number; noAddress: number; withDebt: number;
  headers: string[]; parsedRows: number;
  sample: Array<{ name: string; ort: string | null; gruppe: number | null; nummer: number | null; schulden: number; status: string }>;
}

export async function analyzeFamilien(formData: FormData): Promise<FamAnalyze> {
  await guard();
  const file = formData.get("file");
  if (!(file instanceof File)) return { ok: false, message: "Keine Datei", total: 0, importable: 0, deleted: 0, blocked: 0, noOrt: 0, noAddress: 0, withDebt: 0, headers: [], parsedRows: 0, sample: [] };
  const buf = Buffer.from(await file.arrayBuffer());
  const raw = readSheet(buf);
  const headers = raw.length ? Object.keys(raw[0]!) : [];
  const rows = parseFamilien(buf);
  const locList = await db().select({ name: locations.name }).from(locations);
  const locSet = new Set(locList.map((l) => normalizeName(l.name)));

  let deleted = 0, blocked = 0, noOrt = 0, noAddress = 0, withDebt = 0, importable = 0;
  const sample: FamAnalyze["sample"] = [];
  for (const r of rows) {
    if (r.deleted) { deleted++; continue; }
    if (r.error) continue;
    importable++;
    if (r.blocked) blocked++;
    if (!r.ortLabel || !locSet.has(normalizeName(r.ortLabel))) noOrt++;
    if (!r.address) noAddress++;
    if (r.schulden > 0) withDebt++;
    if (sample.length < 10) sample.push({
      name: `${r.lastName} ${r.firstName}`.trim(), ort: r.ortLabel, gruppe: r.gruppe, nummer: r.nummer,
      schulden: r.schulden, status: r.blocked ? "gesperrt" : "ok",
    });
  }
  return { ok: true, total: rows.length, importable, deleted, blocked, noOrt, noAddress, withDebt, headers, parsedRows: rows.length, sample };
}

export interface FamCommit { ok: boolean; message?: string; persons: number; cards: number; skipped: number; }

export async function commitFamilien(formData: FormData): Promise<FamCommit> {
  const user = await guard();
  const file = formData.get("file");
  if (!(file instanceof File)) return { ok: false, message: "Keine Datei", persons: 0, cards: 0, skipped: 0 };
  const rows = parseFamilien(Buffer.from(await file.arrayBuffer()));

  // Orte-Namen → {id, code}
  const locList = await db().select({ id: locations.id, name: locations.name, code: locations.locationCode }).from(locations);
  const locByName = new Map(locList.map((l) => [normalizeName(l.name), l]));

  // Bereits importierte Alt-IDs (Wiederholungslauf → überspringen, idempotent)
  const existing = await db().select({ lid: persons.legacyId }).from(persons).where(isNull(persons.deletedAt));
  const existingIds = new Set(existing.map((p) => p.lid).filter((x): x is number => x != null));

  let nPersons = 0, nCards = 0, skipped = 0;
  const seen = new Set<number>();
  const importDate = today();

  for (const r of rows) {
    if (r.deleted || r.error || r.oldId == null) { skipped++; continue; }
    if (existingIds.has(r.oldId) || seen.has(r.oldId)) { skipped++; continue; }
    seen.add(r.oldId);

    const lnNorm = normalizeName(r.lastName), fnNorm = normalizeName(r.firstName);
    const loc = r.ortLabel ? locByName.get(normalizeName(r.ortLabel)) : undefined;

    const ins = await db().insert(persons).values({
      firstName: r.firstName, lastName: r.lastName, address: r.address, phone: r.phone,
      householdSize: r.adults + r.children, childrenCount: r.children,
      gruppe: r.gruppe, ausgabeNumber: r.nummer, note: r.note, legacyId: r.oldId,
      lastNameNorm: lnNorm, firstNameNorm: fnNorm, addressNorm: normalizeAddress(r.address),
      lastNamePhon: koelnerPhonetik(lnNorm), firstNamePhon: koelnerPhonetik(fnNorm),
      createdBy: user.id, updatedBy: user.id,
    }).returning({ id: persons.id });
    const personId = ins[0]!.id;
    nPersons++;

    if (loc) {
      await db().insert(personLocationAssignments).values({ personId, locationId: loc.id });

      // Legacy-Karte: Nummer = alte Familien-ID (6-stellig, = alter Barcode). Bleibt gültig,
      // bis der Klient zur Ausgabe kommt; dort wird beim Scan die neue EAN-Karte erzeugt.
      if (r.oldId != null) {
        const legacyNumber = String(r.oldId).padStart(6, "0");
        const cardIns = await db().insert(cards).values({
          cardNumber: legacyNumber, personId, locationId: loc.id,
          validFrom: r.lAnwesenheit ?? importDate, validTo: r.karte ?? importDate,
          status: r.blocked ? "GESPERRT" : "AKTIV",
          blockReason: r.blocked ? (r.note ?? "aus Altsystem gesperrt").slice(0, 250) : null,
          legacy: true, createdBy: user.id,
        }).onConflictDoNothing({ target: cards.cardNumber }).returning({ id: cards.id });
        if (cardIns[0]) nCards++;

        // Übernahme-Buchung: letzte Anwesenheit + Anfangs-Schulden (fällig=Schulden, bezahlt=0).
        if (cardIns[0] && (r.schulden > 0 || r.lAnwesenheit)) {
          await db().insert(distributions).values({
            cardId: cardIns[0]!.id, personId, locationId: loc.id, distributedBy: user.id,
            distributedAt: new Date(`${r.lAnwesenheit ?? importDate}T12:00:00`),
            amountDue: r.schulden > 0 ? String(r.schulden) : "0", amountPaid: "0",
            note: "Übernahme Altsystem",
          });
        }
      }
    }
  }

  await audit({ actorUserId: user.id, action: "migration.familien", entityType: "person", after: { persons: nPersons, cards: nCards, skipped } });
  return { ok: true, persons: nPersons, cards: nCards, skipped };
}
