"use client";

import { useActionState } from "react";
import { demoZuruecksetzen, type UnternehmenState } from "../actions";

export function DemoReset({ id }: { id: string }) {
  const [state, action, pending] = useActionState<UnternehmenState, FormData>(demoZuruecksetzen, {});
  return (
    <form action={action} className="flex items-center gap-3 flex-wrap" onSubmit={(e) => { if (!confirm("Demo-Mandant komplett neu aufbauen? Alle Fachdaten des Demo-Mandanten werden ersetzt (Admin-Konten bleiben).")) e.preventDefault(); }}>
      <input type="hidden" name="id" value={id} />
      <button className="btn sm" type="submit" disabled={pending}>{pending ? "Baut neu auf … (bis 1 Min)" : "↻ Demo zurücksetzen"}</button>
      <span className="text-xs text-muted">20 fiktive Personen, Karten, 8 Wochen Ausgaben, Personal, Zeiten, Dienstplan, Touren, Anträge – Datumsangaben relativ zu heute.</span>
      {state.error ? <span className="pill bad" style={{ flexBasis: "100%" }}>{state.error}</span> : null}
      {state.info ? <span className="pill good" style={{ flexBasis: "100%" }}>{state.info}</span> : null}
    </form>
  );
}
