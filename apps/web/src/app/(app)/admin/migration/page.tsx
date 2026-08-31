import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { hasPermission } from "@/lib/rbac";
import { MigrationClient } from "./MigrationClient";

export default async function MigrationPage() {
  const user = await getCurrentUser();
  if (!user || !hasPermission(user.role, "admin:manage")) redirect("/dashboard");

  return (
    <div>
      <div className="page-h">
        <div>
          <h1>Übernahme Altsystem</h1>
          <div className="sub">CSV-Backup aus dem alten Ausgabeprogramm einspielen</div>
        </div>
        <Link href="/admin" className="btn ghost">← Stammdaten</Link>
      </div>

      <div className="panel mb-4">
        <div className="p-4 text-[.9rem] flex flex-col gap-1">
          <div><b>So geht's:</b> Im Alt-System unter <i>Einstellungen → Backup herunterladen</i> je einmal <b>Orte</b> und <b>Familien</b> als CSV ziehen.</div>
          <div>Dann hier zuerst die <b>Orte</b>, danach die <b>Familien</b> importieren. Gelöschte Einträge und Dubletten werden übersprungen, „gesperrt" in den Notizen wird als gesperrte Karte übernommen.</div>
          <div className="muted">Adressen/Telefon/Fotos sind im Alt-System meist leer – die Analyse zeigt dir, wie viele Adressen fehlen.</div>
        </div>
      </div>

      <MigrationClient />
    </div>
  );
}
