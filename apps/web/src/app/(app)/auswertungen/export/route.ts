import ExcelJS from "exceljs";
import { getCurrentUser } from "@/lib/auth";
import { hasPermission } from "@/lib/rbac";
import { loadReports } from "@/lib/reports";

export async function GET() {
  const user = await getCurrentUser();
  if (!user || !hasPermission(user.role, "report:view")) return new Response("Forbidden", { status: 403 });

  const r = await loadReports();
  const wb = new ExcelJS.Workbook();
  wb.creator = "TDD-Verwaltung";
  wb.created = new Date();

  const s1 = wb.addWorksheet("Berechtigte je Standort");
  s1.columns = [
    { header: "Standort", key: "name", width: 32 },
    { header: "Typ", key: "type", width: 16 },
    { header: "Berechtigte", key: "p", width: 14 },
    { header: "Aktive Karten", key: "c", width: 14 },
  ];
  r.byLocation.forEach((l) => s1.addRow({ name: l.location_name, type: l.location_type, p: l.active_persons, c: l.active_cards }));

  const s2 = wb.addWorksheet("Ausgaben je Standort");
  s2.columns = [
    { header: "Standort", key: "name", width: 32 },
    { header: "Typ", key: "type", width: 16 },
    { header: "Ausgaben 30 Tage", key: "d30", width: 18 },
    { header: "Ausgaben gesamt", key: "total", width: 18 },
  ];
  r.distByLocation.forEach((l) => s2.addRow({ name: l.name, type: l.type, d30: l.d30, total: l.total }));

  const s3 = wb.addWorksheet("Ausgaben monatlich");
  s3.columns = [{ header: "Monat", key: "m", width: 12 }, { header: "Ausgaben", key: "n", width: 12 }];
  r.distMonthly.forEach((m) => s3.addRow({ m: m.monat, n: m.n }));

  const s4 = wb.addWorksheet("Neuaufnahmen monatlich");
  s4.columns = [{ header: "Monat", key: "m", width: 12 }, { header: "Neuaufnahmen", key: "n", width: 14 }];
  r.newPersonsMonthly.forEach((m) => s4.addRow({ m: m.monat, n: m.n }));

  const s5 = wb.addWorksheet("Dubletten & Kartenablauf");
  s5.addRow(["Dubletten zusammengeführt", r.duplicates.merged]);
  s5.addRow(["Trotz Warnung neu angelegt", r.duplicates.create_new]);
  s5.addRow(["Verknüpft", r.duplicates.linked]);
  s5.addRow([]);
  s5.addRow(["Karten Ablauf ≤ 30 Tage", r.cardExpiry.d30]);
  s5.addRow(["Karten Ablauf ≤ 60 Tage", r.cardExpiry.d60]);
  s5.addRow(["Karten Ablauf ≤ 90 Tage", r.cardExpiry.d90]);

  const s6 = wb.addWorksheet("Herkunft der Personen");
  s6.columns = [
    { header: "Herkunftsstelle", key: "name", width: 34 },
    { header: "Typ", key: "type", width: 16 },
    { header: "Personen", key: "n", width: 12 },
  ];
  r.byOrigin.forEach((o) => s6.addRow({ name: o.org_name, type: o.org_type, n: o.n }));

  const s7 = wb.addWorksheet("Anträge je Monat");
  s7.columns = [
    { header: "Monat", key: "m", width: 12 }, { header: "Gemeinden", key: "g", width: 12 },
    { header: "Institutionen", key: "i", width: 14 }, { header: "Summe", key: "s", width: 12 },
  ];
  r.antragMonthly.forEach((m) => s7.addRow({ m: m.month, g: m.gemeinde, i: m.institution, s: m.gemeinde + m.institution }));

  [s1, s2, s3, s4, s6, s7].forEach((s) => { s.getRow(1).font = { bold: true }; });

  const buf = await wb.xlsx.writeBuffer();
  const today = new Date().toISOString().slice(0, 10);
  return new Response(buf as ArrayBuffer, {
    headers: {
      "content-type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "content-disposition": `attachment; filename="TDD-Auswertung-${today}.xlsx"`,
    },
  });
}
