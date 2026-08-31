import Link from "next/link";
import { and, desc, eq, inArray, isNotNull } from "drizzle-orm";
import { antraege, persons, cards } from "@tdd/db";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { withOrg } from "@/lib/org";
import { fmtDate } from "@/lib/format";

export default async function PruefungPage() {
  const user = await getCurrentUser();
  const orgId = user?.organizationId ?? 0;
  const todayStr = new Date().toISOString().slice(0, 10);
  const plus30 = new Date(Date.now() + 30 * 864e5).toISOString().slice(0, 10);

  // Positiv beschiedene, an TDD übergebene Fälle dieser Organisation (neuester Antrag je Person)
  const ants = orgId
    ? await withOrg(orgId, (tx) =>
        tx.select({
          antragId: antraege.id, createdAt: antraege.createdAt, personId: antraege.transferredPersonId,
          first: antraege.firstName, last: antraege.lastName, birth: antraege.birthDate,
        }).from(antraege).where(and(eq(antraege.status, "POSITIV"), isNotNull(antraege.transferredPersonId)))
          .orderBy(desc(antraege.createdAt)))
    : [];

  const latestAntrag = new Map<string, typeof ants[number]>();
  for (const a of ants) if (a.personId && !latestAntrag.has(a.personId)) latestAntrag.set(a.personId, a);

  const personIds = [...latestAntrag.keys()];
  const cardRows = personIds.length
    ? await db().select({ personId: cards.personId, validTo: cards.validTo, status: cards.status }).from(cards).where(inArray(cards.personId, personIds))
    : [];
  const latestCard = new Map<string, { validTo: string; status: string }>();
  for (const c of cardRows) {
    const cur = latestCard.get(c.personId);
    if (!cur || c.validTo > cur.validTo) latestCard.set(c.personId, { validTo: c.validTo, status: c.status });
  }

  // Fälle mit Handlungsbedarf: Karte abgelaufen / läuft in ≤30 Tagen ab / keine aktive Karte
  const cases = [...latestAntrag.values()].map((a) => {
    const card = a.personId ? latestCard.get(a.personId) : undefined;
    const due = !card || card.status !== "AKTIV" || card.validTo <= plus30;
    return { ...a, card, due };
  }).filter((c) => c.due).sort((a, b) => (a.card?.validTo ?? "0").localeCompare(b.card?.validTo ?? "0"));

  return (
    <div>
      <div className="page-h">
        <div><h1>Erneute Überprüfung</h1><div className="sub">Fälle mit abgelaufener/ablaufender Karte · neuer Antrag nötig · {cases.length}</div></div>
      </div>
      <div className="panel">
        {cases.length === 0 ? <div className="empty">Aktuell keine Fälle zur erneuten Überprüfung.</div> : (
          <div className="twrap"><table className="data">
            <thead><tr><th>Klient/in</th><th>Geburtsdatum</th><th>Letzter Antrag</th><th>Karte</th><th></th></tr></thead>
            <tbody>
              {cases.map((c) => (
                <tr key={c.antragId}>
                  <td><b>{c.last}, {c.first}</b></td>
                  <td className="mono">{c.birth ?? "—"}</td>
                  <td className="mono">{fmtDate(c.createdAt)}</td>
                  <td>{!c.card ? <span className="pill muted">keine</span>
                    : c.card.status !== "AKTIV" ? <span className="pill bad">{c.card.status.toLowerCase()}</span>
                    : c.card.validTo < todayStr ? <span className="pill bad">abgelaufen {fmtDate(c.card.validTo)}</span>
                    : <span className="pill warn">läuft ab {fmtDate(c.card.validTo)}</span>}</td>
                  <td>
                    <div className="flex gap-1 justify-end">
                      <Link href={`/portal/${c.antragId}`} className="btn ghost sm">Letzter Antrag &amp; Dokumente</Link>
                      <Link href="/portal/neu" className="btn primary sm">Neuer Antrag</Link>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table></div>
        )}
      </div>
      <p className="text-[.72rem] text-[color:var(--muted)] mt-3">Ausgabestellen-Karten laufen nach 3–6 Monaten ab; Klient/innen werden bei Ablauf benachrichtigt und stellen hier einen neuen Antrag.</p>
    </div>
  );
}
