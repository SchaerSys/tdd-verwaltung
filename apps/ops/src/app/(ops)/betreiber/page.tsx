import { redirect } from "next/navigation";
import { asc } from "drizzle-orm";
import { opsUsers } from "@tdd/db";
import { dbFuer } from "@/lib/db";
import { getCurrentOps } from "@/lib/auth";
import { fmt } from "@/components/SupportTeile";
import { betreiberEntsperren, betreiberRolle, betreiberSchalten } from "./actions";
import { NeuerBetreiber } from "./NeuerBetreiber";

export const dynamic = "force-dynamic";

/** Betreiber-Konten (057): SUPER = alles, SUPPORT = lesen, Passwort-Links, Sperren – keine Mandanten, kein SMTP, keine Konfiguration. */
export default async function BetreiberSeite() {
  const ops = await getCurrentOps();
  if (!ops || ops.rolle !== "SUPER") redirect("/");
  const liste = await dbFuer(null).select({ id: opsUsers.id, email: opsUsers.email, name: opsUsers.displayName, rolle: opsUsers.rolle, aktiv: opsUsers.isActive, totp: opsUsers.totpEnabled, lastLogin: opsUsers.lastLogin, lockedUntil: opsUsers.lockedUntil, failed: opsUsers.failedAttempts })
    .from(opsUsers).orderBy(asc(opsUsers.rolle), asc(opsUsers.email));
  return (
    <div>
      <div className="page-h"><div><h1>Betreiber-Konten</h1><div className="sub">Wer darf die Wartungsplattform bedienen · Super-Admin: alles · Support: lesen, Passwort-Links, Sperren</div></div></div>
      <div className="panel mb-4">
        <div className="twrap"><table className="data">
          <thead><tr><th>Name</th><th>E-Mail</th><th>Rolle</th><th>2FA</th><th>Letzter Login</th><th>Status</th><th></th></tr></thead>
          <tbody>{liste.map((u) => {
            const gesperrt = !!(u.lockedUntil && u.lockedUntil > new Date());
            const selbst = u.id === ops.id;
            return (
              <tr key={u.id}>
                <td>{u.name}{selbst ? <span className="pill muted" style={{ marginLeft: 6 }}>ich</span> : null}</td>
                <td className="mono text-xs">{u.email}</td>
                <td>
                  {selbst ? <span className="pill good">{u.rolle}</span> : (
                    <form action={betreiberRolle} className="flex gap-1 items-center">
                      <input type="hidden" name="id" value={u.id} />
                      <select name="rolle" className="inp sm" defaultValue={u.rolle}><option value="SUPER">SUPER</option><option value="SUPPORT">SUPPORT</option></select>
                      <button className="btn ghost sm" type="submit">Setzen</button>
                    </form>
                  )}
                </td>
                <td>{u.totp ? <span className="pill good">aktiv</span> : <span className="pill warn">fehlt</span>}</td>
                <td className="text-xs">{fmt(u.lastLogin)}</td>
                <td>{!u.aktiv ? <span className="pill muted">inaktiv</span> : gesperrt ? <span className="pill bad">gesperrt ({u.failed} Fehlversuche)</span> : <span className="pill good">aktiv</span>}</td>
                <td className="flex gap-1">
                  {gesperrt ? <form action={betreiberEntsperren}><input type="hidden" name="id" value={u.id} /><button className="btn ghost sm">Entsperren</button></form> : null}
                  {!selbst ? <form action={betreiberSchalten}><input type="hidden" name="id" value={u.id} /><input type="hidden" name="aktiv" value={u.aktiv ? "0" : "1"} /><button className="btn ghost sm">{u.aktiv ? "Deaktivieren" : "Aktivieren"}</button></form> : null}
                </td>
              </tr>
            );
          })}</tbody>
        </table></div>
      </div>
      <div className="panel"><div className="panel-h"><h3>Neues Betreiber-Konto</h3></div><div style={{ padding: 12 }}><NeuerBetreiber /></div></div>
    </div>
  );
}
