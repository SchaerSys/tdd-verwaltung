import nodemailer, { type Transporter } from "nodemailer";
import { promises as dns } from "node:dns";
import { sql } from "drizzle-orm";
import { mailLog, smtpKonfigAusUmgebung, smtpKonfigLaden, empfaengerFuerProtokoll, type SmtpKonfig } from "@tdd/db";
import { dbFuer } from "./db";

export interface MailAttachment { filename: string; content: Buffer }

/**
 * Mailversand der Wartungsplattform (057): fuer einen Mandanten (Einladungen, Freigaben) ueber
 * dessen SMTP, sonst ueber das Plattform-SMTP aus der Umgebung. Jeder Versuch ins Protokoll.
 */
const transporte = new Map<string, { stand: string; t: Transporter }>();

export function transportFuer(k: SmtpKonfig, key: string): Transporter {
  const v = transporte.get(key);
  if (v && v.stand === k.stand) return v.t;
  const t = nodemailer.createTransport({
    host: k.host, port: k.port, secure: k.sicherheit === "SSL",
    ignoreTLS: k.sicherheit === "KEINE", requireTLS: k.sicherheit === "STARTTLS",
    auth: k.benutzer ? { user: k.benutzer, pass: k.passwort ?? "" } : undefined,
    connectionTimeout: 10_000,
  });
  transporte.set(key, { stand: k.stand, t });
  return t;
}

export function absender(k: SmtpKonfig): string {
  return k.absenderName ? `"${k.absenderName.replace(/"/g, "")}" <${k.absenderEmail}>` : k.absenderEmail;
}

async function protokoll(tenantId: string | null, e: { to: string; subject: string; ausloeser?: string; gesendet: boolean; fehler?: string | null; ueber: string | null }): Promise<void> {
  try {
    const { hash, domain } = empfaengerFuerProtokoll(e.to);
    await dbFuer(tenantId).insert(mailLog).values({
      tenantId, empfaengerHash: hash, empfaengerDomain: domain, betreff: e.subject.slice(0, 200), ausloeser: e.ausloeser ?? null,
      quelle: "ops", gesendet: e.gesendet, fehler: e.fehler ? e.fehler.slice(0, 500) : null, ueber: e.ueber,
    });
  } catch (err) { console.error("[mail] Protokoll fehlgeschlagen:", err instanceof Error ? err.message : err); }
}

export async function sendMail(opts: {
  to: string; subject: string; text: string; attachments?: MailAttachment[];
  /** Mandant, in dessen Namen gesendet wird (dessen SMTP); null = Plattform. */
  tenantId?: string | null; ausloeser?: string;
}): Promise<{ sent: boolean; info?: string; ueber?: string }> {
  const tenantId = opts.tenantId ?? null;
  let konfig: SmtpKonfig | null = null; let ueber: "mandant" | "plattform" | null = null;
  if (tenantId) {
    try { konfig = await smtpKonfigLaden(dbFuer(tenantId), tenantId); if (konfig) ueber = "mandant"; }
    catch (e) { const info = e instanceof Error ? e.message : "SMTP nicht lesbar"; await protokoll(tenantId, { ...opts, gesendet: false, fehler: info, ueber: "mandant" }); return { sent: false, info }; }
  }
  if (!konfig) { konfig = smtpKonfigAusUmgebung(); ueber = konfig ? "plattform" : null; }
  if (!konfig) { await protokoll(tenantId, { ...opts, gesendet: false, fehler: "SMTP nicht konfiguriert", ueber: null }); return { sent: false, info: "SMTP nicht konfiguriert" }; }
  try {
    await transportFuer(konfig, ueber === "mandant" ? tenantId! : "plattform").sendMail({
      from: absender(konfig), replyTo: konfig.antwortAn ?? undefined, to: opts.to, subject: opts.subject, text: opts.text, attachments: opts.attachments,
    });
    await protokoll(tenantId, { ...opts, gesendet: true, ueber });
    return { sent: true, ueber: ueber ?? undefined };
  } catch (e) {
    const info = e instanceof Error ? e.message : "Fehler";
    await protokoll(tenantId, { ...opts, gesendet: false, fehler: info, ueber });
    return { sent: false, info, ueber: ueber ?? undefined };
  }
}

