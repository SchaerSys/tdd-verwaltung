import Link from "next/link";
import { redirect } from "next/navigation";
import { eq, asc, and, ne } from "drizzle-orm";
import { locations, users, organizations } from "@tdd/db";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { hasPermission } from "@/lib/rbac";
import { fmtDateTime } from "@/lib/format";
import { setUserRole, toggleUserActive, resetUserTotp } from "../actions";
import { NeuerBenutzer } from "./NeuerBenutzer";
import { BenutzerBearbeiten } from "./BenutzerBearbeiten";
import { mandant } from "@/lib/mandant";

const ROLE_LABEL: Record<string, string> = {
  ADMIN: "Admin", ERFASSUNG: "Erfassung", AUSGABE: "Kasse", AUSWERTUNG: "Auswertung", FAHRER: "Fahrer", MITARBEITER: "Mitarbeiter:in",
};
const INTERNAL_ROLES: { value: string; label: string; desc: string }[] = [
  { value: "MITARBEITER", label: "Mitarbeiter:in", desc: "nur eigener Bereich: Zeiten, Urlaubskonto, Urlaubsantrag" },
  { value: "AUSGABE", label: "Kasse (Zivildiener)", desc: "nur Tresen-Kiosk" },
  { value: "ERFASSUNG", label: "Erfassung", desc: "Personen/Karten, kein Dokumenteneinblick" },
  { value: "AUSWERTUNG", label: "Auswertung", desc: "nur Auswertungen" },
  { value: "FAHRER", label: "Fahrer", desc: "nur eigene Tour am Handy (A4)" },
  { value: "ADMIN", label: "Admin", desc: "alles inkl. Dokumente & Stammdaten" },
];

export default async function BenutzerPage() {
  const user = await getCurrentUser();
  if (!user || !hasPermission(user.role, "admin:manage")) redirect("/dashboard");

  const d = db();
  const locs = await d.select().from(locations).orderBy(asc(locations.type), asc(locations.name));
  const usrs = await d
    .select({
      id: users.id, email: users.email, username: users.username, displayName: users.displayName,
      role: users.role, isActive: users.isActive, totpEnabled: users.totpEnabled, locName: locations.name, locationId: users.locationId,
      lastLogin: users.lastLogin, deaktiviertGrund: users.deaktiviertGrund, lockedUntil: users.lockedUntil,
    })
    .from(users)
    .leftJoin(locations, eq(users.locationId, locations.id))
    .innerJoin(organizations, eq(users.organizationId, organizations.id))
    // Nur die eigenen Konten: Gemeinden/Institutionen verwaltet ausschliesslich der Betreiber (Wartungsplattform).
    .where(and(eq(organizations.type, "TDD"), ne(users.role, "SACHBEARBEITER"), ne(users.email, "ausgabestation@tdd.intern"))) // technisches Stationskonto nicht listen
    .orderBy(asc(users.displayName));

  return (
    <div>
      <div className="page-h">
        <div>
          <h1>Benutzerverwaltung</h1>
          <div className="sub">Konten von {(await mandant()).kurzname} – Gemeinden und Institutionen verwaltet der Betreiber</div>
        </div>
        <Link href="/admin" className="btn ghost">← Stammdaten</Link>
      </div>


      {/* Benutzer & Rollen */}
      <div className="panel">
        <div className="panel-h"><h3>Benutzer &amp; Rollen</h3><span className="pill muted">{usrs.length}</span></div>

        <NeuerBenutzer rollen={INTERNAL_ROLES} orte={locs.map((l) => ({ id: l.id, name: l.name }))} />

        <div className="twrap">
          <table className="data">
            <thead><tr><th>Name</th><th>E-Mail</th><th>Rolle ändern</th><th>Standort</th><th>Letzter Login</th><th>Status</th><th></th></tr></thead>
            <tbody>
              {usrs.map((u) => (
                <tr key={u.id}>
                  <td><b>{u.displayName}</b>{u.username ? <div className="text-xs text-muted mono">{u.username}</div> : null}</td>
                  <td className="mono">{u.email}</td>
                  <td>
                    {u.role === "SACHBEARBEITER"
                      ? <span className="pill muted">Portal (Sachbearbeiter)</span>
                      : u.id === user.id
                        ? <span className="pill muted">{ROLE_LABEL[u.role] ?? u.role} (Sie)</span>
                        : (
                          <form action={setUserRole} className="flex gap-1 items-center">
                            <input type="hidden" name="userId" value={u.id} />
                            <select name="role" className="inp" defaultValue={u.role}>
                              {INTERNAL_ROLES.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
                            </select>
                            <button className="btn ghost sm" type="submit">Setzen</button>
                          </form>
                        )}
                  </td>
                  <td>{u.locName ?? "—"}</td>
                  <td className="text-xs"><span className="mono">{u.lastLogin ? fmtDateTime(u.lastLogin) : "nie"}</span> <Link href={`/admin/benutzer/${u.id}/verlauf`} className="text-muted">Verlauf →</Link></td>
                  <td>
                    <div className="flex gap-2 items-center">
                      {u.isActive
                        ? (u.lockedUntil && u.lockedUntil > new Date() ? <span className="pill warn" title="Zu viele Fehlversuche">Aktiv · kurz gesperrt</span> : <span className="pill good"><span className="dot" />Aktiv</span>)
                        : <span className="pill bad">{u.deaktiviertGrund === "AUSTRITT" ? "Gesperrt (Austritt)" : "Gesperrt"}</span>}
                      {u.id !== user.id && u.role !== "SACHBEARBEITER" ? (
                        <form action={toggleUserActive}>
                          <input type="hidden" name="userId" value={u.id} />
                          <input type="hidden" name="active" value={u.isActive ? "0" : "1"} />
                          <button className="btn ghost sm" type="submit">{u.isActive ? "Sperren" : "Aktivieren"}</button>
                        </form>
                      ) : null}
                      {u.totpEnabled ? (
                        u.id !== user.id ? (
                          <form action={resetUserTotp}>
                            <input type="hidden" name="userId" value={u.id} />
                            <button className="btn ghost sm" type="submit" title="Zweiten Faktor zurücksetzen, wenn das Gerät verloren ging">2FA zurücksetzen</button>
                          </form>
                        ) : <span className="pill muted" title="Zweiter Faktor aktiv">2FA</span>
                      ) : null}
                    </div>
                  </td>
                  <td><BenutzerBearbeiten u={{ id: u.id, displayName: u.displayName, email: u.email, username: u.username ?? null, role: u.role, locationId: u.locationId ?? null, isActive: u.isActive }} rollen={INTERNAL_ROLES} orte={locs.map((l) => ({ id: l.id, name: l.name }))} selbst={u.id === user.id} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
