import ExcelJS from "exceljs";
import { getCurrentUser } from "@/lib/auth";
import { hasPermission } from "@/lib/rbac";
import { loadTresenReport } from "@/lib/tresen-report";

function isoDaysAgo(n: number): string {
  const d = new Date(); d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 10);
}

/** Excel-Sheetname säubern (max 31 Zeichen, keine Sonderzeichen, eindeutig). */
function sheetName(name: string, used: Set<string>): string {
  let base = name.replace(/[\\/?*[\]:]/g, " ").trim().slice(0, 31) || "Ausgabestelle";
  let n = base, i = 2;
  while (used.has(n.toLowerCase())) { const suffix = ` (${i++})`; n = base.slice(0, 31 - suffix.length) + suffix; }
  used.add(n.toLowerCase());
  return n;
}

export async function GET(req: Request) {
  const user = await getCurrentUser();
  if (!user || !hasPermission(user.role, "distribution:record")) return new Response("Forbidden", { status: 403 });

  const url = new URL(req.url);
  const von = /^\d{4}-\d{2}-\d{2}$/.test(url.searchParams.get("von") ?? "") ? url.searchParams.get("von")! : isoDaysAgo(29);
  const bis = /^\d{4}-\d{2}-\d{2}$/.test(url.searchParams.get("bis") ?? "") ? url.searchParams.get("bis")! : isoDaysAgo(0);

  const blocks = await loadTresenReport(von, bis);
  const wb = new ExcelJS.Workbook();
  wb.creator = "TDD-Verwaltung";
  wb.created = new Date();

  // Übersichtsblatt: je Ausgabestelle eine Summenzeile
  const ov = wb.addWorksheet("Übersicht");
  ov.columns = [
    { header: "Ausgabestelle", key: "name", width: 32 },
    { header: "Personen (Summe/Tag)", key: "persons", width: 20 },
    { header: "Einnahmen", key: "income", width: 14 },
    { header: "Ausstand (Schulden)", key: "ausstand", width: 20 },
  ];
  blocks.forEach((b) => ov.addRow({ name: b.name, persons: b.totalPersons, income: b.totalIncome, ausstand: b.totalAusstand }));
  ov.getRow(1).font = { bold: true };

  const used = new Set<string>(["übersicht"]);
  for (const b of blocks) {
    const ws = wb.addWorksheet(sheetName(b.name, used));
    ws.mergeCells("A1:D1");
    ws.getCell("A1").value = `${b.name} · ${von} bis ${bis}`;
    ws.getCell("A1").font = { bold: true, size: 12 };
    ws.addRow([]);
    const head = ws.addRow(["Tag", "Personenanzahl", "Einnahmen", "Ausstand (Schulden)"]);
    head.font = { bold: true };
    b.days.forEach((d) => ws.addRow([d.day, d.persons, d.income, d.ausstand]));
    const total = ws.addRow(["Total", b.totalPersons, b.totalIncome, b.totalAusstand]);
    total.font = { bold: true };
    [14, 16, 14, 20].forEach((w, i) => { ws.getColumn(i + 1).width = w; });
    // Währungsformat für Spalten C/D
    ws.getColumn(3).numFmt = '#,##0.00 "€"';
    ws.getColumn(4).numFmt = '#,##0.00 "€"';
  }
  ov.getColumn(3).numFmt = '#,##0.00 "€"';
  ov.getColumn(4).numFmt = '#,##0.00 "€"';

  const buf = await wb.xlsx.writeBuffer();
  return new Response(buf as ArrayBuffer, {
    headers: {
      "content-type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "content-disposition": `attachment; filename="TDD-Ausgaben-${von}_bis_${bis}.xlsx"`,
    },
  });
}
