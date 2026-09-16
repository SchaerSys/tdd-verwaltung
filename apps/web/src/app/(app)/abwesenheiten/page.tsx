import Link from "next/link";
import { redirect } from "next/navigation";
import { asc, eq } from "drizzle-orm";
import { staff } from "@tdd/db";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { hasPermission } from "@/lib/rbac";
import { ladeKonten, ladeZeitraum } from "@/lib/abwesenheit-daten";
import { ABW_ART_LABEL, ABW_KURZ } from "@/lib/abwesenheit";
import { feiertagsKarte } from "@/lib/feiertage";
import { heuteIso } from "@/lib/touren";
import { fmtDate } from "@/lib/format";
import { abwesenheitBestaetigung, abwesenheitEntscheiden, abwesenheitErfassen, abwesenheitLoeschen } from "./actions";

export const dynamic = "force-dynamic";
const MONATE = ["Jänner", "Februar", "März", "April", "Mai", "Juni", "Juli", "August", "September", "Oktober", "November", "Dezember"];
const FARBE: Record<string, string> = { URLAUB: "#0f766e", KRANK: "#b91c1c", ZEITAUSGLEICH: "#1d4ed8", PFLEGE: "#7c3aed", SONDERURLAUB: "#0891b2", UNBEZAHLT: "#6b7280", SONSTIG: "#9a3412" };

/**
 * Abwesenheiten: offene Antraege, Monatskalender (wer fehlt wann), Erfassen, Konten-Kurzstand.
 * Urlaub nach UrlG, Krankenstand nach EFZG, Pflegefreistellung § 16 UrlG.
 */
