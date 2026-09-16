import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { and, desc, eq, like, or } from "drizzle-orm";
import { auditLogs, users, organizations, staff } from "@tdd/db";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { hasPermission } from "@/lib/rbac";
import { fmtDate, fmtDateTime } from "@/lib/format";

export const dynamic = "force-dynamic";

const AKTION: Record<string, { text: string; pill: string }> = {
  "login": { text: "Anmeldung", pill: "good" },
  "login.failed": { text: "Anmeldung fehlgeschlagen (falsches Passwort)", pill: "warn" },
  "login.locked": { text: "Konto nach Fehlversuchen kurz gesperrt", pill: "bad" },
  "login.austritt": { text: "Anmeldung abgewiesen – Austritt, Konto gesperrt", pill: "bad" },
  "login.2fa.failed": { text: "Zweiter Faktor falsch", pill: "warn" },
  "login.2fa.replay": { text: "Zweiter Faktor wiederverwendet (abgewiesen)", pill: "bad" },
  "login.2fa.recovery": { text: "Anmeldung mit Wiederherstellungscode", pill: "warn" },
  "password.reset.request": { text: "Passwort-Zurücksetzen angefordert", pill: "muted" },
  "password.reset.done": { text: "Passwort per Link neu gesetzt", pill: "muted" },
  "user.password_change": { text: "Passwort geändert", pill: "muted" },
  "user.deactivate": { text: "Konto gesperrt", pill: "bad" },
  "user.activate": { text: "Konto aktiviert", pill: "good" },
  "user.role": { text: "Rolle geändert", pill: "muted" },
  "user.update": { text: "Konto bearbeitet", pill: "muted" },
  "user.create": { text: "Konto angelegt", pill: "muted" },
  "user.2fa.enabled": { text: "2FA eingerichtet", pill: "muted" },
  "user.2fa.disabled": { text: "2FA abgeschaltet", pill: "muted" },
  "user.2fa.reset": { text: "2FA durch Admin zurückgesetzt", pill: "warn" },
};

/**
 * Login-Verlauf eines TDD-Kontos: Anmeldungen, Fehlversuche, Sperren, Passwort- und
 * Kontoänderungen aus dem Audit-Log (letzte 200). Was das Konto fachlich getan hat,
 * steht nicht hier – dafür ist das Protokoll.
 */
