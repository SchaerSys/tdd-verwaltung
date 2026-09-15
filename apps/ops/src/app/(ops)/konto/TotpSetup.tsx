"use client";
import { useActionState, useState } from "react";
import { startTotpSetup, confirmTotp, disableTotp, type TotpSetup as Setup, type TotpState } from "./actions";

export function TotpSetup({ enabled }: { enabled: boolean }) {
  const [setup, setSetup] = useState<Setup | null>(null);
  const [fehler, setFehler] = useState<string | null>(null);
  const [confirmState, confirmAction, confirmPending] = useActionState<TotpState, FormData>(confirmTotp, { ok: false });
  const [disableState, disableAction, disablePending] = useActionState<TotpState, FormData>(disableTotp, { ok: false });

  const starten = async () => {
    setFehler(null);
    const r = await startTotpSetup();
    if ("error" in r) setFehler(r.error);
    else setSetup(r);
  };

  // Nach erfolgreicher Bestaetigung: Wiederherstellungscodes, genau einmal.
  if (confirmState.ok && confirmState.recoveryCodes) {
    return (
      <div className="flex flex-col gap-3">
        <div className="text-sm text-[color:var(--good)] font-semibold">Zweiter Faktor ist aktiv.</div>
        <p className="text-sm">
          Diese zehn Wiederherstellungscodes gelten je einmal, falls die App nicht erreichbar ist.
          <b> Sie werden nur jetzt angezeigt.</b> Ausdrucken und sicher verwahren.
        </p>
        <pre className="text-sm p-3 border border-border rounded bg-surface-2 select-all" style={{ columns: 2 }}>
          {confirmState.recoveryCodes.join("\n")}
        </pre>
        <button type="button" className="btn ghost sm" onClick={() => window.print()}>🖨 Drucken</button>
      </div>
    );
  }

  if (enabled && !disableState.ok) {
    return (
      <form action={disableAction} className="flex flex-col gap-3">
        <div className="text-sm"><span className="pill good"><span className="dot" />Aktiv</span> Jede Anmeldung verlangt zusätzlich den Code aus der App.</div>
        <div className="text-xs text-muted">Zum Abschalten den aktuellen Code eingeben.</div>
        <div className="flex gap-2">
          <input name="code" inputMode="numeric" autoComplete="one-time-code" className="inp" placeholder="000000" maxLength={7} required style={{ maxWidth: 140 }} />
          <button className="btn ghost" disabled={disablePending}>Abschalten</button>
        </div>
        {disableState.error ? <div className="text-sm text-[color:var(--bad)]">{disableState.error}</div> : null}
      </form>
    );
  }

  if (disableState.ok) {
    return (
      <div className="text-sm">
        Zweiter Faktor abgeschaltet.{" "}
        <button type="button" className="text-accent hover:underline" onClick={() => void starten()}>Neu einrichten</button>
      </div>
    );
  }

  if (!setup) {
    return (
      <div className="flex flex-col gap-3">
        <p className="text-sm">
          Zusätzlich zum Passwort wird bei jeder Anmeldung ein sechsstelliger Code aus einer
          Authenticator-App verlangt (z. B. Aegis, FreeOTP, Google Authenticator). Empfohlen für alle Admin-Konten.
        </p>
        <button type="button" className="btn primary" style={{ alignSelf: "start" }} onClick={() => void starten()}>Einrichten</button>
        {fehler ? <div className="text-sm text-[color:var(--bad)]">{fehler}</div> : null}
      </div>
    );
  }

  return (
    <form action={confirmAction} className="flex flex-col gap-3">
      <ol className="text-sm list-decimal pl-5 flex flex-col gap-1">
        <li>Authenticator-App öffnen und den QR-Code scannen.</li>
        <li>Den angezeigten sechsstelligen Code hier eingeben.</li>
      </ol>
      <div className="flex gap-4 items-start flex-wrap">
        <img src={setup.qrDataUrl} alt="QR-Code fuer die Authenticator-App" width={220} height={220} className="bg-white p-2 rounded border border-border" />
        <div className="text-xs text-muted flex flex-col gap-1" style={{ maxWidth: 260 }}>
          <div>Falls Scannen nicht geht, Schlüssel von Hand eingeben:</div>
          <code className="select-all break-all text-[13px]">{setup.secret.replace(/(.{4})/g, "$1 ").trim()}</code>
        </div>
      </div>
      <div className="flex gap-2">
        <input name="code" autoFocus inputMode="numeric" autoComplete="one-time-code" className="inp" placeholder="000000" maxLength={7} required style={{ maxWidth: 140 }} />
        <button className="btn primary" disabled={confirmPending}>{confirmPending ? "Prüfe…" : "Bestätigen"}</button>
      </div>
      {confirmState.error ? <div className="text-sm text-[color:var(--bad)]">{confirmState.error}</div> : null}
    </form>
  );
}
