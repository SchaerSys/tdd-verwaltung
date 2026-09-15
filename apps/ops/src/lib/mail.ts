import nodemailer from "nodemailer";

export interface MailAttachment { filename: string; content: Buffer }

/**
 * Versendet eine E-Mail über den konfigurierten SMTP-Server. Ist kein SMTP
 * konfiguriert (SMTP_HOST leer), wird NICHT gesendet, sondern { sent:false }
 * zurückgegeben (der Absender – Gemeinde/Institution/TDD – ist noch offen).
 */
export async function sendMail(opts: {
  to: string; subject: string; text: string; attachments?: MailAttachment[];
}): Promise<{ sent: boolean; info?: string }> {
  const host = process.env.SMTP_HOST;
  if (!host) return { sent: false, info: "SMTP nicht konfiguriert" };
  try {
    const port = Number(process.env.SMTP_PORT ?? 587);
    const transport = nodemailer.createTransport({
      host, port, secure: port === 465,
      auth: process.env.SMTP_USER ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS } : undefined,
    });
    await transport.sendMail({
      from: process.env.SMTP_FROM ?? "noreply@tdd.schaer-systems.at",
      to: opts.to, subject: opts.subject, text: opts.text, attachments: opts.attachments,
    });
    return { sent: true };
  } catch (e) {
    return { sent: false, info: e instanceof Error ? e.message : "Fehler" };
  }
}
