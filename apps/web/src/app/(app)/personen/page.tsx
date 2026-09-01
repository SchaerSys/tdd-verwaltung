import Link from "next/link";
import { redirect } from "next/navigation";
import { and, asc, eq, exists, ilike, isNull, or, sql } from "drizzle-orm";
import { persons, personLocationAssignments, locations, cards } from "@tdd/db";
import { normalizeName } from "@tdd/core";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { hasPermission } from "@/lib/rbac";
import { fmtDate } from "@/lib/format";

const PAGE_SIZE = 50;

function initials(first: string, last: string) {
  return `${first[0] ?? ""}${last[0] ?? ""}`.toUpperCase();
}

/** Kompakte Seiten-Liste mit Auslassungen, z. B. 1 … 4 5 6 … 20. */
function pageList(cur: number, total: number): (number | "…")[] {
  const wanted = new Set<number>([1, total, cur - 1, cur, cur + 1]);
  const nums = [...wanted].filter((n) => n >= 1 && n <= total).sort((a, b) => a - b);
  const out: (number | "…")[] = [];
  let prev = 0;
  for (const n of nums) {
    if (n - prev > 1) out.push("…");
    out.push(n);
    prev = n;
  }
  return out;
}

export default async function PersonenPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; page?: string }>;
}) {
  const user = await getCurrentUser();
  if (!user || !hasPermission(user.role, "person:read")) redirect("/dashboard");

  const { q, page: pageRaw } = await searchParams;
  const scoped = user.role !== "ADMIN" && user.locationId != null;

  const conds = [isNull(persons.deletedAt), eq(persons.takeoverPending, false)];
  if (scoped) conds.push(eq(personLocationAssignments.locationId, user.locationId!));
  if (q && q.trim()) {
    const raw = q.trim();
    const nameLike = `%${normalizeName(raw)}%`;
    const rawLike = `%${raw}%`;
    const parts = [
      ilike(persons.lastNameNorm, nameLike),
      ilike(persons.firstNameNorm, nameLike),
      ilike(persons.address, rawLike),
      ilike(persons.city, rawLike),
      ilike(persons.postalCode, rawLike),
    ];
    // Kartennummer (nur wenn die Eingabe ziffernartig ist): Person hat eine passende Karte.
    const digits = raw.replace(/\D/g, "");
    if (digits.length >= 3) {
      parts.push(
        exists(
          db()
            .select({ x: sql`1` })
            .from(cards)
            .where(and(eq(cards.personId, persons.id), isNull(cards.deletedAt), ilike(cards.cardNumber, `%${digits}%`))),
        ),
      );
    }
    conds.push(or(...parts)!);
  }

  // Gesamtzahl (gleiche Joins/Filter wie die Liste) → Seitenanzahl.
  const totalRow = await db()
    .select({ n: sql<number>`count(*)::int` })
    .from(persons)
    .leftJoin(personLocationAssignments, and(eq(personLocationAssignments.personId, persons.id), eq(personLocationAssignments.isActive, true)))
    .leftJoin(locations, eq(personLocationAssignments.locationId, locations.id))
    .where(and(...conds));
  const total = totalRow[0]?.n ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const page = Math.min(Math.max(1, parseInt(pageRaw ?? "1", 10) || 1), totalPages);
  const offset = (page - 1) * PAGE_SIZE;

  const rows = await db()
    .select({
      id: persons.id, firstName: persons.firstName, lastName: persons.lastName,
      birthDate: persons.birthDate, address: persons.address, postalCode: persons.postalCode, city: persons.city,
      locName: locations.name, locType: locations.type,
    })
    .from(persons)
    .leftJoin(personLocationAssignments, and(eq(personLocationAssignments.personId, persons.id), eq(personLocationAssignments.isActive, true)))
    .leftJoin(locations, eq(personLocationAssignments.locationId, locations.id))
    .where(and(...conds))
    .orderBy(asc(persons.lastName), asc(persons.firstName))
    .limit(PAGE_SIZE)
    .offset(offset);

  const canWrite = hasPermission(user.role, "person:write");
  const trashRow = canWrite
    ? await db().select({ n: sql<number>`count(*)::int` }).from(persons).where(sql`${persons.deletedAt} IS NOT NULL`)
    : [{ n: 0 }];
  const trashCount = trashRow[0]?.n ?? 0;

  const mk = (p: number) => {
    const sp = new URLSearchParams();
    if (q && q.trim()) sp.set("q", q.trim());
    if (p > 1) sp.set("page", String(p));
    const s = sp.toString();
    return `/personen${s ? `?${s}` : ""}`;
  };
  const fromN = total === 0 ? 0 : offset + 1;
  const toN = Math.min(offset + PAGE_SIZE, total);

  return (
    <div>
      <div className="page-h">
        <div>
          <h1>Personen</h1>
          <div className="sub">{total} {total === 1 ? "Person" : "Personen"}{scoped ? " · eigener Standort" : ""}{total > 0 ? ` · ${fromN}–${toN} angezeigt` : ""}</div>
        </div>
        {canWrite ? (
          <div className="flex gap-2">
            <a href={`/personen/export${q && q.trim() ? `?q=${encodeURIComponent(q.trim())}` : ""}`} className="btn ghost" title="Aktuelle Liste als Excel exportieren">⬇ Excel</a>
            <Link href="/personen/papierkorb" className="btn ghost">🗑 Papierkorb{trashCount > 0 ? ` (${trashCount})` : ""}</Link>
            <Link href="/personen/neu" className="btn primary">＋ Neu aufnehmen</Link>
          </div>
        ) : null}
      </div>

      <div className="panel">
        <div className="panel-h">
          <form className="search max-w-[320px]" style={{ padding: 0 }}>
            <input name="q" defaultValue={q ?? ""} placeholder="🔍 Name, Adresse oder Kartennummer…" className="inp" style={{ border: 0, background: "transparent" }} />
          </form>
        </div>
        <div className="twrap">
          <table className="data">
            <thead><tr><th>Name</th><th>Geburtsdatum</th><th>Adresse</th><th>Bezugsort</th><th></th></tr></thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id}>
                  <td>
                    <div className="cell-name">
                      <span className="av-sm">{initials(r.firstName, r.lastName)}</span>
                      <b>{r.lastName}, {r.firstName}</b>
                    </div>
                  </td>
                  <td className="mono">{fmtDate(r.birthDate)}</td>
                  <td>{[r.address, r.postalCode, r.city].filter(Boolean).join(", ") || "—"}</td>
                  <td>{r.locName ? <span className={`pill ${r.locType === "LADEN" ? "tag-shop" : "tag-out"}`}>{r.locName}</span> : <span className="pill muted">nicht zugeordnet</span>}</td>
                  <td><Link href={`/personen/${r.id}`} className="btn ghost sm">Öffnen →</Link></td>
                </tr>
              ))}
              {rows.length === 0 ? (
                <tr><td colSpan={5}><div className="empty">Keine Personen gefunden. Über „Neu aufnehmen" oder den Excel-Import anlegen.</div></td></tr>
              ) : null}
            </tbody>
          </table>
        </div>

        {totalPages > 1 ? (
          <div className="pager">
            {page > 1
              ? <Link href={mk(page - 1)} className="btn ghost sm">← Zurück</Link>
              : <span className="btn ghost sm" aria-disabled style={{ opacity: .4, pointerEvents: "none" }}>← Zurück</span>}
            <div className="pager-nums">
              {pageList(page, totalPages).map((p, i) =>
                p === "…"
                  ? <span key={`e${i}`} className="pager-ell">…</span>
                  : <Link key={p} href={mk(p)} className={`btn sm ${p === page ? "primary" : "ghost"}`}>{p}</Link>,
              )}
            </div>
            {page < totalPages
              ? <Link href={mk(page + 1)} className="btn ghost sm">Weiter →</Link>
              : <span className="btn ghost sm" aria-disabled style={{ opacity: .4, pointerEvents: "none" }}>Weiter →</span>}
          </div>
        ) : null}
      </div>
    </div>
  );
}
