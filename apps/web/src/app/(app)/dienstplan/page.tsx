import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { hasPermission } from "@/lib/rbac";
import { ladeWoche } from "@/lib/dienstplan-daten";
import { plusTage, TAETIGKEIT_KURZ, TAETIGKEIT_LABEL, wochenStart, wochenTage, type Dienst } from "@/lib/dienstplan";
import { ABW_KURZ } from "@/lib/abwesenheit";
import { fmtMin } from "@/lib/zeit";
import { fmtDate, fmtDateTime } from "@/lib/format";
import { heuteIso, WOCHENTAGE_KURZ } from "@/lib/touren";
import { STAFF_TYPE_LABEL } from "../personal/types";
import { dienstSpeichern, dienstLoeschen, wocheFuellen, wocheKopieren, wocheLeeren, wocheStatus } from "./actions";

export const dynamic = "force-dynamic";

/**
 * Wochendienstplan (P5): Raster Person × Tag, Dienste anlegen/ändern/löschen, Woche aus
 * Standard-Diensten füllen oder Vorwoche kopieren, AZG-/Abwesenheits-/Besetzungsprüfung,
 * Veröffentlichen (dann in „Mein Bereich“ sichtbar). Touren der Disposition werden je Tag
 * eingeblendet, damit Fahrdienst und Ausgabe zusammenpassen.
 */
