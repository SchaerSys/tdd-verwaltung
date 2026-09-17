import Link from "next/link";
import { notFound } from "next/navigation";
import { benutzerDesMandanten, kennzahlenDesMandanten, mailProtokoll, mandantLaden, mandantenStatus, smtpLaden } from "@/lib/unternehmen";
import { getCurrentOps } from "@/lib/auth";
import { zustellbarkeit } from "@/lib/mail";
import { fmt } from "@/components/SupportTeile";
import { checkliste } from "../checkliste";
import { Stammdaten } from "./Stammdaten";
import { SmtpForm, SmtpTest } from "./SmtpForm";
import { VertragForm } from "./VertragForm";
import { notizenSpeichern, smtpLoeschen } from "../actions";
import { DemoReset } from "./DemoReset";

export const dynamic = "force-dynamic";

const TABS = [
  ["uebersicht", "Übersicht"], ["stammdaten", "Stammdaten"], ["smtp", "E-Mail (SMTP)"], ["vertrag", "Vertrag & Module"],
  ["benutzer", "Benutzer"], ["mails", "Mail-Protokoll"], ["notizen", "Notizen"],
] as const;
type Tab = (typeof TABS)[number][0];

export default async function UnternehmenDetail({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ tab?: string }> }) {
  const { id } = await params;
  const sp = await searchParams;
  const tab: Tab = (TABS.find((t) => t[0] === sp.tab)?.[0] ?? "uebersicht");
  const ops = await getCurrentOps();
  const [t, status] = await Promise.all([mandantLaden(id), mandantenStatus()]);
  const m = status.find((x) => x.id === id);
  if (!t || !m || !ops) notFound();
  const super_ = ops.rolle === "SUPER";
  const punkte = checkliste(m);
  const offen = punkte.filter((p) => !p.ok).length;

  return (
    <div>
      <div className="page-h">
        <div>
          <h1>{t.name}</h1>
          <div className="sub mono">{t.slug} · {t.id} · angelegt {fmt(t.createdAt)} · Plan {t.plan}{t.testBis ? ` · Test bis ${t.testBis}` : ""}{!m.aktiv_effektiv ? " · INAKTIV" : ""}</div>
        </div>
        <Link href="/unternehmen" className="btn ghost sm">← Alle Mandanten</Link>
      </div>

      <div className="flex gap-1 mb-4 flex-wrap">
        {TABS.map(([k, label]) => (
          <Link key={k} href={`/unternehmen/${id}?tab=${k}`} className={`btn sm ${tab === k ? "primary" : "ghost"}`}>
            {label}{k === "uebersicht" && offen > 0 ? <span className="pill warn" style={{ marginLeft: 6 }}>{offen}</span> : null}
            {k === "smtp" && !m.smtp ? <span className="pill warn" style={{ marginLeft: 6 }}>fehlt</span> : null}
            {k === "mails" && m.mails_fehler_30 > 0 ? <span className="pill bad" style={{ marginLeft: 6 }}>{m.mails_fehler_30}</span> : null}
          </Link>
        ))}
      </div>

      {tab === "uebersicht" ? (
        <>
          {t.slug === "demo" && super_ ? <div className="panel mb-4"><div className="panel-h"><h3>Demo-Daten</h3></div><div style={{ padding: 12 }}><DemoReset id={id} /></div></div> : null}
          <Uebersicht m={m} punkte={punkte} id={id} />
        </>
      ) : null}
      {tab === "stammdaten" ? (
        <div className="panel"><div className="panel-h"><h3>Stammdaten</h3><span className="text-xs text-muted" style={{ marginLeft: 8 }}>erscheinen in Drucken, Datenschutzinformation und E-Mails der Fach-App</span></div>
          <div style={{ padding: 12 }}>
            {super_ ? <Stammdaten t={{ id: t.id, name: t.name, host: t.host, kurzname: t.kurzname, anschrift: t.anschrift, vertretung: t.vertretung, kontaktEmail: t.kontaktEmail, kontaktTelefon: t.kontaktTelefon, website: t.website }} />
              : <NurLesen zeilen={[["Name", t.name], ["Kurzname", t.kurzname], ["Host", t.host], ["Anschrift", t.anschrift], ["Vertretung", t.vertretung], ["Kontakt", [t.kontaktEmail, t.kontaktTelefon].filter(Boolean).join(" · ")], ["Website", t.website]]} />}
          </div>
        </div>
      ) : null}
      {tab === "smtp" ? <SmtpTab id={id} super_={super_} opsEmail={ops.email} /> : null}
      {tab === "vertrag" ? (
        <div className="panel"><div className="panel-h"><h3>Vertrag &amp; Module</h3></div>
          <div style={{ padding: 12 }}>
            {super_ ? <VertragForm t={{ id: t.id, plan: t.plan, testBis: t.testBis, vertragBeginn: t.vertragBeginn, vertragEnde: t.vertragEnde, kuendigungsfrist: t.kuendigungsfrist, limitBenutzer: t.limitBenutzer, limitStandorte: t.limitStandorte, module: t.module ?? {}, ansprechpartner: t.ansprechpartner }} zaehler={{ benutzer: m.benutzer, standorte: m.standorte }} />
              : <NurLesen zeilen={[["Plan", t.plan], ["Testphase bis", t.testBis], ["Vertrag", [t.vertragBeginn, t.vertragEnde].filter(Boolean).join(" – ")], ["Kündigungsfrist", t.kuendigungsfrist], ["Limit Benutzer", t.limitBenutzer != null ? String(t.limitBenutzer) : null], ["Limit Standorte", t.limitStandorte != null ? String(t.limitStandorte) : null], ["Ansprechpartner", t.ansprechpartner]]} />}
          </div>
        </div>
      ) : null}
      {tab === "benutzer" ? <BenutzerTab id={id} /> : null}
      {tab === "mails" ? <MailsTab id={id} /> : null}
      {tab === "notizen" ? (
        <div className="panel"><div className="panel-h"><h3>Notizen des Betreibers</h3><span className="text-xs text-muted" style={{ marginLeft: 8 }}>nur hier sichtbar – Vertragliches, Ansprechpartner, Absprachen</span></div>
          <form action={notizenSpeichern} style={{ padding: 12 }} className="flex flex-col gap-2">
            <input type="hidden" name="id" value={id} />
            <textarea name="notizen" className="inp w-full" rows={12} defaultValue={t.notizen ?? ""} placeholder="z. B. Vertrag unterschrieben am …, Ansprechpartner …, Besonderheiten …" />
            <div><button className="btn sm" type="submit">Speichern</button></div>
          </form>
        </div>
      ) : null}
    </div>
  );
}

