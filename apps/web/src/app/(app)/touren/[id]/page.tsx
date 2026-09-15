import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { asc, eq } from "drizzle-orm";
import { abholstellen } from "@tdd/db";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { hasPermission } from "@/lib/rbac";
import { ampel, zeitKurz } from "@/lib/touren";
import { ladeTouren, planStammdaten } from "@/lib/touren-daten";
import { fmtDate, fmtDateTime } from "@/lib/format";
import { ConfirmButton } from "@/components/ConfirmButton";
import { stoppMelden, tourLoeschen, tourStoppEntfernen, tourStoppHinzufuegen, tourStoppVerschieben, tourZuweisen } from "../actions";

export const dynamic = "force-dynamic";

/** Eine Tour: Stopps ordnen, Zuweisung, Kilometer, Mengen – und was der Fahrer gemeldet hat. */
export default async function TourSeite({ params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user || !hasPermission(user.role, "tour:manage")) redirect("/dashboard");
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const [t] = await ladeTouren({ id });
  if (!t) notFound();
  const [sd, stellen] = await Promise.all([planStammdaten(), db().select({ id: abholstellen.id, name: abholstellen.name, ort: abholstellen.ort, kuehl: abholstellen.kuehlbedarf }).from(abholstellen).where(eq(abholstellen.isActive, true)).orderBy(asc(abholstellen.name))]);
  const a = ampel(t.konflikte);
  const offen = t.status === "GEPLANT";
  const kisten = t.stopps.reduce((s, x) => s + (x.mengeKisten ?? 0), 0);
  const kg = t.stopps.reduce((s, x) => s + Number(x.mengeKg ?? 0), 0);

  return (
    <div>
      <div className="page-h">
        <div><h1>{t.name}</h1><div className="sub">{fmtDate(t.datum)} · {zeitKurz(t.startzeit) || "ohne Startzeit"}{t.start ? ` · ab ${t.start}` : ""} · {t.status.toLowerCase()}</div></div>
        <div className="flex gap-2">
          <Link href={`/druck/tour?tour=${t.id}`} className="btn ghost" target="_blank">🖨 Laufzettel</Link>
          <Link href={`/touren?datum=${t.datum}`} className="btn ghost">← Disposition</Link>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-[2fr_1fr] items-start">
        <div className="flex flex-col gap-4">
          <div className="panel">
            <div className="panel-h"><h3>Stopps</h3><span className="pill muted">{t.stopps.length}</span>{kisten || kg ? <span className="pill good">{kisten} Kisten · {kg.toLocaleString("de-AT")} kg</span> : null}</div>
            {t.stopps.length === 0 ? <div className="empty">Noch keine Stopps.</div> : (
              <ol className="flex flex-col">
                {t.stopps.map((s, i) => (
                  <li key={s.id} className="flex gap-3 p-3 border-b border-[color:var(--border)] items-start" style={s.status === "NICHT_MOEGLICH" ? { background: "var(--bad-bg)" } : s.status === "ERLEDIGT" ? { background: "var(--good-bg)" } : undefined}>
                    <div className="mono text-lg font-bold" style={{ width: 28 }}>{i + 1}</div>
                    <div className="flex-1 text-[.8125rem]">
                      <div className="flex gap-2 items-center flex-wrap">
                        <span className={`pill ${s.art === "LIEFERUNG" ? "tag-shop" : "tag-out"}`}>{s.art === "LIEFERUNG" ? "Lieferung" : "Abholung"}</span>
                        <b>{s.name}</b>
                        {s.kuehlbedarf ? <span className="pill tag-out">❄</span> : null}
                        {s.fenster ? <span className="mono text-xs text-muted">{s.fenster}</span> : null}
                        {s.status === "ERLEDIGT" ? <span className="pill good">erledigt {fmtDateTime(s.erledigtAt)}</span> : s.status === "NICHT_MOEGLICH" ? <span className="pill bad">nicht möglich</span> : null}
                      </div>
                      <div className="text-muted">{s.adresse}{s.telefon ? ` · ☎ ${s.telefon}` : ""}{s.ansprechperson ? ` · ${s.ansprechperson}` : ""}</div>
                      {s.stellenHinweis ? <div className="text-muted">{s.stellenHinweis}</div> : null}
                      {s.hinweis ? <div>{s.hinweis}</div> : null}
                      {s.status !== "OFFEN" ? <div>{s.mengeKisten != null ? `${s.mengeKisten} Kisten` : ""}{s.mengeKg != null ? ` · ${s.mengeKg} kg` : ""}{s.bemerkung ? ` · „${s.bemerkung}“` : ""}</div> : null}
                    </div>
                    <div className="flex gap-1">
                      {offen ? <>
                        <form action={tourStoppVerschieben}><input type="hidden" name="id" value={s.id} /><input type="hidden" name="tourId" value={t.id} /><input type="hidden" name="richtung" value="hoch" /><button className="btn ghost sm" disabled={i === 0}>↑</button></form>
                        <form action={tourStoppVerschieben}><input type="hidden" name="id" value={s.id} /><input type="hidden" name="tourId" value={t.id} /><input type="hidden" name="richtung" value="runter" /><button className="btn ghost sm" disabled={i === t.stopps.length - 1}>↓</button></form>
                        <form action={tourStoppEntfernen}><input type="hidden" name="id" value={s.id} /><input type="hidden" name="tourId" value={t.id} /><button className="btn ghost sm">✕</button></form>
                      </> : null}
                      {s.status !== "OFFEN" ? <form action={stoppMelden}><input type="hidden" name="id" value={s.id} /><input type="hidden" name="tourId" value={t.id} /><input type="hidden" name="status" value="OFFEN" /><button className="btn ghost sm" title="Meldung zurücknehmen">↺</button></form> : null}
                    </div>
                  </li>
                ))}
              </ol>
            )}
            <details className="border-t border-[color:var(--border)]">
              <summary className="p-3 text-[.8125rem] cursor-pointer">＋ Stopp hinzufügen</summary>
              <div className="p-3 grid gap-3 md:grid-cols-2">
                <form action={tourStoppHinzufuegen} className="flex gap-2 items-end flex-wrap">
                  <input type="hidden" name="tourId" value={t.id} /><input type="hidden" name="art" value="ABHOLUNG" />
                  <div className="field flex-1"><label className="lbl">Abholung bei</label><select name="abholstelleId" className="inp" required><option value="">—</option>{stellen.map((s) => <option key={s.id} value={s.id}>{s.name}{s.ort ? ` (${s.ort})` : ""}{s.kuehl ? " ❄" : ""}</option>)}</select></div>
                  <button className="btn sm" type="submit">Hinzufügen</button>
                </form>
                <form action={tourStoppHinzufuegen} className="flex gap-2 items-end flex-wrap">
                  <input type="hidden" name="tourId" value={t.id} /><input type="hidden" name="art" value="LIEFERUNG" />
                  <div className="field flex-1"><label className="lbl">Lieferung an</label><select name="locationId" className="inp" required><option value="">—</option>{sd.orte.map((o) => <option key={o.id} value={o.id}>{o.name} ({o.type === "LADEN" ? "Laden" : "Ausgabestelle"})</option>)}</select></div>
                  <button className="btn sm" type="submit">Hinzufügen</button>
                </form>
              </div>
            </details>
          </div>
        </div>

        <div className="flex flex-col gap-4">
          <div className="panel" style={{ borderColor: `var(--${a})` }}>
            <div className="panel-h"><h3>Einteilung</h3><span className={`pill ${a}`}><span className="dot" />{a === "good" ? "fahrbereit" : a === "warn" ? "Hinweise" : "Konflikt"}</span></div>
            <form action={tourZuweisen} className="p-3 flex flex-col gap-2">
              <input type="hidden" name="id" value={t.id} />
              <div className="field"><label className="lbl">Fahrer:in</label><select name="fahrerId" className="inp" defaultValue={t.fahrerId ?? ""}><option value="">— offen —</option>{sd.fahrer.filter((f) => f.kannFahren || f.id === t.fahrerId).map((f) => <option key={f.id} value={f.id}>{f.lastName} {f.firstName}</option>)}</select></div>
              <div className="field"><label className="lbl">Beifahrer:in</label><select name="beifahrerId" className="inp" defaultValue={t.beifahrerId ?? ""}><option value="">—</option>{sd.fahrer.map((f) => <option key={f.id} value={f.id}>{f.lastName} {f.firstName}</option>)}</select></div>
              <div className="field"><label className="lbl">Fahrzeug</label><select name="fahrzeugId" className="inp" defaultValue={t.fahrzeugId ?? ""}><option value="">— offen —</option>{sd.wagen.filter((w) => w.isActive || w.id === t.fahrzeugId).map((w) => <option key={w.id} value={w.id}>{w.kennzeichen} · {w.bezeichnung}{w.kuehlung ? " ❄" : ""}</option>)}</select></div>
              <div className="field"><label className="lbl">Startzeit</label><input name="startzeit" type="time" className="inp mono" defaultValue={zeitKurz(t.startzeit)} /></div>
              <div className="field"><label className="lbl">Status</label><select name="status" className="inp" defaultValue={t.status}><option value="GEPLANT">geplant</option><option value="UNTERWEGS">unterwegs</option><option value="ABGESCHLOSSEN">abgeschlossen</option><option value="AUSGEFALLEN">ausgefallen</option></select></div>
              <div className="field"><label className="lbl">Hinweise für die Fahrt</label><textarea name="hinweise" className="inp" rows={2} defaultValue={t.hinweise ?? ""} /></div>
              <button className="btn primary" type="submit">Speichern</button>
            </form>
            {t.konflikte.length ? <ul className="px-3 pb-3 flex flex-col gap-1 text-[.8125rem]">{t.konflikte.map((k) => <li key={k.code} style={{ color: k.schwere === "FEHLER" ? "var(--bad)" : "var(--warn)" }}>{k.schwere === "FEHLER" ? "✕" : "△"} {k.text}</li>)}</ul> : null}
          </div>
          <div className="panel">
            <div className="panel-h"><h3>Fahrt</h3></div>
            <div className="p-3 text-[.8125rem] flex flex-col gap-1">
              <div><span className="text-muted">Gestartet:</span> {fmtDateTime(t.gestartetAt)}{t.kmStart != null ? ` · ${t.kmStart} km` : ""}</div>
              <div><span className="text-muted">Beendet:</span> {fmtDateTime(t.beendetAt)}{t.kmEnde != null ? ` · ${t.kmEnde} km` : ""}</div>
              {t.kmStart != null && t.kmEnde != null ? <div><span className="text-muted">Gefahren:</span> {t.kmEnde - t.kmStart} km</div> : null}
            </div>
            {offen ? <div className="p-3 border-t border-[color:var(--border)]"><form action={tourLoeschen}><input type="hidden" name="id" value={t.id} /><input type="hidden" name="datum" value={t.datum} /><ConfirmButton className="btn danger sm" message="Diese Tour löschen?">Tour löschen</ConfirmButton></form></div> : null}
          </div>
        </div>
      </div>
    </div>
  );
}
