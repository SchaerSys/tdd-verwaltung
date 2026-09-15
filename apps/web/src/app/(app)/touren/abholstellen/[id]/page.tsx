import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { desc, eq } from "drizzle-orm";
import { abholstellen, tourStopps, tourVorlageStopps, tourVorlagen, touren } from "@tdd/db";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { hasPermission } from "@/lib/rbac";
import { WOCHENTAGE } from "@/lib/touren";
import { fmtDate } from "@/lib/format";
import { abholstelleSpeichern } from "../../actions";
import { AbholstelleFelder } from "../AbholstelleFelder";
import { PunktPanel } from "../../KartePanel";

export const dynamic = "force-dynamic";

export default async function AbholstelleSeite({ params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user || !hasPermission(user.role, "tour:manage")) redirect("/dashboard");
  const id = Number((await params).id);
  if (!id) notFound();
  const a = (await db().select().from(abholstellen).where(eq(abholstellen.id, id)).limit(1))[0];
  if (!a) notFound();
  const [vorlagen, letzte] = await Promise.all([
    db().select({ id: tourVorlagen.id, name: tourVorlagen.name, wochentag: tourVorlagen.wochentag }).from(tourVorlageStopps).innerJoin(tourVorlagen, eq(tourVorlageStopps.vorlageId, tourVorlagen.id)).where(eq(tourVorlageStopps.abholstelleId, id)),
    db().select({ id: touren.id, datum: touren.datum, name: touren.name, status: tourStopps.status, kisten: tourStopps.mengeKisten, kg: tourStopps.mengeKg }).from(tourStopps).innerJoin(touren, eq(tourStopps.tourId, touren.id)).where(eq(tourStopps.abholstelleId, id)).orderBy(desc(touren.datum)).limit(20),
  ]);

  return (
    <div>
      <div className="page-h">
        <div><h1>{a.name}</h1><div className="sub">{[a.strasse, a.plz, a.ort].filter(Boolean).join(", ") || "ohne Adresse"}{a.isActive ? "" : " · inaktiv"}</div></div>
        <Link href="/touren/abholstellen" className="btn ghost">← Abholstellen</Link>
      </div>
      <div className="grid gap-4 lg:grid-cols-[2fr_1fr] items-start">
        <div className="panel">
          <div className="panel-h"><h3>Stammdaten</h3></div>
          <form action={abholstelleSpeichern} className="p-4 flex flex-col gap-3"><input type="hidden" name="id" value={a.id} /><AbholstelleFelder a={a} /><div><button className="btn primary" type="submit">Speichern</button></div></form>
        </div>
        <div className="flex flex-col gap-4">
          <PunktPanel art="abholstelle" id={a.id} name={a.name} adresse={[a.strasse, [a.plz, a.ort].filter(Boolean).join(" ")].filter(Boolean).join(", ")} lat={a.lat} lng={a.lng} />
          <div className="panel">
            <div className="panel-h"><h3>Im Wochenplan</h3><span className="pill muted">{vorlagen.length}</span></div>
            <ul className="p-3 text-[.8125rem] flex flex-col gap-1">
              {vorlagen.map((v) => <li key={v.id}><Link href={`/touren/vorlagen/${v.id}`}>{v.name}</Link> <span className="text-muted">({WOCHENTAGE[v.wochentag]})</span></li>)}
              {vorlagen.length === 0 ? <li className="text-muted">In keiner Tourvorlage – im Wochenplan als Stopp hinzufügen.</li> : null}
            </ul>
          </div>
          <div className="panel">
            <div className="panel-h"><h3>Letzte Abholungen</h3></div>
            <div className="twrap"><table className="data">
              <thead><tr><th>Datum</th><th>Tour</th><th>Stand</th><th className="text-right">Menge</th></tr></thead>
              <tbody>{letzte.map((l) => <tr key={l.id + l.datum}><td className="mono text-xs">{fmtDate(l.datum)}</td><td><Link href={`/touren/${l.id}`}>{l.name}</Link></td><td>{l.status === "ERLEDIGT" ? <span className="pill good">erledigt</span> : l.status === "NICHT_MOEGLICH" ? <span className="pill bad">nicht möglich</span> : <span className="pill muted">offen</span>}</td><td className="mono text-right text-xs">{l.kisten != null ? `${l.kisten} K.` : ""}{l.kg != null ? ` ${l.kg} kg` : ""}</td></tr>)}
              {letzte.length === 0 ? <tr><td colSpan={4}><div className="empty">Noch keine Abholung.</div></td></tr> : null}
              </tbody>
            </table></div>
          </div>
        </div>
      </div>
    </div>
  );
}
