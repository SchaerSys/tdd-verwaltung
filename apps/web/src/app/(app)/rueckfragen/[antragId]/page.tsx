import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { and, asc, eq, isNull } from "drizzle-orm";
import { antragNachrichten } from "@tdd/db";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { hasPermission } from "@/lib/rbac";
import { ladeRueckfrage } from "@/lib/rueckfragen";
import { fmtDate, fmtDateTime } from "@/lib/format";
import { Verlauf } from "@/components/portal/Verlauf";
import { antwortNachricht } from "../actions";

/** TDD-Buero: Verlauf zu einem Antrag lesen und antworten. */
export default async function RueckfrageDetail({ params }: { params: Promise<{ antragId: string }> }) {
  const { antragId } = await params;
  const user = await getCurrentUser();
  if (!user || !hasPermission(user.role, "person:write")) redirect("/dashboard");
  const fall = await ladeRueckfrage(antragId);
  if (!fall) notFound();

  const d = db();
  const nachrichten = await d.select().from(antragNachrichten).where(eq(antragNachrichten.antragId, antragId)).orderBy(asc(antragNachrichten.createdAt));
  // Fragen der Organisation gelten mit dem Oeffnen als gelesen.
  if (nachrichten.some((n) => n.seite === "ORG" && !n.gelesenAt)) {
    await d.update(antragNachrichten).set({ gelesenAt: new Date() })
      .where(and(eq(antragNachrichten.antragId, antragId), eq(antragNachrichten.seite, "ORG"), isNull(antragNachrichten.gelesenAt)));
  }

  return (
    <div>
      <div className="page-h">
        <div>
          <h1>{fall.firstName} {fall.lastName}</h1>
          <div className="sub">
            Rückfrage · {fall.orgType === "GEMEINDE" ? "Gemeinde" : "Institution"} {fall.orgName} · Antrag vom {fmtDate(fall.antragAm)} · {fall.status.toLowerCase()}
            {fall.birthDate ? ` · geb. ${fmtDate(fall.birthDate)}` : ""}
          </div>
        </div>
        <div className="flex gap-2">
          {fall.transferredPersonId ? <Link href={`/personen/${fall.transferredPersonId}`} className="btn">Person öffnen</Link> : null}
          <Link href="/rueckfragen" className="btn ghost">← Rückfragen</Link>
        </div>
      </div>
      {!fall.transferredPersonId ? (
        <div className="panel mb-4"><div className="p-4 text-[.8125rem] text-muted">
          Dieser Antrag ist noch nicht positiv beschieden – bei TDD gibt es noch keine Person dazu. Der Antragsinhalt bleibt bei der Organisation; Auskunft zu bekannten Personen über die Personensuche.
        </div></div>
      ) : null}
      <div className="panel">
        <div className="panel-h"><h3>Verlauf</h3><span className="pill muted">{nachrichten.length}</span></div>
        <Verlauf
          nachrichten={nachrichten.map((n) => ({ id: n.id, seite: n.seite, autor: n.autorName, text: n.text, am: fmtDateTime(n.createdAt) }))}
          eigeneSeite="TDD"
          action={antwortNachricht}
          antragId={fall.antragId}
          hinweis="Die Antwort erscheint der Organisation im Portal beim Antrag und wird auf deren Startseite als neu markiert."
        />
      </div>
    </div>
  );
}
