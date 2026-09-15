import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { asc, eq } from "drizzle-orm";
import { abholstellen, locations, tourVorlageStopps, tourVorlagen } from "@tdd/db";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { hasPermission } from "@/lib/rbac";
import { WOCHENTAGE, WOCHENTAGE_KURZ, zeitKurz } from "@/lib/touren";
import { planStammdaten } from "@/lib/touren-daten";
import { vorlageSpeichern, vorlageStoppEntfernen, vorlageStoppHinzufuegen, vorlageStoppVerschieben } from "../../actions";

export const dynamic = "force-dynamic";

export default async function VorlageSeite({ params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user || !hasPermission(user.role, "tour:manage")) redirect("/dashboard");
  const id = Number((await params).id);
  if (!id) notFound();
  const v = (await db().select().from(tourVorlagen).where(eq(tourVorlagen.id, id)).limit(1))[0];
  if (!v) notFound();
  const [stopps, sd, stellen] = await Promise.all([
    db().select({ s: tourVorlageStopps, aName: abholstellen.name, aOrt: abholstellen.ort, aKuehl: abholstellen.kuehlbedarf, aTage: abholstellen.abholtage, aVon: abholstellen.fensterVon, aBis: abholstellen.fensterBis, lName: locations.name })
      .from(tourVorlageStopps).leftJoin(abholstellen, eq(tourVorlageStopps.abholstelleId, abholstellen.id)).leftJoin(locations, eq(tourVorlageStopps.locationId, locations.id))
      .where(eq(tourVorlageStopps.vorlageId, id)).orderBy(asc(tourVorlageStopps.reihenfolge)),
    planStammdaten(),
    db().select({ id: abholstellen.id, name: abholstellen.name, ort: abholstellen.ort, kuehl: abholstellen.kuehlbedarf, tage: abholstellen.abholtage }).from(abholstellen).where(eq(abholstellen.isActive, true)).orderBy(asc(abholstellen.name)),
  ]);
  const kuehl = stopps.some((s) => s.s.art === "ABHOLUNG" && s.aKuehl);
  const wagen = sd.wagen.find((w) => w.id === v.fahrzeugId);

  return (
    <div>
      <div className="page-h">
        <div><h1>{v.name}</h1><div className="sub">{WOCHENTAGE[v.wochentag]} · {zeitKurz(v.startzeit) || "ohne Startzeit"} · {stopps.length} Stopps{v.isActive ? "" : " · inaktiv"}</div></div>
        <Link href="/touren/vorlagen" className="btn ghost">← Wochenplan</Link>
      </div>

      <div className="grid gap-4 lg:grid-cols-[2fr_1fr] items-start">
        <div className="panel">
          <div className="panel-h"><h3>Stopps in Reihenfolge</h3>{kuehl ? <span className="pill tag-out">❄ Kühlware</span> : null}{kuehl && wagen && !wagen.kuehlung ? <span className="pill bad">Standard-Fahrzeug ohne Kühlung</span> : null}</div>
          {stopps.length === 0 ? <div className="empty">Noch keine Stopps – unten hinzufügen. Zuerst Abholungen, zum Schluss die Lieferung an Lager/Ausgabestelle.</div> : (
            <ol className="flex flex-col">
              {stopps.map((s, i) => {
                const passtNicht = s.s.art === "ABHOLUNG" && (s.aTage?.length ?? 0) > 0 && !s.aTage!.includes(v.wochentag);
                return (
                  <li key={s.s.id} className="flex gap-3 p-3 border-b border-[color:var(--border)] items-center">
                    <div className="mono text-lg font-bold" style={{ width: 28 }}>{i + 1}</div>
                    <div className="flex-1 text-[.8125rem]">
                      <span className={`pill ${s.s.art === "LIEFERUNG" ? "tag-shop" : "tag-out"}`}>{s.s.art === "LIEFERUNG" ? "Lieferung" : "Abholung"}</span>{" "}
                      <b>{s.s.art === "ABHOLUNG" ? s.aName : s.lName}</b>{s.aOrt ? <span className="text-muted"> · {s.aOrt}</span> : null}
                      {s.aKuehl ? " ❄" : ""}
                      {s.aVon || s.aBis ? <span className="mono text-xs text-muted"> · {(s.aVon ?? "").slice(0, 5)}–{(s.aBis ?? "").slice(0, 5)}</span> : null}
                      {passtNicht ? <span className="pill warn" style={{ marginLeft: 6 }}>holt normalerweise {s.aTage!.map((t) => WOCHENTAGE_KURZ[t]).join("/")}</span> : null}
                      {s.s.hinweis ? <div className="text-muted">{s.s.hinweis}</div> : null}
                    </div>
                    <div className="flex gap-1">
                      <form action={vorlageStoppVerschieben}><input type="hidden" name="id" value={s.s.id} /><input type="hidden" name="vorlageId" value={id} /><input type="hidden" name="richtung" value="hoch" /><button className="btn ghost sm" disabled={i === 0}>↑</button></form>
                      <form action={vorlageStoppVerschieben}><input type="hidden" name="id" value={s.s.id} /><input type="hidden" name="vorlageId" value={id} /><input type="hidden" name="richtung" value="runter" /><button className="btn ghost sm" disabled={i === stopps.length - 1}>↓</button></form>
                      <form action={vorlageStoppEntfernen}><input type="hidden" name="id" value={s.s.id} /><input type="hidden" name="vorlageId" value={id} /><button className="btn ghost sm">✕</button></form>
                    </div>
                  </li>
                );
              })}
            </ol>
          )}
          <div className="p-3 border-t border-[color:var(--border)] grid gap-3 md:grid-cols-2">
            <form action={vorlageStoppHinzufuegen} className="flex gap-2 items-end flex-wrap">
              <input type="hidden" name="vorlageId" value={id} /><input type="hidden" name="art" value="ABHOLUNG" />
              <div className="field flex-1"><label className="lbl">Abholung bei</label><select name="abholstelleId" className="inp" required><option value="">—</option>{stellen.map((s) => <option key={s.id} value={s.id}>{s.name}{s.ort ? ` (${s.ort})` : ""}{s.kuehl ? " ❄" : ""}{s.tage.length && !s.tage.includes(v.wochentag) ? " · nicht " + WOCHENTAGE_KURZ[v.wochentag] : ""}</option>)}</select></div>
              <div className="field"><label className="lbl">Hinweis</label><input name="hinweis" className="inp" placeholder="optional" /></div>
              <button className="btn sm" type="submit">＋ Abholung</button>
            </form>
            <form action={vorlageStoppHinzufuegen} className="flex gap-2 items-end flex-wrap">
              <input type="hidden" name="vorlageId" value={id} /><input type="hidden" name="art" value="LIEFERUNG" />
              <div className="field flex-1"><label className="lbl">Lieferung an</label><select name="locationId" className="inp" required><option value="">—</option>{sd.orte.map((o) => <option key={o.id} value={o.id}>{o.name} ({o.type === "LADEN" ? "Laden" : "Ausgabestelle"})</option>)}</select></div>
              <div className="field"><label className="lbl">Hinweis</label><input name="hinweis" className="inp" placeholder="optional" /></div>
              <button className="btn sm" type="submit">＋ Lieferung</button>
            </form>
          </div>
        </div>

        <div className="panel">
          <div className="panel-h"><h3>Vorlage</h3></div>
          <form action={vorlageSpeichern} className="p-3 flex flex-col gap-2">
            <input type="hidden" name="id" value={id} />
            <div className="field"><label className="lbl">Name</label><input name="name" className="inp" defaultValue={v.name} required /></div>
            <div className="field"><label className="lbl">Wochentag</label><select name="wochentag" className="inp" defaultValue={v.wochentag}>{[1, 2, 3, 4, 5, 6, 7].map((t) => <option key={t} value={t}>{WOCHENTAGE[t]}</option>)}</select></div>
            <div className="field"><label className="lbl">Startzeit</label><input name="startzeit" type="time" className="inp mono" defaultValue={zeitKurz(v.startzeit)} /></div>
            <div className="field"><label className="lbl">Start ab</label><select name="startLocationId" className="inp" defaultValue={v.startLocationId ?? ""}><option value="">—</option>{sd.orte.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}</select></div>
            <div className="field"><label className="lbl">Standard-Fahrzeug</label><select name="fahrzeugId" className="inp" defaultValue={v.fahrzeugId ?? ""}><option value="">—</option>{sd.wagen.filter((w) => w.isActive || w.id === v.fahrzeugId).map((w) => <option key={w.id} value={w.id}>{w.kennzeichen} · {w.bezeichnung}{w.kuehlung ? " ❄" : ""}</option>)}</select></div>
            <div className="field"><label className="lbl">Standard-Fahrer:in</label><select name="fahrerId" className="inp" defaultValue={v.fahrerId ?? ""}><option value="">—</option>{sd.fahrer.filter((f) => f.kannFahren || f.id === v.fahrerId).map((f) => <option key={f.id} value={f.id}>{f.lastName} {f.firstName}</option>)}</select></div>
            <div className="field"><label className="lbl">Hinweise</label><textarea name="hinweise" className="inp" rows={2} defaultValue={v.hinweise ?? ""} /></div>
            <label className="flex items-center gap-1 text-[.8125rem]"><input type="checkbox" name="isActive" defaultChecked={v.isActive} /> aktiv (wird täglich erzeugt)</label>
            <button className="btn primary" type="submit">Speichern</button>
          </form>
        </div>
      </div>
    </div>
  );
}
