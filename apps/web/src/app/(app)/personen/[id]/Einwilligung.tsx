"use client";

import { useState } from "react";
import { Unterschrift } from "@/components/Unterschrift";
import { einwilligungErfassen, einwilligungWiderrufen } from "./einwilligung-actions";
import { CONSENT_LABEL } from "@/lib/einwilligung-const";

export interface EinwilligungStand { personId: string; at: string | null; method: string | null; unterschrift: boolean; widerrufAt: string | null; widerrufGrund: string | null }

/** Panel "DSGVO-Einwilligung" in der Personenakte: Stand, Unterschrift ansehen, Widerruf, neu erfassen. */
export function Einwilligung({ s }: { s: EinwilligungStand }) {
  const [modus, setModus] = useState<"" | "neu" | "widerruf">("");
  const gueltig = !!s.at && !s.widerrufAt;
  return (
    <div className="flex flex-col gap-3">
      <div className="text-sm">
        {s.widerrufAt ? <span className="pill bad">WIDERRUFEN am {new Date(s.widerrufAt).toLocaleDateString("de-AT")}{s.widerrufGrund ? ` – ${s.widerrufGrund}` : ""}</span>
          : gueltig ? <span className="pill good">erteilt am {new Date(s.at!).toLocaleDateString("de-AT")}{s.method ? ` · ${CONSENT_LABEL[s.method] ?? s.method}` : ""}</span>
          : <span className="pill warn">nicht dokumentiert</span>}
        {s.unterschrift ? <a href={`/personen/${s.personId}/unterschrift`} target="_blank" className="btn ghost sm" style={{ marginLeft: 8 }}>Unterschrift ansehen</a> : null}
      </div>
      {s.widerrufAt ? <div className="text-xs" style={{ color: "var(--bad)" }}>Nach einem Widerruf ist die Ausgabe am Tresen gesperrt. Entweder neue Einwilligung erfassen oder die Person nach Prüfung löschen (Löschfrist beachten).</div> : null}
      <div className="flex gap-2 flex-wrap">
        <button type="button" className="btn sm" onClick={() => setModus(modus === "neu" ? "" : "neu")}>{gueltig ? "Neu erfassen" : "Einwilligung erfassen"}</button>
        {gueltig ? <button type="button" className="btn ghost sm" onClick={() => setModus(modus === "widerruf" ? "" : "widerruf")}>Widerruf dokumentieren</button> : null}
      </div>
      {modus === "neu" ? (
        <form action={einwilligungErfassen} className="flex flex-col gap-2 border-t border-[color:var(--border)] pt-3">
          <input type="hidden" name="personId" value={s.personId} />
          <label className="text-sm flex items-center gap-2"><input type="radio" name="art" value="UNTERSCHRIFT" defaultChecked /> Unterschrift am Bildschirm</label>
          <Unterschrift />
          <label className="text-sm flex items-center gap-2"><input type="radio" name="art" value="PAPIER" /> liegt auf Papier vor</label>
          <div><button className="btn primary sm" type="submit">Speichern</button></div>
        </form>
      ) : null}
      {modus === "widerruf" ? (
        <form action={einwilligungWiderrufen} className="flex gap-2 items-end flex-wrap border-t border-[color:var(--border)] pt-3" onSubmit={(e) => { if (!confirm("Widerruf dokumentieren? Die Ausgabe am Tresen wird gesperrt.")) e.preventDefault(); }}>
          <input type="hidden" name="personId" value={s.personId} />
          <div className="field flex-1 min-w-[240px]"><label className="lbl">Grund / Hinweis</label><input name="grund" className="inp" placeholder="z. B. schriftlicher Widerruf vom …" /></div>
          <button className="btn danger sm" type="submit">Widerruf speichern</button>
        </form>
      ) : null}
    </div>
  );
}
