import { meinKontext } from "@/lib/my";
import { ladeKonten } from "@/lib/abwesenheit-daten";
import { ABW_ART_LABEL } from "@/lib/abwesenheit";
import { heuteIso } from "@/lib/touren";
import { fmtDate } from "@/lib/format";
import { urlaubBeantragen, krankMelden, antragZurueckziehen } from "@/app/(app)/mein/actions";

export const dynamic = "force-dynamic";

export default async function MyAntraege() {
  const k = (await meinKontext())!;
  const heute = heuteIso();
  const konto = (await ladeKonten(heute, k.person!.id))[0];
  const u = konto?.urlaub ?? null;
  const eintraege = [...(konto?.eintraege ?? [])].sort((a, b) => b.von.localeCompare(a.von)).slice(0, 12);
  return (
    <div className="flex flex-col gap-3">
      {u ? (
        <div className="grid grid-cols-3 gap-2">
          <div className="panel p-3 text-center"><div className="text-xs text-muted">Anspruch</div><b>{u.anspruch + u.uebertrag}</b></div>
          <div className="panel p-3 text-center"><div className="text-xs text-muted">Verbraucht</div><b>{u.verbraucht}</b></div>
          <div className="panel p-3 text-center"><div className="text-xs text-muted">Rest</div><b style={{ color: "var(--good)" }}>{u.rest}</b></div>
        </div>
      ) : null}
      <div className="panel">
        <div className="panel-h"><h3>Urlaub / Zeitausgleich beantragen</h3></div>
        <form action={urlaubBeantragen} className="p-3 flex flex-col gap-2">
          <select name="art" className="inp"><option value="URLAUB">Urlaub</option><option value="ZEITAUSGLEICH">Zeitausgleich</option></select>
          <div className="grid grid-cols-2 gap-2"><input type="date" name="von" className="inp mono" min={heute} required /><input type="date" name="bis" className="inp mono" min={heute} /></div>
          <label className="text-sm flex items-center gap-2"><input type="checkbox" name="halbtag" /> halber Tag</label>
          <input name="notiz" className="inp" placeholder="Notiz (optional)" />
          <button className="btn primary" type="submit">Antrag senden</button>
        </form>
      </div>
      <div className="panel">
        <div className="panel-h"><h3>Krank melden</h3></div>
        <form action={krankMelden} className="p-3 flex flex-col gap-2">
          <div className="grid grid-cols-2 gap-2"><input type="date" name="von" className="inp mono" defaultValue={heute} /><input type="date" name="bis" className="inp mono" placeholder="Ende" /></div>
          <input name="notiz" className="inp" placeholder="Hinweis (optional)" />
          <button className="btn" type="submit">Krankmeldung senden</button>
        </form>
      </div>
      <div className="panel">
        <div className="panel-h"><h3>Meine Anträge &amp; Abwesenheiten</h3></div>
        <div className="p-3 text-sm flex flex-col gap-2">
          {eintraege.length ? eintraege.map((e) => (
            <div key={e.id} className="flex items-center justify-between gap-2">
              <div><b>{ABW_ART_LABEL[e.art] ?? e.art}</b> {fmtDate(e.von)}{e.bis !== e.von ? ` – ${fmtDate(e.bis)}` : ""}{e.halbtag ? " (halb)" : ""}<div className="text-xs text-muted">{e.status === "BEANTRAGT" ? "wartet auf Büro" : e.status === "GENEHMIGT" ? "genehmigt" : "abgelehnt"}</div></div>
              {e.status === "BEANTRAGT" ? <form action={antragZurueckziehen}><input type="hidden" name="id" value={e.id} /><button className="btn ghost sm" type="submit">Zurückziehen</button></form> : null}
            </div>
          )) : <span className="text-muted">Noch keine Einträge.</span>}
        </div>
      </div>
    </div>
  );
}
