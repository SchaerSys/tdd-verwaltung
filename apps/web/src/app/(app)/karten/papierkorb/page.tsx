import Link from "next/link";
import { redirect } from "next/navigation";
import { desc, eq, sql } from "drizzle-orm";
import { cards, persons, locations } from "@tdd/db";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { hasPermission } from "@/lib/rbac";
import { fmtDate } from "@/lib/format";
import { restoreCard, hardDeleteCard, emptyTrash } from "./actions";

export default async function PapierkorbPage() {
  const user = await getCurrentUser();
  if (!user || !hasPermission(user.role, "card:manage")) redirect("/dashboard");

  const rows = await db()
    .select({
      id: cards.id, number: cards.cardNumber, validTo: cards.validTo, status: cards.status,
      deletedAt: cards.deletedAt, reason: cards.trashReason, personId: cards.personId,
      first: persons.firstName, last: persons.lastName, loc: locations.name,
    })
    .from(cards)
    .innerJoin(persons, eq(cards.personId, persons.id))
    .innerJoin(locations, eq(cards.locationId, locations.id))
    .where(sql`${cards.deletedAt} IS NOT NULL`)
    .orderBy(desc(cards.deletedAt))
    .limit(500);

  const totalRow = await db().select({ n: sql<number>`count(*)::int` }).from(cards).where(sql`${cards.deletedAt} IS NOT NULL`);
  const total = totalRow[0]?.n ?? 0;

  return (
    <div>
      <div className="page-h">
        <div>
          <h1>Papierkorb – Karten</h1>
          <div className="sub">{total} Karten im Papierkorb · automatisch verschoben, wenn &gt; 6 Monate inaktiv</div>
        </div>
        <div className="flex gap-2">
          <Link href="/karten" className="btn ghost">← Karten</Link>
          {total > 0 ? (
            <form action={emptyTrash}>
              <button type="submit" className="btn danger">🗑 Papierkorb endgültig leeren ({total})</button>
            </form>
          ) : null}
        </div>
      </div>

      <div className="panel">
        <div className="panel-h"><h3>Im Papierkorb</h3><span className="pill muted">{rows.length}{total > rows.length ? ` von ${total}` : ""}</span></div>
        {rows.length === 0 ? (
          <div className="empty">Der Papierkorb ist leer.</div>
        ) : (
          <div className="twrap"><table className="data">
            <thead><tr><th>Person</th><th>Kartennr.</th><th>Standort</th><th>Gültig bis</th><th>Verschoben</th><th>Grund</th><th></th></tr></thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id}>
                  <td><Link href={`/personen/${r.personId}`} className="font-semibold hover:underline">{r.last}, {r.first}</Link></td>
                  <td className="mono">{r.number}</td>
                  <td>{r.loc}</td>
                  <td className="mono">{fmtDate(r.validTo)}</td>
                  <td className="mono">{fmtDate(r.deletedAt)}</td>
                  <td className="text-[.8125rem]">{r.reason ?? "—"}</td>
                  <td>
                    <div className="flex gap-1 justify-end">
                      <form action={restoreCard}><input type="hidden" name="cardId" value={r.id} /><button className="btn ghost sm" type="submit">↩ Wiederherstellen</button></form>
                      <form action={hardDeleteCard}><input type="hidden" name="cardId" value={r.id} /><button className="btn danger sm" type="submit">Endgültig löschen</button></form>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table></div>
        )}
      </div>
    </div>
  );
}
