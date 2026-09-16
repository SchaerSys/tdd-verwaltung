import Link from "next/link";
import { redirect } from "next/navigation";
import { asc } from "drizzle-orm";
import { locations } from "@tdd/db";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { hasPermission } from "@/lib/rbac";
import { standortTyp } from "@/lib/format";
import { TourKarte } from "@/components/TourKarte";
import { standortAdresse } from "./actions";

export const dynamic = "force-dynamic";

/** Standorte (Lager, Ausgabestellen, Laeden) als Start- und Zielpunkte: Adresse und Koordinaten. */
export default async function StandorteKarteSeite() {
  const user = await getCurrentUser();
  if (!user || !hasPermission(user.role, "tour:manage")) redirect("/dashboard");
  const liste = await db().select().from(locations).orderBy(asc(locations.type), asc(locations.name));
  const punkte = liste.filter((l) => l.lat != null && l.lng != null).map((l) => ({ lat: l.lat!, lng: l.lng!, nr: l.type === "LAGER" ? "L" : l.type === "LADEN" ? "S" : "A", label: l.name, untertitel: [l.strasse, l.plz, l.city].filter(Boolean).join(", "), farbe: l.type === "LAGER" ? "#1d4ed8" : l.type === "LADEN" ? "#0f766e" : "#981313" }));

  return (
    <div>
      <div className="page-h">
        <div><h1>Standorte auf der Karte</h1><div className="sub">Start (Lager) und Lieferziele der Touren · {punkte.length} von {liste.length} mit Koordinaten</div></div>
        <Link href="/touren" className="btn ghost">← Disposition</Link>
      </div>
      <div className="panel mb-4"><div className="p-2"><TourKarte punkte={punkte} hoehe={520} /></div></div>
      <div className="panel">
        <div className="twrap"><table className="data">
          <thead><tr><th>Standort</th><th>Typ</th><th>Straße</th><th>PLZ</th><th>Ort</th><th>Koordinaten</th><th></th></tr></thead>
          <tbody>{liste.map((l) => (
            <tr key={l.id} style={l.isActive ? undefined : { opacity: .55 }}>
              <td><b>{l.name}</b></td>
              <td><span className={`pill ${l.type === "LAGER" ? "muted" : l.type === "LADEN" ? "tag-shop" : "tag-out"}`}>{standortTyp(l.type)}</span></td>
              <td colSpan={5}>
                <form action={standortAdresse} className="flex gap-2 items-center flex-wrap">
                  <input type="hidden" name="id" value={l.id} />
                  <input name="strasse" className="inp sm" defaultValue={l.strasse ?? ""} placeholder="Straße Nr." style={{ width: 200 }} />
                  <input name="plz" className="inp sm mono" defaultValue={l.plz ?? ""} placeholder="PLZ" style={{ width: 70 }} />
                  <input name="geofenceM" className="inp sm mono" defaultValue={l.geofenceM} title="Geofence-Radius in Metern" style={{ width: 70 }} /><span className="text-xs text-muted">m</span>
                  <span className="text-[.8125rem]">{l.city}</span>
                  <span className="mono text-xs text-muted">{l.lat != null ? `${l.lat.toFixed(5)}, ${l.lng!.toFixed(5)}` : "—"}</span>
                  <button className="btn ghost sm" type="submit">Speichern &amp; Adresse suchen</button>
                </form>
              </td>
            </tr>
          ))}</tbody>
        </table></div>
        <div className="p-3 text-[.72rem] text-muted">Für das Lager Vandans bitte die Straße eintragen – dann startet die Routenberechnung an der richtigen Rampe statt in der Ortsmitte.</div>
      </div>
    </div>
  );
}
