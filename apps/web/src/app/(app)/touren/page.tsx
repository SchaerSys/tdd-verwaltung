import Link from "next/link";
import { redirect } from "next/navigation";
import { and, asc, eq, gte, lte } from "drizzle-orm";
import { abwesenheiten, staff, tourVorlagen } from "@tdd/db";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { hasPermission } from "@/lib/rbac";
import { ampel, datumPlus, heuteIso, WOCHENTAGE, wochentag, zeitKurz } from "@/lib/touren";
import { ladeTouren, planStammdaten } from "@/lib/touren-daten";
import { fmtDate } from "@/lib/format";
import { abwesenheitAnlegen, abwesenheitLoeschen, alleFreigeben, tourAnlegen, tourFreigeben, tourZuweisen, tourenErzeugen } from "./actions";
import { AutoSubmit } from "@/components/AutoSubmit";

export const dynamic = "force-dynamic";

const STATUS: Record<string, { label: string; pill: string }> = {
  GEPLANT: { label: "geplant", pill: "muted" }, UNTERWEGS: { label: "unterwegs", pill: "tag-out" }, ABGESCHLOSSEN: { label: "abgeschlossen", pill: "good" }, AUSGEFALLEN: { label: "ausgefallen", pill: "bad" },
};

/**
 * Tagesdisposition: alle Touren eines Tages, Fahrer und Fahrzeug direkt zuweisen,
 * Konflikte sofort sichtbar (Urlaub, Werkstatt, Kuehlung, Doppelbelegung).
 */
