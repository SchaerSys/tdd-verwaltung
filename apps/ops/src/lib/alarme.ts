import { eq, sql } from "drizzle-orm";
import { opsAlarme, opsUsers } from "@tdd/db";
import { dbFuer } from "./db";
import { webStatus, dbStatus, zertStatus } from "./health";
import { hostDatei, platte } from "./host";
import { backupBewertung } from "./backup-log";
import { sendMail } from "./mail";

/**
 * Betreiber-Alarme (Stufe B): alle 15 Minuten per Cron aufgerufen (/api/alarme, JOB_TOKEN).
 * Jede Pruefung hat einen Schluessel und einen Zustand in ops_alarme. Mail geht nur bei
 * Zustandswechsel (ALARM / Entwarnung) und als Erinnerung alle 24 h, an ALARM_EMAIL oder
 * alle aktiven Super-Admins – ueber das Plattform-SMTP, nie ueber ein Mandanten-SMTP.
 */
export interface Pruefung { schluessel: string; aktiv: boolean; text: string }

function rows<T>(res: unknown): T[] { return (Array.isArray(res) ? res : (res as { rows?: T[] }).rows ?? []) as T[]; }

export async function pruefungen(): Promise<Pruefung[]> {
  const out: Pruefung[] = [];
  const web = await webStatus();
  out.push({ schluessel: "web", aktiv: !web.ok, text: web.ok ? "Fach-App antwortet" : `Fach-App nicht in Ordnung: ${web.fehler ?? "Healthcheck nicht ok"}` });
  try { const d = await dbStatus(); out.push({ schluessel: "db", aktiv: false, text: `Datenbank erreichbar (${d.groesseMb} MB)` }); }
  catch (e) { out.push({ schluessel: "db", aktiv: true, text: `Datenbank nicht erreichbar: ${e instanceof Error ? e.message : "Fehler"}` }); }

  const b = backupBewertung(await hostDatei("backup.log", 5), new Date(), 26);
  out.push({ schluessel: "backup", aktiv: !b.ok, text: b.eintrag ? (b.ok ? `Backup ok (${b.eintrag.text})` : b.veraltet ? `Letztes Backup älter als 26 h (${b.eintrag.zeit.toISOString()})` : `Backup fehlgeschlagen: ${b.eintrag.text}`) : "Kein Backup-Log" });

  const p = await platte();
  out.push(p ? { schluessel: "platte", aktiv: p.belegtProzent >= 80, text: `Platte ${p.belegtProzent} % belegt (${p.freiGb} GB frei)` } : { schluessel: "platte", aktiv: true, text: "Plattenstand nicht lesbar" });

  for (const host of [process.env.APP_DOMAIN || "tdd.schaer-systems.at", process.env.OPS_DOMAIN || "tddops.schaer-systems.at"]) {
    const z = await zertStatus(host);
    const schlecht = z.tage == null || z.tage < 14;
    out.push({ schluessel: `zert:${host}`, aktiv: schlecht, text: z.tage == null ? `Zertifikat ${host}: ${z.fehler ?? "nicht prüfbar"}` : `Zertifikat ${host} gültig noch ${z.tage} Tage` });
  }

  // Serverfehler je Mandant in 24 h (app_events, ohne Kontext = alle Mandanten)
  const fehler = rows<{ tenant_id: string | null; name: string | null; n: number }>(await dbFuer(null).execute(sql`
    SELECT e.tenant_id, t.name, count(*)::int AS n FROM app_events e LEFT JOIN tenants t ON t.id = e.tenant_id
    WHERE e.kind = 'FEHLER' AND e.at > now() - interval '24 hours' GROUP BY 1, 2`));
  for (const f of fehler) out.push({ schluessel: `fehler:${f.tenant_id ?? "-"}`, aktiv: f.n > 20, text: `${f.n} Serverfehler in 24 h bei ${f.name ?? "unbekannt"}` });

  // Naechtliche Jobs (jobs.log auf dem Host): letzter Lauf je Job nicht aelter als 26 h
  const jobs = await hostDatei("jobs.log", 60);
  for (const job of ["cleanup", "retention"]) {
    const letzte = [...jobs].reverse().find((z) => z.includes(` ${job} `));
    const zeit = letzte ? new Date(letzte.slice(0, 25)) : null;
    const alt = !zeit || Number.isNaN(zeit.getTime()) || Date.now() - zeit.getTime() > 26 * 36e5;
    const kaputt = !!letzte && /error|fehler|curl:/i.test(letzte);
    out.push({ schluessel: `job:${job}`, aktiv: alt || kaputt, text: !letzte ? `Job ${job}: kein Lauf im Log` : kaputt ? `Job ${job} mit Fehler: ${letzte.slice(0, 160)}` : alt ? `Job ${job} zuletzt ${letzte.slice(0, 25)}` : `Job ${job} ok (${letzte.slice(0, 19)})` });
  }
  return out;
}

