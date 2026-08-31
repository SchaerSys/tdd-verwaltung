import Link from "next/link";
import { asc, eq } from "drizzle-orm";
import { locations } from "@tdd/db";
import { db } from "@/lib/db";
import { AntragForm } from "./AntragForm";

export default async function NeuAntragPage() {
  const locs = await db().select({ id: locations.id, name: locations.name, type: locations.type })
    .from(locations).where(eq(locations.isActive, true)).orderBy(asc(locations.type), asc(locations.name));

  return (
    <div>
      <div className="page-h">
        <div><h1>Neuer Antrag</h1><div className="sub">Antragsteller erfassen + Anspruchsprüfung</div></div>
        <Link href="/portal" className="btn ghost">← Zurück</Link>
      </div>
      <AntragForm locations={locs} />
    </div>
  );
}
