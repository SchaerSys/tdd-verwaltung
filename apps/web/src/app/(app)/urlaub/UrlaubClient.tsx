"use client";

import { useMemo, useState } from "react";
import { berechneUrlaub, fmtDe, type UrlaubInput } from "@/lib/urlaub";

interface StaffLite { id: string; name: string; weeklyHours: string | null; employmentStart: string | null; employmentEnd: string | null }

const today = () => {
  const p = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Vienna", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
  return p;
};

export function UrlaubClient({ staff }: { staff: StaffLite[] }) {
  const [mode, setMode] = useState<"eintritt" | "austritt">("eintritt");
  const [eintritt, setEintritt] = useState("");
  const [stichtag, setStichtag] = useState(today());
  const [wochenstunden, setWochenstunden] = useState("38.5");
  const [tageWoche, setTageWoche] = useState("5");
  const [jahresWochen, setJahresWochen] = useState<"5" | "6">("5");
  const [urlaubsjahr, setUrlaubsjahr] = useState<"kalender" | "arbeit">("kalender");
  const [aliquot, setAliquot] = useState<"monat" | "tag">("monat");
  const [verbraucht, setVerbraucht] = useState("0");
  const [uebertrag, setUebertrag] = useState("0");

  const pick = (id: string) => {
    const s = staff.find((x) => x.id === id);
    if (!s) return;
    if (s.weeklyHours) setWochenstunden(String(Number(s.weeklyHours)));
    if (s.employmentStart) setEintritt(s.employmentStart);
    if (s.employmentEnd) { setMode("austritt"); setStichtag(s.employmentEnd); }
    else { setMode("eintritt"); setStichtag(today()); }
  };

  const num = (v: string) => { const n = parseFloat(v.replace(",", ".")); return Number.isFinite(n) ? n : 0; };
  const r = useMemo(() => berechneUrlaub({
    eintritt, stichtag, wochenstunden: num(wochenstunden), tageWoche: num(tageWoche),
    jahresWochen: (jahresWochen === "6" ? 6 : 5), urlaubsjahr, aliquot, verbraucht: num(verbraucht), uebertrag: num(uebertrag), mode,
  } as UrlaubInput), [eintritt, stichtag, wochenstunden, tageWoche, jahresWochen, urlaubsjahr, aliquot, verbraucht, uebertrag, mode]);

  return (
    <div className="grid gap-4 lg:grid-cols-[1.1fr_1fr] items-start">
      <div className="panel">
        <div className="panel-h"><h3>Eingaben</h3></div>
        <div className="p-4 grid gap-3">
          <div className="field">
            <label className="lbl">Aus Personal übernehmen</label>
            <select className="inp" defaultValue="" onChange={(e) => pick(e.target.value)}>
              <option value="" disabled>— Mitarbeiter:in wählen (füllt vor) —</option>
              {staff.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </div>

          <div className="flex gap-2">
            <button type="button" className={`btn sm ${mode === "eintritt" ? "primary" : "ghost"}`} onClick={() => setMode("eintritt")}>laufend / bei Eintritt</button>
            <button type="button" className={`btn sm ${mode === "austritt" ? "primary" : "ghost"}`} onClick={() => setMode("austritt")}>bei Austritt</button>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="field"><label className="lbl">Anstellungsdatum (Eintritt)</label><input type="date" className="inp mono" value={eintritt} onChange={(e) => setEintritt(e.target.value)} /></div>
            <div className="field"><label className="lbl">{mode === "austritt" ? "Austrittsdatum" : "Stichtag (Berechnung per)"}</label><input type="date" className="inp mono" value={stichtag} onChange={(e) => setStichtag(e.target.value)} /></div>
            <div className="field"><label className="lbl">Wochenstunden</label><input className="inp mono" inputMode="decimal" value={wochenstunden} onChange={(e) => setWochenstunden(e.target.value)} /></div>
            <div className="field"><label className="lbl">Arbeitstage pro Woche</label><input className="inp mono" inputMode="decimal" value={tageWoche} onChange={(e) => setTageWoche(e.target.value)} /></div>
            <div className="field"><label className="lbl">Jahresanspruch</label>
              <select className="inp" value={jahresWochen} onChange={(e) => setJahresWochen(e.target.value as "5" | "6")}>
                <option value="5">5 Wochen (25 AT) – Standard</option>
                <option value="6">6 Wochen (30 AT) – ab 25 Dienstjahren</option>
              </select></div>
            <div className="field"><label className="lbl">Urlaubsjahr</label>
              <select className="inp" value={urlaubsjahr} onChange={(e) => setUrlaubsjahr(e.target.value as "kalender" | "arbeit")}>
                <option value="kalender">Kalenderjahr</option>
                <option value="arbeit">Arbeitsjahr (ab Eintrittsjahrestag)</option>
              </select></div>
            <div className="field"><label className="lbl">Aliquotierung</label>
              <select className="inp" value={aliquot} onChange={(e) => setAliquot(e.target.value as "monat" | "tag")}>
                <option value="monat">je begonnenem Monat (1/12)</option>
                <option value="tag">taggenau</option>
              </select></div>
            <div className="field"><label className="lbl">Verbraucht (Stunden)</label><input className="inp mono" inputMode="decimal" value={verbraucht} onChange={(e) => setVerbraucht(e.target.value)} /></div>
            <div className="field"><label className="lbl">Übertrag Vorjahre (Stunden)</label><input className="inp mono" inputMode="decimal" value={uebertrag} onChange={(e) => setUebertrag(e.target.value)} /></div>
          </div>

          {r.ok ? (
            <div className="pill muted" style={{ alignSelf: "start" }}>Ausmaß {fmtDe(r.ausmassPct)} % · 1 Urlaubstag = {fmtDe(r.hProTag)} h</div>
          ) : <div className="text-[.85rem]" style={{ color: "var(--warn)" }}>{r.error}</div>}
        </div>
      </div>

      <div className="panel">
        <div className="panel-h"><h3>Restanspruch</h3></div>
        <div className="p-4">
          {r.ok ? (
            <>
              <div className="grid gap-4 sm:grid-cols-2 mb-3">
                <div className="card stat"><div className="k">Rest in Stunden</div><div className="v" style={r.restStd < 0 ? { color: "var(--bad)" } : undefined}>{fmtDe(r.restStd)} h</div></div>
                <div className="card stat"><div className="k">Rest in Urlaubstagen</div><div className="v" style={r.restStd < 0 ? { color: "var(--bad)" } : undefined}>{fmtDe(r.restTage)}</div></div>
              </div>
              <div className="twrap"><table className="data">
                <thead><tr><th>Position</th><th className="text-right">Stunden</th><th className="text-right">Tage</th></tr></thead>
                <tbody>
                  <tr><td>Urlaubsjahr</td><td colSpan={2} className="muted text-[.85rem]">{r.jahrLabel} ({r.jjStart} – {r.jjEnde})</td></tr>
                  <tr><td>Voller Jahresanspruch</td><td className="text-right mono">{fmtDe(r.jahresStd)}</td><td className="text-right mono">{fmtDe(r.jahresStd / r.hProTag)}</td></tr>
                  <tr><td>Anspruch laufendes Jahr<div className="muted text-[.78rem]">{r.basis}</div></td><td className="text-right mono">{fmtDe(r.anspruchStd)}</td><td className="text-right mono">{fmtDe(r.anspruchStd / r.hProTag)}</td></tr>
                  <tr><td>Übertrag Vorjahre</td><td className="text-right mono">+ {fmtDe(r.uebertrag)}</td><td className="text-right mono">+ {fmtDe(r.uebertrag / r.hProTag)}</td></tr>
                  <tr><td>Verbraucht</td><td className="text-right mono">− {fmtDe(r.verbraucht)}</td><td className="text-right mono">− {fmtDe(r.verbraucht / r.hProTag)}</td></tr>
                  <tr className="total-row"><td><b>Restanspruch</b></td><td className="text-right mono"><b>{fmtDe(r.restStd)} h</b></td><td className="text-right mono"><b>{fmtDe(r.restTage)}</b></td></tr>
                </tbody>
              </table></div>
              <div className="sub mt-3">
                {mode === "austritt"
                  ? "Bei Beendigung gebührt der aliquote Anspruch (§ 10 UrlG); offene Ansprüche aus Vorjahren voll. Negativ = Vorgriff (Rückverrechnung nur bei bestimmten Beendigungsarten)."
                  : "Im Eintrittsjahr wird aliquot gerechnet; ab dem folgenden Urlaubsjahr voller Anspruch. Teilzeit: gekürzt werden die Stunden je Urlaubstag, nicht die Anzahl der Urlaubstage."}
              </div>
            </>
          ) : <div className="empty">Bitte eine gültige Eingabe machen.</div>}
        </div>
      </div>
    </div>
  );
}
