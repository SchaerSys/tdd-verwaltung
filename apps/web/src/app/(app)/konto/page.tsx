import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { KontoForm } from "./KontoForm";

const ROLE_LABEL: Record<string, string> = {
  ADMIN: "Admin", ERFASSUNG: "Erfassung", AUSGABE: "Kasse", AUSWERTUNG: "Auswertung", SACHBEARBEITER: "Sachbearbeiter",
};

export default async function KontoPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  return (
    <div>
      <div className="page-h">
        <div>
          <h1>Mein Konto</h1>
          <div className="sub">{user.displayName} · {user.email} · {ROLE_LABEL[user.role] ?? user.role}</div>
        </div>
      </div>

      <div className="panel" style={{ maxWidth: 520 }}>
        <div className="panel-h"><h3>Passwort ändern</h3></div>
        <div className="p-4">
          <KontoForm />
        </div>
      </div>
    </div>
  );
}
