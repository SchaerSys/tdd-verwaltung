import { zeitKurz } from "@/lib/touren";
import type { TourAnzeige } from "@/lib/touren-daten";
import { stoppMelden, tourBeenden, tourStarten } from "@/app/(app)/touren/actions";
import { TourKarte } from "@/components/TourKarte";

export type Strecke = { km: number; minuten: number; geometrie: [number, number][] } | null;

/**
 * Tour-Ablauf fuer das Tablet: Karte, Start, Navigation zum naechsten Stopp, Stopps abhaken,
 * Mengen, Tour beenden. Gleich fuer Fahrzeug-Tablet (/fahrzeug) und Buero/Fahrer-Login (/fahrt).
 */
export interface FahrerOption { id: string; name: string }

export function TourAblauf({ liste, strecken, fahrer }: { liste: TourAnzeige[]; strecken: Map<string, Strecke>; fahrer: FahrerOption[] }) {
  return (
    <>
      {liste.map((t) => {
        const offen = t.stopps.filter((s) => s.status === "OFFEN");
        const naechster = offen[0];
        const strecke = strecken.get(t.id) ?? null;
        const punkte = t.stopps.filter((s) => s.lat != null && s.lng != null).map((s) => ({ lat: s.lat!, lng: s.lng!, nr: String(t.stopps.indexOf(s) + 1), label: s.name, untertitel: s.adresse, farbe: s.status === "ERLEDIGT" ? "#16a34a" : s.art === "LIEFERUNG" ? "#0f766e" : "#981313" }));
        const naviNaechster = naechster ? (naechster.lat && naechster.lng ? `geo:${naechster.lat},${naechster.lng}?q=${naechster.lat},${naechster.lng}(${encodeURIComponent(naechster.name)})` : naechster.adresse ? `geo:0,0?q=${encodeURIComponent(`${naechster.name}, ${naechster.adresse}`)}` : null) : null;
        return (
          <div key={t.id} className="panel" style={{ borderLeft: `5px solid var(--${t.status === "ABGESCHLOSSEN" ? "good" : t.status === "UNTERWEGS" ? "accent" : "border"})` }}>
            <div className="p-3 border-b border-[color:var(--border)]">
              <div className="flex items-center gap-2 flex-wrap">
                <b style={{ fontSize: "1.05rem" }}>{t.name}</b>
                <span className="mono text-sm text-muted">{zeitKurz(t.startzeit)}</span>
                <span className={`pill ${t.status === "ABGESCHLOSSEN" ? "good" : t.status === "UNTERWEGS" ? "tag-out" : t.status === "AUSGEFALLEN" ? "bad" : "muted"}`}>{t.status === "GEPLANT" ? "geplant" : t.status === "UNTERWEGS" ? "unterwegs" : t.status === "ABGESCHLOSSEN" ? "fertig" : "ausgefallen"}</span>
              </div>
              <div className="text-sm text-muted mt-1">{t.fahrer ? `🧑‍✈️ ${t.fahrer}` : "Fahrer:in beim Start wählen"}{t.beifahrer ? ` · mit ${t.beifahrer}` : ""} · {t.fahrzeug ?? "kein Fahrzeug"}{t.fahrzeugKuehlung ? " ❄" : ""}{t.start ? ` · Start ${t.start}` : ""}</div>
              {t.hinweise ? <div className="text-sm mt-1 p-2 rounded" style={{ background: "var(--warn-bg)" }}>{t.hinweise}</div> : null}
              {t.konflikte.some((k) => k.schwere === "FEHLER") ? <div className="text-sm mt-1" style={{ color: "var(--bad)" }}>{t.konflikte.filter((k) => k.schwere === "FEHLER").map((k) => k.text).join(" · ")}</div> : null}
            </div>

            {punkte.length ? <div className="p-2 border-b border-[color:var(--border)]"><TourKarte punkte={punkte} route={strecke?.geometrie} hoehe={260} />{strecke ? <div className="text-xs text-muted mt-1 text-center">{strecke.km} km · ca. {strecke.minuten} min Fahrzeit</div> : null}</div> : null}
            {t.status === "UNTERWEGS" && naechster && naviNaechster ? (
              <div className="p-3 border-b border-[color:var(--border)]"><a href={naviNaechster} className="btn primary" style={{ display: "block", textAlign: "center", fontSize: "1.05rem", padding: "12px" }}>🧭 Navigation zu Stopp {t.stopps.indexOf(naechster) + 1}: {naechster.name}</a></div>
            ) : null}
            {t.status === "GEPLANT" ? (
              <form action={tourStarten} className="p-3 grid gap-2 border-b border-[color:var(--border)]" style={{ gridTemplateColumns: "1fr 1fr" }}>
                <input type="hidden" name="id" value={t.id} />
                <div className="field"><label className="lbl">Wer fährt?</label>
                  <select name="fahrerId" className="inp" defaultValue={t.fahrerId ?? ""} style={{ fontSize: "1.05rem" }} required>
                    <option value="">— bitte wählen —</option>
                    {fahrer.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
                  </select></div>
                <div className="field"><label className="lbl">Beifahrer:in</label>
                  <select name="beifahrerId" className="inp" defaultValue={t.beifahrerId ?? ""} style={{ fontSize: "1.05rem" }}>
                    <option value="">—</option>
                    {fahrer.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
                  </select></div>
                <div className="field"><label className="lbl">Kilometerstand Start</label><input name="kmStart" inputMode="numeric" className="inp mono" style={{ fontSize: "1.1rem" }} placeholder="optional" /></div>
                <button className="btn primary self-end" type="submit" style={{ fontSize: "1.05rem", padding: "12px 18px" }}>▶ Tour starten</button>
              </form>
            ) : null}

            <ol className="flex flex-col">
              {t.stopps.map((s, i) => {
                const aktiv = naechster?.id === s.id && t.status !== "ABGESCHLOSSEN";
                const navi = s.lat && s.lng ? `geo:${s.lat},${s.lng}?q=${s.lat},${s.lng}(${encodeURIComponent(s.name)})` : s.adresse ? `geo:0,0?q=${encodeURIComponent(`${s.name}, ${s.adresse}`)}` : null;
                return (
                  <li key={s.id} className="p-3 border-b border-[color:var(--border)]" style={s.status === "ERLEDIGT" ? { background: "var(--good-bg)", opacity: .8 } : s.status === "NICHT_MOEGLICH" ? { background: "var(--bad-bg)" } : aktiv ? { background: "var(--surface-2)" } : undefined}>
                    <div className="flex gap-3 items-start">
                      <div className="mono font-bold grid place-items-center rounded-full" style={{ width: 34, height: 34, background: s.status === "ERLEDIGT" ? "var(--good)" : s.status === "NICHT_MOEGLICH" ? "var(--bad)" : aktiv ? "var(--accent)" : "var(--surface-2)", color: s.status !== "OFFEN" || aktiv ? "#fff" : "inherit", flex: "none" }}>{s.status === "ERLEDIGT" ? "✓" : s.status === "NICHT_MOEGLICH" ? "✕" : i + 1}</div>
                      <div className="flex-1">
                        <div className="flex gap-2 items-center flex-wrap"><b style={{ fontSize: "1rem" }}>{s.name}</b><span className={`pill ${s.art === "LIEFERUNG" ? "tag-shop" : "tag-out"}`}>{s.art === "LIEFERUNG" ? "Lieferung" : "Abholung"}</span>{s.kuehlbedarf ? "❄" : ""}{s.fenster ? <span className="mono text-xs text-muted">{s.fenster}</span> : null}</div>
                        <div className="text-sm text-muted">{s.adresse}</div>
                        {s.ansprechperson || s.telefon ? <div className="text-sm">{s.ansprechperson ?? ""}{s.telefon ? <> · <a href={`tel:${s.telefon.replace(/\s/g, "")}`} className="text-accent">☎ {s.telefon}</a></> : null}</div> : null}
                        {s.stellenHinweis ? <div className="text-sm mt-1">{s.stellenHinweis}</div> : null}
                        {s.hinweis ? <div className="text-sm mt-1 font-semibold">{s.hinweis}</div> : null}
                        {s.status !== "OFFEN" ? <div className="text-sm mt-1">{s.mengeKisten != null ? `${s.mengeKisten} Kisten` : ""}{s.mengeKg != null ? ` · ${s.mengeKg} kg` : ""}{s.bemerkung ? ` · ${s.bemerkung}` : ""}</div> : null}
                        <div className="flex gap-2 mt-2 flex-wrap">
                          {navi ? <a href={navi} className="btn ghost sm">🧭 Navigation</a> : null}
                        </div>
                        {s.status === "OFFEN" && t.status !== "ABGESCHLOSSEN" ? (
                          <details className="mt-2" open={aktiv}>
                            <summary className="btn sm cursor-pointer list-none inline-block">{s.art === "ABHOLUNG" ? "Abgeholt – Mengen eintragen" : "Abgeliefert"}</summary>
                            <form action={stoppMelden} className="mt-2 grid gap-2 grid-cols-2">
                              <input type="hidden" name="id" value={s.id} /><input type="hidden" name="tourId" value={t.id} />
                              {s.art === "ABHOLUNG" ? <>
                                <div className="field"><label className="lbl">Kisten</label><input name="mengeKisten" inputMode="numeric" className="inp mono" style={{ fontSize: "1.2rem" }} /></div>
                                <div className="field"><label className="lbl">kg (geschätzt)</label><input name="mengeKg" inputMode="decimal" className="inp mono" style={{ fontSize: "1.2rem" }} /></div>
                              </> : null}
                              <div className="field col-span-2"><label className="lbl">Bemerkung</label><input name="bemerkung" className="inp" placeholder="optional" /></div>
                              <button className="btn primary col-span-2" type="submit" name="status" value="ERLEDIGT" style={{ fontSize: "1.05rem", padding: "12px" }}>✓ Erledigt</button>
                              <button className="btn ghost col-span-2" type="submit" name="status" value="NICHT_MOEGLICH">✕ Nicht möglich (geschlossen, nichts da …)</button>
                            </form>
                          </details>
                        ) : null}
                      </div>
                    </div>
                  </li>
                );
              })}
            </ol>

            {t.status === "UNTERWEGS" ? (
              <form action={tourBeenden} className="p-3 flex gap-2 items-end">
                <input type="hidden" name="id" value={t.id} />
                <div className="field flex-1"><label className="lbl">Kilometerstand Ende</label><input name="kmEnde" inputMode="numeric" className="inp mono" style={{ fontSize: "1.1rem" }} placeholder="optional" /></div>
                <button className="btn primary" type="submit" style={{ fontSize: "1.05rem", padding: "12px 18px" }} disabled={offen.length > 0} title={offen.length ? `${offen.length} Stopps noch offen` : undefined}>■ Tour beenden</button>
              </form>
            ) : null}
            {t.status === "ABGESCHLOSSEN" ? <div className="p-3 text-sm text-muted">Fertig{t.kmStart != null && t.kmEnde != null ? ` · ${t.kmEnde - t.kmStart} km` : ""}. Danke!</div> : null}
          </div>
        );
      })}
    </>
  );
}
