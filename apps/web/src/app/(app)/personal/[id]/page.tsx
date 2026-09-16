import Link from "next/link";
import { NfcZuweisen } from "../NfcZuweisen";
import { redirect, notFound } from "next/navigation";
import { asc, eq } from "drizzle-orm";
import { staff, locations, users } from "@tdd/db";
import { WOCHENTAGE_KURZ } from "@/lib/touren";
import { verteilungSpeichern } from "../../zeit/azg-actions";
import { urlaubStammdaten } from "../../abwesenheiten/actions";
import { sollJeWochentag, type Verteilung } from "@/lib/azg";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { hasPermission } from "@/lib/rbac";
import { updateStaff, toggleStaffActive } from "../actions";
import { STAFF_TYPES, STAFF_TYPE_LABEL } from "../types";

export default async function StaffEditPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user || !hasPermission(user.role, "staff:manage")) redirect("/dashboard");
  const { id } = await params;

  const [rows, locs, fahrerLogins] = await Promise.all([
    db().select().from(staff).where(eq(staff.id, id)).limit(1),
    db().select({ id: locations.id, name: locations.name }).from(locations).where(eq(locations.isActive, true)).orderBy(asc(locations.name)),
    db().select({ id: users.id, name: users.displayName, email: users.email }).from(users).where(eq(users.role, "FAHRER")).orderBy(asc(users.displayName)),
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
          <a href={`/druck/zeit?staff=${p.id}`} className="btn ghost">🖨 Monatsübersicht</a>
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
          <div className="field">
            <label className="lbl" htmlFor="nfcCardId">Stempelkarte (NFC-Kennung)</label>
            <input id="nfcCardId" name="nfcCardId" className="inp mono" defaultValue={p.nfcCardId ?? ""} placeholder="z. B. 04A32B1C5D6E80" />
            <div className="mt-1"><NfcZuweisen feldId="nfcCardId" /></div>
          </div>
          <div className="field sm:col-span-2 lg:col-span-3"><label className="lbl">Notiz</label><input name="note" className="inp" defaultValue={p.note ?? ""} /></div>
          <div className="sm:col-span-2 lg:col-span-3 border-t border-[color:var(--border)] pt-3 text-[.8125rem] font-semibold">Fahrdienst (A4 Touren)</div>
          <div className="field"><label className="lbl">Fährt Touren</label>
            {p.staffType === "FAHRER"
              ? <div className="mt-2 text-[.8125rem]"><span className="pill good"><span className="dot" />ja – Fahrer:in</span> <span className="text-muted">fest, weil als Fahrer:in geführt</span><input type="hidden" name="kannFahren" value="on" /></div>
              : <label className="flex items-center gap-2 text-[.8125rem] mt-2"><input type="checkbox" name="kannFahren" defaultChecked={p.kannFahren} /> kann zusätzlich als Fahrer:in eingeteilt werden</label>}
          </div>
          <div className="field"><label className="lbl">Führerschein</label><input name="fuehrerschein" className="inp" defaultValue={p.fuehrerschein ?? ""} placeholder="z. B. B, C1" /></div>
          <div className="field"><label className="lbl">Straße</label><input name="strasse" className="inp" defaultValue={p.strasse ?? ""} /></div>
          <div className="field"><label className="lbl">PLZ / Ort</label><div className="flex gap-1"><input name="plz" className="inp mono" defaultValue={p.plz ?? ""} style={{ width: 80 }} /><input name="ort" className="inp" defaultValue={p.ort ?? ""} /></div></div>
          <div className="field"><label className="lbl">Fahrertage (leer = alle)</label>
            <div className="flex gap-2 flex-wrap mt-2 text-[.8125rem]">{[1, 2, 3, 4, 5, 6, 7].map((t) => <label key={t} className="flex items-center gap-1"><input type="checkbox" name="fahrerTage" value={t} defaultChecked={p.fahrerTage.includes(t)} />{WOCHENTAGE_KURZ[t]}</label>)}</div></div>
          <div className="field sm:col-span-2"><label className="lbl">Login (optional – Touren laufen über das Fahrzeug-Tablet, kein Login nötig)</label>
            <select name="userId" className="inp" defaultValue={p.userId ?? ""}><option value="">— kein Login —</option>{fahrerLogins.map((u) => <option key={u.id} value={u.id}>{u.name} · {u.email}</option>)}</select>
            <div className="text-[.72rem] text-muted mt-1">Benutzer mit Rolle FAHRER werden in der Benutzerverwaltung angelegt; hier wird die Person verknüpft.</div></div>
        </div>
        <div className="p-4 border-t border-[color:var(--border)]"><button type="submit" className="btn primary">Speichern</button></div>
      </form>

      {/* Arbeitszeit: fixe Wochenverteilung (Teilzeit § 19c AZG) – Soll je Tag statt Wochenstunden ÷ 5 */}
      <form action={verteilungSpeichern} className="panel mt-4">
        <input type="hidden" name="staffId" value={p.id} />
        <div className="panel-h"><h3>Arbeitszeit – Wochenverteilung &amp; Zeitkonto</h3><span className="text-xs text-muted">Soll je Wochentag in Stunden; Summe ergibt die Wochenstunden</span></div>
        <div className="p-4 grid gap-3" style={{ gridTemplateColumns: "repeat(7, minmax(60px, 1fr))" }}>
          {[1, 2, 3, 4, 5, 6, 7].map((t) => { const min = sollJeWochentag((p.sollVerteilung as Verteilung | null) ?? null, p.weeklyHours ? Number(p.weeklyHours) : null)[t] ?? 0; return (
            <div className="field" key={t}><label className="lbl">{WOCHENTAGE_KURZ[t]}</label><input name={`tag${t}`} className="inp mono" inputMode="decimal" defaultValue={min ? String(Math.round((min / 60) * 100) / 100) : ""} placeholder="0" /></div>
          ); })}
        </div>
        <div className="px-4 pb-2 grid gap-3 sm:grid-cols-3">
          <div className="field"><label className="lbl">Zeitkonto ab</label><input name="zeitkontoStart" type="date" className="inp mono" defaultValue={p.zeitkontoStart ?? ""} /><div className="text-[.7rem] text-muted">leer = ab Eintritt</div></div>
          <div className="field"><label className="lbl">Anfangssaldo (h, ± aus der bisherigen Führung)</label><input name="zeitkontoAnfang" className="inp mono" inputMode="decimal" defaultValue={p.zeitkontoAnfangMin ? String(Math.round((p.zeitkontoAnfangMin / 60) * 100) / 100) : ""} placeholder="0" /></div>
        </div>
        <div className="p-4 border-t border-[color:var(--border)] flex gap-2 items-center"><button type="submit" className="btn primary">Verteilung speichern</button><Link href={`/zeit/monat?staff=${p.id}`} className="btn ghost">Monatsauswertung →</Link></div>
      </form>

      {/* Urlaub nach UrlG: Urlaubsjahr, Wochen, Uebertrag aus alter Fuehrung, Vordienstzeiten */}
      <form action={urlaubStammdaten} className="panel mt-4">
        <input type="hidden" name="staffId" value={p.id} />
        <div className="panel-h"><h3>Urlaub – Stammdaten (UrlG)</h3><span className="text-xs text-muted">Anspruch ergibt sich aus Wochen × Arbeitstagen der Verteilung</span></div>
        <div className="p-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <div className="field"><label className="lbl">Urlaubsjahr</label><select name="urlaubsjahr" className="inp" defaultValue={p.urlaubsjahr}><option value="ARBEIT">Arbeitsjahr (ab Eintritt)</option><option value="KALENDER">Kalenderjahr</option></select></div>
          <div className="field"><label className="lbl">Wochen</label><select name="urlaubWochen" className="inp" defaultValue={p.urlaubWochen}><option value="5">5 Wochen</option><option value="6">6 Wochen (ab 25 Dienstjahren)</option></select></div>
          <div className="field"><label className="lbl">Resturlaub aus alter Führung (Tage)</label><input name="urlaubUebertragTage" className="inp mono" inputMode="decimal" defaultValue={Number(p.urlaubUebertragTage) ? String(p.urlaubUebertragTage) : ""} placeholder="0" /></div>
          <div className="field"><label className="lbl">gilt für Urlaubsjahr ab</label><input name="urlaubUebertragAb" type="date" className="inp mono" defaultValue={p.urlaubUebertragAb ?? ""} /></div>
          <div className="field"><label className="lbl">Vordienstzeiten (Jahre)</label><input name="dienstjahreAnrechnung" className="inp mono" inputMode="decimal" defaultValue={Number(p.dienstjahreAnrechnung) ? String(p.dienstjahreAnrechnung) : ""} placeholder="0" /></div>
        </div>
        <div className="p-4 border-t border-[color:var(--border)] flex gap-2 items-center"><button type="submit" className="btn primary">Urlaubsdaten speichern</button><Link href={`/abwesenheiten/konto?staff=${p.id}`} className="btn ghost">Urlaubskonto →</Link>{!p.employmentStart ? <span className="text-xs" style={{ color: "var(--warn)" }}>Eintrittsdatum fehlt – ohne Eintritt kein Urlaubsjahr.</span> : null}</div>
      </form>
    </div>
  );
}
