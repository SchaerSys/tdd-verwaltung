import Link from "next/link";
import { asc, eq } from "drizzle-orm";
import { antraege, locations } from "@tdd/db";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { withOrg } from "@/lib/org";
import { fmtDate } from "@/lib/format";
import { AntragForm, type Vorlage } from "./AntragForm";

/**
 * Neuer Antrag – oder Verlaengerung (`?vorlage=<antragId>`): Stammdaten, Haushalt und
 * Bezugsort kommen aus dem alten Antrag (nur eigene Organisation, RLS), die
 * Einkommenswerte sind bewusst leer, weil sie neu zu erheben sind.
 */
export default async function NeuAntragPage({ searchParams }: { searchParams: Promise<{ vorlage?: string }> }) {
  const sp = await searchParams;
  const user = await getCurrentUser();
  const orgId = user?.organizationId ?? 0;
  const locs = await db().select({ id: locations.id, name: locations.name, type: locations.type })
    .from(locations).where(eq(locations.isActive, true)).orderBy(asc(locations.type), asc(locations.name));

  let vorlage: Vorlage | null = null;
  if (sp.vorlage && orgId && /^[0-9a-f-]{36}$/i.test(sp.vorlage)) {
    const alt = await withOrg(orgId, (tx) => tx.select().from(antraege).where(eq(antraege.id, sp.vorlage!)).limit(1));
    const v = alt[0];
    if (v) {
      vorlage = {
        id: v.id, datum: fmtDate(v.createdAt),
        firstName: v.firstName, lastName: v.lastName, birthDate: v.birthDate ?? "", phone: v.phone ?? "", email: v.email ?? "",
        address: v.address ?? "", postalCode: v.postalCode ?? "", city: v.city ?? "", pets: v.pets ?? "",
        adults: String(v.adults), childrenU12: String(v.childrenU12), childrenO12: String(v.childrenO12),
        targetType: v.targetType, intendedLocationId: v.intendedLocationId ? String(v.intendedLocationId) : "",
      };
    }
  }

  return (
    <div>
      <div className="page-h">
        <div>
          <h1>{vorlage ? "Verlängerungsantrag" : "Neuer Antrag"}</h1>
          <div className="sub">{vorlage ? <>Vorbefüllt aus dem <Link href={`/portal/${vorlage.id}`}>Antrag vom {vorlage.datum}</Link> · Einkommen neu erfassen, Angaben prüfen</> : "Antragsteller erfassen + Anspruchsprüfung"}</div>
        </div>
        <Link href="/portal" className="btn ghost">← Zurück</Link>
      </div>
      <AntragForm locations={locs} vorlage={vorlage} />
    </div>
  );
}
