"use client";

import { useActionState } from "react";
import { betreiberAnlegen, type BetreiberState } from "./actions";

export function NeuerBetreiber() {
  const [state, action, pending] = useActionState<BetreiberState, FormData>(betreiberAnlegen, {});
  return (
    <form action={action} className="flex gap-2 items-end flex-wrap">
      <label className="text-xs">Name<br /><input name="displayName" className="inp sm" style={{ width: 220 }} required /></label>
      <label className="text-xs">E-Mail<br /><input name="email" type="email" className="inp sm mono" style={{ width: 260 }} required /></label>
      <label className="text-xs">Rolle<br /><select name="rolle" className="inp sm" defaultValue="SUPPORT"><option value="SUPPORT">Support</option><option value="SUPER">Super-Admin</option></select></label>
      <button className="btn sm" type="submit" disabled={pending}>{pending ? "Legt an …" : "Anlegen"}</button>
      {state.error ? <span className="pill bad" style={{ flexBasis: "100%" }}>{state.error}</span> : null}
      {state.info ? <span className="pill good" style={{ flexBasis: "100%" }}>{state.info}</span> : null}
      {state.passwort ? <code className="text-base" style={{ flexBasis: "100%" }}>{state.passwort}</code> : null}
      <p className="text-xs text-muted" style={{ flexBasis: "100%" }}>Das Startpasswort wird nur hier einmal angezeigt. Die Person ändert es unter „Konto“ und richtet dort den zweiten Faktor ein.</p>
    </form>
  );
}
