"use server";

import ExcelJS from "exceljs";
import { Readable } from "node:stream";
import { isNull } from "drizzle-orm";
import { persons, locations, personLocationAssignments } from "@tdd/db";
import { normalizeName, normalizeAddress, koelnerPhonetik } from "@tdd/core";
import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import { requirePermission } from "@/lib/guard";

// ── Spaltenerkennung anhand normalisierter Kopfzeilen ─────────────────────
type Field =
  | "lastName" | "firstName" | "address" | "postalCode" | "city"
  | "birthDate" | "phone" | "email" | "householdSize" | "childrenCount" | "location";

const HEADER_PATTERNS: { field: Field; re: RegExp }[] = [
  { field: "lastName", re: /^(nachname|familienname|name)$/ },
  { field: "firstName", re: /^(vorname)$/ },
  { field: "address", re: /^(adresse|strasse|str|anschrift)$/ },
  { field: "postalCode", re: /^(plz|postleitzahl)$/ },
  { field: "city", re: /^(ort|stadt|gemeinde)$/ },
  { field: "birthDate", re: /^(geburtsdatum|geburtstag|geboren|gebdat|geb)$/ },
  { field: "phone", re: /^(telefon|tel|telefonnummer|handy|mobil)$/ },
  { field: "email", re: /^(email|e mail|mail)$/ },
  { field: "householdSize", re: /^(haushalt|anzahl haushalt|haushaltsgroesse|personen)$/ },
  { field: "childrenCount", re: /^(kinder|anzahl kinder)$/ },
  { field: "location", re: /^(standort|bezugsort|laden|ausgabestelle)$/ },
];

function detectColumns(headers: string[]): Record<Field, string | null> {
  const map = Object.fromEntries(HEADER_PATTERNS.map((p) => [p.field, null])) as Record<Field, string | null>;
  for (const h of headers) {
    const norm = normalizeName(h);
    for (const p of HEADER_PATTERNS) {
      if (map[p.field] === null && p.re.test(norm)) { map[p.field] = h; break; }
    }
  }
  return map;
}

