import ExcelJS from "exceljs";
import { and, asc, eq, exists, ilike, isNull, or, sql } from "drizzle-orm";
import { persons, personLocationAssignments, locations, cards } from "@tdd/db";
import { normalizeName } from "@tdd/core";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { hasPermission } from "@/lib/rbac";
import { fmtDate } from "@/lib/format";

/** Excel-Export der Personenliste – exakt derselbe Filter wie in /personen. */
export async function GET(req: Request) {
  const user = await getCurrentUser();
  if (!user || !hasPermission(user.role, "person:read")) return new Response("Forbidden", { status: 403 });

  const q = new URL(req.url).searchParams.get("q")?.trim() ?? "";
  const scoped = user.role !== "ADMIN" && user.locationId != null;

  const conds = [isNull(persons.deletedAt), eq(persons.takeoverPending, false)];
  if (scoped) conds.push(eq(personLocationAssignments.locationId, user.locationId!));
  if (q) {
    const nameLike = `%${normalizeName(q)}%`;
    const rawLike = `%${q}%`;
    const parts = [
      ilike(persons.lastNameNorm, nameLike),
      ilike(persons.firstNameNorm, nameLike),
      ilike(persons.address, rawLike),
      ilike(persons.city, rawLike),
      ilike(persons.postalCode, rawLike),
    ];
    const digits = q.replace(/\D/g, "");
    if (digits.length >= 3) {
      parts.push(exists(db().select({ x: sql`1` }).from(cards).where(
        and(eq(cards.personId, persons.id), isNull(cards.deletedAt), ilike(cards.cardNumber, `%${digits}%`)))));
    }
    conds.push(or(...parts)!);
  }

  const rows = await db()
    .select({
      firstName: persons.firstName, lastName: persons.lastName, birthDate: persons.birthDate,
      address: persons.address, postalCode: persons.postalCode, city: persons.city,
      phone: persons.phone, email: persons.email, household: persons.householdSize, children: persons.childrenCount,
      status: persons.status, locName: locations.name, personId: persons.id,
    })
    .from(persons)
    .leftJoin(personLocationAssignments, and(eq(personLocationAssignments.personId, persons.id), eq(personLocationAssignments.isActive, true)))
    .leftJoin(locations, eq(personLocationAssignments.locationId, locations.id))
    .where(and(...conds))
    .orderBy(asc(persons.lastName), asc(persons.firstName));

  // Aktive Kartennummer je Person (separat, um Zeilen-Duplikate bei Mehrfachkarten zu vermeiden).
  const cardRows = await db()
    .select({ personId: cards.personId, number: cards.cardNumber })
    .from(cards)
    .where(and(eq(cards.status, "AKTIV"), isNull(cards.deletedAt), sql`${cards.validTo} >= current_date`));
  const cardByPerson = new Map<string, string>();
  for (const c of cardRows) if (!cardByPerson.has(c.personId)) cardByPerson.set(c.personId, c.number);

  const wb = new ExcelJS.Workbook();
  wb.creator = "TDD-Verwaltung";
  wb.created = new Date();
  const ws = wb.addWorksheet("Personen");
  ws.columns = [
    { header: "Nachname", key: "last", width: 22 },
    { header: "Vorname", key: "first", width: 20 },
    { header: "Geburtsdatum", key: "birth", width: 14 },
    { header: "Adresse", key: "addr", width: 30 },
    { header: "PLZ", key: "plz", width: 8 },
    { header: "Ort", key: "city", width: 18 },
    { header: "Telefon", key: "phone", width: 16 },
    { header: "E-Mail", key: "email", width: 26 },
    { header: "Haushalt", key: "hh", width: 10 },
    { header: "Kinder", key: "kids", width: 8 },
    { header: "Bezugsort", key: "loc", width: 22 },
    { header: "Aktive Karte", key: "card", width: 16 },
    { header: "Status", key: "status", width: 12 },
  ];
  rows.forEach((r) => ws.addRow({
    last: r.lastName, first: r.firstName, birth: r.birthDate ? fmtDate(r.birthDate) : "",
    addr: r.address ?? "", plz: r.postalCode ?? "", city: r.city ?? "",
    phone: r.phone ?? "", email: r.email ?? "", hh: r.household ?? "", kids: r.children ?? "",
    loc: r.locName ?? "", card: cardByPerson.get(r.personId) ?? "", status: r.status,
  }));
  ws.getRow(1).font = { bold: true };
  ws.autoFilter = "A1:M1";
  ws.views = [{ state: "frozen", ySplit: 1 }];

  const buf = await wb.xlsx.writeBuffer();
  const today = new Date().toISOString().slice(0, 10);
  return new Response(buf as ArrayBuffer, {
    headers: {
      "content-type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "content-disposition": `attachment; filename="TDD-Personen-${today}.xlsx"`,
      "cache-control": "no-store",
    },
  });
}
