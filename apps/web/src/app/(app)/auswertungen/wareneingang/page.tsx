import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { hasPermission } from "@/lib/rbac";
import { ladeWareneingang } from "@/lib/wareneingang";
import { fmtDate, fmtDateTime } from "@/lib/format";

export const dynamic = "force-dynamic";

function isoDaysAgo(n: number): string { const d = new Date(); d.setDate(d.getDate() - n); return d.toISOString().slice(0, 10); }
const WT = ["So", "Mo", "Di", "Mi", "Do", "Fr", "Sa"];

/** Wareneingang: Kisten und kg je Tag / Abholstelle / Tour aus den Eingaben der Fahrer:innen. */
export default async function WareneingangSeite({ searchParams }: { searchParams: Promise<{ von?: string; bis?: string; tag?: string }> }) {
  const user = await getCurrentUser();
  if (!user || !(hasPermission(user.role, "report:view") || hasPermission(user.role, "tour:manage"))) redirect("/dashboard");
  const sp = await searchParams;
  const ok = (v?: string) => !!v && /^\d{4}-\d{2}-\d{2}$/.test(v);
  const von = ok(sp.von) ? sp.von! : isoDaysAgo(29);
  const bis = ok(sp.bis) ? sp.bis! : isoDaysAgo(0);
  const tag = ok(sp.tag) ? sp.tag : undefined;
  const w = await ladeWareneingang(von, bis, tag);
  const maxKisten = Math.max(1, ...w.tage.map((t) => t.kisten));
  const q = `von=${von}&bis=${bis}`;

  return (
    <div>
      <div className="page-h">
        <div><h1>Wareneingang</h1><div className="sub">Kisten und geschätzte kg aus den Abholungen · {fmtDate(von)} – {fmtDate(bis)} · <Link href="/auswertungen">← Alle Auswertungen</Link></div></div>
        <a href={`/auswertungen/wareneingang/export?${q}`} className="btn primary">⬇ Excel-Export</a>
      </div>

      <form className="panel mb-4" method="get">
        <div className="p-4 flex gap-3 items-end flex-wrap">
          <div className="field"><label className="lbl">Von</label><input type="date" name="von" defaultValue={von} className="inp mono" /></div>
          <div className="field"><label className="lbl">Bis</label><input type="date" name="bis" defaultValue={bis} className="inp mono" /></div>
          <button type="submit" className="btn">Anzeigen</button>
          {tag ? <Link href={`/auswertungen/wareneingang?${q}`} className="btn ghost">Tag-Filter aufheben ({fmtDate(tag)})</Link> : null}
          <span className="text-xs text-muted">Erfasst wird beim Abhaken eines Abhol-Stopps am Fahrzeug-Tablet oder Fahrer-Handy (Kisten, kg geschätzt).</span>
        </div>
      </form>

      <div className="grid gap-4 grid-cols-[repeat(auto-fit,minmax(170px,1fr))] mb-4">
        <div className="card stat"><div className="k">Kisten</div><div className="v">{w.summe.kisten}</div><div className="d">{w.summe.stopps} Abholungen</div></div>
        <div className="card stat"><div className="k">kg (geschätzt)</div><div className="v">{w.summe.kg.toLocaleString("de-AT")}</div></div>
        <div className="card stat"><div className="k">Touren</div><div className="v">{w.summe.touren}</div><div className="d">an {w.summe.tage} Tagen</div></div>
        <div className="card stat"><div className="k">Ø Kisten je Tag</div><div className="v">{w.summe.tage ? Math.round(w.summe.kisten / w.summe.tage) : 0}</div></div>
      </div>

      <div className="grid gap-4 lg:grid-cols-2 items-start mb-4">
        <div className="panel">
          <div className="panel-h"><h3>Je Tag</h3></div>
          {w.tage.length === 0 ? <div className="empty">Keine Abholungen im Zeitraum.</div> : (
            <div className="twrap"><table className="data">
              <thead><tr><th>Tag</th><th className="text-right">Kisten</th><th className="text-right">kg</th><th className="text-right">Abholungen</th><th className="text-right">Touren</th><th></th></tr></thead>
              <tbody>{w.tage.map((t) => (
                <tr key={t.tag} style={tag === t.tag ? { background: "var(--surface-2)" } : undefined}>
                  <td><Link href={`/auswertungen/wareneingang?${q}&tag=${t.tag}`}>{WT[new Date(t.tag + "T00:00:00Z").getUTCDay()]} {fmtDate(t.tag)}</Link></td>
                  <td className="text-right mono"><b>{t.kisten}</b><div style={{ height: 4, background: "var(--accent)", width: `${Math.round((t.kisten / maxKisten) * 100)}%`, opacity: .5 }} /></td>
                  <td className="text-right mono">{Math.round(t.kg)}</td><td className="text-right mono">{t.stopps}</td><td className="text-right mono">{t.touren}</td>
                  <td><Link href={`/touren?datum=${t.tag}`} className="btn ghost sm">Disposition</Link></td>
                </tr>
              ))}</tbody>
            </table></div>
          )}
        </div>
        <div className="panel">
          <div className="panel-h"><h3>Je Abholstelle</h3></div>
          {w.stellen.length === 0 ? <div className="empty">Keine Daten.</div> : (
            <div className="twrap"><table className="data">
              <thead><tr><th>Abholstelle</th><th>Art</th><th className="text-right">Kisten</th><th className="text-right">kg</th><th className="text-right">Abholungen</th><th>Letzte</th></tr></thead>
              <tbody>{w.stellen.map((s) => (
                <tr key={s.abholstelleId}><td><Link href={`/touren/abholstellen/${s.abholstelleId}`}>{s.name}</Link></td><td className="text-xs text-muted">{s.art ?? "—"}</td><td className="text-right mono"><b>{s.kisten}</b></td><td className="text-right mono">{Math.round(s.kg)}</td><td className="text-right mono">{s.stopps}</td><td className="text-xs">{s.letzte ? fmtDate(s.letzte) : "—"}</td></tr>
              ))}</tbody>
            </table></div>
          )}
        </div>
      </div>

      <div className="panel">
        <div className="panel-h"><h3>Einzelne Abholungen{tag ? ` am ${fmtDate(tag)}` : ""}</h3><span className="pill muted">{w.touren.length}</span></div>
        {w.touren.length === 0 ? <div className="empty">Keine Abholungen.</div> : (
          <div className="twrap"><table className="data">
            <thead><tr><th>Datum</th><th>Tour</th><th>Fahrer:in</th><th>Fahrzeug</th><th>Abholstelle</th><th className="text-right">Kisten</th><th className="text-right">kg</th><th>Erledigt</th><th>Bemerkung</th></tr></thead>
            <tbody>{w.touren.map((t, i) => (
              <tr key={`${t.tourId}-${i}`}><td className="mono text-xs">{fmtDate(t.datum)}</td><td><Link href={`/touren/${t.tourId}`}>{t.tour}</Link></td><td>{t.fahrer ?? "—"}</td><td className="mono text-xs">{t.fahrzeug ?? "—"}</td><td>{t.stelle}</td>
                <td className="text-right mono">{t.kisten ?? "—"}</td><td className="text-right mono">{t.kg != null ? Math.round(t.kg) : "—"}</td><td className="text-xs">{t.erledigtAt ? fmtDateTime(t.erledigtAt) : "—"}</td><td className="text-xs text-muted">{t.bemerkung ?? ""}</td></tr>
            ))}</tbody>
          </table></div>
        )}
      </div>
    </div>
  );
}
