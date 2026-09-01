import Link from "next/link";
import { redirect } from "next/navigation";
import { asc, eq } from "drizzle-orm";
import { staff, locations } from "@tdd/db";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { hasPermission } from "@/lib/rbac";
import { fmtDate } from "@/lib/format";
import { createStaff } from "./actions";
import { STAFF_TYPES, STAFF_TYPE_LABEL } from "./types";

export default async function PersonalPage() {
  const user = await getCurrentUser();
  if (!user || !hasPermission(user.role, "staff:manage")) redirect("/dashboard");

  const [rows, locs] = await Promise.all([
    db().select().from(staff).orderBy(asc(staff.lastName), asc(staff.firstName)),
    db().select({ id: locations.id, name: locations.name }).from(locations).where(eq(locations.isActive, true)).orderBy(asc(locations.name)),
  ]);
  const active = rows.filter((r) => r.isActive);
  const inactive = rows.filter((r) => !r.isActive);

  return (
    <div>
      <div className="page-h">
        <div>
          <h1>Personal <span className="pill muted">A2</span></h1>
          <div className="sub">Mitarbeitende, Zivildiener, Ehrenamtliche &amp; Fahrer:innen · {active.length} aktiv{inactive.length ? ` · ${inactive.length} inaktiv` : ""}</div>
        </div>
      </div>

      {/* Neu anlegen (manuelle Erfassung) */}
      <details className="panel mb-4">
        <summary className="acc-sum"><span className="acc-name">＋ Neue Person anlegen</span></summary>
        <form action={createStaff} className="p-4">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <div className="field"><label className="lbl">Nachname *</label><input name="lastName" className="inp" required /></div>
            <div className="field"><label className="lbl">Vorname *</label><input name="firstName" className="inp" required /></div>
            <div className="field"><label className="lbl">Art</label>
              <select name="staffType" className="inp" defaultValue="ANGESTELLT">
                {STAFF_TYPES.map((t) => <option key={t} value={t}>{STAFF_TYPE_LABEL[t]}</option>)}
              </select></div>
            <div className="field"><label className="lbl">E-Mail</label><input name="email" type="email" className="inp" /></div>
            <div className="field"><label className="lbl">Telefon</label><input name="phone" className="inp mono" /></div>
            <div className="field"><label className="lbl">Standort</label>
              <select name="locationId" className="inp" defaultValue=""><option value="">— keiner —</option>
                {locs.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}</select></div>
            <div className="field"><label className="lbl">Eintritt</label><input name="employmentStart" type="date" className="inp mono" /></div>
            <div className="field"><label className="lbl">Austritt</label><input name="employmentEnd" type="date" className="inp mono" /></div>
            <div className="field"><label className="lbl">Wochenstunden</label><input name="weeklyHours" className="inp mono" inputMode="decimal" placeholder="z. B. 38.5" /></div>
            <div className="field"><label className="lbl">Urlaub (Werktage/Jahr)</label><input name="vacationDaysYear" className="inp mono" inputMode="decimal" placeholder="z. B. 30" /></div>
            <div className="field"><label className="lbl">Stempelkarte (NFC-ID)</label><input name="nfcCardId" className="inp mono" placeholder="optional" /></div>
            <div className="field sm:col-span-2 lg:col-span-3"><label className="lbl">Notiz</label><input name="note" className="inp" /></div>
          </div>
          <div className="mt-3"><button type="submit" className="btn primary">Anlegen</button></div>
        </form>
      </details>

      <div className="panel">
        <div className="panel-h"><h3>Personal</h3><span className="pill muted">{rows.length}</span></div>
        <div className="twrap">
          <table className="data">
            <thead><tr><th>Name</th><th>Art</th><th>Standort</th><th>Eintritt</th><th>Std/Wo.</th><th>Status</th><th></th></tr></thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} style={r.isActive ? undefined : { opacity: .55 }}>
                  <td><b>{r.lastName}, {r.firstName}</b></td>
                  <td><span className="pill muted">{STAFF_TYPE_LABEL[r.staffType] ?? r.staffType}</span></td>
                  <td>{locs.find((l) => l.id === r.locationId)?.name ?? "—"}</td>
                  <td className="mono">{fmtDate(r.employmentStart)}</td>
                  <td className="mono">{r.weeklyHours ?? "—"}</td>
                  <td>{r.isActive ? <span className="pill good"><span className="dot" />Aktiv</span> : <span className="pill bad">Inaktiv</span>}</td>
                  <td><Link href={`/personal/${r.id}`} className="btn ghost sm">Öffnen →</Link></td>
                </tr>
              ))}
              {rows.length === 0 ? <tr><td colSpan={7}><div className="empty">Noch kein Personal erfasst. Über „＋ Neue Person anlegen" beginnen (manuelle Erfassung).</div></td></tr> : null}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
