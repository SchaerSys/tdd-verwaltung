"use client";

import { useActionState } from "react";
import { mandantAnlegen, type UnternehmenState } from "./actions";

export function NeuerMandant() {
  const [state, action, pending] = useActionState<UnternehmenState, FormData>(mandantAnlegen, {});
  return (
    <form action={action} className="flex gap-2 items-end flex-wrap">
      <label className="text-xs">Name<br /><input name="name" className="inp sm" style={{ width: 260 }} placeholder="Tischlein deck dich Tirol" required /></label>
      <label className="text-xs">Kurzname<br /><input name="slug" className="inp sm mono" style={{ width: 180 }} placeholder="tdd-tirol" pattern="[a-z0-9][a-z0-9-]{1,60}" required /></label>
      <button className="btn sm" type="submit" disabled={pending}>{pending ? "Wird angelegt …" : "Anlegen"}</button>
      {state.error ? <span className="pill bad" style={{ flexBasis: "100%" }}>{state.error}</span> : null}
      {state.info ? <span className="pill good" style={{ flexBasis: "100%" }}>{state.info}</span> : null}
    </form>
  );
}
