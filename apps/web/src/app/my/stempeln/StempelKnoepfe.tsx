"use client";

import { useState, useTransition } from "react";
import { selbstStempeln } from "../actions";
import { allowedActions, KIND_LABEL, STATUS_LABEL, type EventKind, type Status } from "@/lib/zeit";

/** Grosse Stempel-Knoepfe: nur die im Zustand erlaubten Aktionen. */
export function StempelKnoepfe({ status: start, kompakt = false }: { status: Status; kompakt?: boolean }) {
  const [status, setStatus] = useState<Status>(start);
  const [meldung, setMeldung] = useState<string | null>(null);
  const [pending, startT] = useTransition();
  const farbe: Record<EventKind, string> = { IN: "primary", OUT: "danger", BREAK_START: "", BREAK_END: "" };
  const klick = (k: EventKind) => startT(async () => {
    try {
      const r = await selbstStempeln(k);
      setStatus(r.status);
      setMeldung(r.ok ? `✓ ${KIND_LABEL[k]} um ${new Date().toLocaleTimeString("de-AT", { hour: "2-digit", minute: "2-digit" })}` : (r.error ?? "Fehler"));
    } catch (e) { setMeldung(e instanceof Error ? e.message : "Fehler (offline?)"); }
  });
  return (
    <div className="flex flex-col gap-2">
      {!kompakt ? <div className="text-center"><div className="text-xs text-muted">Aktueller Zustand</div><b className="text-2xl">{STATUS_LABEL[status]}</b></div> : null}
      <div className={`grid gap-2 ${kompakt ? "grid-cols-2" : "grid-cols-1"}`}>
        {allowedActions(status).map((k) => (
          <button key={k} className={`btn ${farbe[k]}`} style={{ padding: kompakt ? 12 : 22, fontSize: kompakt ? "1rem" : "1.25rem" }} disabled={pending} onClick={() => klick(k)}>
            {pending ? "…" : KIND_LABEL[k]}
          </button>
        ))}
      </div>
      {meldung ? <div className="text-sm text-center" style={{ color: meldung.startsWith("✓") ? "var(--good)" : "var(--bad)" }}>{meldung}</div> : null}
    </div>
  );
}