export default async function LoginVerlauf({ params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user || !hasPermission(user.role, "admin:manage")) redirect("/dashboard");
  const { id } = await params;

  const u = (await db().select({
    id: users.id, name: users.displayName, email: users.email, username: users.username, role: users.role, isActive: users.isActive,
    lastLogin: users.lastLogin, deaktiviertGrund: users.deaktiviertGrund, deaktiviertAt: users.deaktiviertAt, failedAttempts: users.failedAttempts,
    lockedUntil: users.lockedUntil, createdAt: users.createdAt, orgTyp: organizations.type,
  }).from(users).leftJoin(organizations, eq(users.organizationId, organizations.id)).where(eq(users.id, id)).limit(1))[0];
  if (!u || u.orgTyp !== "TDD" || u.role === "SACHBEARBEITER") notFound(); // Portal-Konten verwaltet der Betreiber

  const [eintraege, person] = await Promise.all([
    db().select({ at: auditLogs.at, action: auditLogs.action, ip: auditLogs.ip, actor: auditLogs.actorUserId, after: auditLogs.after })
      .from(auditLogs)
      .where(or(
        and(eq(auditLogs.actorUserId, id), or(like(auditLogs.action, "login%"), like(auditLogs.action, "password.%"))),
        and(eq(auditLogs.entityType, "user"), eq(auditLogs.entityId, id), like(auditLogs.action, "user.%")),
      ))
      .orderBy(desc(auditLogs.at)).limit(200),
    db().select({ id: staff.id, employmentEnd: staff.employmentEnd }).from(staff).where(eq(staff.userId, id)).limit(1),
  ]);
  const fehl = eintraege.filter((e) => e.action === "login.failed" || e.action === "login.locked").length;

  return (
    <div>
      <div className="page-h">
        <div><h1>Login-Verlauf · {u.name}</h1><div className="sub mono">{u.email}{u.username ? ` · ${u.username}` : ""} · {u.role}</div></div>
        <Link href="/admin/benutzer" className="btn ghost">← Benutzer</Link>
      </div>

      <div className="grid gap-4 lg:grid-cols-4 mb-4">
        <div className="panel p-4 text-[.8125rem]"><div className="text-xs text-muted">Stand</div>
          {u.isActive ? <span className="pill good"><span className="dot" />Aktiv</span> : <span className="pill bad">{u.deaktiviertGrund === "AUSTRITT" ? "Gesperrt wegen Austritt" : "Gesperrt (Admin)"}{u.deaktiviertAt ? ` seit ${fmtDate(u.deaktiviertAt)}` : ""}</span>}
          {u.lockedUntil && u.lockedUntil > new Date() ? <div className="mt-1 text-xs" style={{ color: "var(--warn)" }}>Kurzsperre bis {fmtDateTime(u.lockedUntil)} ({u.failedAttempts} Fehlversuche)</div> : null}</div>
        <div className="panel p-4 text-[.8125rem]"><div className="text-xs text-muted">Letzter Login</div><b className="mono">{u.lastLogin ? fmtDateTime(u.lastLogin) : "nie"}</b></div>
        <div className="panel p-4 text-[.8125rem]"><div className="text-xs text-muted">Fehlversuche (letzte 200 Einträge)</div><b className={fehl > 5 ? "" : undefined} style={fehl > 5 ? { color: "var(--warn)" } : undefined}>{fehl}</b></div>
        <div className="panel p-4 text-[.8125rem]"><div className="text-xs text-muted">Personal-Datensatz</div>
          {person[0] ? <Link href={`/personal/${person[0].id}`}>verknüpft →{person[0].employmentEnd ? ` (Austritt ${fmtDate(person[0].employmentEnd)})` : ""}</Link> : <span className="text-muted">nicht verknüpft</span>}
          <div className="text-xs text-muted mt-1">Konto seit {fmtDate(u.createdAt)}</div></div>
      </div>

      <div className="panel">
        <div className="panel-h"><h3>Ereignisse</h3><span className="pill muted">{eintraege.length}</span></div>
        <div className="twrap"><table className="data">
          <thead><tr><th>Zeitpunkt</th><th>Ereignis</th><th>IP</th><th>Details</th></tr></thead>
          <tbody>{eintraege.map((e, i) => { const a = AKTION[e.action] ?? { text: e.action, pill: "muted" }; const d = (e.after ?? null) as Record<string, unknown> | null; return (
            <tr key={i}>
              <td className="mono">{fmtDateTime(e.at)}</td>
              <td><span className={`pill ${a.pill}`}>{a.text}</span></td>
              <td className="mono text-xs">{e.ip ?? ""}</td>
              <td className="text-xs text-muted">{e.action.startsWith("user.") && e.actor && e.actor !== id ? "durch Admin" : ""}{d?.zweiterFaktor ? "mit zweitem Faktor" : ""}{d?.erstes ? "Initialpasswort ersetzt" : ""}{typeof d?.attempts === "number" ? `Versuch ${d.attempts}` : ""}{typeof d?.role === "string" ? `Rolle ${d.role}` : ""}{typeof d?.grund === "string" ? `Grund ${d.grund}` : ""}</td>
            </tr>); })}
          {eintraege.length === 0 ? <tr><td colSpan={4}><div className="empty">Noch keine Ereignisse.</div></td></tr> : null}</tbody>
        </table></div>
        <div className="p-3 text-[.72rem] text-muted">Audit-Log wird drei Jahre aufbewahrt. IP-Adressen dienen nur der Erkennung von Missbrauch.</div>
      </div>
    </div>
  );
}