function NurLesen({ zeilen }: { zeilen: [string, string | null | undefined][] }) {
  return <table className="data"><tbody>{zeilen.map(([k, v]) => <tr key={k}><td className="text-muted" style={{ width: 180 }}>{k}</td><td style={{ whiteSpace: "pre-line" }}>{v || "—"}</td></tr>)}</tbody></table>;
}

async function Uebersicht({ m, punkte, id }: { m: Awaited<ReturnType<typeof mandantenStatus>>[number]; punkte: ReturnType<typeof checkliste>; id: string }) {
  const z = await kennzahlenDesMandanten(id);
  const offen = punkte.filter((p) => !p.ok).length;
  return (
    <>
      <div className="grid gap-3 sm:grid-cols-5 mb-4">
        <div className="card stat"><div className="k">Benutzer</div><div className="v">{m.benutzer}</div><div className="d">{m.admins} Admin{m.limit_benutzer ? ` · Limit ${m.limit_benutzer}` : ""}</div></div>
        <div className="card stat"><div className="k">Standorte</div><div className="v">{m.standorte}</div><div className="d">{m.lager} Lager{m.limit_standorte ? ` · Limit ${m.limit_standorte}` : ""}</div></div>
        <div className="card stat"><div className="k">Personen</div><div className="v">{z?.persons_total ?? m.personen}</div><div className="d">{z?.active_cards ?? 0} aktive Karten</div></div>
        <div className="card stat"><div className="k">Ausgaben 30 Tage</div><div className="v">{z?.distributions_30d ?? 0}</div></div>
        <div className="card stat"><div className="k">Mails 30 Tage</div><div className="v">{m.mails_30}</div><div className="d" style={{ color: m.mails_fehler_30 > 0 ? "var(--bad)" : undefined }}>{m.mails_fehler_30} fehlgeschlagen</div></div>
      </div>
      <div className="panel">
        <div className="panel-h"><h3>Inbetriebnahme</h3>{offen === 0 ? <span className="pill good">vollständig</span> : <span className="pill warn">{offen} von {punkte.length} offen</span>}
          <Link href={`/unternehmen/${id}/einrichten?schritt=2`} className="btn ghost sm" style={{ marginLeft: "auto" }}>Assistent öffnen</Link></div>
        <div className="twrap"><table className="data">
          <tbody>{punkte.map((p) => (
            <tr key={p.key}>
              <td style={{ width: 28 }}>{p.ok ? <span className="pill good">✓</span> : <span className="pill warn">·</span>}</td>
              <td><b>{p.titel}</b></td>
              <td className="text-muted text-sm">{p.hinweis}</td>
              <td>{!p.ok && p.href ? <Link href={p.href} className="btn ghost sm">Erledigen</Link> : null}</td>
            </tr>
          ))}</tbody>
        </table></div>
      </div>
    </>
  );
}

