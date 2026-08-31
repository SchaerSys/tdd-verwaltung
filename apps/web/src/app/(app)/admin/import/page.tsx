import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { hasPermission } from "@/lib/rbac";
import { ImportClient } from "./ImportClient";

export default async function ImportPage() {
  const user = await getCurrentUser();
  if (!user || !hasPermission(user.role, "admin:manage")) redirect("/dashboard");

  return (
    <div>
      <div className="page-h">
        <div>
          <h1>Excel-Import</h1>
          <div className="sub">Personen aus einer Excel-Liste einlesen · mit Dubletten-Prüfung</div>
        </div>
      </div>
      <ImportClient />
    </div>
  );
}
