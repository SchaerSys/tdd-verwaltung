import Link from "next/link";
import { redirect } from "next/navigation";
import { sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { hasPermission } from "@/lib/rbac";
import { fmtDateTime } from "@/lib/format";
import { ladeRegeln } from "@/lib/azg-daten";

export const dynamic = "force-dynamic";

const eur = (n: number) => n.toLocaleString("de-AT", { style: "currency", currency: "EUR" });

interface Zeile { person_id: string; first_name: string; last_name: string; gruppe: number | null; ausgabe_number: number | null; location_id: number | null; location_name: string | null; offen: string; offene_ausgaben: number; zuletzt: Date | null }

/** Offene Schulden je Person – Sicht v_schulden (056); Kasse sieht den eigenen Standort, Buero alle. */
export default async function SchuldenSeite({ searchParams }: { searchParams: Promise<{ sort?: string; ort?: string }> }) {
  const user = await getCurrentUser();
  if (!user || !hasPermission(user.role, "distribution:record")) redirect("/dashboard");
  const sp = await searchParams;
  const gebunden = user.role !== "ADMIN" && user.locationId != null ? user.locationId : (sp.ort && /^\d+$/.test(sp.ort) ? Number(sp.ort) : null);
  const sort = sp.sort === "alt" ? "alt" : sp.sort === "name" ? "name" : "betrag";
  const regeln = await ladeRegeln();

  const res = await db().execute(sql`
    SELECT person_id, first_name, last_name, gruppe, ausgabe_number, location_id, location_name, offen, offene_ausgaben::int AS offene_ausgaben, zuletzt
    FROM v_schulden
    WHERE ${gebunden != null ? sql`location_id = ${gebunden}` : sql`true`}
    ORDER BY ${sort === "alt" ? sql`zuletzt ASC NULLS FIRST` : sort === "name" ? sql`last_name, first_name` : sql`offen DESC`}
    LIMIT 500`);
  const zeilen = res as unknown as Zeile[];
  const orte = (await db().execute(sql`SELECT DISTINCT location_id, location_name FROM v_schulden WHERE location_id IS NOT NULL ORDER BY location_name`)) as unknown as { location_id: number; location_name: string }[];
  const summe = zeilen.reduce((a, z) => a + Number(z.offen), 0);
  const stufe = (z: Zeile) => {
    const o = Number(z.offen);
    if (o >= regeln.schuldenSperreEur || z.offene_ausgaben >= regeln.schuldenSperreAnzahl) return <span className="pill bad">Sperre</span>;
    if (o >= regeln.schuldenWarnungEur || z.offene_ausgaben >= regeln.schuldenWarnungAnzahl) return <span className="pill warn">Warnung</span>;
    return <span className="pill muted">offen</span>;
  };
  const canPersons = hasPermission(user.role, "person:read");

  return (
    <div>
      <div className="page-h">
        <div><h1>Offene Schulden</h1><div className="sub">{zeilen.length} Personen · {eur(summe)} offen{gebunden != null ? " · eigener Standort" : ""}</div></div>
        <Link href="/ausgaben" className="btn ghost">← Ausgaben</Link>
      </div>

      <form className="panel mb-4" method="get">
        <div className="p-3 flex gap-3 items-end flex-wrap">
          {user.role === "ADMIN" || user.locationId == null ? (
            <div className="field"><label className="lbl">Ausgabestelle</label>
              <select name="ort" className="inp" defaultValue={sp.ort ?? ""}>
                <option value="">alle</option>
                {orte.map((o) => <option key={o.location_id} value={o.location_id}>{o.location_name}</option>)}
              </select>
            </div>
          ) : null}
          <div className="field"><label className="lbl">Sortierung</label>
            <select name="sort" className="inp" defaultValue={sort}>
              <option value="betrag">Betrag (höchste zuerst)</option>
              <option value="alt">Älteste Bewegung zuerst</option>
              <option value="name">Name</option>
            </select>
          </div>
          <button type="submit" className="btn">Anzeigen</button>
          <div className="text-[.72rem] text-muted">Warnung ab {eur(regeln.schuldenWarnungEur)} / {regeln.schuldenWarnungAnzahl} offenen Ausgaben · Sperre ab {eur(regeln.schuldenSperreEur)} / {regeln.schuldenSperreAnzahl}</div>
        </div>
      </form>

      <div className="panel">
        {zeilen.length === 0 ? <div className="empty">Keine offenen Schulden.</div> : (
          <div className="twrap"><table className="data">
            <thead><tr><th>Name</th><th>Ausgabestelle</th><th>Gruppe / Nr.</th><th className="text-right">Offen</th><th className="text-right">Unbez. Ausgaben</th><th>Letzte Bewegung</th><th>Stufe</th></tr></thead>
            <tbody>{zeilen.map((z) => (
              <tr key={z.person_id}>
                <td>{canPersons ? <Link href={`/personen/${z.person_id}`}>{z.last_name}, {z.first_name}</Link> : <>{z.last_name}, {z.first_name}</>}</td>
                <td>{z.location_name ?? "—"}</td>
                <td className="mono">{z.gruppe != null && z.ausgabe_number != null ? `${z.gruppe} / ${z.ausgabe_number}` : "—"}</td>
                <td className="text-right mono"><b>{eur(Number(z.offen))}</b></td>
                <td className="text-right mono">{z.offene_ausgaben}</td>
                <td className="mono text-xs">{z.zuletzt ? fmtDateTime(z.zuletzt) : "—"}</td>
                <td>{stufe(z)}</td>
              </tr>
            ))}</tbody>
          </table></div>
        )}
      </div>
    </div>
  );
}
