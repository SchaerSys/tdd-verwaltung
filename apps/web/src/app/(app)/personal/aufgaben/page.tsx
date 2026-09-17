import { redirect } from "next/navigation";
import { alias } from "drizzle-orm/pg-core";
import { asc, desc, eq, isNotNull, isNull } from "drizzle-orm";
import { aufgaben, staff } from "@tdd/db";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { hasPermission } from "@/lib/rbac";
import { fmtDate, fmtDateTime } from "@/lib/format";
import { ConfirmButton } from "@/components/ConfirmButton";
import { aufgabeAnlegen, aufgabeLoeschen, aufgabeWiederOeffnen } from "./actions";

export const dynamic = "force-dynamic";

/** Aufgaben fuer Mitarbeitende (myTafelwerk): anlegen, Stand sehen, wieder oeffnen. */
export default async function AufgabenSeite() {
  const user = await getCurrentUser();
  if (!user || !hasPermission(user.role, "staff:manage")) redirect("/dashboard");
  const wer = alias(staff, "wer"); const erl = alias(staff, "erl");
  const basis = () => db().select({ a: aufgaben, wer: wer.firstName, werN: wer.lastName, erl: erl.firstName, erlN: erl.lastName }).from(aufgaben)
    .leftJoin(wer, eq(aufgaben.staffId, wer.id)).leftJoin(erl, eq(aufgaben.erledigtVon, erl.id));
  const [offen, erledigt, leute] = await Promise.all([
    basis().where(isNull(aufgaben.erledigtAm)).orderBy(asc(aufgaben.faelligAm), desc(aufgaben.createdAt)),
    basis().where(isNotNull(aufgaben.erledigtAm)).orderBy(desc(aufgaben.erledigtAm)).limit(30),
    db().select({ id: staff.id, first: staff.firstName, last: staff.lastName }).from(staff).where(eq(staff.isActive, true)).orderBy(asc(staff.lastName)),
  ]);
  const heute = new Date().toISOString().slice(0, 10);
  const name = (f: string | null, l: string | null) => (f || l ? `${f ?? ""} ${l ?? ""}`.trim() : "alle");
  return (
    <div>
      <div className="page-h"><div><h1>Aufgaben</h1><div className="sub">Arbeiten an Mitarbeitende verteilen – sichtbar in myTafelwerk, mit Benachrichtigung</div></div></div>
      <div className="panel mb-4">
        <div className="panel-h"><h3>Neue Aufgabe</h3></div>
        <form action={aufgabeAnlegen} className="p-4 grid gap-3 sm:grid-cols-4">
          <div className="field sm:col-span-2"><label className="lbl">Titel</label><input name="titel" className="inp" required placeholder="z. B. Kühlschrank Lager reinigen" /></div>
          <div className="field"><label className="lbl">Für</label><select name="staffId" className="inp"><option value="">alle Mitarbeitenden</option>{leute.map((l) => <option key={l.id} value={l.id}>{l.last}, {l.first}</option>)}</select></div>
          <div className="field"><label className="lbl">Fällig bis</label><input type="date" name="faelligAm" className="inp mono" /></div>
          <div className="field sm:col-span-3"><label className="lbl">Beschreibung</label><input name="beschreibung" className="inp" placeholder="optional" /></div>
          <div className="field"><label className="lbl">Priorität</label><select name="prio" className="inp" defaultValue="NORMAL"><option value="NIEDRIG">niedrig</option><option value="NORMAL">normal</option><option value="HOCH">hoch</option></select></div>
          <div className="sm:col-span-4"><button className="btn primary" type="submit">Aufgabe anlegen</button></div>
        </form>
      </div>
      <div className="panel mb-4">
        <div className="panel-h"><h3>Offen</h3><span className="pill muted">{offen.length}</span></div>
        {offen.length === 0 ? <div className="empty">Keine offenen Aufgaben.</div> : (
          <div className="twrap"><table className="data">
            <thead><tr><th>Aufgabe</th><th>Für</th><th>Fällig</th><th>Prio</th><th>Angelegt</th><th></th></tr></thead>
            <tbody>{offen.map(({ a, wer: f, werN: l }) => (
              <tr key={a.id}><td><b>{a.titel}</b>{a.beschreibung ? <div className="text-xs text-muted">{a.beschreibung}</div> : null}</td><td>{name(f, l)}</td>
                <td style={{ color: a.faelligAm && a.faelligAm < heute ? "var(--bad)" : undefined }}>{a.faelligAm ? fmtDate(a.faelligAm) : "—"}</td>
                <td>{a.prio === "HOCH" ? <span className="pill bad">hoch</span> : a.prio === "NIEDRIG" ? <span className="pill muted">niedrig</span> : "normal"}</td>
                <td className="text-xs">{fmtDateTime(a.createdAt)}</td>
                <td><form action={aufgabeLoeschen}><input type="hidden" name="id" value={a.id} /><ConfirmButton className="btn ghost sm" message="Aufgabe löschen?">Löschen</ConfirmButton></form></td></tr>
            ))}</tbody>
          </table></div>
        )}
      </div>
      <div className="panel">
        <div className="panel-h"><h3>Erledigt</h3><span className="text-xs text-muted">letzte 30</span></div>
        {erledigt.length === 0 ? <div className="empty">Noch nichts erledigt.</div> : (
          <div className="twrap"><table className="data">
            <thead><tr><th>Aufgabe</th><th>Für</th><th>Erledigt von</th><th>Am</th><th></th></tr></thead>
            <tbody>{erledigt.map(({ a, wer: f, werN: l, erl: ef, erlN: el }) => (
              <tr key={a.id}><td>{a.titel}</td><td>{name(f, l)}</td><td>{name(ef, el)}</td><td className="text-xs">{fmtDateTime(a.erledigtAm)}</td>
                <td><form action={aufgabeWiederOeffnen}><input type="hidden" name="id" value={a.id} /><button className="btn ghost sm" type="submit">Wieder öffnen</button></form></td></tr>
            ))}</tbody>
          </table></div>
        )}
      </div>
    </div>
  );
}
