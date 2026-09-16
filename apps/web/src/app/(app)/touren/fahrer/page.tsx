import Link from "next/link";
import { redirect } from "next/navigation";
import { asc, eq } from "drizzle-orm";
import { staff } from "@tdd/db";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { hasPermission } from "@/lib/rbac";
import { WOCHENTAGE_KURZ } from "@/lib/touren";
import { STAFF_TYPE_LABEL } from "../../personal/types";
import { fahrerAnlegen } from "./actions";

export const dynamic = "force-dynamic";

/**
 * Fahrer:innen fuer die Disposition – ohne Login. Name, Adresse, Telefon reichen;
 * wer gefahren ist, waehlt die Person beim Start am Fahrzeug-Tablet aus dieser Liste.
 */
export default async function FahrerSeite() {
  const user = await getCurrentUser();
  if (!user || !hasPermission(user.role, "tour:manage")) redirect("/dashboard");
  const liste = await db().select().from(staff).where(eq(staff.kannFahren, true)).orderBy(asc(staff.isActive), asc(staff.lastName), asc(staff.firstName));
  const aktiv = liste.filter((f) => f.isActive);

  return (
    <div>
      <div className="page-h">
        <div><h1>Fahrer:innen</h1><div className="sub">{aktiv.length} aktiv · ohne Login – am Tablet wählt man beim Start, wer fährt</div></div>
        <Link href="/touren" className="btn ghost">← Disposition</Link>
      </div>

      <div className="panel mb-4">
        <details>
          <summary className="p-3 cursor-pointer font-semibold text-[.8125rem]">＋ Fahrer:in hinterlegen</summary>
          <form action={fahrerAnlegen} className="p-4 border-t border-[color:var(--border)] grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <div className="field"><label className="lbl">Vorname *</label><input name="firstName" className="inp" required /></div>
            <div className="field"><label className="lbl">Nachname *</label><input name="lastName" className="inp" required /></div>
            <div className="field"><label className="lbl">Telefon</label><input name="phone" className="inp mono" inputMode="tel" /></div>
            <div className="field"><label className="lbl">Art</label><select name="staffType" className="inp" defaultValue="FAHRER"><option value="FAHRER">Fahrer:in (angestellt)</option><option value="EHRENAMT">Ehrenamtlich</option><option value="ZIVILDIENER">Zivildiener</option></select></div>
            <div className="field lg:col-span-2"><label className="lbl">Straße</label><input name="strasse" className="inp" /></div>
            <div className="field"><label className="lbl">PLZ</label><input name="plz" className="inp mono" /></div>
            <div className="field"><label className="lbl">Ort</label><input name="ort" className="inp" /></div>
            <div className="field"><label className="lbl">Führerschein</label><input name="fuehrerschein" className="inp" placeholder="B" /></div>
            <div className="field lg:col-span-2"><label className="lbl">Fahrertage (leer = alle)</label>
              <div className="flex gap-2 flex-wrap mt-2 text-[.8125rem]">{[1, 2, 3, 4, 5, 6, 7].map((t) => <label key={t} className="flex items-center gap-1"><input type="checkbox" name="fahrerTage" value={t} />{WOCHENTAGE_KURZ[t]}</label>)}</div></div>
            <div className="field justify-end"><button className="btn primary" type="submit">Hinterlegen</button></div>
          </form>
        </details>
      </div>

      <div className="panel">
        <div className="twrap"><table className="data">
          <thead><tr><th>Name</th><th>Art</th><th>Telefon</th><th>Adresse</th><th>Führerschein</th><th>Fahrertage</th><th>Ortung</th><th>Login</th><th></th></tr></thead>
          <tbody>{liste.map((f) => (
            <tr key={f.id} style={f.isActive ? undefined : { opacity: .55 }}>
              <td><Link href={`/personal/${f.id}`} className="font-semibold hover:underline">{f.lastName} {f.firstName}</Link>{!f.isActive ? <span className="pill muted" style={{ marginLeft: 6 }}>inaktiv</span> : null}</td>
              <td className="text-xs">{STAFF_TYPE_LABEL[f.staffType] ?? f.staffType}</td>
              <td className="mono text-xs">{f.phone ?? "—"}</td>
              <td className="text-xs">{[f.strasse, [f.plz, f.ort].filter(Boolean).join(" ")].filter(Boolean).join(", ") || "—"}</td>
              <td className="mono text-xs">{f.fuehrerschein ?? "—"}</td>
              <td className="mono text-xs">{f.fahrerTage.length ? f.fahrerTage.map((t) => WOCHENTAGE_KURZ[t]).join(" ") : "alle"}</td>
              <td className="text-xs">{f.ortungZustimmungAm ? <span className="pill good" title={`Zustimmung vom ${f.ortungZustimmungAm}`}>📍 ja</span> : <span className="pill muted" title="Ohne Zustimmung keine Ortung – im Personal-Datensatz eintragen">nein</span>}</td>
              <td className="text-xs">{f.userId ? <span className="pill muted">ja</span> : <span className="text-muted">nein (nicht nötig)</span>}</td>
              <td><Link href={`/personal/${f.id}`} className="btn ghost sm">Bearbeiten →</Link></td>
            </tr>
          ))}
          {liste.length === 0 ? <tr><td colSpan={9}><div className="empty">Noch niemand hinterlegt. Oben „Fahrer:in hinterlegen“ – Name und Telefon genügen.</div></td></tr> : null}
          </tbody>
        </table></div>
        <div className="p-3 text-[.72rem] text-muted">Alle Personen aus dem Personal-Verzeichnis mit „fährt Touren“ erscheinen hier. Zeiterfassung und Urlaub sind für Fahrer:innen optional – die Felder stehen im Personal-Datensatz.</div>
      </div>
    </div>
  );
}
