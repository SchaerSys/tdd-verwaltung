"use client";
import { useActionState } from "react";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { tabletKoppeln, type KoppelnState } from "./actions";

export function KoppelnForm() {
  const [state, action, pending] = useActionState<KoppelnState, FormData>(tabletKoppeln, {});
  const router = useRouter();
  useEffect(() => { if (state.ok) router.refresh(); }, [state.ok, router]);
  return (
    <div className="w-full max-w-sm bg-surface border border-border rounded-card p-6 shadow-sm flex flex-col gap-4 mx-auto">
      <div><div className="text-lg font-semibold">Tablet mit Fahrzeug verbinden</div><div className="text-sm text-muted">Einmalig – danach zeigt dieses Tablet immer die Touren seines Fahrzeugs.</div></div>
      <form action={action} className="flex flex-col gap-3">
        <input name="code" inputMode="numeric" autoComplete="one-time-code" className="inp text-center mono" style={{ fontSize: "2rem", letterSpacing: ".3em" }} placeholder="000000" maxLength={7} required autoFocus />
        {state.error ? <div className="text-sm" style={{ color: "var(--bad)" }}>{state.error}</div> : null}
        <button className="btn primary" disabled={pending} style={{ fontSize: "1.1rem", padding: 14 }}>{pending ? "Verbinde…" : "Verbinden"}</button>
      </form>
      <p className="text-[.75rem] text-muted">Den Code erzeugt das Büro in der Disposition unter „Fahrzeuge → Tablet koppeln“. Er gilt 10 Minuten.</p>
    </div>
  );
}