async function SmtpTab({ id, super_, opsEmail }: { id: string; super_: boolean; opsEmail: string }) {
  const s = await smtpLaden(id);
  const dnsInfo = s ? await zustellbarkeit(s.absenderEmail.split("@")[1] ?? "") : null;
  return (
    <div className="flex flex-col gap-4">
      <div className="panel">
        <div className="panel-h"><h3>E-Mail-Versand (SMTP)</h3>{s ? <span className="pill good">hinterlegt</span> : <span className="pill warn">nicht hinterlegt – Plattform-SMTP als Rückfall</span>}
          {s?.letzterTestAm ? <span className={`pill ${s.letzterTestOk ? "good" : "bad"}`} style={{ marginLeft: 8 }}>Test {fmt(s.letzterTestAm)}: {s.letzterTestOk ? "ok" : "fehlgeschlagen"}</span> : null}</div>
        <div style={{ padding: 12 }}>
          {super_ ? <SmtpForm id={id} werte={s} /> : <NurLesen zeilen={[["Server", s ? `${s.host}:${s.port} (${s.sicherheit})` : null], ["Benutzer", s?.benutzer], ["Absender", s ? `${s.absenderName ?? ""} <${s.absenderEmail}>` : null], ["Antwort an", s?.antwortAn], ["Stand", s ? `${fmt(s.aktualisiertAm)} · ${s.aktualisiertVon ?? ""}` : null]]} />}
          {s?.letzterTestInfo ? <div className="text-xs text-muted mt-2">Letzter Test: {s.letzterTestInfo}</div> : null}
        </div>
      </div>
      {s ? (
        <div className="panel">
          <div className="panel-h"><h3>Test-Mail</h3></div>
          <div style={{ padding: 12 }} className="flex flex-col gap-3">
            <SmtpTest id={id} standard={opsEmail} />
            {super_ ? <form action={smtpLoeschen}><input type="hidden" name="id" value={id} /><button className="btn ghost sm" type="submit">SMTP-Einstellungen entfernen (zurück auf Plattform-SMTP)</button></form> : null}
          </div>
        </div>
      ) : null}
      {dnsInfo ? (
        <div className="panel">
          <div className="panel-h"><h3>Zustellbarkeit der Absender-Domain</h3>{dnsInfo.hinweise.length === 0 ? <span className="pill good">SPF, DMARC, MX vorhanden</span> : <span className="pill warn">{dnsInfo.hinweise.length} Hinweis(e)</span>}</div>
          <div style={{ padding: 12 }} className="text-sm flex flex-col gap-1">
            <div><b>SPF:</b> <span className="mono text-xs">{dnsInfo.spf ?? "—"}</span></div>
            <div><b>DMARC:</b> <span className="mono text-xs">{dnsInfo.dmarc ?? "—"}</span></div>
            <div><b>MX:</b> <span className="mono text-xs">{dnsInfo.mx.join(", ") || "—"}</span></div>
            {dnsInfo.hinweise.map((h) => <div key={h} className="pill warn" style={{ display: "block", whiteSpace: "normal" }}>{h}</div>)}
            <div className="text-xs text-muted">DKIM lässt sich ohne Selector nicht automatisch prüfen – beim Domain-Anbieter kontrollieren.</div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

async function BenutzerTab({ id }: { id: string }) {
  const liste = await benutzerDesMandanten(id);
  return (
    <div className="panel">
      <div className="panel-h"><h3>Benutzer dieses Mandanten</h3><span className="pill muted">{liste.length}</span>
        <Link href="/benutzer" className="btn ghost sm" style={{ marginLeft: "auto" }}>Verwalten (Mandant oben wählen)</Link></div>
      <div className="twrap"><table className="data">
        <thead><tr><th>Name</th><th>E-Mail</th><th>Rolle</th><th>2FA</th><th>Letzter Login</th><th>Status</th></tr></thead>
        <tbody>{liste.map((u) => (
          <tr key={u.id}>
            <td>{u.name}</td><td className="mono text-xs">{u.email}</td><td><span className="pill muted">{u.role}</span></td>
            <td>{u.totp ? "✓" : "—"}</td><td className="text-xs">{fmt(u.lastLogin)}</td>
            <td>{!u.isActive ? <span className="pill muted">inaktiv</span> : u.lockedUntil && u.lockedUntil > new Date() ? <span className="pill bad">gesperrt</span> : <span className="pill good">aktiv</span>}</td>
          </tr>
        ))}</tbody>
      </table></div>
    </div>
  );
}

async function MailsTab({ id }: { id: string }) {
  const p = await mailProtokoll(id);
  return (
    <div className="panel">
      <div className="panel-h"><h3>Mail-Protokoll</h3><span className="pill good">{p.gesendet30} gesendet (30 Tage)</span><span className={`pill ${p.fehler30 > 0 ? "bad" : "muted"}`} style={{ marginLeft: 6 }}>{p.fehler30} fehlgeschlagen</span>
        <span className="text-xs text-muted" style={{ marginLeft: 8 }}>ohne Inhalte, Empfänger nur als Domain</span></div>
      {p.eintraege.length === 0 ? <div className="empty">Noch keine Mails.</div> : (
        <div className="twrap"><table className="data">
          <thead><tr><th>Zeit</th><th>Auslöser</th><th>Betreff</th><th>Empfänger-Domain</th><th>Über</th><th>Quelle</th><th>Ergebnis</th></tr></thead>
          <tbody>{p.eintraege.map((e) => (
            <tr key={e.id}>
              <td className="mono text-xs">{fmt(e.at)}</td><td>{e.ausloeser ?? "—"}</td><td className="text-sm">{e.betreff}</td><td className="mono text-xs">{e.empfaenger_domain ?? "—"}</td>
              <td>{e.ueber ?? "—"}</td><td>{e.quelle}</td>
              <td>{e.gesendet ? <span className="pill good">gesendet</span> : <span className="pill bad" title={e.fehler ?? ""}>fehlgeschlagen{e.fehler ? ` · ${e.fehler.slice(0, 80)}` : ""}</span>}</td>
            </tr>
          ))}</tbody>
        </table></div>
      )}
    </div>
  );
}

