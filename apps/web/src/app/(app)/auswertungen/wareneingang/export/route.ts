import ExcelJS from "exceljs";
import { getCurrentUser } from "@/lib/auth";
import { hasPermission } from "@/lib/rbac";
import { ladeWareneingang } from "@/lib/wareneingang";

function isoDaysAgo(n: number): string { const d = new Date(); d.setDate(d.getDate() - n); return d.toISOString().slice(0, 10); }

/** Excel: Wareneingang je Tag, je Abholstelle, einzelne Abholungen. */
export async function GET(req: Request) {
  const user = await getCurrentUser();
  if (!user || !(hasPermission(user.role, "report:view") || hasPermission(user.role, "tour:manage"))) return new Response("Forbidden", { status: 403 });
  const url = new URL(req.url);
  const ok = (v: string | null) => !!v && /^\d{4}-\d{2}-\d{2}$/.test(v);
  const von = ok(url.searchParams.get("von")) ? url.searchParams.get("von")! : isoDaysAgo(29);
  const bis = ok(url.searchParams.get("bis")) ? url.searchParams.get("bis")! : isoDaysAgo(0);
  const w = await ladeWareneingang(von, bis);
  const wb = new ExcelJS.Workbook(); wb.creator = "Tafelwerk"; wb.created = new Date();
  const t = wb.addWorksheet("Je Tag");
  t.columns = [{ header: "Tag", key: "tag", width: 12 }, { header: "Kisten", key: "kisten", width: 10 }, { header: "kg (geschätzt)", key: "kg", width: 14 }, { header: "Abholungen", key: "stopps", width: 12 }, { header: "Touren", key: "touren", width: 10 }];
  w.tage.forEach((z) => t.addRow({ ...z, kg: Math.round(z.kg) }));
  const tot = t.addRow({ tag: "Total", kisten: w.summe.kisten, kg: w.summe.kg, stopps: w.summe.stopps, touren: w.summe.touren }); tot.font = { bold: true };
  const s = wb.addWorksheet("Je Abholstelle");
  s.columns = [{ header: "Abholstelle", key: "name", width: 34 }, { header: "Art", key: "art", width: 14 }, { header: "Kisten", key: "kisten", width: 10 }, { header: "kg (geschätzt)", key: "kg", width: 14 }, { header: "Abholungen", key: "stopps", width: 12 }, { header: "Letzte", key: "letzte", width: 12 }];
  w.stellen.forEach((z) => s.addRow({ ...z, kg: Math.round(z.kg) }));
  const e = wb.addWorksheet("Abholungen");
  e.columns = [{ header: "Datum", key: "datum", width: 12 }, { header: "Tour", key: "tour", width: 22 }, { header: "Fahrer:in", key: "fahrer", width: 22 }, { header: "Fahrzeug", key: "fahrzeug", width: 12 }, { header: "Abholstelle", key: "stelle", width: 34 }, { header: "Kisten", key: "kisten", width: 10 }, { header: "kg", key: "kg", width: 10 }, { header: "Bemerkung", key: "bemerkung", width: 30 }];
  w.touren.forEach((z) => e.addRow({ datum: z.datum, tour: z.tour, fahrer: z.fahrer ?? "", fahrzeug: z.fahrzeug ?? "", stelle: z.stelle, kisten: z.kisten ?? "", kg: z.kg != null ? Math.round(z.kg) : "", bemerkung: z.bemerkung ?? "" }));
  [t, s, e].forEach((ws) => { ws.getRow(1).font = { bold: true }; });
  const buf = await wb.xlsx.writeBuffer();
  return new Response(buf, { headers: { "content-type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "content-disposition": `attachment; filename="Wareneingang-${von}_bis_${bis}.xlsx"` } });
}
