"use client";

import Link from "next/link";
import { useActionState } from "react";
import { adminEinladen, hostSpeichern, type UnternehmenState } from "../../actions";

export function HostForm({ id, host, weiter }: { id: string; host: string | null; weiter: string }) {
  const [state, action, pending] = useActionState<UnternehmenState, FormData>(hostSpeichern, {});
  return (
    <form action={action} className="flex gap-2 items-end flex-wrap">
      <input type="hidden" name="id" value={id} />
      <label className="text-xs">Host<br /><input name="host" className="inp sm mono" style={{ width: 300 }} defaultValue={host ?? ""} placeholder="tirol.tafelwerk.at" /></label>
      <button className="btn sm" type="submit" formAction={action}>{pending ? "Prüft …" : "Speichern & DNS prüfen"}</button>
      <button className="btn sm" type="submit" name="weiter" value={weiter} disabled={pending}>Speichern & weiter</button>
      <Link href={weiter} className="btn ghost sm">Ohne eigenen Host weiter</Link>
      {state.error ? <span className="pill bad" style={{ flexBasis: "100%" }}>{state.error}</span> : null}
      {state.info ? <span className="pill good" style={{ flexBasis: "100%" }}>{state.info}</span> : null}
    </form>
  );
}

export function AdminForm({ id }: { id: string }) {
  const [state, action, pending] = useActionState<UnternehmenState, FormData>(adminEinladen, {});
  return (
    <form action={action} className="flex gap-2 items-end flex-wrap">
      <input type="hidden" name="id" value={id} />
      <label className="text-xs">Name<br /><input name="displayName" className="inp sm" style={{ width: 240 }} required /></label>
      <label className="text-xs">E-Mail<br /><input name="email" type="email" className="inp sm mono" style={{ width: 280 }} required /></label>
      <button className="btn sm" type="submit" disabled={pending}>{pending ? "Sendet …" : "Einladen & Willkommens-Mail senden"}</button>
      {state.error ? <span className="pill bad" style={{ flexBasis: "100%" }}>{state.error}</span> : null}
      {state.info ? <span className="pill good" style={{ flexBasis: "100%" }}>{state.info}</span> : null}
      {state.link ? <code className="text-xs" style={{ flexBasis: "100%", wordBreak: "break-all" }}>{state.link}</code> : null}
      {state.info && !state.error ? <Link href={`/unternehmen/${id}`} className="btn primary sm">Fertig – zur Mandantenakte</Link> : null}
    </form>
  );
}
