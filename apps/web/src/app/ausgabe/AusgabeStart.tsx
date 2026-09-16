"use client";
import { useActionState, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ausgabeStarten, stationKoppelnAction, type StationState } from "./actions";

export interface StartStandort { id: number; name: string; heuteOffen: string | null }
export interface StartPerson { id: string; name: string; typ: string; dienstLoc: number | null }

export function StationKoppeln() {
  const [state, action, pending] = useActionState<StationState, FormData>(stationKoppelnAction, {});
  const router = useRouter();
  useEffect(() => { if (state.ok) router.refresh(); }, [state.ok, router]);
  return (
    <div className="w-full max-w-sm bg-surface border border-border rounded-card p-6 shadow-sm flex flex-col gap-4 mx-auto">
      <div><div className="text-lg font-semibold">Laptop als Ausgabestation koppeln</div><div className="text-sm text-muted">Einmalig. Danach startet die Ausgabe ohne Passwort – Standort wählen, Name antippen, PIN.</div></div>
      <form action={action} className="flex flex-col gap-3">
        <input name="code" inputMode="numeric" autoComplete="one-time-code" className="inp text-center mono" style={{ fontSize: "2rem", letterSpacing: ".3em" }} placeholder="000000" maxLength={7} required autoFocus />
        {state.error ? <div className="text-sm" style={{ color: "var(--bad)" }}>{state.error}</div> : null}
        <button className="btn primary" disabled={pending} style={{ fontSize: "1.1rem", padding: 14 }}>{pending ? "Verbinde…" : "Verbinden"}</button>
      </form>
      <p className="text-[.75rem] text-muted">Den Code erzeugt das Büro unter Stammdaten → Ausgabestation. Er gilt 10 Minuten. Büro-Konten können sich stattdessen <a href="/login">anmelden</a>.</p>
    </div>
  );
}

/** Startseite: Standort wählen, Person antippen, PIN – oder (Büro) nur Standort. */
export function AusgabeStart({ standorte, personen, vorbelegt, modus, name }: { standorte: StartStandort[]; personen: StartPerson[]; vorbelegt: number | null; modus: "STATION" | "BUERO"; name?: string }) {
  const [loc, setLoc] = useState<number | null>(vorbelegt ?? standorte[0]?.id ?? null);
  const [person, setPerson] = useState<StartPerson | null>(null);
  const [state, action, pending] = useActionState<StationState, FormData>(ausgabeStarten, {});
  const sortiert = [...personen].sort((a, b) => Number(b.dienstLoc === loc) - Number(a.dienstLoc === loc) || a.name.localeCompare(b.name));

  return (
    <form action={action} className="flex flex-col gap-5 w-full max-w-3xl mx-auto">
      <input type="hidden" name="locationId" value={loc ?? ""} />
      <section>
        <div className="text-xs uppercase tracking-wide text-muted mb-2">1 · Ausgabestelle</div>
        <div className="grid gap-2" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))" }}>
          {standorte.map((s) => (
            <button type="button" key={s.id} onClick={() => setLoc(s.id)} className="btn" style={{ padding: "14px 10px", justifyContent: "flex-start", flexDirection: "column", alignItems: "flex-start", gap: 2, borderColor: loc === s.id ? "var(--accent)" : undefined, background: loc === s.id ? "var(--accent-bg, var(--surface-2))" : undefined }}>
              <span className="font-semibold">{s.name}</span>
              <span className="text-[.7rem] text-muted">{s.heuteOffen ? `heute ${s.heuteOffen}` : "heute geschlossen"}</span>
            </button>
          ))}
        </div>
      </section>

      {modus === "STATION" ? (
        <section>
          <div className="text-xs uppercase tracking-wide text-muted mb-2">2 · Wer führt die Ausgabe?</div>
          {personen.length === 0 ? <div className="empty">Noch niemand mit Ausgabe-PIN – das Büro vergibt PINs im Personal-Datensatz.</div> : null}
          <div className="grid gap-2" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(170px, 1fr))" }}>
            {sortiert.map((p) => (
              <button type="button" key={p.id} onClick={() => setPerson(p)} className="btn" style={{ padding: "14px 10px", flexDirection: "column", alignItems: "flex-start", gap: 2, borderColor: person?.id === p.id ? "var(--accent)" : undefined, background: person?.id === p.id ? "var(--accent-bg, var(--surface-2))" : undefined }}>
                <span className="font-semibold">{p.name}</span>
                <span className="text-[.7rem] text-muted">{p.dienstLoc === loc && loc ? "heute hier eingeteilt" : p.typ}</span>
              </button>
            ))}
          </div>
          <input type="hidden" name="staffId" value={person?.id ?? ""} />
        </section>
      ) : null}

      <section className="bg-surface border border-border rounded-card p-4 flex flex-col gap-3">
        {modus === "STATION" ? (
          <>
            <div className="text-xs uppercase tracking-wide text-muted">3 · PIN{person ? ` für ${person.name}` : ""}</div>
            <input name="pin" type="password" inputMode="numeric" autoComplete="off" className="inp text-center mono" style={{ fontSize: "1.8rem", letterSpacing: ".4em", maxWidth: 240 }} placeholder="••••" maxLength={8} disabled={!person} required />
          </>
        ) : <div className="text-sm">Angemeldet als <b>{name}</b> – die Ausgabe läuft unter deinem Konto.</div>}
        {state.error ? <div className="text-sm" style={{ color: "var(--bad)" }}>{state.error}</div> : null}
        <button className="btn primary" disabled={pending || !loc || (modus === "STATION" && !person)} style={{ fontSize: "1.15rem", padding: 14 }}>{pending ? "Starte…" : "Ausgabe starten"}</button>
      </section>
    </form>
  );
}
