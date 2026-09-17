import nodemailer, { type Transporter } from "nodemailer";
import { currentTenantId, mailLog, smtpKonfigAusUmgebung, smtpKonfigLaden, empfaengerFuerProtokoll, type SmtpKonfig } from "@tdd/db";
import { db } from "./db";

export interface MailAttachment { filename: string; content: Buffer }

/**
 * E-Mail-Versand je Mandant (057): Zugangsdaten aus tenant_smtp des aktuellen Mandanten
 * (Pflege nur durch den Betreiber), Rueckfall auf das Plattform-SMTP aus der Umgebung.
 * Ist gar nichts konfiguriert, wird NICHT gesendet, sondern { sent:false } zurueckgegeben.
 * Jeder Versuch landet im Mail-Protokoll (Empfaenger nur als Hash + Domain, kein Inhalt).
 */
const transporte = new Map<string, { stand: string; t: Transporter }>();

function transport(k: SmtpKonfig, key: string): Transporter {
  const vorhanden = transporte.get(key);
  if (vorhanden && vorhanden.stand === k.stand) return vorhanden.t;
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

async function protokoll(e: { to: string; subject: string; ausloeser?: string; gesendet: boolean; fehler?: string | null; ueber: "mandant" | "plattform" | null }): Promise<void> {
  try {
    const { hash, domain } = empfaengerFuerProtokoll(e.to);
    await db().insert(mailLog).values({
      empfaengerHash: hash, empfaengerDomain: domain, betreff: e.subject.slice(0, 200), ausloeser: e.ausloeser ?? null,
      quelle: "app", gesendet: e.gesendet, fehler: e.fehler ? e.fehler.slice(0, 500) : null, ueber: e.ueber,
    });
  } catch (err) {
    console.error("[mail] Protokoll fehlgeschlagen:", err instanceof Error ? err.message : err);
  }
}

export async function sendMail(opts: {
  to: string; subject: string; text: string; attachments?: MailAttachment[];
  /** Fuer das Protokoll: einladung | passwort | bescheid | kartenablauf | pin | … */
  ausloeser?: string;
}): Promise<{ sent: boolean; info?: string }> {
  const tenant = currentTenantId();
  let konfig: SmtpKonfig | null;
  let ueber: "mandant" | "plattform" | null = null;
  try {
    konfig = await smtpKonfigLaden(db());
    if (konfig) ueber = "mandant";
  } catch (e) {
    const info = e instanceof Error ? e.message : "SMTP-Konfiguration nicht lesbar";
    await protokoll({ ...opts, gesendet: false, fehler: info, ueber: "mandant" });
    return { sent: false, info };
  }
  if (!konfig) { konfig = smtpKonfigAusUmgebung(); ueber = konfig ? "plattform" : null; }
  if (!konfig) {
    await protokoll({ ...opts, gesendet: false, fehler: "SMTP nicht konfiguriert", ueber: null });
    return { sent: false, info: "SMTP nicht konfiguriert" };
  }
  try {
    await transport(konfig, ueber === "mandant" ? tenant : "plattform").sendMail({
      from: absender(konfig), replyTo: konfig.antwortAn ?? undefined,
      to: opts.to, subject: opts.subject, text: opts.text, attachments: opts.attachments,
    });
    await protokoll({ ...opts, gesendet: true, ueber });
    return { sent: true };
  } catch (e) {
    const info = e instanceof Error ? e.message : "Fehler";
    await protokoll({ ...opts, gesendet: false, fehler: info, ueber });
    return { sent: false, info };
  }
}
