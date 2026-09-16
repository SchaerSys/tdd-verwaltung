import ExcelJS from "exceljs";
import { getCurrentUser } from "@/lib/auth";
import { hasPermission } from "@/lib/rbac";
import { ladeLohn } from "@/lib/lohn-daten";
import { lohnCsv, LOHN_SPALTEN } from "@/lib/lohn";
import { audit } from "@/lib/audit";

/** Lohnexport als Excel (Standard) oder CSV (?format=csv) – nur Admin, weil SV-Nummern enthalten sind. */
export async function GET(req: Request) {
  const user = await getCurrentUser();
  if (!user || !hasPermission(user.role, "admin:manage")) return new Response("Forbidden", { status: 403 });
  const url = new URL(req.url);
  const m = /^(\d{4})-(\d{2})$/.exec(url.searchParams.get("monat") ?? "");
  if (!m) return new Response("monat=YYYY-MM fehlt", { status: 400 });
  const jahr = Number(m[1]); const monat = Number(m[2]);
  if (monat < 1 || monat > 12) return new Response("Ungültiger Monat", { status: 400 });
  const zeilen = await ladeLohn(jahr, monat);
  await audit({ actorUserId: user.id, action: "lohn.export", entityType: "lohn", entityId: `${jahr}-${m[2]}`, after: { personen: zeilen.length, format: url.searchParams.get("format") ?? "xlsx" } });
  const name = `Lohn_${jahr}-${m[2]}`;

  if (url.searchParams.get("format") === "csv") {
    return new Response(lohnCsv(zeilen), { headers: { "content-type": "text/csv; charset=utf-8", "content-disposition": `attachment; filename="${name}.csv"`, "cache-control": "private, no-store" } });
  }
  const wb = new ExcelJS.Workbook();
  wb.creator = "CareOS"; wb.created = new Date();
  const ws = wb.addWorksheet(`Lohn ${jahr}-${m[2]}`);
  ws.columns = LOHN_SPALTEN.map((c) => ({ header: c.label, key: c.key, width: Math.max(10, Math.min(28, c.label.length + 4)) }));
  for (const z of zeilen) ws.addRow({ ...z, abgeschlossen: z.abgeschlossen ? "ja" : "nein" });
  ws.getRow(1).font = { bold: true };
  ws.views = [{ state: "frozen", ySplit: 1 }];
  const buf = await wb.xlsx.writeBuffer();
  return new Response(new Uint8Array(buf), {
    headers: { "content-type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "content-disposition": `attachment; filename="${name}.xlsx"`, "cache-control": "private, no-store" },
  });
}