export default async function DispositionSeite({ searchParams }: { searchParams: Promise<{ datum?: string }> }) {
  const user = await getCurrentUser();
  if (!user || !hasPermission(user.role, "tour:manage")) redirect("/dashboard");
  const sp = await searchParams;
  const datum = /^\d{4}-\d{2}-\d{2}$/.test(sp.datum ?? "") ? sp.datum! : heuteIso();
  const wt = wochentag(datum);

  const [liste, sd, vorlagenHeute, abwesend] = await Promise.all([
    ladeTouren({ datum }), planStammdaten(),
    db().select({ id: tourVorlagen.id, name: tourVorlagen.name }).from(tourVorlagen).where(and(eq(tourVorlagen.wochentag, wt), eq(tourVorlagen.isActive, true))),
    db().select({ id: abwesenheiten.id, art: abwesenheiten.art, von: abwesenheiten.von, bis: abwesenheiten.bis, first: staff.firstName, last: staff.lastName })
      .from(abwesenheiten).innerJoin(staff, eq(abwesenheiten.staffId, staff.id)).where(and(lte(abwesenheiten.von, datum), gte(abwesenheiten.bis, datum))).orderBy(asc(staff.lastName)),
  ]);
  const fehlend = vorlagenHeute.filter((v) => !liste.some((t) => t.name === v.name));
  const fahrerAuswahl = sd.fahrer.filter((f) => f.kannFahren);
  const gesamtKonflikte = liste.reduce((s, t) => s + t.konflikte.filter((k) => k.schwere === "FEHLER").length, 0);
  const kisten = liste.flatMap((t) => t.stopps).reduce((s, x) => s + (x.mengeKisten ?? 0), 0);
  const kg = liste.flatMap((t) => t.stopps).reduce((s, x) => s + Number(x.mengeKg ?? 0), 0);

  return (
    <div>
      <div className="page-h">
        <div><h1>Disposition</h1><div className="sub">{WOCHENTAGE[wt]}, {fmtDate(datum)} · {liste.length} Touren{gesamtKonflikte ? ` · ${gesamtKonflikte} offene Konflikte` : ""}{kisten || kg ? ` · gerettet: ${kisten} Kisten / ${kg.toLocaleString("de-AT")} kg` : ""}</div></div>
        <div className="flex gap-2 items-center flex-wrap">
          <Link href={`/touren?datum=${datumPlus(datum, -1)}`} className="btn ghost">← Vortag</Link>
          <form method="get" className="flex gap-1"><input type="date" name="datum" defaultValue={datum} className="inp mono" /><button className="btn" type="submit">Anzeigen</button></form>
          <Link href={`/touren?datum=${datumPlus(datum, 1)}`} className="btn ghost">Folgetag →</Link>
          <Link href={`/druck/tour?datum=${datum}`} className="btn ghost" target="_blank">🖨 Laufzettel</Link>
        </div>
      </div>

      <div className="flex gap-2 flex-wrap mb-4 items-center">
        <form action={tourenErzeugen}><input type="hidden" name="datum" value={datum} />
          <button className="btn primary" type="submit" disabled={fehlend.length === 0} title={fehlend.length ? fehlend.map((v) => v.name).join(", ") : "Alle Vorlagen dieses Wochentags sind schon angelegt"}>
            ⟳ Touren aus Wochenplan erzeugen{fehlend.length ? ` (${fehlend.length})` : ""}</button></form>
        <details className="relative">
          <summary className="btn ghost cursor-pointer list-none">＋ Freie Tour</summary>
          <form action={tourAnlegen} className="absolute z-10 mt-1 panel p-3 flex gap-2 items-end" style={{ minWidth: 380 }}>
            <input type="hidden" name="datum" value={datum} />
            <div className="field"><label className="lbl">Name</label><input name="name" className="inp" required placeholder="z. B. Sonderabholung Spar Hard" /></div>
            <div className="field"><label className="lbl">Start</label><input name="startzeit" type="time" className="inp mono" /></div>
            <button className="btn primary" type="submit">Anlegen</button>
          </form>
        </details>
        <form action={alleFreigeben}><input type="hidden" name="datum" value={datum} />
          <button className="btn" type="submit" disabled={!liste.some((t) => !t.freigegebenAt && t.status === "GEPLANT" && !t.konflikte.some((k) => k.schwere === "FEHLER"))} title="Alle Touren ohne roten Konflikt an die Fahrer:innen senden">📲 Alle fahrbereiten senden</button></form>
        <span className="text-xs text-muted ml-auto">Wochenplan: <Link href="/touren/vorlagen">{vorlagenHeute.length} Vorlagen für {WOCHENTAGE[wt]}</Link></span>
      </div>

      {liste.length === 0 ? (
        <div className="panel mb-4"><div className="empty">Noch keine Touren für diesen Tag. {vorlagenHeute.length ? "Mit „Touren aus Wochenplan erzeugen“ anlegen." : "Für diesen Wochentag gibt es keine Vorlagen – im Wochenplan anlegen oder eine freie Tour erfassen."}</div></div>
      ) : (
        <div className="flex flex-col gap-3 mb-4">
          {liste.map((t) => {
            const a = ampel(t.konflikte);
            const erledigt = t.stopps.filter((s) => s.status !== "OFFEN").length;
            return (
              <div key={t.id} className="panel" style={{ borderLeft: `4px solid var(--${a})` }}>
                <div className="panel-h" style={{ gap: 12 }}>
                  <Link href={`/touren/${t.id}`} className="font-semibold hover:underline" style={{ fontSize: ".95rem" }}>{t.name}</Link>
                  <span className="mono text-xs text-muted">{zeitKurz(t.startzeit) || "—"}{t.start ? ` · ab ${t.start}` : ""}</span>
                  <span className={`pill ${STATUS[t.status]?.pill ?? "muted"}`}>{STATUS[t.status]?.label ?? t.status}</span>
                  <span className="pill muted">{t.stopps.length} Stopps{erledigt ? ` · ${erledigt} erledigt` : ""}</span>
                  {t.stopps.some((s) => s.kuehlbedarf) ? <span className="pill tag-out">❄ Kühlware</span> : null}
                  {t.freigegebenAt ? <span className="pill good">📲 gesendet</span> : t.status === "GEPLANT" ? <span className="pill warn">noch nicht gesendet</span> : null}
                  {t.streckeKm ? <span className="pill muted">{t.streckeKm} km · {t.fahrzeitMin} min</span> : null}
                  <span style={{ marginLeft: "auto" }} className="flex gap-1">
                    {t.status === "GEPLANT" ? (
                      <form action={tourFreigeben}><input type="hidden" name="id" value={t.id} /><input type="hidden" name="zurueck" value={t.freigegebenAt ? "1" : "0"} />
                        <button className={`btn sm ${t.freigegebenAt ? "ghost" : "primary"}`} type="submit" disabled={!t.freigegebenAt && a === "bad"} title={a === "bad" ? "Erst Konflikte lösen" : undefined}>{t.freigegebenAt ? "Zurückholen" : "📲 An Fahrer senden"}</button></form>
                    ) : null}
                    <Link href={`/touren/${t.id}`} className="btn ghost sm">Öffnen →</Link>
                  </span>
                </div>
                <div className="p-3 grid gap-3 md:grid-cols-[1fr_1fr_1fr_auto] items-end">
                  <form action={tourZuweisen} className="field">
                    <input type="hidden" name="id" value={t.id} />
                    <label className="lbl">Fahrer:in</label>
                    <AutoSubmit><select name="fahrerId" className="inp" defaultValue={t.fahrerId ?? ""} disabled={t.status === "ABGESCHLOSSEN"}>
                      <option value="">— offen —</option>
                      {fahrerAuswahl.map((f) => <option key={f.id} value={f.id}>{f.lastName} {f.firstName}</option>)}
                    </select></AutoSubmit>
                  </form>
                  <form action={tourZuweisen} className="field">
                    <input type="hidden" name="id" value={t.id} />
                    <label className="lbl">Beifahrer:in</label>
                    <AutoSubmit><select name="beifahrerId" className="inp" defaultValue={t.beifahrerId ?? ""} disabled={t.status === "ABGESCHLOSSEN"}>
                      <option value="">—</option>
                      {sd.fahrer.map((f) => <option key={f.id} value={f.id}>{f.lastName} {f.firstName}</option>)}
                    </select></AutoSubmit>
                  </form>
                  <form action={tourZuweisen} className="field">
                    <input type="hidden" name="id" value={t.id} />
                    <label className="lbl">Fahrzeug</label>
                    <AutoSubmit><select name="fahrzeugId" className="inp" defaultValue={t.fahrzeugId ?? ""} disabled={t.status === "ABGESCHLOSSEN"}>
                      <option value="">— offen —</option>
                      {sd.wagen.filter((w) => w.isActive || w.id === t.fahrzeugId).map((w) => <option key={w.id} value={w.id}>{w.kennzeichen} · {w.bezeichnung}{w.kuehlung ? " ❄" : ""}{w.elektrisch ? " ⚡" : ""}</option>)}
                    </select></AutoSubmit>
                  </form>
                  <form action={tourZuweisen} className="field">
                    <input type="hidden" name="id" value={t.id} />
                    <label className="lbl">Status</label>
                    <AutoSubmit><select name="status" className="inp" defaultValue={t.status}>
                      {Object.entries(STATUS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                    </select></AutoSubmit>
                  </form>
                </div>
                {t.konflikte.length ? (
                  <ul className="px-3 pb-3 flex flex-col gap-1 text-[.8125rem]">
                    {t.konflikte.map((k) => <li key={k.code} style={{ color: k.schwere === "FEHLER" ? "var(--bad)" : "var(--warn)" }}>{k.schwere === "FEHLER" ? "✕" : "△"} {k.text}</li>)}
                  </ul>
                ) : null}
                <div className="px-3 pb-3 text-xs text-muted">
                  {t.stopps.map((s, i) => <span key={s.id}>{i ? " → " : ""}<span style={s.status === "ERLEDIGT" ? { textDecoration: "line-through" } : s.status === "NICHT_MOEGLICH" ? { color: "var(--bad)" } : undefined}>{s.art === "LIEFERUNG" ? "▶ " : ""}{s.name}</span></span>)}
                  {t.stopps.length === 0 ? "keine Stopps" : ""}
                </div>
              </div>
            );
          })}
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-2 items-start">
        <div className="panel">
          <div className="panel-h"><h3>Abwesend am {fmtDate(datum)}</h3><span className="pill muted">{abwesend.length}</span></div>
          <ul className="p-3 flex flex-col gap-1 text-[.8125rem]">
            {abwesend.map((a) => (
              <li key={a.id} className="flex items-center gap-2">
                <span className={`pill ${a.art === "KRANK" ? "bad" : a.art === "URLAUB" ? "warn" : "muted"}`}>{a.art === "KRANK" ? "krank" : a.art === "URLAUB" ? "Urlaub" : "abwesend"}</span>
                <span>{a.last} {a.first}</span><span className="text-muted mono text-xs">{fmtDate(a.von)} – {fmtDate(a.bis)}</span>
                <form action={abwesenheitLoeschen} className="ml-auto"><input type="hidden" name="id" value={a.id} /><button className="btn ghost sm" type="submit">✕</button></form>
              </li>
            ))}
            {abwesend.length === 0 ? <li className="text-muted">Niemand abwesend.</li> : null}
          </ul>
          <form action={abwesenheitAnlegen} className="p-3 border-t border-[color:var(--border)] grid gap-2 sm:grid-cols-5 items-end">
            <div className="field sm:col-span-2"><label className="lbl">Person</label><select name="staffId" className="inp" required><option value="">—</option>{sd.fahrer.map((f) => <option key={f.id} value={f.id}>{f.lastName} {f.firstName}</option>)}</select></div>
            <div className="field"><label className="lbl">Art</label><select name="art" className="inp"><option value="KRANK">krank</option><option value="URLAUB">Urlaub</option><option value="SONSTIG">sonstig</option></select></div>
            <div className="field"><label className="lbl">Von</label><input name="von" type="date" className="inp mono" defaultValue={datum} required /></div>
            <div className="field"><label className="lbl">Bis</label><input name="bis" type="date" className="inp mono" defaultValue={datum} /></div>
            <div className="sm:col-span-5"><button className="btn sm" type="submit">Abwesenheit eintragen</button></div>
          </form>
        </div>
        <div className="panel">
          <div className="panel-h"><h3>Schnellzugriff</h3></div>
          <div className="p-3 flex gap-2 flex-wrap">
            <Link href="/touren/vorlagen" className="btn ghost sm">Wochenplan</Link>
            <Link href="/touren/abholstellen" className="btn ghost sm">Abholstellen</Link>
            <Link href="/touren/fahrzeuge" className="btn ghost sm">Fahrzeuge</Link>
            <Link href="/touren/angebote" className="btn ghost sm">Angebote (Homepage)</Link>
            <Link href="/personal" className="btn ghost sm">Personal (Fahrer:innen)</Link>
          </div>
          <div className="px-3 pb-3 text-[.72rem] text-muted">Rot = Tour kann so nicht fahren (kein Fahrer/Fahrzeug, abwesend, Werkstatt, Kühlware ohne Kühlung). Gelb = Hinweis (Doppelbelegung, Fahrertag, Pickerl). Fahrer:innen sehen ihre Tour unter /fahrt am Handy.</div>
        </div>
      </div>
    </div>
  );
}
