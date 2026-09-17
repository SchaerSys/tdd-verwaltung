import { requireJobToken } from "@/lib/job-auth";
import { fuerAlleMandanten } from "@/lib/tenant-jobs";
import { ladeRegeln } from "@/lib/azg-daten";
import { ladeMonatsbericht, monatName, monatsberichtText } from "@/lib/monatsbericht";
import { mandant } from "@/lib/mandant";
import { sendMail } from "@/lib/mail";
import { appUrl } from "@/lib/auth-tokens";

export const dynamic = "force-dynamic";

/** Monatsbericht fuer den Vormonat an die in den Zeitregeln hinterlegten Adressen (Cron am 1., 06:00). ?monat=YYYY-MM erzwingt einen Monat. */
export async function GET(req: Request) {
  const denied = requireJobToken(req);
  if (denied) return denied;
  const url = new URL(req.url);
  const vormonat = new Date(); vormonat.setUTCDate(1); vormonat.setUTCMonth(vormonat.getUTCMonth() - 1);
  const monat = /^\d{4}-\d{2}$/.test(url.searchParams.get("monat") ?? "") ? url.searchParams.get("monat")! : `${vormonat.getUTCFullYear()}-${String(vormonat.getUTCMonth() + 1).padStart(2, "0")}`;
  const ergebnis = await fuerAlleMandanten(async () => {
    const regeln = await ladeRegeln();
    const an = (regeln.monatsberichtEmail ?? "").split(",").map((s) => s.trim()).filter((s) => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(s));
    if (an.length === 0) return { gesendet: 0, grund: "kein Empfänger" };
    const [b, m] = await Promise.all([ladeMonatsbericht(monat), mandant()]);
    let gesendet = 0;
    for (const e of an) {
      const r = await sendMail({ ausloeser: "monatsbericht", to: e, subject: `${m.kurzname} – Monatsbericht ${monatName(monat)}`,
        text: `${monatsberichtText(b, m.name)}\n\nDruckfassung (Anmeldung nötig): ${appUrl()}/druck/monatsbericht?monat=${monat}` });
      if (r.sent) gesendet++;
    }
    return { gesendet, monat };
  });
  return Response.json(ergebnis);
}
