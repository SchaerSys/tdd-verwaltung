import Link from "next/link";
import { redirect, notFound } from "next/navigation";
import { asc, eq } from "drizzle-orm";
import { staff, locations } from "@tdd/db";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { hasPermission } from "@/lib/rbac";
import { updateStaff, toggleStaffActive } from "../actions";
import { STAFF_TYPES, STAFF_TYPE_LABEL } from "../types";

export default async function StaffEditPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user || !hasPermission(user.role, "staff:manage")) redirect("/dashboard");
  const { id } = await params;

  const [rows, locs] = await Promise.all([
    db().select().from(staff).where(eq(staff.id, id)).limit(1),
    db().select({ id: locations.id, name: locations.name }).from(locations).where(eq(locations.isActive, true)).orderBy(asc(locations.name)),
  ]);
  const p = rows[0];
  if (!p) notFound();

  return (
    <div>
      <div className="page-h">
        <div>
          <h1>{p.firstName} {p.lastName}</h1>
          <div className="sub">{STAFF_TYPE_LABEL[p.staffType] ?? p.staffType}{p.isActive ? "" : " · inaktiv"}</div>
        </div>
        <div className="flex gap-2">
          <form action={toggleStaffActive}>
            <input type="hidden" name="id" value={p.id} />
            <input type="hidden" name="active" value={p.isActive ? "0" : "1"} />
            <button className="btn ghost" type="submit">{p.isActive ? "Deaktivieren" : "Aktivieren"}</button>
          </form>
          <Link href="/personal" className="btn ghost">← Personal</Link>
        </div>
      </div>

      <form action={updateStaff} className="panel">
        <input type="hidden" name="id" value={p.id} />
        <div className="p-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <div className="field"><label className="lbl">Nachname *</label><input name="lastName" className="inp" required defaultValue={p.lastName} /></div>
          <div className="field"><label className="lbl">Vorname *</label><input name="firstName" className="inp" required defaultValue={p.firstName} /></div>
          <div className="field"><label className="lbl">Art</label>
            <select name="staffType" className="inp" defaultValue={p.staffType}>
              {STAFF_TYPES.map((t) => <option key={t} value={t}>{STAFF_TYPE_LABEL[t]}</option>)}
            </select></div>
          <div className="field"><label className="lbl">E-Mail</label><input name="email" type="email" className="inp" defaultValue={p.email ?? ""} /></div>
          <div className="field"><label className="lbl">Telefon</label><input name="phone" className="inp mono" defaultValue={p.phone ?? ""} /></div>
          <div className="field"><label className="lbl">Standort</label>
            <select name="locationId" className="inp" defaultValue={p.locationId ?? ""}><option value="">— keiner —</option>
              {locs.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}</select></div>
          <div className="field"><label className="lbl">Eintritt</label><input name="employmentStart" type="date" className="inp mono" defaultValue={p.employmentStart ?? ""} /></div>
          <div className="field"><label className="lbl">Austritt</label><input name="employmentEnd" type="date" className="inp mono" defaultValue={p.employmentEnd ?? ""} /></div>
          <div className="field"><label className="lbl">Wochenstunden</label><input name="weeklyHours" className="inp mono" inputMode="decimal" defaultValue={p.weeklyHours ?? ""} /></div>
          <div className="field"><label className="lbl">Urlaub (Werktage/Jahr)</label><input name="vacationDaysYear" className="inp mono" inputMode="decimal" defaultValue={p.vacationDaysYear ?? ""} /></div>
          <div className="field"><label className="lbl">Stempelkarte (NFC-ID)</label><input name="nfcCardId" className="inp mono" defaultValue={p.nfcCardId ?? ""} /></div>
          <div className="field sm:col-span-2 lg:col-span-3"><label className="lbl">Notiz</label><input name="note" className="inp" defaultValue={p.note ?? ""} /></div>
        </div>
        <div className="p-4 border-t border-[color:var(--border)]"><button type="submit" className="btn primary">Speichern</button></div>
      </form>
    </div>
  );
}
