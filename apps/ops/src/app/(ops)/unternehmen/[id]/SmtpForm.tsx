"use client";

import { useActionState } from "react";
import { smtpSpeichern, smtpTest, type UnternehmenState } from "../actions";

export interface SmtpWerte { host: string; port: number; sicherheit: string; benutzer: string | null; absenderEmail: string; absenderName: string | null; antwortAn: string | null }

export function SmtpForm({ id, werte, weiter }: { id: string; werte: SmtpWerte | null; weiter?: string }) {
  const [state, action, pending] = useActionState<UnternehmenState, FormData>(smtpSpeichern, {});
  return (
    <form action={action} className="grid gap-3 sm:grid-cols-2">
      <input type="hidden" name="id" value={id} />
      {weiter ? <input type="hidden" name="weiter" value={weiter} /> : null}
      <label className="text-xs">SMTP-Server (Host)<br /><input name="host" className="inp sm w-full mono" defaultValue={werte?.host ?? ""} placeholder="smtp.world4you.com" required /></label>
      <div className="grid grid-cols-2 gap-2">
        <label className="text-xs">Port<br /><input name="port" className="inp sm w-full mono" defaultValue={werte?.port ?? 587} /></label>
        <label className="text-xs">Verschlüsselung<br />
          <select name="sicherheit" className="inp sm w-full" defaultValue={werte?.sicherheit ?? "STARTTLS"}>
            <option value="STARTTLS">STARTTLS (587)</option><option value="SSL">SSL/TLS (465)</option><option value="KEINE">keine (nur intern)</option>
          </select></label>
      </div>
      <label className="text-xs">Benutzername<br /><input name="benutzer" className="inp sm w-full mono" defaultValue={werte?.benutzer ?? ""} autoComplete="off" /></label>
      <label className="text-xs">Passwort {werte ? <span className="text-muted">(leer lassen = unverändert)</span> : null}<br /><input name="passwort" type="password" className="inp sm w-full mono" autoComplete="new-password" placeholder={werte ? "••••••••" : ""} /></label>
      <label className="text-xs">Absender-Adresse<br /><input name="absenderEmail" type="email" className="inp sm w-full mono" defaultValue={werte?.absenderEmail ?? ""} placeholder="noreply@verein.at" required /></label>
      <label className="text-xs">Absender-Name<br /><input name="absenderName" className="inp sm w-full" defaultValue={werte?.absenderName ?? ""} placeholder="Tischlein deck dich Tirol" /></label>
      <label className="text-xs">Antwort an (optional)<br /><input name="antwortAn" type="email" className="inp sm w-full mono" defaultValue={werte?.antwortAn ?? ""} placeholder="office@verein.at" /></label>
      <div className="sm:col-span-2 flex items-center gap-3 flex-wrap">
        <button className="btn sm" type="submit" disabled={pending}>{pending ? "Speichert …" : weiter ? "Speichern & weiter" : "Speichern"}</button>
        {weiter ? <a href={weiter} className="btn ghost sm">Überspringen (Plattform-SMTP)</a> : null}
        {state.error ? <span className="pill bad">{state.error}</span> : null}
        {state.info ? <span className="pill good">{state.info}</span> : null}
      </div>
      <p className="sm:col-span-2 text-xs text-muted">Das Passwort wird verschlüsselt gespeichert (AES-256-GCM, Schlüssel nur auf dem Server) und nie wieder angezeigt. Viele Anbieter verlangen, dass die Absender-Adresse zum Postfach gehört.</p>
    </form>
  );
}

export function SmtpTest({ id, standard }: { id: string; standard: string }) {
  const [state, action, pending] = useActionState<UnternehmenState, FormData>(smtpTest, {});
  return (
    <form action={action} className="flex gap-2 items-end flex-wrap">
      <input type="hidden" name="id" value={id} />
      <label className="text-xs">Test-Mail an<br /><input name="an" type="email" className="inp sm mono" style={{ width: 280 }} defaultValue={standard} /></label>
      <button className="btn sm" type="submit" disabled={pending}>{pending ? "Sendet …" : "Test-Mail senden"}</button>
      {state.error ? <span className="pill bad" style={{ flexBasis: "100%", whiteSpace: "normal" }}>{state.error}</span> : null}
      {state.info ? <span className="pill good">{state.info}</span> : null}
    </form>
  );
}
