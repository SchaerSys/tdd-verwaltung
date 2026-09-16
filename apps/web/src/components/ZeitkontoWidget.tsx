import type { ZeitkontoWidgetDaten } from "@/lib/zeitkonto-widget";

const WT = ["", "Mo", "Di", "Mi", "Do", "Fr", "Sa", "So"];
const std = (min: number) => `${Math.floor(Math.abs(min) / 60)}:${String(Math.abs(min) % 60).padStart(2, "0")}`;
const saldo = (min: number) => `${min < 0 ? "−" : "+"}${std(min)} h`;
const fmtDatum = (iso: string) => `${iso.slice(8, 10)}.${iso.slice(5, 7)}.`;

/**
 * Zeitkonto-Widget: Wochenstunden als Kreisdiagramm (gearbeitet / noch offen), darunter Zeitkonto
 * (Zeitausgleich) und Urlaubskonto sauber gelistet. Reine Darstellung, Daten aus lib/zeitkonto-widget.
 */
export function ZeitkontoWidget({ d, kompakt = false }: { d: ZeitkontoWidgetDaten; kompakt?: boolean }) {
  const gesamt = Math.max(d.woche.sollMin, d.woche.istMin + d.woche.gutschriftMin, 1);
  const anteilIst = Math.min(1, d.woche.istMin / gesamt);
  const anteilGut = Math.min(1 - anteilIst, d.woche.gutschriftMin / gesamt);
  const r = 44, u = 2 * Math.PI * r;
  const heuteTag = new Date(d.heute + "T00:00:00Z").getUTCDay() || 7;

  return (
    <div className="zk">
      <div className="zk-top">
        <svg viewBox="0 0 110 110" width={kompakt ? 96 : 120} height={kompakt ? 96 : 120} role="img" aria-label={`Diese Woche ${std(d.woche.istMin)} von ${std(d.woche.sollMin)} Stunden gearbeitet`}>
          <circle cx="55" cy="55" r={r} fill="none" stroke="var(--surface-2)" strokeWidth="12" />
          {anteilGut > 0 ? <circle cx="55" cy="55" r={r} fill="none" stroke="var(--warn)" strokeWidth="12" strokeDasharray={`${u * anteilGut} ${u}`} strokeDashoffset={-u * anteilIst} transform="rotate(-90 55 55)" strokeLinecap="butt" /> : null}
          <circle cx="55" cy="55" r={r} fill="none" stroke="var(--accent)" strokeWidth="12" strokeDasharray={`${u * anteilIst} ${u}`} transform="rotate(-90 55 55)" strokeLinecap="butt" />
          <text x="55" y="51" textAnchor="middle" fontSize="15" fontWeight="700" fill="currentColor" fontFamily="ui-monospace, monospace">{std(d.woche.istMin)}</text>
          <text x="55" y="67" textAnchor="middle" fontSize="9" fill="var(--muted)">von {std(d.woche.sollMin)} h</text>
        </svg>
        <div className="zk-woche">
          <div className="zk-k">Diese Woche · {fmtDatum(d.woche.start)} – {fmtDatum(d.woche.ende)}</div>
          <div className="zk-row"><span><i className="zk-dot" style={{ background: "var(--accent)" }} />gearbeitet</span><b className="mono">{std(d.woche.istMin)} h</b></div>
          {d.woche.gutschriftMin ? <div className="zk-row"><span><i className="zk-dot" style={{ background: "var(--warn)" }} />Gutschrift (Feiertag/Urlaub/krank)</span><b className="mono">{std(d.woche.gutschriftMin)} h</b></div> : null}
          <div className="zk-row"><span><i className="zk-dot" style={{ background: "var(--surface-2)", border: "1px solid var(--border)" }} />noch zu arbeiten</span><b className="mono">{std(d.woche.restMin)} h</b></div>
          <div className="zk-tage">{d.woche.tage.map((t) => { const wt = new Date(t.datum + "T00:00:00Z").getUTCDay() || 7; const voll = t.sollMin ? Math.min(1, (t.istMin + t.gutschriftMin) / t.sollMin) : 0; return (
            <div key={t.datum} className="zk-tag" title={`${WT[wt]} ${fmtDatum(t.datum)}: ${std(t.istMin)} / ${std(t.sollMin)} h`} style={{ opacity: wt > heuteTag ? .45 : 1 }}>
              <div className="zk-bar"><div style={{ height: `${Math.round(voll * 100)}%`, background: t.gutschriftMin && !t.istMin ? "var(--warn)" : "var(--accent)" }} /></div>
              <span style={{ fontWeight: wt === heuteTag ? 700 : 400 }}>{WT[wt]}</span>
            </div>); })}</div>
        </div>
      </div>

      <div className="zk-list">
        <div className="zk-row zk-big"><span>Zeitkonto (Zeitausgleich verfügbar)</span><b className="mono" style={{ color: d.kontoMin < 0 ? "var(--bad)" : "var(--good)" }}>{saldo(d.kontoMin)}</b></div>
        <div className="zk-row zk-sub"><span>laufender Monat: Ist {std(d.monat.istMin)} / Soll {std(d.monat.sollMin)} h</span><span className="mono">{saldo(d.monat.saldoMin)}</span></div>
        {d.urlaub ? (
          <>
            <div className="zk-k" style={{ marginTop: 10 }}>{d.urlaub.titel} · {d.urlaub.zeitraum}</div>
            <div className="zk-row"><span>Anspruch{d.urlaub.uebertrag ? " (Jahr)" : ""}</span><b className="mono">{d.urlaub.anspruch} {d.urlaub.einheit}</b></div>
            {d.urlaub.uebertrag ? <div className="zk-row"><span>+ Übertrag aus Vorjahren</span><b className="mono">{d.urlaub.uebertrag}</b></div> : null}
            <div className="zk-row"><span>− bereits bezogen</span><b className="mono">{d.urlaub.verbraucht}</b></div>
            {d.urlaub.geplant ? <div className="zk-row"><span>− genehmigt geplant</span><b className="mono">{d.urlaub.geplant}</b></div> : null}
            <div className="zk-row zk-big" style={{ borderTop: "1px solid var(--border)", paddingTop: 6 }}><span>Resturlaub</span><b className="mono" style={{ color: d.urlaub.rest < 0 ? "var(--bad)" : "var(--good)" }}>{d.urlaub.rest} {d.urlaub.einheit}</b></div>
            {d.urlaub.verfall ? <div className="zk-sub" style={{ color: "var(--warn)" }}>{d.urlaub.verfall.tage} Tage verfallen am {fmtDatum(d.urlaub.verfall.am)}{d.urlaub.verfall.am.slice(0, 4)}</div> : null}
          </>
        ) : <div className="zk-sub">{d.fehlt ?? "Kein Urlaubskonto."}</div>}
      </div>

      <style>{`
        .zk { font-size: .8125rem; }
        .zk-top { display: flex; gap: 14px; align-items: center; }
        .zk-woche { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 3px; }
        .zk-k { font-size: .68rem; text-transform: uppercase; letter-spacing: .04em; color: var(--muted); }
        .zk-row { display: flex; justify-content: space-between; gap: 8px; align-items: baseline; }
        .zk-row span { display: inline-flex; align-items: center; gap: 6px; }
        .zk-big { font-size: .95rem; }
        .zk-sub { font-size: .72rem; color: var(--muted); display: flex; justify-content: space-between; gap: 8px; }
        .zk-dot { display: inline-block; width: 9px; height: 9px; border-radius: 50%; }
        .zk-tage { display: flex; gap: 5px; margin-top: 6px; }
        .zk-tag { display: flex; flex-direction: column; align-items: center; gap: 2px; font-size: .62rem; color: var(--muted); }
        .zk-bar { width: 12px; height: 26px; background: var(--surface-2); border-radius: 3px; display: flex; flex-direction: column-reverse; overflow: hidden; }
        .zk-bar > div { width: 100%; border-radius: 3px 3px 0 0; }
        .zk-list { margin-top: 12px; padding-top: 10px; border-top: 1px solid var(--border); display: flex; flex-direction: column; gap: 3px; }
      `}</style>
    </div>
  );
}
