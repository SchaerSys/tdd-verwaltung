import Link from "next/link";
import { notFound } from "next/navigation";
import { eq } from "drizzle-orm";
import { antraege, antragDocuments } from "@tdd/db";
import { getCurrentUser } from "@/lib/auth";
import { withOrg } from "@/lib/org";
import { suggest, suggestionLabel, INCOME_FIELDS, EXPENSE_FIELDS, type Financials } from "@/lib/eligibility";
import { decideAntrag, addAntragDocument } from "./actions";
import { fmtDate } from "@/lib/format";

const DOC_TYPES = ["AUSWEIS", "ZMR", "KONTOAUSZUG", "MIETVERTRAG", "SONSTIGES"] as const;
const DOC_LABEL: Record<string, string> = {
  AUSWEIS: "Ausweis", ZMR: "ZMR-Auszug", KONTOAUSZUG: "Kontoauszug", MIETVERTRAG: "Mietvertrag", SONSTIGES: "Sonstiges", BESCHEID: "Bescheid",
};

const eur = (v: number) => v.toLocaleString("de-AT", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " €";

export default async function AntragDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await getCurrentUser();
  const orgId = user?.organizationId ?? 0;

  const data = orgId
    ? await withOrg(orgId, async (tx) => {
        const arows = await tx.select().from(antraege).where(eq(antraege.id, id)).limit(1);
        const docs = arows[0]
          ? await tx.select({ id: antragDocuments.id, docType: antragDocuments.docType, uploadedAt: antragDocuments.uploadedAt }).from(antragDocuments).where(eq(antragDocuments.antragId, id))
          : [];
        return { a: arows[0], docs };
      })
    : { a: undefined, docs: [] as { id: string; docType: string; uploadedAt: Date }[] };
  const a = data.a;
  const docs = data.docs;
  if (!a) notFound();

  const fin = (a.financials ?? { income: {}, expense: {} }) as Financials;
  const available = Number(a.availableIncome ?? 0);
  const limit = Number(a.incomeLimit ?? 0);
  const sug = suggest(available, limit);
  const sColor = sug === "BERECHTIGT" ? "good" : sug === "HAERTEFALL" ? "warn" : "bad";
  const open = a.status === "OFFEN" || a.status === "IN_PRUEFUNG";
  const label = (k: string, list: readonly (readonly [string, string])[]) => list.find((x) => x[0] === k)?.[1] ?? k;

  return (
    <div>
      <div className="page-h">
        <div><h1>{a.firstName} {a.lastName}</h1><div className="sub">Antrag · {a.targetType === "LADEN" ? "Laden" : "Ausgabestelle"}</div></div>
        <Link href="/portal" className="btn ghost">← Zurück</Link>
      </div>

      <div className="grid gap-4 lg:grid-cols-2 items-start">
        <div className="panel">
          <div className="panel-h"><h3>Antragsteller</h3></div>
          <div className="p-4 text-[.8125rem] flex flex-col gap-1">
            <div><span className="text-muted">Geburtsdatum:</span> <span className="mono">{fmtDate(a.birthDate)}</span></div>
            <div><span className="text-muted">Adresse:</span> {[a.address, a.postalCode, a.city].filter(Boolean).join(", ") || "—"}</div>
            <div><span className="text-muted">Telefon:</span> <span className="mono">{a.phone ?? "—"}</span></div>
            <div><span className="text-muted">Haushalt:</span> {a.adults} Erw. · {a.childrenU12} Kind(er) &lt;12 · {a.childrenO12} Kind(er) ≥12</div>
            <div><span className="text-muted">DSGVO-Einwilligung:</span> {a.consentGiven ? `ja (${a.consentAt ?? ""})` : "nein"}</div>
          </div>
        </div>

        <div className="panel" style={{ borderColor: `var(--${sColor})` }}>
          <div className="panel-h" style={{ background: `var(--${sColor}-bg)` }}><h3 style={{ color: `var(--${sColor})` }}>Anspruchsprüfung</h3>
            <span className={`pill ${sColor}`}>{suggestionLabel(sug)}</span></div>
          <div className="p-4 grid grid-cols-2 gap-3 text-center">
            <div><div className="text-[.72rem] text-muted">Einnahmen</div><div className="mono font-bold">{eur(Number(a.incomeTotal ?? 0))}</div></div>
            <div><div className="text-[.72rem] text-muted">Ausgaben</div><div className="mono font-bold">{eur(Number(a.expenseTotal ?? 0))}</div></div>
            <div><div className="text-[.72rem] text-muted">Verfügbar</div><div className="mono font-bold">{eur(available)}</div></div>
            <div><div className="text-[.72rem] text-muted">Einkommensgrenze</div><div className="mono font-bold">{eur(limit)}</div></div>
          </div>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-2 items-start mt-4">
        <div className="panel"><div className="panel-h"><h3>Einnahmen</h3></div>
          <div className="p-4 text-[.8125rem] flex flex-col gap-1">
            {INCOME_FIELDS.map(([k]) => (fin.income?.[k] ? <div key={k} className="flex justify-between"><span>{label(k, INCOME_FIELDS)}</span><span className="mono">{eur(Number(fin.income[k]))}</span></div> : null))}
          </div></div>
        <div className="panel"><div className="panel-h"><h3>Ausgaben</h3></div>
          <div className="p-4 text-[.8125rem] flex flex-col gap-1">
            {EXPENSE_FIELDS.map(([k]) => (fin.expense?.[k] ? <div key={k} className="flex justify-between"><span>{label(k, EXPENSE_FIELDS)}</span><span className="mono">{eur(Number(fin.expense[k]))}</span></div> : null))}
          </div></div>
      </div>

      {/* Dokumente */}
      <div className="panel mt-4">
        <div className="panel-h"><h3>Dokumente</h3><span className="pill muted">{docs.length}</span></div>
        <div className="p-4 flex flex-col gap-3">
          {docs.length ? (
            <div className="flex flex-col gap-1 text-[.8125rem]">
              {docs.map((d) => (
                <div key={d.id} className="flex items-center gap-2">
                  <span className="pill tag-out">{DOC_LABEL[d.docType] ?? d.docType}</span>
                  <span className="text-muted mono">{fmtDate(d.uploadedAt)}</span>
                </div>
              ))}
            </div>
          ) : <div className="text-[.72rem] text-muted">Noch keine Dokumente.</div>}
          {open ? (
            <form action={addAntragDocument} className="flex items-end gap-2 flex-wrap border-t border-[color:var(--border)] pt-3">
              <input type="hidden" name="antragId" value={a.id} />
              <div className="field"><label className="lbl">Dokument-Typ</label>
                <select name="docType" className="inp">{DOC_TYPES.map((t) => <option key={t} value={t}>{DOC_LABEL[t]}</option>)}</select></div>
              <input type="file" name="file" accept="image/*,application/pdf,.docx" className="text-[.8125rem]" required />
              <button className="btn" type="submit">Hochladen</button>
            </form>
          ) : null}
          <div className="text-[.72rem] text-muted">Bild, PDF oder Word. Wandern bei positivem Bescheid mit zur Person (nur für TDD-Admin sichtbar).</div>
        </div>
      </div>

      {/* Bescheid */}
      <div className="panel mt-4">
        <div className="panel-h"><h3>Bescheid</h3>
          <span className={`pill ${a.status === "POSITIV" ? "good" : a.status === "NEGATIV" ? "bad" : "muted"}`}>{a.status.toLowerCase()}</span></div>
        <div className="p-4">
          {open ? (
            <form action={decideAntrag} className="flex flex-col gap-3">
              <input type="hidden" name="antragId" value={a.id} />
              <div className="field"><label className="lbl">Begründung / Anmerkung</label><input name="reason" className="inp" placeholder="optional" /></div>
              <div className="flex gap-2">
                <button type="submit" name="decision" value="POSITIV" className="btn primary">✓ Positiv bescheiden &amp; an TDD übergeben</button>
                <button type="submit" name="decision" value="NEGATIV" className="btn danger">✕ Negativ bescheiden</button>
              </div>
              <div className="text-[.72rem] text-muted">Bei positivem Bescheid wird die Person automatisch bei TDD angelegt (inkl. Dokumente).</div>
            </form>
          ) : (
            <div className="text-[.8125rem] flex flex-col gap-1">
              <div>Entschieden am <b>{fmtDate(a.decidedAt)}</b>{a.decisionReason ? ` · ${a.decisionReason}` : ""}</div>
              {a.status === "POSITIV" && a.transferredPersonId ? <div className="pill good" style={{ alignSelf: "flex-start" }}>✓ an TDD übergeben</div> : null}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
