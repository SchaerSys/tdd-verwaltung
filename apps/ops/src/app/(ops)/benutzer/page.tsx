import Link from "next/link";
import { asc, eq } from "drizzle-orm";
import { locations, organizations, users } from "@tdd/db";
import { db } from "@/lib/db";
import { Einladen, PasswortLink } from "./Einladen";
import { aktivSchalten, entsperren, rolleSetzen, zfaZuruecksetzen } from "./actions";

export const dynamic = "force-dynamic";

const ROLLEN = ["ADMIN", "ERFASSUNG", "AUSGABE", "AUSWERTUNG", "SACHBEARBEITER"];
const fmt = (d: Date | null) => (d ? d.toLocaleString("de-AT", { timeZone: "Europe/Vienna", dateStyle: "short", timeStyle: "short" }) : "—");

/**
 * Benutzerverwaltung der Fach-App aus Betreibersicht. Die Rolle sieht nur die
 * freigegebenen Spalten (028): kein Passwort-Hash, kein 2FA-Geheimnis.
 */
export default async function BenutzerSeite() {
  const d = db();
  const [liste, standorte, orgs] = await Promise.all([
    d.select({
      id: users.id, email: users.email, name: users.displayName, role: users.role, isActive: users.isActive, emailVerified: users.emailVerified,
      failed: users.failedAttempts, lockedUntil: users.lockedUntil, lastLogin: users.lastLogin, createdAt: users.createdAt, totp: users.totpEnabled,
      loc: locations.name, org: organizations.name, orgType: organizations.type,
    }).from(users).leftJoin(locations, eq(users.locationId, locations.id)).leftJoin(organizations, eq(users.organizationId, organizations.id))
      .orderBy(asc(users.role), asc(users.email)),
    d.select({ id: locations.id, name: locations.name }).from(locations).where(eq(locations.isActive, true)).orderBy(asc(locations.name)),
    d.select({ id: organizations.id, name: organizations.name, type: organizations.type }).from(organizations).where(eq(organizations.isActive, true)).orderBy(asc(organizations.type), asc(organizations.name)),
  ]);
  const jetzt = new Date();
  const intern = liste.filter((u) => u.role !== "SACHBEARBEITER");
  const portal = liste.filter((u) => u.role === "SACHBEARBEITER");

  const Tabelle = ({ zeilen, mitOrg }: { zeilen: typeof liste; mitOrg: boolean }) => (
    <div className="twrap"><table className="data">
      <thead><tr><th>Benutzer</th><th>Rolle</th><th>{mitOrg ? "Organisation" : "Standort"}</th><th>Status</th><th>Letzter Login</th><th></th></tr></thead>
      <tbody>{zeilen.map((u) => {
        const gesperrt = !!u.lockedUntil && u.lockedUntil > jetzt;
        return (
          <tr key={u.id} style={u.isActive ? undefined : { opacity: .55 }}>
            <td><Link href={`/support/${u.id}`} className="font-semibold hover:underline" title="Support-Sicht">{u.name}</Link><div className="text-xs text-muted mono">{u.email}</div></td>
            <td>
              <form action={rolleSetzen} className="inline-flex gap-1">
                <input type="hidden" name="userId" value={u.id} />
                <select name="role" className="inp sm" defaultValue={u.role} style={{ width: 150 }}>{ROLLEN.map((r) => <option key={r} value={r}>{r}</option>)}</select>
                <button className="btn ghost sm" type="submit">✓</button>
              </form>
            </td>
            <td>{mitOrg ? (u.org ? <><span className="pill muted">{u.orgType === "GEMEINDE" ? "Gemeinde" : "Institution"}</span> {u.org}</> : "—") : (u.loc ?? "—")}</td>
            <td className="flex gap-1 flex-wrap">
              {u.isActive ? <span className="pill good"><span className="dot" />aktiv</span> : <span className="pill bad">deaktiviert</span>}
              {!u.emailVerified ? <span className="pill warn">E-Mail unbestätigt</span> : null}
              {gesperrt ? <span className="pill bad">Login-Sperre bis {fmt(u.lockedUntil)}</span> : u.failed > 0 ? <span className="pill warn">{u.failed} Fehlversuche</span> : null}
              {u.totp ? <span className="pill tag-out">2FA</span> : null}
            </td>
            <td className="mono text-xs">{fmt(u.lastLogin)}</td>
            <td>
              <div className="flex gap-1 flex-wrap justify-end">
                <form action={aktivSchalten}><input type="hidden" name="userId" value={u.id} /><input type="hidden" name="aktiv" value={u.isActive ? "0" : "1"} />
                  <button className={`btn ghost sm ${u.isActive ? "" : ""}`} type="submit">{u.isActive ? "Deaktivieren" : "Aktivieren"}</button></form>
                {gesperrt || u.failed > 0 ? <form action={entsperren}><input type="hidden" name="userId" value={u.id} /><button className="btn ghost sm" type="submit">Sperre aufheben</button></form> : null}
                {u.totp ? <form action={zfaZuruecksetzen}><input type="hidden" name="userId" value={u.id} /><button className="btn ghost sm" type="submit">2FA zurücksetzen</button></form> : null}
                <PasswortLink userId={u.id} />
              </div>
            </td>
          </tr>
        );
      })}
      {zeilen.length === 0 ? <tr><td colSpan={6}><div className="empty">Keine Benutzer.</div></td></tr> : null}
      </tbody>
    </table></div>
  );

  return (
    <div>
      <div className="page-h"><div><h1>Benutzer</h1><div className="sub">{liste.length} Konten · {liste.filter((u) => u.isActive).length} aktiv · {liste.filter((u) => u.totp).length} mit 2FA</div></div></div>

      <div className="panel mb-4">
        <div className="panel-h"><h3>Benutzer einladen</h3></div>
        <Einladen standorte={standorte} organisationen={orgs} />
      </div>

      <div className="panel mb-4">
        <div className="panel-h"><h3>TDD (Büro, Tresen, Auswertung)</h3><span className="pill muted">{intern.length}</span></div>
        <Tabelle zeilen={intern} mitOrg={false} />
      </div>
      <div className="panel">
        <div className="panel-h"><h3>Portal (Gemeinden, Institutionen)</h3><span className="pill muted">{portal.length}</span></div>
        <Tabelle zeilen={portal} mitOrg />
      </div>
    </div>
  );
}
