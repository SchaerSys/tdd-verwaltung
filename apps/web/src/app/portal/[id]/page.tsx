import Link from "next/link";
import { notFound } from "next/navigation";
import { and, asc, eq, isNull } from "drizzle-orm";
import { antraege, antragDocuments, antragNachrichten } from "@tdd/db";
import { getCurrentUser } from "@/lib/auth";
import { withOrg } from "@/lib/org";
import { suggest, suggestionLabel, INCOME_FIELDS, EXPENSE_FIELDS, type Financials } from "@/lib/eligibility";
import { decideAntrag, addAntragDocument, sendNachricht } from "./actions";
import { fmtDate, fmtDateTime } from "@/lib/format";
import { ladeRueckstatus } from "@/lib/portal-status";
import { antragCheck, checkZusammenfassung } from "@/lib/antrag-check";
import { RueckPill } from "@/components/portal/Pills";
import { Verlauf } from "@/components/portal/Verlauf";

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
        if (!arows[0]) return { a: undefined, docs: [], nachrichten: [], vorgaenger: undefined, folge: undefined };
        const docs = await tx.select({ id: antragDocuments.id, docType: antragDocuments.docType, uploadedAt: antragDocuments.uploadedAt }).from(antragDocuments).where(eq(antragDocuments.antragId, id));
        const nachrichten = await tx.select().from(antragNachrichten).where(eq(antragNachrichten.antragId, id)).orderBy(asc(antragNachrichten.createdAt));
        // Antworten von TDD gelten mit dem Oeffnen als gelesen.
        if (nachrichten.some((n) => n.seite === "TDD" && !n.gelesenAt)) {
          await tx.update(antragNachrichten).set({ gelesenAt: new Date() })
            .where(and(eq(antragNachrichten.antragId, id), eq(antragNachrichten.seite, "TDD"), isNull(antragNachrichten.gelesenAt)));
        }
        const vorgaenger = arows[0].vorgaengerAntragId
          ? (await tx.select({ id: antraege.id, createdAt: antraege.createdAt, status: antraege.status }).from(antraege).where(eq(antraege.id, arows[0].vorgaengerAntragId)).limit(1))[0]
          : undefined;
        const folge = (await tx.select({ id: antraege.id, createdAt: antraege.createdAt, status: antraege.status }).from(antraege).where(eq(antraege.vorgaengerAntragId, id)).limit(1))[0];
        return { a: arows[0], docs, nachrichten, vorgaenger, folge };
      })
    : { a: undefined, docs: [], nachrichten: [], vorgaenger: undefined, folge: undefined };
  const a = data.a;
  if (!a) notFound();
  const docs = data.docs;
  const rueck = a.transferredPersonId ? (await ladeRueckstatus([a.transferredPersonId])).get(a.transferredPersonId) ?? null : null;

  const fin = (a.financials ?? { income: {}, expense: {} }) as Financials;
  const available = Number(a.availableIncome ?? 0);
  const limit = Number(a.incomeLimit ?? 0);
  const sug = suggest(available, limit);
  const sColor = sug === "BERECHTIGT" ? "good" : sug === "HAERTEFALL" ? "warn" : "bad";
  const open = a.status === "OFFEN" || a.status === "IN_PRUEFUNG";
  const label = (k: string, list: readonly (readonly [string, string])[]) => list.find((x) => x[0] === k)?.[1] ?? k;

  const check = antragCheck({
    firstName: a.firstName, lastName: a.lastName, email: a.email ?? "", birthDate: a.birthDate ?? "", address: a.address ?? "",
    postalCode: a.postalCode ?? "", city: a.city ?? "", phone: a.phone ?? "", consent: a.consentGiven,
    intendedLocationId: a.intendedLocationId, einnahmenErfasst: Number(a.incomeTotal ?? 0) > 0, dokumente: docs.map((d) => d.docType),
  });
  const zsf = checkZusammenfassung(check);
  const verlaengerungSinnvoll = a.status === "POSITIV" && !data.folge && (!rueck || rueck.stufe === "LAEUFT_AB" || rueck.stufe === "ABGELAUFEN" || rueck.stufe === "GELOESCHT");

  return (
    <div>
      <div className="page-h">
        <div>
          <h1>{a.firstName} {a.lastName}</h1>
          <div className="sub">
            Antrag vom {fmtDate(a.createdAt)} · {a.targetType === "LADEN" ? "Laden" : "Ausgabestelle"}
            {data.vorgaenger ? <> · Verlängerung von <Link href={`/portal/${data.vorgaenger.id}`}>Antrag vom {fmtDate(data.vorgaenger.createdAt)}</Link></> : null}
            {data.folge ? <> · Folgeantrag: <Link href={`/portal/${data.folge.id}`}>{fmtDate(data.folge.createdAt)} ({data.folge.status.toLowerCase()})</Link></> : null}
          </div>
        </div>
        <div className="flex gap-2">
          {a.status === "POSITIV" && !data.folge ? <Link href={`/portal/neu?vorlage=${a.id}`} className={`btn ${verlaengerungSinnvoll ? "primary" : "ghost"}`}>↻ Verlängerungsantrag</Link> : null}
          <Link href="/portal" className="btn ghost">← Zurück</Link>
        </div>
      </div>

      {/* Rueckkanal: Stand bei TDD */}
      {a.status === "POSITIV" ? (
        <div className="panel mb-4" style={{ borderColor: `var(--${rueck?.pill === "good" ? "good" : rueck?.pill === "warn" ? "warn" : rueck?.pill === "bad" ? "bad" : "border"})` }}>
          <div className="panel-h"><h3>Stand bei TDD</h3><RueckPill r={rueck} /></div>
          <div className="p-4 text-[.8125rem] grid gap-2 sm:grid-cols-3">
            <div><div className="text-[.72rem] text-muted">Übergeben am</div><div>{fmtDate(a.decidedAt)}</div></div>
            <div><div className="text-[.72rem] text-muted">Karte gültig bis</div><div className="mono">{rueck?.gueltigBis ? fmtDate(rueck.gueltigBis) : "—"}</div></div>
            <div><div className="text-[.72rem] text-muted">Bezüge</div><div>{rueck?.bezuege ? `${rueck.bezuege} · zuletzt ${fmtDate(rueck.letzterBezug)}` : "noch keiner"}</div></div>
          </div>
          {verlaengerungSinnvoll && rueck && rueck.stufe !== "GELOESCHT" ? (
            <div className="px-4 pb-4 text-[.75rem]" style={{ color: "var(--warn)" }}>
              Die Berechtigung endet bzw. ist beendet. Mit „Verlängerungsantrag“ wird ein neuer Antrag mit den bekannten Daten vorbefüllt – nur die aktuellen Einkommenswerte sind neu zu erfassen.
            </div>
          ) : null}
        </div>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-2 items-start">
        <div className="panel">
          <div className="panel-h"><h3>Antragsteller</h3></div>
          <div className="p-4 text-[.8125rem] flex flex-col gap-1">
            <div><span className="text-muted">Geburtsdatum:</span> <span className="mono">{fmtDate(a.birthDate)}</span></div>
            <div><span className="text-muted">Adresse:</span> {[a.address, a.postalCode, a.city].filter(Boolean).join(", ") || "—"}</div>
            <div><span className="text-muted">Telefon:</span> <span className="mono">{a.phone ?? "—"}</span></div>
            <div><span className="text-muted">E-Mail:</span> {a.email ?? "—"}</div>
            <div><span className="text-muted">Haushalt:</span> {a.adults} Erw. · {a.childrenU12} Kind(er) &lt;12 · {a.childrenO12} Kind(er) ≥12</div>
            <div><span className="text-muted">DSGVO-Einwilligung:</span> {a.consentGiven ? `ja (${fmtDate(a.consentAt)})` : "nein"}</div>
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

      {/* Vollstaendigkeit – nur solange der Antrag offen ist */}
      {open ? (
        <div className="panel mt-4" style={{ borderColor: zsf.pflichtFehlt.length ? "var(--bad)" : zsf.empfohlenFehlt.length ? "var(--warn)" : "var(--good)" }}>
          <div className="panel-h"><h3>Vollständigkeit</h3>
            {zsf.vollstaendig ? <span className="pill good"><span className="dot" />vollständig</span>
              : zsf.pflichtFehlt.length ? <span className="pill bad">{zsf.pflichtFehlt.length} Pflichtangabe(n) fehlen</span>
              : <span className="pill warn">{zsf.empfohlenFehlt.length} Empfehlung(en) offen</span>}
          </div>
          <ul className="p-4 flex flex-col gap-1 text-[.8125rem]">
            {check.map((c) => (
              <li key={c.key} className="flex gap-2 items-start">
                <span style={{ color: c.ok ? "var(--good)" : c.pflicht ? "var(--bad)" : "var(--warn)", width: 16, flex: "none" }}>{c.ok ? "✓" : c.pflicht ? "✕" : "○"}</span>
                <span>{c.label}{c.pflicht ? " *" : ""}{!c.ok && c.hinweis ? <span className="text-muted"> – {c.hinweis}</span> : null}</span>
              </li>
            ))}
          </ul>
          <div className="px-4 pb-3 text-[.72rem] text-muted">* Pflicht für den positiven Bescheid. Empfehlungen sparen Rückfragen bei TDD.</div>
        </div>
      ) : null}

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
                <button type="submit" name="decision" value="POSITIV" className="btn primary" disabled={zsf.pflichtFehlt.length > 0}
                  title={zsf.pflichtFehlt.length ? "Pflichtangaben fehlen (siehe Vollständigkeit)" : undefined}>✓ Positiv bescheiden &amp; an TDD übergeben</button>
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

      {/* Rueckfragen / Verlauf mit TDD */}
      <div className="panel mt-4">
        <div className="panel-h"><h3>Rückfragen an TDD</h3><span className="pill muted">{data.nachrichten.length}</span></div>
        <Verlauf
          nachrichten={data.nachrichten.map((n) => ({ id: n.id, seite: n.seite, autor: n.autorName, text: n.text, am: fmtDateTime(n.createdAt) }))}
          eigeneSeite="ORG"
          action={sendNachricht}
          antragId={a.id}
          hinweis="Fragen zu diesem Antrag direkt an das TDD-Büro – z. B. ob die Person schon bekannt ist, welcher Standort passt oder warum die Karte noch nicht ausgestellt wurde. TDD antwortet hier; neue Antworten sind auf der Startseite markiert."
        />
      </div>
    </div>
  );
}