export default async function AbwesenheitenSeite({ searchParams }: { searchParams: Promise<{ monat?: string }> }) {
  const user = await getCurrentUser();
  if (!user || !hasPermission(user.role, "staff:manage")) redirect("/dashboard");
  const sp = await searchParams;
  const heute = heuteIso();
  const m = /^(\d{4})-(\d{2})$/.exec(sp.monat ?? "");
  const jahr = m ? Number(m[1]) : Number(heute.slice(0, 4));
  const monat = m ? Number(m[2]) : Number(heute.slice(5, 7));
  const tageImMonat = new Date(Date.UTC(jahr, monat, 0)).getUTCDate();
  const von = `${jahr}-${String(monat).padStart(2, "0")}-01`;
  const bis = `${jahr}-${String(monat).padStart(2, "0")}-${String(tageImMonat).padStart(2, "0")}`;
  const monatParam = von.slice(0, 7);
  const vor = monat === 1 ? `${jahr - 1}-12` : `${jahr}-${String(monat - 1).padStart(2, "0")}`;
  const nach = monat === 12 ? `${jahr + 1}-01` : `${jahr}-${String(monat + 1).padStart(2, "0")}`;

  const [leute, eintraege, konten] = await Promise.all([
    db().select({ id: staff.id, first: staff.firstName, last: staff.lastName }).from(staff).where(eq(staff.isActive, true)).orderBy(asc(staff.lastName), asc(staff.firstName)),
    ladeZeitraum(von, bis), ladeKonten(heute),
  ]);
  const feier = feiertagsKarte([jahr]);
  const offen = eintraege.filter((e) => e.a.status === "BEANTRAGT");
  const krankOhneBestaetigung = eintraege.filter((e) => e.a.art === "KRANK" && !e.a.bestaetigung && e.a.status === "GENEHMIGT" && (new Date(e.a.bis).getTime() - new Date(e.a.von).getTime()) / 864e5 >= 2);
  const heuteAbwesend = eintraege.filter((e) => e.a.status === "GENEHMIGT" && e.a.von <= heute && e.a.bis >= heute);
  const tage = Array.from({ length: tageImMonat }, (_, i) => `${von.slice(0, 8)}${String(i + 1).padStart(2, "0")}`);
  const wt = (d: string) => { const t = new Date(d + "T00:00:00Z").getUTCDay(); return t === 0 ? 7 : t; };

  return (
    <div>
      <div className="page-h">
        <div><h1>Abwesenheiten</h1><div className="sub">{MONATE[monat - 1]} {jahr} · heute {heuteAbwesend.length} abwesend · {offen.length} offene Anträge</div></div>
        <div className="flex gap-2 items-center flex-wrap">
          <Link href={`/abwesenheiten?monat=${vor}`} className="btn ghost">←</Link>
          <form method="get" className="flex gap-1"><input type="month" name="monat" defaultValue={monatParam} className="inp mono" /><button className="btn" type="submit">Anzeigen</button></form>
          <Link href={`/abwesenheiten?monat=${nach}`} className="btn ghost">→</Link>
          <Link href="/abwesenheiten/konto" className="btn ghost">Urlaubskonten</Link>
        </div>
      </div>

      {offen.length > 0 ? (
        <div className="panel mb-4" style={{ borderColor: "var(--warn)" }}>
          <div className="panel-h"><h3>Anträge zur Genehmigung</h3><span className="pill warn">{offen.length}</span></div>
          <div className="twrap"><table className="data">
            <thead><tr><th>Person</th><th>Art</th><th>Von</th><th>Bis</th><th>Notiz</th><th>Urlaub Rest</th><th></th></tr></thead>
            <tbody>{offen.map((e) => {
              const k = konten.find((x) => x.person.id === e.staffId);
              return (
                <tr key={e.a.id}>
                  <td><b>{e.last} {e.first}</b></td><td><span className="pill muted">{ABW_ART_LABEL[e.a.art]}</span></td>
                  <td className="mono">{fmtDate(e.a.von)}</td><td className="mono">{fmtDate(e.a.bis)}{e.a.halbtag ? " (½)" : ""}</td><td className="text-xs">{e.a.notiz ?? ""}</td>
                  <td className="mono">{k?.urlaub ? `${k.urlaub.rest} Tage` : "—"}</td>
                  <td><div className="flex gap-1 justify-end">
                    <form action={abwesenheitEntscheiden}><input type="hidden" name="id" value={e.a.id} /><input type="hidden" name="status" value="GENEHMIGT" /><button className="btn primary sm" type="submit">Genehmigen</button></form>
                    <form action={abwesenheitEntscheiden}><input type="hidden" name="id" value={e.a.id} /><input type="hidden" name="status" value="ABGELEHNT" /><button className="btn ghost sm" type="submit">Ablehnen</button></form>
                  </div></td>
                </tr>
              );
            })}</tbody>
          </table></div>
        </div>
      ) : null}

      {krankOhneBestaetigung.length > 0 ? (
        <div className="panel mb-4" style={{ borderColor: "var(--warn)" }}>
          <div className="panel-h"><h3>Krankenstand ohne Bestätigung</h3><span className="pill warn">{krankOhneBestaetigung.length}</span><span className="text-xs text-muted" style={{ marginLeft: 8 }}>Ab dem 3. Tag Krankenbestätigung anfordern (§ 4 EFZG – der Verein darf sie verlangen).</span></div>
          <ul className="p-3 flex flex-col gap-1 text-[.8125rem]">{krankOhneBestaetigung.map((e) => (
            <li key={e.a.id} className="flex gap-2 items-center"><span>{e.last} {e.first}</span><span className="mono text-muted">{fmtDate(e.a.von)} – {fmtDate(e.a.bis)}</span>
              <form action={abwesenheitBestaetigung} className="ml-auto"><input type="hidden" name="id" value={e.a.id} /><button className="btn ghost sm" type="submit">✓ Bestätigung liegt vor</button></form></li>
          ))}</ul>
        </div>
      ) : null}

      <div className="panel mb-4">
        <div className="panel-h"><h3>Kalender {MONATE[monat - 1]} {jahr}</h3>
          <span className="text-xs text-muted" style={{ marginLeft: 8 }}>{Object.entries(ABW_ART_LABEL).map(([k, v]) => <span key={k} className="mr-2"><span style={{ display: "inline-block", width: 10, height: 10, background: FARBE[k], borderRadius: 2, marginRight: 3 }} />{ABW_KURZ[k]} = {v}</span>)}</span></div>
        <div className="twrap"><table className="data" style={{ fontSize: ".72rem" }}>
          <thead><tr><th style={{ minWidth: 140 }}>Person</th>{tage.map((d) => <th key={d} className="text-center" style={{ padding: "4px 2px", background: feier.has(d) ? "var(--warn-bg)" : wt(d) >= 6 ? "var(--surface-2)" : undefined }} title={feier.get(d)}>{d.slice(8)}</th>)}</tr></thead>
          <tbody>{leute.map((p) => (
            <tr key={p.id}>
              <td><Link href={`/abwesenheiten/konto?staff=${p.id}`} className="hover:underline">{p.last} {p.first}</Link></td>
              {tage.map((d) => {
                const e = eintraege.find((x) => x.staffId === p.id && x.a.von <= d && x.a.bis >= d && x.a.status !== "ABGELEHNT");
                return <td key={d} className="text-center mono" style={{ padding: "4px 2px", background: e ? FARBE[e.a.art] : wt(d) >= 6 || feier.has(d) ? "var(--surface-2)" : undefined, color: e ? "#fff" : undefined, opacity: e?.a.status === "BEANTRAGT" ? .45 : 1 }} title={e ? `${ABW_ART_LABEL[e.a.art]} ${fmtDate(e.a.von)}–${fmtDate(e.a.bis)}${e.a.status === "BEANTRAGT" ? " (beantragt)" : ""}` : undefined}>{e ? ABW_KURZ[e.a.art] : ""}</td>;
              })}
            </tr>
          ))}</tbody>
        </table></div>
      </div>

      <div className="grid gap-4 lg:grid-cols-2 items-start">
        <div className="panel">
          <div className="panel-h"><h3>Abwesenheit erfassen</h3></div>
          <form action={abwesenheitErfassen} className="p-4 grid gap-3 sm:grid-cols-2">
            <div className="field"><label className="lbl">Person</label><select name="staffId" className="inp" required><option value="">—</option>{leute.map((p) => <option key={p.id} value={p.id}>{p.last} {p.first}</option>)}</select></div>
            <div className="field"><label className="lbl">Art</label><select name="art" className="inp">{Object.entries(ABW_ART_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></div>
            <div className="field"><label className="lbl">Von</label><input name="von" type="date" className="inp mono" required defaultValue={heute} /></div>
            <div className="field"><label className="lbl">Bis</label><input name="bis" type="date" className="inp mono" defaultValue={heute} /></div>
            <div className="field sm:col-span-2"><label className="lbl">Notiz</label><input name="notiz" className="inp" placeholder="optional" /></div>
            <label className="flex items-center gap-2 text-[.8125rem]"><input type="checkbox" name="halbtag" /> halber Tag (nur bei einem Tag)</label>
            <label className="flex items-center gap-2 text-[.8125rem]"><input type="checkbox" name="bestaetigung" /> Krankenbestätigung liegt vor</label>
            <label className="flex items-center gap-2 text-[.8125rem]"><input type="checkbox" name="status" value="BEANTRAGT" /> nur als Antrag eintragen (noch nicht genehmigt)</label>
            <div className="sm:col-span-2"><button className="btn primary" type="submit">Speichern</button></div>
          </form>
        </div>
        <div className="panel">
          <div className="panel-h"><h3>Einträge {MONATE[monat - 1]}</h3><span className="pill muted">{eintraege.length}</span></div>
          <div className="twrap" style={{ maxHeight: 420, overflow: "auto" }}><table className="data">
            <thead><tr><th>Person</th><th>Art</th><th>Zeitraum</th><th>Stand</th><th></th></tr></thead>
            <tbody>{eintraege.map((e) => (
              <tr key={e.a.id} style={e.a.status === "ABGELEHNT" ? { opacity: .5 } : undefined}>
                <td>{e.last} {e.first}</td><td><span className="pill muted">{ABW_ART_LABEL[e.a.art]}</span>{e.a.art === "KRANK" && e.a.bestaetigung ? " ✓" : ""}</td>
                <td className="mono text-xs">{fmtDate(e.a.von)} – {fmtDate(e.a.bis)}{e.a.halbtag ? " ½" : ""}</td>
                <td className="text-xs">{e.a.status === "GENEHMIGT" ? "genehmigt" : e.a.status === "BEANTRAGT" ? "beantragt" : "abgelehnt"}</td>
                <td><form action={abwesenheitLoeschen}><input type="hidden" name="id" value={e.a.id} /><button className="btn ghost sm" type="submit">✕</button></form></td>
              </tr>
            ))}
            {eintraege.length === 0 ? <tr><td colSpan={5}><div className="empty">Keine Einträge in diesem Monat.</div></td></tr> : null}
            </tbody>
          </table></div>
        </div>
      </div>
    </div>
  );
}
