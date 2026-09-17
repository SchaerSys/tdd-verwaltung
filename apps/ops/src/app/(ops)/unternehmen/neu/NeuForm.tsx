"use client";

import { useActionState } from "react";
import { assistentAnlegen, type UnternehmenState } from "../actions";

export function NeuForm() {
  const [state, action, pending] = useActionState<UnternehmenState, FormData>(assistentAnlegen, {});
  const in30 = new Date(Date.now() + 30 * 864e5).toISOString().slice(0, 10);
  return (
    <form action={action} className="grid gap-3 sm:grid-cols-2">
      <label className="text-xs">Name (vollständig)<br /><input name="name" className="inp sm w-full" placeholder="Tischlein deck dich Tirol" required /></label>
      <label className="text-xs">Kurzname für die URL<br /><input name="slug" className="inp sm w-full mono" placeholder="tdd-tirol" pattern="[a-z0-9][a-z0-9-]{1,60}" required /><span className="text-muted">Einstieg ohne eigenen Host: /m/&lt;kurzname&gt;</span></label>
      <label className="text-xs">Kurzname (Drucke, Betreff)<br /><input name="kurzname" className="inp sm w-full" placeholder="TDD Tirol" /></label>
      <label className="text-xs">Ansprechpartner (Verein)<br /><input name="ansprechpartner" className="inp sm w-full" placeholder="Name, Funktion, Telefon" /></label>
      <label className="text-xs">Anschrift (Zeilen)<br /><textarea name="anschrift" className="inp sm w-full" rows={3} placeholder={"Straße 1\nA-6020 Innsbruck"} /></label>
      <div className="grid gap-2">
        <label className="text-xs">Kontakt-E-Mail<br /><input name="kontaktEmail" type="email" className="inp sm w-full mono" /></label>
        <label className="text-xs">Telefon<br /><input name="kontaktTelefon" className="inp sm w-full" /></label>
        <label className="text-xs">Website<br /><input name="website" className="inp sm w-full" placeholder="https://…" /></label>
      </div>
      <label className="text-xs">Plan<br />
        <select name="plan" className="inp sm w-full" defaultValue="TEST"><option value="TEST">Test (befristet)</option><option value="BASIS">Basis</option><option value="PLUS">Plus</option></select></label>
      <label className="text-xs">Testphase bis<br /><input name="testBis" type="date" className="inp sm w-full mono" defaultValue={in30} /><span className="text-muted">nur bei Plan Test; danach automatisch inaktiv</span></label>
      <div className="sm:col-span-2 flex items-center gap-3">
        <button className="btn sm" type="submit" disabled={pending}>{pending ? "Wird angelegt …" : "Anlegen & weiter"}</button>
        {state.error ? <span className="pill bad">{state.error}</span> : null}
      </div>
      <p className="sm:col-span-2 text-xs text-muted">Angelegt werden Mandant, Trägerorganisation, Zeitregeln (AZG-Standard), Löschfristen und Auswahllisten als Kopie von Tischlein deck dich Vorarlberg.</p>
    </form>
  );
}
