import Link from "next/link";
import { redirect } from "next/navigation";
import { and, asc, eq, or, ilike, sql, isNull } from "drizzle-orm";
import { cards, persons, locations } from "@tdd/db";
import { normalizeName } from "@tdd/core";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { hasPermission } from "@/lib/rbac";
import { fmtDate } from "@/lib/format";
import { ConfirmButton } from "@/components/ConfirmButton";
import { renewCard, blockCard, replaceCard, unblockCard, renewCardsBulk } from "./actions";

const LIMIT = 200;

function statusPill(status: string, validTo: string, todayStr: string) {
  if (status === "AKTIV" && validTo < todayStr) return <span className="pill bad"><span className="dot" />abgelaufen</span>;
  if (status === "AKTIV") return <span className="pill good"><span className="dot" />aktiv</span>;
  if (status === "GESPERRT") return <span className="pill bad"><span className="dot" />gesperrt</span>;
  if (status === "ERSETZT") return <span className="pill muted">ersetzt</span>;
  return <span className="pill muted">{status.toLowerCase()}</span>;
}

export default async function KartenPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const user = await getCurrentUser();
  if (!user || !hasPermission(user.role, "card:manage")) redirect("/dashboard");

  const { q } = await searchParams;
  const todayStr = new Date().toISOString().slice(0, 10);
  const plus30 = new Date(Date.now() + 30 * 864e5).toISOString().slice(0, 10);

  const sel = {
    id: cards.id, number: cards.cardNumber, validFrom: cards.validFrom, validTo: cards.validTo,
    status: cards.status, personId: cards.personId,
    first: persons.firstName, last: persons.lastName, loc: locations.name, locType: locations.type,
  };

  // Hauptliste: nach Suche gefiltert, sonst nach Ablauf sortiert – immer begrenzt, ohne Papierkorb.
  const search = q?.trim();
  const where = and(
    isNull(cards.deletedAt),
    search
      ? or(
          ilike(persons.lastNameNorm, `%${normalizeName(search)}%`),
          ilike(persons.firstNameNorm, `%${normalizeName(search)}%`),
          ilike(cards.cardNumber, `%${search.replace(/\s+/g, "")}%`),
        )
      : undefined,
  );

  const [rows, totalRow, trashRow, expiring] = await Promise.all([
    db().select(sel).from(cards)
      .innerJoin(persons, eq(cards.personId, persons.id))
      .innerJoin(locations, eq(cards.locationId, locations.id))
      .where(where)
      .orderBy(asc(cards.validTo))
      .limit(LIMIT),
    db().select({ n: sql<number>`count(*)::int` }).from(cards).where(isNull(cards.deletedAt)),
    db().select({ n: sql<number>`count(*)::int` }).from(cards).where(sql`${cards.deletedAt} IS NOT NULL`),
    db().select(sel).from(cards)
      .innerJoin(persons, eq(cards.personId, persons.id))
      .innerJoin(locations, eq(cards.locationId, locations.id))
      .where(and(isNull(cards.deletedAt), eq(cards.status, "AKTIV"), sql`${cards.validTo} BETWEEN ${todayStr} AND ${plus30}`))
      .orderBy(asc(cards.validTo))
      .limit(100),
  ]);
  const total = totalRow[0]?.n ?? 0;
  const trashCount = trashRow[0]?.n ?? 0;

  const actions = (r: typeof rows[number]) => (
    <div className="flex gap-1 justify-end flex-wrap">
      <Link href={`/druck/karte/${r.id}`} className="btn ghost sm">🖨</Link>
      {r.status === "AKTIV" ? (
        <>
          <form action={renewCard}><input type="hidden" name="cardId" value={r.id} /><button className="btn ghost sm">Verlängern</button></form>
          <form action={replaceCard}><input type="hidden" name="cardId" value={r.id} /><button className="btn ghost sm">Ersetzen</button></form>
          <form action={blockCard}><input type="hidden" name="cardId" value={r.id} /><button className="btn ghost sm">Sperren</button></form>
        </>
      ) : null}
      {r.status === "GESPERRT" ? (
        <form action={unblockCard}><input type="hidden" name="cardId" value={r.id} /><button className="btn ghost sm">Entsperren</button></form>
      ) : null}
    </div>
  );

  return (
    <div>
      <div className="page-h">
        <div><h1>Karten</h1><div className="sub">{total} aktive Karten · {expiring.length} laufen in 30 Tagen ab</div></div>
        <Link href="/karten/papierkorb" className="btn ghost">🗑 Papierkorb{trashCount > 0 ? ` (${trashCount})` : ""}</Link>
      </div>

      {expiring.length > 0 ? (
        <form action={renewCardsBulk} className="panel mb-4" style={{ borderColor: "var(--warn)" }}>
          <input type="hidden" name="months" value="6" />
          <div className="panel-h" style={{ background: "var(--warn-bg)" }}>
            <h3 style={{ color: "var(--warn)" }}>Bald ablaufende Karten</h3>
            <div className="flex items-center gap-2">
              <span className="pill warn">{expiring.length}</span>
              <ConfirmButton className="btn primary sm" message="Ausgewählte Karten um 6 Monate verlängern? Für jede ausgewählte Karte wird eine neue Karte erstellt (die alte wird ersetzt).">↻ Ausgewählte verlängern (6 Mon.)</ConfirmButton>
            </div>
          </div>
          <div className="twrap"><table className="data">
            <thead><tr><th></th><th>Person</th><th>Kartennr.</th><th>Gültig bis</th><th></th></tr></thead>
            <tbody>{expiring.map((r) => (
              <tr key={r.id}>
                <td><input type="checkbox" name="cardIds" value={r.id} aria-label={`${r.last} ${r.first} auswählen`} /></td>
                <td><Link href={`/personen/${r.personId}`} className="font-semibold hover:underline">{r.last}, {r.first}</Link></td>
                <td className="mono">{r.number}</td><td className="mono">{fmtDate(r.validTo)}</td>
                <td><Link href={`/druck/karte/${r.id}`} className="btn ghost sm">🖨</Link></td>
              </tr>
            ))}</tbody>
          </table></div>
        </form>
      ) : null}

      <div className="panel">
        <div className="panel-h">
          <h3>Karten <span className="pill muted">{rows.length}{!q && total > rows.length ? ` von ${total}` : ""}</span></h3>
          <form className="search max-w-[320px]" style={{ padding: 0 }}>
            <input name="q" defaultValue={q ?? ""} placeholder="🔍 Name oder Kartennr.…" className="inp" style={{ border: 0, background: "transparent" }} />
          </form>
        </div>
        {rows.length === 0 ? <div className="empty">{q ? "Kein Treffer." : "Noch keine Karten."}</div> : (
          <div className="twrap"><table className="data">
            <thead><tr><th>Person</th><th>Kartennr.</th><th>Standort</th><th>Gültig bis</th><th>Status</th><th></th></tr></thead>
            <tbody>{rows.map((r) => (
              <tr key={r.id}>
                <td><Link href={`/personen/${r.personId}`} className="font-semibold hover:underline">{r.last}, {r.first}</Link></td>
                <td className="mono">{r.number}</td>
                <td><span className={`pill ${r.locType === "LADEN" ? "tag-shop" : "tag-out"}`}>{r.loc}</span></td>
                <td className="mono">{fmtDate(r.validTo)}</td>
                <td>{statusPill(r.status, r.validTo, todayStr)}</td>
                <td>{actions(r)}</td>
              </tr>
            ))}</tbody>
          </table></div>
        )}
      </div>
    </div>
  );
}
