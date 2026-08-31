import Link from "next/link";
import { redirect } from "next/navigation";
import { eq, asc, and } from "drizzle-orm";
import { locations, users, organizations } from "@tdd/db";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { hasPermission } from "@/lib/rbac";
import { approveUser, rejectUser, createUser, setUserRole, toggleUserActive } from "../actions";

const ROLE_LABEL: Record<string, string> = {
  ADMIN: "Admin", ERFASSUNG: "Erfassung", AUSGABE: "Kasse", AUSWERTUNG: "Auswertung",
};
const INTERNAL_ROLES: { value: string; label: string; desc: string }[] = [
  { value: "AUSGABE", label: "Kasse (Zivildiener)", desc: "nur Tresen-Kiosk" },
  { value: "ERFASSUNG", label: "Erfassung", desc: "Personen/Karten, kein Dokumenteneinblick" },
  { value: "AUSWERTUNG", label: "Auswertung", desc: "nur Auswertungen" },
  { value: "ADMIN", label: "Admin", desc: "alles inkl. Dokumente & Stammdaten" },
];

export default async function BenutzerPage() {
  const user = await getCurrentUser();
  if (!user || !hasPermission(user.role, "admin:manage")) redirect("/dashboard");

  const d = db();
  const locs = await d.select().from(locations).orderBy(asc(locations.type), asc(locations.name));
  const usrs = await d
    .select({
      id: users.id, email: users.email, displayName: users.displayName,
      role: users.role, isActive: users.isActive, locName: locations.name,
    })
    .from(users)
    .leftJoin(locations, eq(users.locationId, locations.id))
    .orderBy(asc(users.displayName));
  const pending = await d.select({ id: users.id, name: users.displayName, email: users.email, orgName: organizations.name, orgType: organizations.type })
    .from(users).leftJoin(organizations, eq(users.organizationId, organizations.id))
    .where(and(eq(users.role, "SACHBEARBEITER"), eq(users.emailVerified, true), eq(users.isActive, false)))
    .orderBy(asc(users.displayName));

  return (
    <div>
      <div className="page-h">
        <div>
          <h1>Benutzerverwaltung</h1>
          <div className="sub">Benutzer anlegen, Rollen &amp; Freigaben</div>
        </div>
        <Link href="/admin" className="btn ghost">← Stammdaten</Link>
      </div>

      {/* Registrierungen zur Freigabe */}
      {pending.length > 0 ? (
        <div className="panel mb-4" style={{ borderColor: "var(--warn)" }}>
          <div className="panel-h" style={{ background: "var(--warn-bg)" }}><h3 style={{ color: "var(--warn)" }}>Registrierungen zur Freigabe</h3><span className="pill warn">{pending.length}</span></div>
          <div className="twrap"><table className="data">
            <thead><tr><th>Name</th><th>E-Mail</th><th>Organisation</th><th></th></tr></thead>
            <tbody>
              {pending.map((u) => (
                <tr key={u.id}>
                  <td><b>{u.name}</b></td>
                  <td className="mono">{u.email}</td>
                  <td>{u.orgName ? <span className="pill muted">{u.orgType === "GEMEINDE" ? "Gemeinde" : "Institution"}: {u.orgName}</span> : "—"}</td>
                  <td>
                    <div className="flex gap-1 justify-end">
                      <form action={approveUser}><input type="hidden" name="userId" value={u.id} /><button className="btn primary sm" type="submit">Freigeben</button></form>
                      <form action={rejectUser}><input type="hidden" name="userId" value={u.id} /><button className="btn ghost sm" type="submit">Ablehnen</button></form>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table></div>
        </div>
      ) : null}

      {/* Benutzer & Rollen */}
      <div className="panel">
        <div className="panel-h"><h3>Benutzer &amp; Rollen</h3><span className="pill muted">{usrs.length}</span></div>

        <form action={createUser} className="p-4 border-b border-[color:var(--border)]">
          <div className="lbl mb-2">Neuen Benutzer anlegen</div>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            <input name="displayName" className="inp" placeholder="Name" required />
            <input name="email" type="email" className="inp" placeholder="E-Mail" required />
            <input name="password" type="text" className="inp mono" placeholder="Passwort (min. 8)" minLength={8} required />
            <select name="role" className="inp" defaultValue="AUSGABE">
              {INTERNAL_ROLES.map((r) => <option key={r.value} value={r.value}>{r.label} – {r.desc}</option>)}
            </select>
            <select name="locationId" className="inp" defaultValue="">
              <option value="">— Standort (optional) —</option>
              {locs.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
            </select>
            <button type="submit" className="btn primary">Anlegen</button>
          </div>
          <div className="sub mt-1">Zivildiener → Rolle „Kasse": sehen ausschließlich den Tresen-Kiosk, keine weiteren Daten.</div>
        </form>

        <div className="twrap">
          <table className="data">
            <thead><tr><th>Name</th><th>E-Mail</th><th>Rolle ändern</th><th>Standort</th><th>Status</th></tr></thead>
            <tbody>
              {usrs.map((u) => (
                <tr key={u.id}>
                  <td><b>{u.displayName}</b></td>
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
                  <td>
                    <div className="flex gap-2 items-center">
                      {u.isActive ? <span className="pill good"><span className="dot" />Aktiv</span> : <span className="pill bad">Gesperrt</span>}
                      {u.id !== user.id && u.role !== "SACHBEARBEITER" ? (
                        <form action={toggleUserActive}>
                          <input type="hidden" name="userId" value={u.id} />
                          <input type="hidden" name="active" value={u.isActive ? "0" : "1"} />
                          <button className="btn ghost sm" type="submit">{u.isActive ? "Sperren" : "Aktivieren"}</button>
                        </form>
                      ) : null}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