/** Test-Mail ueber das Mandanten-SMTP; Ergebnis wird an der Konfiguration vermerkt. */
export async function smtpTesten(tenantId: string, an: string, von: string): Promise<{ ok: boolean; info: string }> {
  let k: SmtpKonfig | null;
  try { k = await smtpKonfigLaden(dbFuer(tenantId), tenantId); }
  catch (e) { return { ok: false, info: e instanceof Error ? e.message : "SMTP nicht lesbar" }; }
  if (!k) return { ok: false, info: "Für diesen Mandanten ist kein SMTP hinterlegt." };
  let ok = false; let info: string;
  try {
    const t = transportFuer(k, `test:${tenantId}`);
    await t.verify();
    await t.sendMail({ from: absender(k), to: an, subject: "CareOS – Test der E-Mail-Einstellungen",
      text: `Diese Test-Mail wurde von der CareOS-Wartungsplattform über den SMTP-Server ${k.host}:${k.port} gesendet.\nAbsender: ${k.absenderEmail}\nAusgelöst von: ${von}\n\nWenn diese Mail ankommt, sind die Einstellungen in Ordnung.` });
    ok = true; info = `Gesendet an ${an} über ${k.host}:${k.port}`;
  } catch (e) { info = e instanceof Error ? e.message : "Fehler"; }
  await dbFuer(tenantId).execute(sql`UPDATE tenant_smtp SET letzter_test_am = now(), letzter_test_ok = ${ok}, letzter_test_info = ${info.slice(0, 500)} WHERE tenant_id = ${tenantId}::uuid`);
  await protokoll(tenantId, { to: an, subject: "Test der E-Mail-Einstellungen", ausloeser: "test", gesendet: ok, fehler: ok ? null : info, ueber: "mandant" });
  return { ok, info };
}

/** Zustellbarkeit: SPF / DMARC / MX der Absender-Domain (nur DNS lesen). DKIM ist ohne Selector nicht pruefbar. */
export async function zustellbarkeit(domain: string): Promise<{ spf: string | null; dmarc: string | null; mx: string[]; hinweise: string[] }> {
  const txt = async (name: string) => { try { return (await dns.resolveTxt(name)).map((t) => t.join("")); } catch { return []; } };
  const spf = (await txt(domain)).find((t) => t.toLowerCase().startsWith("v=spf1")) ?? null;
  const dmarc = (await txt(`_dmarc.${domain}`)).find((t) => t.toLowerCase().startsWith("v=dmarc1")) ?? null;
  let mx: string[] = [];
  try { mx = (await dns.resolveMx(domain)).sort((a, b) => a.priority - b.priority).map((m) => m.exchange); } catch { /* keine */ }
  const hinweise: string[] = [];
  if (!spf) hinweise.push("Kein SPF-Eintrag – Empfänger stufen Mails leicht als Spam ein. Beim Domain-Anbieter einen TXT-Eintrag v=spf1 mit dem Mailserver anlegen.");
  if (!dmarc) hinweise.push("Kein DMARC-Eintrag (_dmarc." + domain + ") – empfohlen: v=DMARC1; p=none; rua=mailto:… als Einstieg.");
  if (mx.length === 0) hinweise.push("Kein MX-Eintrag – Antworten an diese Domain kommen nicht an.");
  return { spf, dmarc, mx, hinweise };
}

/** Zeigt der Host per DNS auf diesen Server? Vergleich mit der Adresse des Plattform-Hosts. */
export async function hostZeigtHierher(host: string): Promise<{ ok: boolean; ip: string[]; erwartet: string[]; info: string }> {
  const platform = process.env.APP_DOMAIN || (process.env.APP_URL ? new URL(process.env.APP_URL).hostname : "tdd.schaer-systems.at");
  const auf = async (h: string) => { try { return await dns.resolve4(h); } catch { return [] as string[]; } };
  const [ip, erwartet] = await Promise.all([auf(host), auf(platform)]);
  if (ip.length === 0) return { ok: false, ip, erwartet, info: `Kein A-Eintrag für ${host}. DNS beim Domain-Anbieter auf ${erwartet.join(", ") || "die Server-IP"} setzen.` };
  const ok = erwartet.length > 0 && ip.some((x) => erwartet.includes(x));
  return { ok, ip, erwartet, info: ok ? `${host} zeigt auf ${ip.join(", ")} – passt.` : `${host} zeigt auf ${ip.join(", ")}, erwartet ${erwartet.join(", ")}.` };
}
