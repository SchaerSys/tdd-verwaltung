import { redirect } from "next/navigation";
import { getCurrentOps } from "@/lib/auth";
import { KontoForm } from "./KontoForm";
import { TotpSetup } from "./TotpSetup";

export default async function KontoSeite() {
  const user = await getCurrentOps();
  if (!user) redirect("/login");
  return (
    <div>
      <div className="page-h"><div><h1>Mein Konto</h1><div className="sub">{user.displayName} · {user.email}</div></div></div>
      <div className="grid gap-4 lg:grid-cols-2 items-start">
        <div className="panel"><div className="panel-h"><h3>Passwort ändern</h3></div><div className="p-4"><KontoForm /></div></div>
        <div className="panel" style={user.totpEnabled ? undefined : { borderColor: "var(--warn)" }}>
          <div className="panel-h"><h3>Zweiter Faktor (Authenticator-App)</h3>{user.totpEnabled ? <span className="pill good"><span className="dot" />aktiv</span> : <span className="pill warn">nicht eingerichtet</span>}</div>
          <div className="p-4"><TotpSetup enabled={user.totpEnabled} /></div>
        </div>
      </div>
    </div>
  );
}
