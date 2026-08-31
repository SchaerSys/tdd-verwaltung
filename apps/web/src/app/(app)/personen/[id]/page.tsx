import Link from "next/link";
import { redirect, notFound } from "next/navigation";
import { and, eq, desc, sql } from "drizzle-orm";
import { persons, personLocationAssignments, locations, lookupValues, cards, distributions, scanDocuments } from "@tdd/db";

const DOC_LABEL: Record<string, string> = {
  AUSWEIS: "Ausweis", ZMR: "ZMR-Auszug", KONTOAUSZUG: "Kontoauszug", MIETVERTRAG: "Mietvertrag", BESCHEID: "Bescheid", VEREINSFORMULAR: "Vereinsformular", SONSTIGES: "Sonstiges",
};
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { hasPermission } from "@/lib/rbac";
import { issueCard, renewCard, blockCard, replaceCard, unblockCard } from "../../karten/actions";
import { deletePerson } from "./bearbeiten/actions";
import { ConfirmButton } from "@/components/ConfirmButton";
import { fmtDate, fmtDateTime } from "@/lib/format";

async function label(id: number | null): Promise<string | null> {
  if (id == null) return null;
  const r = await db().select({ label: lookupValues.label }).from(lookupValues).where(eq(lookupValues.id, id)).limit(1);
  return r[0]?.label ?? null;
}

