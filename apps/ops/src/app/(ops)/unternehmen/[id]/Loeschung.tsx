"use client";

import { useActionState } from "react";
import { loeschungAbbrechen, loeschungAusfuehren, loeschungBeantragen, loeschungFreigeben, type UnternehmenState } from "../actions";

export interface LoeschStand { id: string; slug: string; beantragtAm: string | null; beantragtVon: string | null; freigegebenAm: string | null; freigegebenVon: string | null; ich: string }

/** Zwei-Personen-Regel: Antrag → Freigabe (andere Person oder 7 Tage) → Ausfuehrung fruehestens 7 Tage nach dem Antrag. */
export function Loeschung({ s }: { s: LoeschStand }) {
  const [state, action, pending] = useActionState<UnternehmenState, FormData>(loeschungAusfuehren, {});
  const beantragt = !!s.beantragtAm;
  const tageSeitAntrag = s.beantragtAm ? Math.floor((Date.now() - new Date(s.beantragtAm).getTime()) / 864e5) : 0;
  const wartezeitVorbei = tageSeitAntrag >= 7;
  const darfFreigeben = beantragt && !s.freigegebenAm && (s.beantragtVon !== s.ich || wartezeitVorbei);
  const darfLoeschen = beantragt && !!s.freigegebenAm && wartezeitVorbei;
  return (
    <div className="flex flex-col gap-3">
      {!beantragt ? (
        <form action={loeschungBeantragen} className="flex gap-2 items-end flex-wrap" onSubmit={(e) => { if (!confirm("Löschung beantragen? Der Mandant wird sofort deaktiviert; gelöscht wird frühestens nach 7 Tagen und nach Freigabe.")) e.preventDefault(); }}>
          <input type="hidden" name="id" value={s.id} />
          <label className="text-xs">Zur Bestätigung Kurzname eingeben<br /><input name="bestaetigung" className="inp sm mono" placeholder={s.slug} required /></label>
          <button className="btn danger sm" type="submit">Löschung beantragen</button>
          <span className="text-xs text-muted basis-full">Antrag deaktiviert den Mandanten (kein Login, keine Jobs). Freigabe durch eine zweite Super-Admin-Person oder nach 7 Tagen; endgültiges Löschen frühestens 7 Tage nach dem Antrag. Bis dahin jederzeit abbrechbar.</span>
        </form>
      ) : (
        <>
          <div className="text-sm">
            <div>Beantragt am <b>{new Date(s.beantragtAm!).toLocaleString("de-AT")}</b> von <span className="mono">{s.beantragtVon}</span> · {tageSeitAntrag} Tag(e) her</div>
            <div>Freigabe: {s.freigegebenAm ? <>am <b>{new Date(s.freigegebenAm).toLocaleString("de-AT")}</b> von <span className="mono">{s.freigegebenVon}</span></> : <span className="pill warn">offen</span>}</div>
          </div>
          <div className="flex gap-2 flex-wrap">
            {darfFreigeben ? <form action={loeschungFreigeben}><input type="hidden" name="id" value={s.id} /><button className="btn sm" type="submit">Löschung freigeben</button></form> : null}
            {beantragt && !s.freigegebenAm && !darfFreigeben ? <span className="text-xs text-muted">Freigabe nur durch eine andere Person oder ab {new Date(new Date(s.beantragtAm!).getTime() + 7 * 864e5).toLocaleDateString("de-AT")}.</span> : null}
            <form action={loeschungAbbrechen}><input type="hidden" name="id" value={s.id} /><button className="btn ghost sm" type="submit">Abbrechen (Mandant bleibt, wieder aktivierbar)</button></form>
          </div>
          {s.freigegebenAm ? (
            <form action={action} onSubmit={(e) => { if (!confirm("ENDGÜLTIG löschen? Alle Personen, Karten, Ausgaben, Personal, Touren und Benutzer dieses Mandanten werden unwiderruflich entfernt.")) e.preventDefault(); }}>
              <input type="hidden" name="id" value={s.id} />
              <button className="btn danger sm" type="submit" disabled={!darfLoeschen || pending}>{pending ? "Löscht …" : darfLoeschen ? "Jetzt endgültig löschen" : `Endgültig löschen ab ${new Date(new Date(s.beantragtAm!).getTime() + 7 * 864e5).toLocaleDateString("de-AT")}`}</button>
              {state.error ? <span className="pill bad" style={{ marginLeft: 8 }}>{state.error}</span> : null}
              {state.info ? <span className="pill good" style={{ marginLeft: 8 }}>{state.info}</span> : null}
            </form>
          ) : null}
        </>
      )}
    </div>
  );
}