export default async function DienstplanSeite({ searchParams }: { searchParams: Promise<{ woche?: string; neu?: string; bearbeiten?: string }> }) {
  const user = await getCurrentUser();
  if (!user || !hasPermission(user.role, "staff:manage")) redirect("/dashboard");
  const sp = await searchParams;
  const heute = heuteIso();
  const woche = /^\d{4}-\d{2}-\d{2}$/.test(sp.woche ?? "") ? wochenStart(sp.woche!) : wochenStart(heute);
  const w = await ladeWoche(woche);
  const tage = wochenTage(woche);
  const admin = hasPermission(user.role, "admin:manage");
  const ortName = (id: number | null) => w.standorte.find((s) => s.id === id)?.name ?? null;
  const ortKurz = (id: number | null) => { const n = ortName(id); return n ? n.split(/\s+/)[0]!.slice(0, 8) : ""; };

  // Formular-Vorbelegung: neu=<staffId>_<datum> oder bearbeiten=<dienstId>
  const bearbeiten = sp.bearbeiten ? w.dienste.find((d) => d.id === sp.bearbeiten) ?? null : null;
  const neu = sp.neu?.match(/^([0-9a-f-]{36})_(\d{4}-\d{2}-\d{2})$/);
  const vorPerson = bearbeiten?.staffId ?? neu?.[1] ?? "";
  const vorTag = bearbeiten?.datum ?? neu?.[2] ?? tage[0]!;
  const vorStandard = vorPerson && !bearbeiten ? w.personen.find((p) => p.id === vorPerson)?.standard?.[String(new Date(vorTag + "T00:00:00Z").getUTCDay() || 7)] : undefined;
  const formOffen = !!(bearbeiten || neu);

  const fehler = w.hinweise.filter((h) => h.schwere === "FEHLER").length;
  const warn = w.hinweise.filter((h) => h.schwere === "WARNUNG").length;
  const kw = (() => { const d = new Date(woche + "T00:00:00Z"); d.setUTCDate(d.getUTCDate() + 3); const j = new Date(Date.UTC(d.getUTCFullYear(), 0, 1)); return Math.ceil(((d.getTime() - j.getTime()) / 864e5 + 1) / 7); })();

  const Zelle = ({ p, datum }: { p: (typeof w.personen)[number]; datum: string }) => {
    const ds = w.dienste.filter((d) => d.staffId === p.id && d.datum === datum);
    const abw = w.abwesenheiten.filter((a) => a.staffId === p.id && a.von <= datum && a.bis >= datum);
    const tour = w.touren.filter((t) => t.datum === datum && (t.fahrerId === p.id || t.beifahrerId === p.id));
    const probleme = w.hinweise.filter((h) => h.staffId === p.id && h.datum === datum && h.schwere !== "INFO");
    return (
      <td className="zelle" style={{ background: probleme.some((h) => h.schwere === "FEHLER") ? "var(--bad-bg)" : probleme.length ? "var(--warn-bg)" : undefined, verticalAlign: "top" }} title={probleme.map((h) => h.text).join("\n") || undefined}>
        {abw.map((a, i) => <span key={i} className={`pill ${a.status === "BEANTRAGT" ? "muted" : a.art === "KRANK" ? "bad" : "warn"}`} style={{ fontSize: ".65rem" }}>{ABW_KURZ[a.art]}{a.halbtag ? "½" : ""}{a.status === "BEANTRAGT" ? "?" : ""}</span>)}
        {ds.map((d: Dienst) => (
          <div key={d.id} className="dienst">
            <Link href={`/dienstplan?woche=${woche}&bearbeiten=${d.id}`} className="mono" title={`${TAETIGKEIT_LABEL[d.taetigkeit]}${ortName(d.locationId) ? ` · ${ortName(d.locationId)}` : ""}${d.pauseMin ? ` · Pause ${d.pauseMin} min` : ""}${d.notiz ? ` · ${d.notiz}` : ""}`}>
              {d.von.slice(0, 5)}–{d.bis.slice(0, 5)}
            </Link>
            <span className="text-muted" style={{ fontSize: ".65rem" }}> {TAETIGKEIT_KURZ[d.taetigkeit]}{d.locationId ? ` ${ortKurz(d.locationId)}` : ""}</span>
            {w.status === "ENTWURF" || admin ? <form action={dienstLoeschen} style={{ display: "inline" }}><input type="hidden" name="id" value={d.id} /><button type="submit" className="x" title="Dienst löschen">×</button></form> : null}
          </div>
        ))}
        {tour.map((t) => <div key={t.id} style={{ fontSize: ".65rem" }} title={`Tour ${t.name}${t.startzeit ? ` ab ${t.startzeit.slice(0, 5)}` : ""} (Disposition)`}>🚚 {t.startzeit ? t.startzeit.slice(0, 5) : ""} {t.name.slice(0, 14)}</div>)}
        <Link href={`/dienstplan?woche=${woche}&neu=${p.id}_${datum}`} className="plus" title="Dienst eintragen">+</Link>
      </td>
    );
  };

  return (
    <div>
      <div className="page-h">
        <div><h1>Dienstplan</h1><div className="sub">KW {kw} · {fmtDate(woche)} – {fmtDate(w.wocheEnde)} · {w.status === "VEROEFFENTLICHT" ? `veröffentlicht ${w.veroeffentlichtAt ? fmtDateTime(w.veroeffentlichtAt) : ""}` : "Entwurf – für Mitarbeitende noch nicht sichtbar"}</div></div>
        <div className="flex gap-2 items-center flex-wrap">
          <Link href={`/dienstplan?woche=${plusTage(woche, -7)}`} className="btn ghost">‹ Vorwoche</Link>
          <Link href="/dienstplan" className="btn ghost">Heute</Link>
          <Link href={`/dienstplan?woche=${plusTage(woche, 7)}`} className="btn ghost">Nächste ›</Link>
          <form method="get" className="flex gap-1"><input type="date" name="woche" defaultValue={woche} className="inp mono" /><button className="btn" type="submit">Gehe zu</button></form>
          <a href={`/druck/dienstplan?woche=${woche}`} target="_blank" className="btn ghost">🖨 Drucken</a>
          {!formOffen && w.personen[0] ? <Link href={`/dienstplan?woche=${woche}&neu=${w.personen[0].id}_${tage[0]}`} className="btn">＋ Dienst</Link> : null}
        </div>
      </div>

      <div className="flex gap-2 items-center flex-wrap mb-3">
        {w.status === "ENTWURF" ? (
          <>
            <form action={wocheFuellen}><input type="hidden" name="woche" value={woche} /><button className="btn" type="submit" title="Standard-Dienste (Personal-Datensatz) für alle, die diese Woche noch keinen Dienst haben">Aus Standard füllen</button></form>
            <form action={wocheKopieren}><input type="hidden" name="woche" value={woche} /><button className="btn" type="submit">Vorwoche übernehmen</button></form>
            <form action={wocheStatus}><input type="hidden" name="woche" value={woche} /><input type="hidden" name="status" value="VEROEFFENTLICHT" /><button className="btn primary" type="submit" disabled={fehler > 0} title={fehler ? "Fehler zuerst beheben" : "Für Mitarbeitende in „Mein Bereich“ sichtbar machen"}>Veröffentlichen</button></form>
            {admin && w.dienste.some((d) => d.datum >= woche) ? <form action={wocheLeeren}><input type="hidden" name="woche" value={woche} /><button className="btn ghost" type="submit">Woche leeren</button></form> : null}
          </>
        ) : (
          <form action={wocheStatus}><input type="hidden" name="woche" value={woche} /><input type="hidden" name="status" value="ENTWURF" /><button className="btn ghost" type="submit">Zurück auf Entwurf</button></form>
        )}
        <span className={`pill ${fehler ? "bad" : warn ? "warn" : "good"}`} style={{ marginLeft: "auto" }}>{fehler ? `${fehler} Fehler` : ""}{fehler && warn ? " · " : ""}{warn ? `${warn} Hinweise` : ""}{!fehler && !warn ? "Prüfung ok" : ""}</span>
      </div>

      {formOffen ? (
        <form action={dienstSpeichern} className="panel mb-3">
          {bearbeiten ? <input type="hidden" name="id" value={bearbeiten.id} /> : null}
          <div className="panel-h"><h3>{bearbeiten ? "Dienst ändern" : "Dienst eintragen"}</h3><Link href={`/dienstplan?woche=${woche}`} className="btn ghost sm" style={{ marginLeft: "auto" }}>Schließen</Link></div>
          <div className="p-4 grid gap-3 sm:grid-cols-3 lg:grid-cols-7">
            <div className="field"><label className="lbl">Person</label><select name="staffId" className="inp" defaultValue={vorPerson} required>{w.personen.map((p) => <option key={p.id} value={p.id}>{p.lastName} {p.firstName}</option>)}</select></div>
            <div className="field"><label className="lbl">Tag</label><select name="datum" className="inp mono" defaultValue={vorTag}>{tage.map((t) => <option key={t} value={t}>{WOCHENTAGE_KURZ[new Date(t + "T00:00:00Z").getUTCDay() || 7]} {fmtDate(t)}</option>)}</select></div>
            <div className="field"><label className="lbl">Von</label><input name="von" type="time" className="inp mono" required defaultValue={bearbeiten?.von.slice(0, 5) ?? vorStandard?.von ?? "08:00"} /></div>
            <div className="field"><label className="lbl">Bis</label><input name="bis" type="time" className="inp mono" required defaultValue={bearbeiten?.bis.slice(0, 5) ?? vorStandard?.bis ?? "16:30"} /></div>
            <div className="field"><label className="lbl">Pause (min)</label><input name="pauseMin" className="inp mono" inputMode="numeric" defaultValue={bearbeiten?.pauseMin ?? vorStandard?.pause ?? 30} /></div>
            <div className="field"><label className="lbl">Standort</label><select name="locationId" className="inp" defaultValue={bearbeiten?.locationId ?? vorStandard?.location ?? w.personen.find((p) => p.id === vorPerson)?.locationId ?? ""}><option value="">—</option>{w.standorte.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select></div>
            <div className="field"><label className="lbl">Tätigkeit</label><select name="taetigkeit" className="inp" defaultValue={bearbeiten?.taetigkeit ?? vorStandard?.taetigkeit ?? "AUSGABE"}>{Object.entries(TAETIGKEIT_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></div>
            <div className="field sm:col-span-3 lg:col-span-5"><label className="lbl">Notiz</label><input name="notiz" className="inp" defaultValue={bearbeiten?.notiz ?? ""} placeholder="optional" /></div>
            <div className="lg:col-span-2 flex items-end"><button className="btn primary" type="submit">{bearbeiten ? "Speichern" : "Eintragen"}</button></div>
          </div>
        </form>
      ) : null}

      <div className="panel mb-3">
        <div className="twrap"><table className="data plan">
          <thead><tr><th>Person</th>{tage.map((t) => { const f = w.feiertage.get(t); const wt = new Date(t + "T00:00:00Z").getUTCDay() || 7; return <th key={t} style={{ color: f ? "var(--bad)" : wt >= 6 ? "var(--muted)" : undefined, background: t === heute ? "var(--warn-bg)" : undefined }} title={f}>{WOCHENTAGE_KURZ[wt]} {t.slice(8)}.{f ? " 🎉" : ""}</th>; })}<th className="text-right">Σ / Soll</th></tr></thead>
          <tbody>{w.personen.map((p) => {
            const sum = w.summen.get(p.id) ?? 0;
            const soll = Object.values(p.soll).reduce((a, b) => a + b, 0);
            return (
              <tr key={p.id}>
                <td><Link href={`/personal/${p.id}`} className="font-semibold hover:underline">{p.lastName} {p.firstName}</Link><div className="text-[.65rem] text-muted">{STAFF_TYPE_LABEL[p.staffType] ?? p.staffType}{!p.standard ? " · kein Standard" : ""}</div></td>
                {tage.map((t) => <Zelle key={t} p={p} datum={t} />)}
                <td className="mono text-right" style={{ color: soll && Math.abs(sum - soll) >= 60 ? "var(--warn)" : undefined }}>{sum ? fmtMin(sum) : "—"}{soll ? <div className="text-[.65rem] text-muted">{fmtMin(soll)}</div> : null}</td>
              </tr>
            );
          })}
          {w.personen.length === 0 ? <tr><td colSpan={9}><div className="empty">Kein aktives Personal.</div></td></tr> : null}</tbody>
        </table></div>
        <div className="p-2 text-[.68rem] text-muted">A Ausgabe · F Fahrdienst · L Lager · B Büro · S Sonstig · Pills: U Urlaub, K krank, Z Zeitausgleich, P Pflege (? = beantragt) · 🚚 Tour laut Disposition · Klick auf die Zeit ändert den Dienst, + trägt einen ein.</div>
      </div>

      <div className="grid gap-4 lg:grid-cols-2 items-start">
        <div className="panel">
          <div className="panel-h"><h3>Prüfung</h3><span className="pill muted">{w.hinweise.length}</span></div>
          <ul className="p-3 flex flex-col gap-1 text-[.78rem]">
            {w.hinweise.sort((a, b) => (a.schwere === b.schwere ? a.datum.localeCompare(b.datum) : a.schwere === "FEHLER" ? -1 : b.schwere === "FEHLER" ? 1 : a.schwere === "WARNUNG" ? -1 : 1)).map((h, i) => (
              <li key={i} className="flex gap-2 items-start"><span className={`pill ${h.schwere === "FEHLER" ? "bad" : h.schwere === "WARNUNG" ? "warn" : "muted"}`} style={{ flexShrink: 0 }}>{WOCHENTAGE_KURZ[new Date(h.datum + "T00:00:00Z").getUTCDay() || 7]} {h.datum.slice(8)}.</span><span>{h.text}</span></li>
            ))}
            {w.hinweise.length === 0 ? <li className="empty">Keine Hinweise – Plan passt zu AZG, Abwesenheiten und Öffnungszeiten.</li> : null}
          </ul>
        </div>
        <div className="panel">
          <div className="panel-h"><h3>Besetzung je Standort</h3></div>
          <div className="twrap"><table className="data" style={{ fontSize: ".75rem" }}>
            <thead><tr><th>Standort</th>{tage.map((t) => <th key={t}>{WOCHENTAGE_KURZ[new Date(t + "T00:00:00Z").getUTCDay() || 7]}</th>)}</tr></thead>
            <tbody>{w.standorte.filter((s) => w.dienste.some((d) => d.locationId === s.id) || Object.keys(s.oeffnung).length).map((s) => (
              <tr key={s.id}><td><b>{s.name}</b></td>{tage.map((t) => { const wt = new Date(t + "T00:00:00Z").getUTCDay() || 7; const slots = s.oeffnung[wt] ?? []; const ds = w.dienste.filter((d) => d.locationId === s.id && d.datum === t); return (
                <td key={t} style={{ verticalAlign: "top", background: slots.length && !ds.length && !w.feiertage.has(t) ? "var(--bad-bg)" : undefined }}>
                  {slots.length ? <div className="text-[.62rem] text-muted mono">{slots.map((x) => `${x.from}–${x.to}`).join(", ")}</div> : null}
                  {ds.map((d) => <div key={d.id}>{w.personen.find((p) => p.id === d.staffId)?.firstName ?? "?"} <span className="mono text-muted">{d.von.slice(0, 5)}–{d.bis.slice(0, 5)}</span></div>)}
                </td>); })}</tr>
            ))}</tbody>
          </table></div>
        </div>
      </div>

      <style>{`
        .plan td.zelle { min-width: 96px; padding: 4px 5px; }
        .plan .dienst { white-space: nowrap; line-height: 1.35; }
        .plan .dienst a { text-decoration: none; }
        .plan .dienst a:hover { text-decoration: underline; }
        .plan .x { border: 0; background: transparent; color: var(--muted); cursor: pointer; padding: 0 3px; font-size: .8rem; }
        .plan .x:hover { color: var(--bad); }
        .plan .plus { display: inline-block; color: var(--muted); font-size: .8rem; opacity: .35; text-decoration: none; padding: 0 4px; }
        .plan td.zelle:hover .plus { opacity: 1; }
      `}</style>
    </div>
  );
}