async function empfaenger(): Promise<string[]> {
  const env = (process.env.ALARM_EMAIL ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  if (env.length) return env;
  const r = await dbFuer(null).select({ email: opsUsers.email }).from(opsUsers).where(sql`${opsUsers.isActive} AND ${opsUsers.rolle} = 'SUPER'`);
  return r.map((x) => x.email);
}

export interface AlarmLauf { geprueft: number; aktiv: string[]; neu: string[]; entwarnt: string[]; erinnert: string[]; mail: boolean }

export async function alarmeLaufen(): Promise<AlarmLauf> {
  const d = dbFuer(null);
  const jetzt = new Date();
  const liste = await pruefungen();
  const alt = new Map((await d.select().from(opsAlarme)).map((a) => [a.schluessel, a]));
  const neu: string[] = [], entwarnt: string[] = [], erinnert: string[] = [], aktiv: string[] = [];
  for (const p of liste) {
    const vorher = alt.get(p.schluessel);
    const war = vorher?.aktiv ?? false;
    let gemeldet = vorher?.zuletztGemeldet ?? null;
    if (p.aktiv) {
      aktiv.push(p.text);
      if (!war) { neu.push(p.text); gemeldet = jetzt; }
      else if (!gemeldet || jetzt.getTime() - gemeldet.getTime() > 24 * 36e5) { erinnert.push(p.text); gemeldet = jetzt; }
    } else if (war) { entwarnt.push(p.text); gemeldet = jetzt; }
    await d.insert(opsAlarme).values({ schluessel: p.schluessel, aktiv: p.aktiv, text: p.text, seit: p.aktiv ? (war ? vorher!.seit : jetzt) : null, zuletztGemeldet: gemeldet, zuletztGeprueft: jetzt })
      .onConflictDoUpdate({ target: opsAlarme.schluessel, set: { aktiv: p.aktiv, text: p.text, seit: p.aktiv ? (war ? vorher!.seit : jetzt) : null, zuletztGemeldet: gemeldet, zuletztGeprueft: jetzt } });
  }
  // Verschwundene Schluessel (z. B. Mandant geloescht) aufraeumen
  const bekannt = new Set(liste.map((p) => p.schluessel));
  for (const k of alt.keys()) if (!bekannt.has(k)) await d.delete(opsAlarme).where(eq(opsAlarme.schluessel, k));

  let mail = false;
  if (neu.length || entwarnt.length || erinnert.length) {
    const an = await empfaenger();
    const zeilen = [
      ...(neu.length ? ["ALARM (neu):", ...neu.map((t) => `  • ${t}`), ""] : []),
      ...(erinnert.length ? ["Weiterhin aktiv (Erinnerung):", ...erinnert.map((t) => `  • ${t}`), ""] : []),
      ...(entwarnt.length ? ["Entwarnung:", ...entwarnt.map((t) => `  • ${t}`), ""] : []),
      `Aktive Alarme gesamt: ${aktiv.length}`, `Geprüft: ${jetzt.toISOString()}`, "", `Super-Admin-Plattform: https://${process.env.OPS_DOMAIN || "tddops.schaer-systems.at"}/`,
    ];
    const betreff = neu.length ? `⚠ Tafelwerk ALARM: ${neu[0]!.slice(0, 70)}` : entwarnt.length && !erinnert.length ? `✓ Tafelwerk Entwarnung: ${entwarnt[0]!.slice(0, 70)}` : `⚠ Tafelwerk: ${aktiv.length} Alarm(e) weiterhin aktiv`;
    for (const e of an) { const r = await sendMail({ to: e, subject: betreff, text: zeilen.join("\n"), ausloeser: "alarm" }); mail = mail || r.sent; }
  }
  return { geprueft: liste.length, aktiv, neu, entwarnt, erinnert, mail };
}
