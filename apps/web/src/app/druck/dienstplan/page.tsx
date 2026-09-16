import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { hasPermission } from "@/lib/rbac";
import { PrintButton } from "@/components/PrintButton";
import { ladeWoche } from "@/lib/dienstplan-daten";
import { TAETIGKEIT_LABEL, wochenStart, wochenTage } from "@/lib/dienstplan";
import { ABW_ART_LABEL } from "@/lib/abwesenheit";
import { fmtMin } from "@/lib/zeit";
import { fmtDate } from "@/lib/format";
import { heuteIso, WOCHENTAGE_KURZ } from "@/lib/touren";

/** Wochendienstplan zum Aushängen – /druck/dienstplan?woche=YYYY-MM-DD (Montag). */
export default async function DienstplanDruck({ searchParams }: { searchParams: Promise<{ woche?: string }> }) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!hasPermission(user.role, "staff:manage")) redirect("/dashboard");
  const sp = await searchParams;
  const woche = /^\d{4}-\d{2}-\d{2}$/.test(sp.woche ?? "") ? wochenStart(sp.woche!) : wochenStart(heuteIso());
  const w = await ladeWoche(woche);
  const tage = wochenTage(woche);
  const ort = (id: number | null) => w.standorte.find((s) => s.id === id)?.name ?? "";
  const mitDienst = w.personen.filter((p) => w.dienste.some((d) => d.staffId === p.id && d.datum >= woche) || w.abwesenheiten.some((a) => a.staffId === p.id && a.status === "GENEHMIGT"));

  return (
    <div style={{ background: "#fff", color: "#111", minHeight: "100vh" }}>
      <div className="no-print" style={{ padding: "12px 20px", borderBottom: "1px solid #ddd", display: "flex", gap: 12, alignItems: "center" }}>
        <Link href={`/dienstplan?woche=${woche}`} className="btn ghost">← Dienstplan</Link>
        {w.status !== "VEROEFFENTLICHT" ? <span style={{ fontSize: ".8rem", color: "#a00" }}>Entwurf – noch nicht veröffentlicht.</span> : null}
        <span style={{ marginLeft: "auto" }}><PrintButton /></span>
      </div>
      <div className="dp">
        <h1>Dienstplan {fmtDate(woche)} – {fmtDate(w.wocheEnde)}</h1>
        <div className="meta">{w.status === "VEROEFFENTLICHT" ? "veröffentlicht" : "ENTWURF"} · Stand {new Date().toLocaleDateString("de-AT")}{w.status !== "VEROEFFENTLICHT" ? " · Änderungen vorbehalten" : ""}</div>
        <table>
          <thead><tr><th>Person</th>{tage.map((t) => { const wt = new Date(t + "T00:00:00Z").getUTCDay() || 7; const f = w.feiertage.get(t); return <th key={t} className={wt >= 6 ? "we" : ""}>{WOCHENTAGE_KURZ[wt]} {t.slice(8)}.{t.slice(5, 7)}.{f ? <div className="f">{f}</div> : null}</th>; })}<th className="z">Std.</th></tr></thead>
          <tbody>{mitDienst.map((p) => (
            <tr key={p.id}>
              <td><b>{p.lastName} {p.firstName}</b></td>
              {tage.map((t) => { const ds = w.dienste.filter((d) => d.staffId === p.id && d.datum === t); const abw = w.abwesenheiten.filter((a) => a.staffId === p.id && a.status === "GENEHMIGT" && a.von <= t && a.bis >= t); return (
                <td key={t}>
                  {abw.map((a, i) => <div key={i} className="abw">{ABW_ART_LABEL[a.art]}{a.halbtag ? " ½" : ""}</div>)}
                  {ds.map((d) => <div key={d.id}><span className="mono">{d.von.slice(0, 5)}–{d.bis.slice(0, 5)}</span><div className="k">{TAETIGKEIT_LABEL[d.taetigkeit]}{d.locationId ? ` · ${ort(d.locationId)}` : ""}{d.notiz ? ` · ${d.notiz}` : ""}</div></div>)}
                </td>); })}
              <td className="z mono">{w.summen.get(p.id) ? fmtMin(w.summen.get(p.id)!) : ""}</td>
            </tr>
          ))}</tbody>
        </table>
        {w.standorte.some((s) => Object.keys(s.oeffnung).length) ? (
          <>
            <h2>Besetzung Ausgabestellen</h2>
            <table>
              <thead><tr><th>Standort</th>{tage.map((t) => <th key={t}>{WOCHENTAGE_KURZ[new Date(t + "T00:00:00Z").getUTCDay() || 7]}</th>)}</tr></thead>
              <tbody>{w.standorte.filter((s) => Object.keys(s.oeffnung).length || w.dienste.some((d) => d.locationId === s.id)).map((s) => (
                <tr key={s.id}><td><b>{s.name}</b></td>{tage.map((t) => { const wt = new Date(t + "T00:00:00Z").getUTCDay() || 7; const ds = w.dienste.filter((d) => d.locationId === s.id && d.datum === t); return (
                  <td key={t}>{(s.oeffnung[wt] ?? []).map((x) => <div key={x.from} className="k">{x.from}–{x.to}</div>)}{ds.map((d) => <div key={d.id}>{w.personen.find((p) => p.id === d.staffId)?.firstName} <span className="mono k">{d.von.slice(0, 5)}–{d.bis.slice(0, 5)}</span></div>)}</td>); })}</tr>
              ))}</tbody>
            </table>
          </>
        ) : null}
      </div>
      <style>{`
        @page { size: A4 landscape; margin: 12mm; }
        .dp { max-width: 270mm; margin: 0 auto; padding: 16px 10px; font-size: 10.5px; }
        .dp h1 { font-size: 17px; margin: 0 0 2px; }
        .dp h2 { font-size: 13px; margin: 16px 0 4px; }
        .dp .meta { color: #555; margin-bottom: 10px; }
        .dp table { width: 100%; border-collapse: collapse; }
        .dp th, .dp td { padding: 4px 5px; border: 1px solid #ccc; text-align: left; vertical-align: top; }
        .dp th { background: #f2f2f2; font-size: 10px; }
        .dp th.we { color: #777; }
        .dp .f { color: #a00; font-weight: 400; font-size: 9px; }
        .dp .k { font-size: 9px; color: #555; }
        .dp .abw { font-style: italic; color: #a60; }
        .dp .z { text-align: right; }
      `}</style>
    </div>
  );
}