export default async function DossierPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user || !hasPermission(user.role, "person:read")) redirect("/dashboard");

  const { id } = await params;
  const rows = await db().select().from(persons).where(eq(persons.id, id)).limit(1);
  const p = rows[0];
  if (!p) notFound();

  const [assignment, personCards, personDist, distAgg, lang, origin] = await Promise.all([
    db().select({ name: locations.name, type: locations.type })
      .from(personLocationAssignments)
      .innerJoin(locations, eq(personLocationAssignments.locationId, locations.id))
      .where(and(eq(personLocationAssignments.personId, id), eq(personLocationAssignments.isActive, true)))
      .limit(1),
    db().select().from(cards).where(eq(cards.personId, id)).orderBy(desc(cards.createdAt)),
    db().select().from(distributions).where(eq(distributions.personId, id)).orderBy(desc(distributions.distributedAt)).limit(50),
    db().select({
      due: sql<string>`COALESCE(SUM(${distributions.amountDue}), 0)`,
      paid: sql<string>`COALESCE(SUM(${distributions.amountPaid}), 0)`,
    }).from(distributions).where(eq(distributions.personId, id)),
    label(p.languageId),
    label(p.originId),
  ]);
  const sumDue = Number(distAgg[0]?.due ?? 0);
  const sumPaid = Number(distAgg[0]?.paid ?? 0);
  const offen = Math.max(0, Math.round((sumDue - sumPaid) * 100) / 100);

  const loc = assignment[0];
  const todayStr = new Date().toISOString().slice(0, 10);
  const hasActiveCard = personCards.some((c) => c.status === "AKTIV" && c.validTo >= todayStr);
  const canManageCards = hasPermission(user.role, "card:manage");
  const canManagePersons = hasPermission(user.role, "person:write");
  const canViewDocs = hasPermission(user.role, "document:view");
  const documents = canViewDocs
    ? await db().select({ id: scanDocuments.id, docType: scanDocuments.docType, uploadedAt: scanDocuments.uploadedAt })
        .from(scanDocuments).where(eq(scanDocuments.personId, id)).orderBy(desc(scanDocuments.uploadedAt))
    : [];
  const inits = `${p.firstName[0] ?? ""}${p.lastName[0] ?? ""}`.toUpperCase();

  return (
    <div>
      <div className="page-h">
        <div><h1>Person-Dossier</h1><div className="sub">Interne ID · <span className="mono">{p.id.slice(0, 8)}</span></div></div>
        {canManagePersons ? (
          <div className="flex gap-2">
            <Link href={`/personen/${p.id}/bearbeiten`} className="btn">✎ Bearbeiten</Link>
            <form action={deletePerson}>
              <input type="hidden" name="personId" value={p.id} />
              <ConfirmButton className="btn danger" message={`Person „${p.firstName} ${p.lastName}" wirklich löschen?`}>🗑 Löschen</ConfirmButton>
            </form>
          </div>
        ) : null}

      </div>

      <div className="dossier-head" style={{ display: "flex", gap: 18, alignItems: "center", flexWrap: "wrap", background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "var(--r)", padding: 18, boxShadow: "var(--shadow)" }}>
        <div style={{ width: 76, height: 76, borderRadius: 14, background: "var(--surface-2)", border: "1px solid var(--border)", display: "grid", placeItems: "center", color: "var(--muted-2)", fontSize: ".72rem", flex: "none", fontWeight: 700 }}>{inits}</div>
        <div style={{ flex: 1 }}>
          <div className="flex gap-2 items-center flex-wrap">
            <h2 style={{ fontSize: "1.4rem" }}>{p.firstName} {p.lastName}</h2>
            {hasActiveCard
              ? <span className="pill good"><span className="dot" />Berechtigt</span>
              : <span className="pill muted">Keine aktive Karte</span>}
            {loc ? <span className={`pill ${loc.type === "LADEN" ? "tag-shop" : "tag-out"}`}>{loc.name}</span> : <span className="pill muted">kein Standort</span>}
          </div>
          <div className="flex gap-6 flex-wrap mt-2 text-[.8125rem]">
            <Meta l="Geburtsdatum" v={fmtDate(p.birthDate)} mono />
            <Meta l="Haushalt" v={p.householdSize != null ? `${Math.max(0, p.householdSize - (p.childrenCount ?? 0))} Erw.${p.childrenCount != null ? ` · ${p.childrenCount} Kinder` : ""}` : "—"} />
            <Meta l="Telefon" v={p.phone ?? "—"} mono />
            <Meta l="Sprache" v={lang ?? "—"} />
            <Meta l="Herkunft" v={origin ?? "—"} />
          </div>
        </div>
      </div>

      <div className="flex gap-1 border-b border-[color:var(--border)] mt-5 flex-wrap">
        {["Stammdaten", "Karten", "Ausgaben", "Dokumente / Scans", "Notizen", "Verlauf"].map((t, i) => (
          <span key={t} className={`px-3 py-2 text-[.8125rem] font-semibold cursor-default border-b-2 ${i === 0 ? "text-[color:var(--accent)] border-[color:var(--accent)]" : "text-[color:var(--muted)] border-transparent"}`}>{t}</span>
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-2 items-start mt-4">
        <div className="panel">
          <div className="panel-h"><h3>Adresse &amp; Kontakt</h3></div>
          <div className="p-4 text-[.8125rem] flex flex-col gap-2">
            <div><span className="text-[color:var(--muted)]">Adresse:</span> {[p.address, p.postalCode, p.city].filter(Boolean).join(", ") || "—"}</div>
            <div><span className="text-[color:var(--muted)]">E-Mail:</span> {p.email ?? "—"}</div>
            {p.note ? <div><span className="text-[color:var(--muted)]">Notiz:</span> {p.note}</div> : null}
          </div>
        </div>
        <div className="panel">
          <div className="panel-h"><h3>Karten</h3></div>
          {canManageCards && loc ? (
            <form action={issueCard} className="p-4 border-b border-[color:var(--border)] flex items-end gap-2 flex-wrap">
              <input type="hidden" name="personId" value={p.id} />
              <div className="field"><label className="lbl">Laufdauer</label>
                <select name="months" className="inp"><option value="6">6 Monate</option><option value="3">3 Monate</option><option value="12">12 Monate</option></select></div>
              <button className="btn primary" type="submit">＋ Karte ausstellen</button>
            </form>
          ) : canManageCards && !loc ? (
            <div className="p-4 text-[.72rem] text-[color:var(--muted)]">Zum Ausstellen einer Karte zuerst einen Standort zuordnen.</div>
          ) : null}
          {personCards.length === 0
            ? <div className="empty">Noch keine Karte ausgestellt.</div>
            : (
              <div className="twrap"><table className="data">
                <thead><tr><th>Kartennr.</th><th>Gültig bis</th><th>Status</th><th></th></tr></thead>
                <tbody>{personCards.map((c) => {
                  const active = c.status === "AKTIV";
                  return (
                    <tr key={c.id}>
                      <td className="mono">{c.cardNumber}</td>
                      <td className="mono">{fmtDate(c.validTo)}</td>
                      <td>{active && c.validTo < todayStr
                        ? <span className="pill bad">abgelaufen</span>
                        : active ? <span className="pill good"><span className="dot" />aktiv</span>
                        : c.status === "GESPERRT" ? <span className="pill bad">gesperrt</span>
                        : <span className="pill muted">{c.status.toLowerCase()}</span>}</td>
                      <td>
                        <div className="flex gap-1 justify-end flex-wrap">
                          <Link href={`/druck/karte/${c.id}`} className="btn ghost sm">🖨</Link>
                          {active && canManageCards ? (
                            <>
                              <form action={renewCard}><input type="hidden" name="cardId" value={c.id} /><button className="btn ghost sm">Verlängern</button></form>
                              <form action={replaceCard}><input type="hidden" name="cardId" value={c.id} /><button className="btn ghost sm">Ersetzen</button></form>
                              <form action={blockCard}><input type="hidden" name="cardId" value={c.id} /><button className="btn ghost sm">Sperren</button></form>
                            </>
                          ) : null}
                          {c.status === "GESPERRT" && canManageCards ? (
                            <form action={unblockCard}><input type="hidden" name="cardId" value={c.id} /><button className="btn ghost sm">Entsperren</button></form>
                          ) : null}
                        </div>
                      </td>
                    </tr>
                  );
                })}</tbody>
              </table></div>
            )}
        </div>
      </div>

      <div className="panel mt-4">
        <div className="panel-h"><h3>Ausgaben &amp; Zahlungen</h3></div>
        {personDist.length === 0
          ? <div className="empty">Noch keine Ausgaben protokolliert.</div>
          : <div className="twrap"><table className="data">
              <thead><tr><th>Datum</th><th>Art</th><th className="text-right">Fällig</th><th className="text-right">Bezahlt</th></tr></thead>
              <tbody>
                {personDist.map((d) => {
                  const paid = d.amountPaid != null ? Number(d.amountPaid) : null;
                  const due = d.amountDue != null ? Number(d.amountDue) : null;
                  const isSettle = d.note === "Schulden beglichen" || (due === 0 && (paid ?? 0) > 0);
                  const fmt = (n: number | null) => n == null ? "—" : n.toLocaleString("de-AT", { style: "currency", currency: "EUR" });
                  return (
                    <tr key={d.id}>
                      <td className="mono">{fmtDateTime(d.distributedAt)}</td>
                      <td>{isSettle ? <span className="pill good">Schulden beglichen</span> : <span className="pill muted">Ausgabe</span>}</td>
                      <td className="text-right mono">{fmt(due)}</td>
                      <td className="text-right mono">{fmt(paid)}</td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr className="total-row">
                  <td colSpan={2}><b>Total</b></td>
                  <td className="text-right mono"><b>{sumDue.toLocaleString("de-AT", { style: "currency", currency: "EUR" })}</b></td>
                  <td className="text-right mono"><b>{sumPaid.toLocaleString("de-AT", { style: "currency", currency: "EUR" })}</b></td>
                </tr>
                <tr className="total-row">
                  <td colSpan={3}><b>Offener Ausstand</b></td>
                  <td className="text-right mono"><b style={{ color: offen > 0 ? "var(--warn)" : "var(--good)" }}>{offen.toLocaleString("de-AT", { style: "currency", currency: "EUR" })}</b></td>
                </tr>
              </tfoot>
            </table></div>}
      </div>

      {/* Dokumente – nur für Admin (document:view) */}
      {canViewDocs ? (
        <div className="panel mt-4">
          <div className="panel-h"><h3>Dokumente / Scans</h3><span className="pill muted">{documents.length}</span></div>
          {documents.length ? (
            <div className="p-4 flex flex-col gap-2 text-[.8125rem]">
              {documents.map((d) => (
                <div key={d.id} className="flex items-center gap-3">
                  <span className="pill tag-out">{DOC_LABEL[d.docType] ?? d.docType}</span>
                  <span className="text-muted mono">{fmtDate(d.uploadedAt)}</span>
                  <a href={`/dokument/${d.id}`} target="_blank" rel="noreferrer" className="btn ghost sm ml-auto">Öffnen ↗</a>
                </div>
              ))}
            </div>
          ) : <div className="empty">Keine Dokumente.</div>}
        </div>
      ) : (
        <div className="panel mt-4"><div className="p-4"><div className="lock-note">🔒 Dokumente sind nur für Administratoren einsehbar.</div></div></div>
      )}
    </div>
  );
}

function Meta({ l, v, mono }: { l: string; v: string; mono?: boolean }) {
  return (
    <div>
      <div className="text-[.72rem] text-[color:var(--muted)]">{l}</div>
      <div className={`font-semibold mt-0.5 ${mono ? "mono" : ""}`}>{v}</div>
    </div>
  );
}