function toIsoDate(v: unknown): string | null {
  if (v == null || v === "") return null;
  if (v instanceof Date) {
    const y = v.getFullYear(), m = String(v.getMonth() + 1).padStart(2, "0"), d = String(v.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  }
  const s = String(v).trim();
  let m = /^(\d{1,2})\.(\d{1,2})\.(\d{4})$/.exec(s);
  if (m) return `${m[3]}-${m[2]!.padStart(2, "0")}-${m[1]!.padStart(2, "0")}`;
  m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (m) return s;
  return null;
}

function toInt(v: unknown): number | null {
  if (v == null || v === "") return null;
  const n = parseInt(String(v).replace(/[^\d]/g, ""), 10);
  return Number.isFinite(n) ? n : null;
}

function str(v: unknown): string | null {
  if (v == null) return null;
  const s = String(v).trim();
  return s === "" ? null : s;
}

interface ParsedRow {
  lastName: string; firstName: string;
  address: string | null; postalCode: string | null; city: string | null;
  birthDate: string | null; phone: string | null; email: string | null;
  householdSize: number | null; childrenCount: number | null;
  locationLabel: string | null;
  lastNameNorm: string; firstNameNorm: string; addressNorm: string;
  lastNamePhon: string; firstNamePhon: string;
  key: string; error: string | null;
}

/** Zellwert auf einen einfachen Wert reduzieren (Formeln, RichText, Hyperlinks). */
function cellValue(v: ExcelJS.CellValue): unknown {
  if (v == null) return null;
  if (v instanceof Date) return v;
  if (typeof v === "object") {
    if ("richText" in v) return v.richText.map((r) => r.text).join("");
    if ("result" in v) return v.result ?? null;
    if ("text" in v) return v.text;
    return null;
  }
  return v;
}

/** Liest das erste Blatt als Liste von {Spaltenüberschrift: Wert}. */
async function readSheet(buf: Buffer, isCsv: boolean): Promise<Record<string, unknown>[]> {
  const wb = new ExcelJS.Workbook();
  const sheet = isCsv
    ? await wb.csv.read(Readable.from(buf.toString("utf8")))
    // exceljs' eigener Buffer-Typ passt nicht zu Nodes Buffer<ArrayBufferLike>; ein
    // sauber zugeschnittener ArrayBuffer ist fuer beide Seiten eindeutig.
    : (await wb.xlsx.load(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer)).worksheets[0];
  if (!sheet) return [];

  const headers: string[] = [];
  sheet.getRow(1).eachCell({ includeEmpty: false }, (cell, col) => {
    headers[col] = String(cellValue(cell.value) ?? "").trim();
  });

  const out: Record<string, unknown>[] = [];
  sheet.eachRow({ includeEmpty: false }, (row, rowNumber) => {
    if (rowNumber === 1) return;
    const obj: Record<string, unknown> = {};
    let empty = true;
    for (let col = 1; col < headers.length; col++) {
      const key = headers[col];
      if (!key) continue;
      const value = cellValue(row.getCell(col).value);
      obj[key] = value;
      if (value != null && String(value).trim() !== "") empty = false;
    }
    if (!empty) out.push(obj);
  });
  return out;
}

async function parseWorkbook(buf: Buffer, filename: string): Promise<{ headers: string[]; cols: Record<Field, string | null>; rows: ParsedRow[] }> {
  const json = await readSheet(buf, filename.toLowerCase().endsWith(".csv"));
  const headers = json.length ? Object.keys(json[0]!) : [];
  const cols = detectColumns(headers);

  const get = (row: Record<string, unknown>, f: Field) => (cols[f] ? row[cols[f]] : null);

  const rows: ParsedRow[] = json.map((row) => {
    const lastName = str(get(row, "lastName")) ?? "";
    const firstName = str(get(row, "firstName")) ?? "";
    const address = str(get(row, "address"));
    const lastNameNorm = normalizeName(lastName);
    const firstNameNorm = normalizeName(firstName);
    const birthDate = toIsoDate(get(row, "birthDate"));
    const error = !lastName || !firstName ? "Nach-/Vorname fehlt" : null;
    return {
      lastName, firstName, address,
      postalCode: str(get(row, "postalCode")), city: str(get(row, "city")),
      birthDate, phone: str(get(row, "phone")), email: str(get(row, "email")),
      householdSize: toInt(get(row, "householdSize")), childrenCount: toInt(get(row, "childrenCount")),
      locationLabel: str(get(row, "location")),
      lastNameNorm, firstNameNorm, addressNorm: normalizeAddress(address),
      lastNamePhon: koelnerPhonetik(lastNameNorm), firstNamePhon: koelnerPhonetik(firstNameNorm),
      key: `${lastNameNorm}|${firstNameNorm}|${birthDate ?? ""}`, error: error,
    };
  });
  return { headers, cols, rows };
}

async function existingKeys(): Promise<Set<string>> {
  const rows = await db()
    .select({ ln: persons.lastNameNorm, fn: persons.firstNameNorm, bd: persons.birthDate })
    .from(persons)
    .where(isNull(persons.deletedAt));
  return new Set(rows.map((r) => `${r.ln}|${r.fn}|${r.bd ?? ""}`));
}

const guard = () => requirePermission("admin:manage");

export interface AnalyzeResult {
  ok: boolean;
  message?: string;
  headers: string[];
  detected: Record<string, string | null>;
  total: number;
  newCount: number;
  dupCount: number;
  errorCount: number;
  sample: Array<{ lastName: string; firstName: string; birthDate: string | null; city: string | null; status: string }>;
}

export async function analyzeImport(formData: FormData): Promise<AnalyzeResult> {
  await guard();
  const file = formData.get("file");
  if (!(file instanceof File)) {
    return { ok: false, message: "Keine Datei", headers: [], detected: {}, total: 0, newCount: 0, dupCount: 0, errorCount: 0, sample: [] };
  }
  const buf = Buffer.from(await file.arrayBuffer());
  const { headers, cols, rows } = await parseWorkbook(buf, file.name);
  if (!cols.lastName || !cols.firstName) {
    return {
      ok: false,
      message: "Spalten 'Nachname' und 'Vorname' konnten nicht erkannt werden.",
      headers, detected: cols, total: rows.length, newCount: 0, dupCount: 0, errorCount: 0, sample: [],
    };
  }
  const existing = await existingKeys();
  const seen = new Set<string>();
  let newCount = 0, dupCount = 0, errorCount = 0;
  const sample: AnalyzeResult["sample"] = [];
  for (const r of rows) {
    let status: string;
    if (r.error) { errorCount++; status = "Fehler"; }
    else if (existing.has(r.key) || seen.has(r.key)) { dupCount++; status = "Dublette"; }
    else { newCount++; seen.add(r.key); status = "Neu"; }
    if (sample.length < 8) sample.push({ lastName: r.lastName, firstName: r.firstName, birthDate: r.birthDate, city: r.city, status });
  }
  return { ok: true, headers, detected: cols, total: rows.length, newCount, dupCount, errorCount, sample };
}

export interface CommitResult { ok: boolean; message?: string; inserted: number; skipped: number; }

export async function commitImport(formData: FormData): Promise<CommitResult> {
  const user = await guard();
  const file = formData.get("file");
  if (!(file instanceof File)) return { ok: false, message: "Keine Datei", inserted: 0, skipped: 0 };

  const buf = Buffer.from(await file.arrayBuffer());
  const { cols, rows } = await parseWorkbook(buf, file.name);
  if (!cols.lastName || !cols.firstName) return { ok: false, message: "Pflichtspalten fehlen", inserted: 0, skipped: 0 };

  const existing = await existingKeys();
  const seen = new Set<string>();

  // Standort-Namen → id (falls Spalte vorhanden)
  const locList = await db().select({ id: locations.id, name: locations.name, city: locations.city }).from(locations);
  const locByLabel = new Map<string, number>();
  for (const l of locList) {
    locByLabel.set(normalizeName(l.name), l.id);
    locByLabel.set(normalizeName(l.city), l.id);
  }

  const toInsert = rows.filter((r) => {
    if (r.error) return false;
    if (existing.has(r.key) || seen.has(r.key)) return false;
    seen.add(r.key);
    return true;
  });

  let inserted = 0;
  const skipped = rows.length - toInsert.length;

  if (toInsert.length > 0) {
    const values = toInsert.map((r) => ({
      firstName: r.firstName, lastName: r.lastName, address: r.address,
      postalCode: r.postalCode, city: r.city, birthDate: r.birthDate,
      phone: r.phone, email: r.email, householdSize: r.householdSize, childrenCount: r.childrenCount,
      lastNameNorm: r.lastNameNorm, firstNameNorm: r.firstNameNorm, addressNorm: r.addressNorm,
      lastNamePhon: r.lastNamePhon, firstNamePhon: r.firstNamePhon,
      createdBy: user.id, updatedBy: user.id,
    }));

    // In Blöcken einfügen (Reihenfolge bleibt für Standort-Zuordnung erhalten)
    const CHUNK = 500;
    for (let i = 0; i < values.length; i += CHUNK) {
      const chunk = values.slice(i, i + CHUNK);
      const rowsSlice = toInsert.slice(i, i + CHUNK);
      const insertedRows = await db().insert(persons).values(chunk).returning({ id: persons.id });
      inserted += insertedRows.length;

      const assignments = insertedRows
        .map((ins, idx) => {
          const label = rowsSlice[idx]!.locationLabel;
          if (!label) return null;
          const locId = locByLabel.get(normalizeName(label));
          if (!locId) return null;
          return { personId: ins.id, locationId: locId };
        })
        .filter((a): a is { personId: string; locationId: number } => a !== null);
      if (assignments.length) await db().insert(personLocationAssignments).values(assignments);
    }
  }

  await audit({
    actorUserId: user.id, action: "import", entityType: "person",
    after: { inserted, skipped, total: rows.length },
  });

  return { ok: true, inserted, skipped };
}
