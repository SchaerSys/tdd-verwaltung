"use server";

import { revalidatePath } from "next/cache";
import { eq, sql } from "drizzle-orm";
import { redirect } from "next/navigation";
import { tenants, smtpPasswortVerschluesseln } from "@tdd/db";
import { db, dbFuer } from "@/lib/db";
import { audit } from "@/lib/audit";
import { requireOps, requireSuper } from "@/lib/auth";
import { mandantWaehlen } from "@/lib/tenant";
import { sendMail, smtpTesten } from "@/lib/mail";
import { appUrl } from "@/lib/constants";

export type UnternehmenState = { error?: string; info?: string; link?: string };

function rows<T>(res: unknown): T[] {
  if (Array.isArray(res)) return res as T[];
  const r = res as { rows?: T[] };
  return r.rows ?? [];
}

/** Mandant anlegen: die DB-Funktion (Owner) legt Organisation, Zeitregeln, Fristen und Auswahllisten mit an (054). */
export async function mandantAnlegen(_prev: UnternehmenState, fd: FormData): Promise<UnternehmenState> {
  const ops = await requireSuper();
  const name = String(fd.get("name") ?? "").trim();
  const slug = String(fd.get("slug") ?? "").trim().toLowerCase();
  if (!name) return { error: "Name ist Pflicht." };
  if (!/^[a-z0-9][a-z0-9-]{1,60}$/.test(slug)) return { error: "Kurzname: Kleinbuchstaben, Ziffern und Bindestrich, 2–61 Zeichen." };
  let id: string;
  try {
    const r = rows<{ id: string }>(await (await db()).execute(sql`SELECT ops_create_tenant(${name}, ${slug}) AS id`));
    id = r[0]!.id;
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Anlegen fehlgeschlagen.";
    return { error: /tenants_slug_key|duplicate key/.test(msg) ? "Dieser Kurzname ist schon vergeben." : msg };
  }
  await audit({ akteur: ops.email, action: "tenant.create", entityType: "tenant", entityId: id, after: { name, slug } });
  revalidatePath("/unternehmen"); revalidatePath("/", "layout");
  return { info: `Mandant „${name}“ angelegt. Über „Benutzer“ kann jetzt das erste Admin-Konto eingeladen werden (Mandant oben auswählen).` };
}

/** Mandant aktiv/inaktiv – inaktive Mandanten werden von den Hintergrundjobs der Fach-App übersprungen. */
export async function mandantSchalten(fd: FormData): Promise<void> {
  const ops = await requireSuper();
  const id = String(fd.get("id") ?? "");
  const an = fd.get("aktiv") === "1";
  if (!id) return;
  await (await db()).update(tenants).set({ isActive: an }).where(eq(tenants.id, id));
  await audit({ akteur: ops.email, action: an ? "tenant.activate" : "tenant.deactivate", entityType: "tenant", entityId: id });
  revalidatePath("/unternehmen"); revalidatePath("/", "layout");
}

const HOST = /^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/;

/** Stammdaten (055): Host, Kurzname, Anschrift, Kontakt – erscheinen in Drucken, Datenschutzinfo und E-Mails der Fach-App. */
export async function stammdatenSpeichern(_prev: UnternehmenState, fd: FormData): Promise<UnternehmenState> {
  const ops = await requireSuper();
  const id = String(fd.get("id") ?? "");
  const t = (v: string) => { const s = String(fd.get(v) ?? "").trim(); return s ? s : null; };
  const name = t("name"); const host = t("host")?.toLowerCase() ?? null;
  if (!id || !name) return { error: "Name ist Pflicht." };
  if (host && !HOST.test(host)) return { error: "Host: nur Hostname ohne Protokoll und Pfad, z. B. tirol.careos.at." };
  const email = t("kontaktEmail");
  if (email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return { error: "Kontakt-E-Mail ist ungültig." };
  try {
    await (await db()).update(tenants).set({
      name, host, kurzname: t("kurzname"), anschrift: t("anschrift"), vertretung: t("vertretung"),
      kontaktEmail: email, kontaktTelefon: t("kontaktTelefon"), website: t("website"), updatedAt: new Date(),
    }).where(eq(tenants.id, id));
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Speichern fehlgeschlagen.";
    return { error: /uq_tenants_host/.test(msg) ? "Dieser Host ist schon einem anderen Mandanten zugeordnet." : msg };
  }
  await audit({ akteur: ops.email, action: "tenant.update", entityType: "tenant", entityId: id, after: { name, host } });
  revalidatePath(`/unternehmen/${id}`); revalidatePath("/unternehmen"); revalidatePath("/", "layout");
  return { info: "Stammdaten gespeichert. Die Fach-App übernimmt den Host innerhalb einer Minute." };
}

/** Mandant im Kopf der Wartungsplattform waehlen (Cookie, steuert den DB-Kontext aller Seiten). */
export async function mandantSetzen(fd: FormData): Promise<void> {
  await requireOps();
  await mandantWaehlen(String(fd.get("mandant") ?? ""));
  revalidatePath("/", "layout");
}

// ── SMTP je Mandant (057) ─────────────────────────────────────────────────
export async function smtpSpeichern(_prev: UnternehmenState, fd: FormData): Promise<UnternehmenState> {
  const ops = await requireSuper();
  const id = String(fd.get("id") ?? "");
  const t = (v: string) => String(fd.get(v) ?? "").trim();
  const host = t("host").toLowerCase(); const port = Number(t("port") || 587);
  const sicherheit = ["STARTTLS", "SSL", "KEINE"].includes(t("sicherheit")) ? t("sicherheit") : "STARTTLS";
  const absender = t("absenderEmail").toLowerCase(); const passwort = String(fd.get("passwort") ?? "");
  if (!id || !host || !/^[a-z0-9.-]+$/.test(host)) return { error: "SMTP-Host fehlt oder ist ungültig." };
  if (!(port > 0 && port < 65536)) return { error: "Port ungültig." };
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(absender)) return { error: "Absender-Adresse ist ungültig." };
  const antwort = t("antwortAn").toLowerCase();
  if (antwort && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(antwort)) return { error: "Antwort-Adresse ist ungültig." };
  let enc: string | null = null;
  if (passwort) { try { enc = smtpPasswortVerschluesseln(passwort); } catch (e) { return { error: e instanceof Error ? e.message : "Verschlüsselung fehlgeschlagen" }; } }
  await dbFuer(null).execute(sql`SELECT ops_smtp_speichern(${id}::uuid, ${host}, ${port}, ${sicherheit}, ${t("benutzer")}, ${enc}, ${absender}, ${t("absenderName")}, ${antwort}, ${ops.email})`);
  await audit({ akteur: ops.email, action: "tenant.smtp", entityType: "tenant", entityId: id, after: { host, port, sicherheit, absender, passwortGeaendert: !!enc } });
  revalidatePath(`/unternehmen/${id}`);
  const weiter = String(fd.get("weiter") ?? "");
  if (weiter) redirect(weiter);
  return { info: enc ? "SMTP gespeichert (Passwort neu hinterlegt)." : "SMTP gespeichert (Passwort unverändert)." };
}

export async function smtpLoeschen(fd: FormData): Promise<void> {
  const ops = await requireSuper();
  const id = String(fd.get("id") ?? "");
  if (!id) return;
  await dbFuer(null).execute(sql`DELETE FROM tenant_smtp WHERE tenant_id = ${id}::uuid`);
  await audit({ akteur: ops.email, action: "tenant.smtp.delete", entityType: "tenant", entityId: id });
  revalidatePath(`/unternehmen/${id}`);
}

export async function smtpTest(_prev: UnternehmenState, fd: FormData): Promise<UnternehmenState> {
  const ops = await requireOps();
  const id = String(fd.get("id") ?? ""); const an = String(fd.get("an") ?? "").trim() || ops.email;
  if (!id) return { error: "Mandant fehlt." };
  const r = await smtpTesten(id, an, ops.email);
  revalidatePath(`/unternehmen/${id}`);
  return r.ok ? { info: r.info } : { error: `Test fehlgeschlagen: ${r.info}` };
}

// ── Vertrag, Module, Notizen ──────────────────────────────────────────────
export async function vertragSpeichern(_prev: UnternehmenState, fd: FormData): Promise<UnternehmenState> {
  const ops = await requireSuper();
  const id = String(fd.get("id") ?? "");
  const t = (v: string) => { const s = String(fd.get(v) ?? "").trim(); return s ? s : null; };
  const datum = (v: string) => { const s = t(v); return s && /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : null; };
  const zahl = (v: string) => { const s = t(v); const n = s ? Number(s) : NaN; return Number.isFinite(n) && n > 0 ? Math.round(n) : null; };
  const plan = ["TEST", "BASIS", "PLUS"].includes(t("plan") ?? "") ? t("plan")! : "BASIS";
  const module: Record<string, boolean> = {};
  for (const m of ["portal", "personal", "zivildienst", "touren", "station"]) if (fd.get(`modul_${m}`) !== "on") module[m] = false;
  if (!id) return { error: "Mandant fehlt." };
  await dbFuer(null).update(tenants).set({
    plan, testBis: datum("testBis"), vertragBeginn: datum("vertragBeginn"), vertragEnde: datum("vertragEnde"), kuendigungsfrist: t("kuendigungsfrist"),
    limitBenutzer: zahl("limitBenutzer"), limitStandorte: zahl("limitStandorte"), module, ansprechpartner: t("ansprechpartner"), updatedAt: new Date(),
  }).where(eq(tenants.id, id));
  await audit({ akteur: ops.email, action: "tenant.vertrag", entityType: "tenant", entityId: id, after: { plan, testBis: datum("testBis"), vertragEnde: datum("vertragEnde"), module } });
  revalidatePath(`/unternehmen/${id}`); revalidatePath("/unternehmen");
  return { info: "Vertrag und Module gespeichert." };
}

export async function notizenSpeichern(fd: FormData): Promise<void> {
  const ops = await requireOps();
  const id = String(fd.get("id") ?? "");
  if (!id) return;
  await dbFuer(null).update(tenants).set({ notizen: String(fd.get("notizen") ?? "").trim() || null, updatedAt: new Date() }).where(eq(tenants.id, id));
  await audit({ akteur: ops.email, action: "tenant.notizen", entityType: "tenant", entityId: id });
  revalidatePath(`/unternehmen/${id}`);
}

// ── Anlege-Assistent ──────────────────────────────────────────────────────
export async function assistentAnlegen(_prev: UnternehmenState, fd: FormData): Promise<UnternehmenState> {
  const ops = await requireSuper();
  const name = String(fd.get("name") ?? "").trim();
  const slug = String(fd.get("slug") ?? "").trim().toLowerCase();
  if (!name) return { error: "Name ist Pflicht." };
  if (!/^[a-z0-9][a-z0-9-]{1,60}$/.test(slug)) return { error: "Kurzname (URL): Kleinbuchstaben, Ziffern, Bindestrich." };
  let id: string;
  try {
    const r = rows<{ id: string }>(await (await db()).execute(sql`SELECT ops_create_tenant(${name}, ${slug}) AS id`));
    id = r[0]!.id;
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Anlegen fehlgeschlagen.";
    return { error: /tenants_slug_key|duplicate key/.test(msg) ? "Dieser Kurzname ist schon vergeben." : msg };
  }
  const t = (v: string) => { const s = String(fd.get(v) ?? "").trim(); return s ? s : null; };
  const plan = ["TEST", "BASIS", "PLUS"].includes(t("plan") ?? "") ? t("plan")! : "TEST";
  const testBis = t("testBis") && /^\d{4}-\d{2}-\d{2}$/.test(t("testBis")!) ? t("testBis") : null;
  await dbFuer(null).update(tenants).set({
    kurzname: t("kurzname"), anschrift: t("anschrift"), kontaktEmail: t("kontaktEmail")?.toLowerCase() ?? null, kontaktTelefon: t("kontaktTelefon"),
    website: t("website"), ansprechpartner: t("ansprechpartner"), plan, testBis: plan === "TEST" ? testBis : null, updatedAt: new Date(),
  }).where(eq(tenants.id, id));
  await audit({ akteur: ops.email, action: "tenant.create", entityType: "tenant", entityId: id, after: { name, slug, plan } });
  revalidatePath("/unternehmen"); revalidatePath("/", "layout");
  redirect(`/unternehmen/${id}/einrichten?schritt=2`);
}

export async function hostSpeichern(_prev: UnternehmenState, fd: FormData): Promise<UnternehmenState> {
  const ops = await requireSuper();
  const id = String(fd.get("id") ?? "");
  const host = String(fd.get("host") ?? "").trim().toLowerCase() || null;
  if (!id) return { error: "Mandant fehlt." };
  if (host && !/^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/.test(host)) return { error: "Host ungültig (nur Hostname, z. B. tirol.careos.at)." };
  try { await dbFuer(null).update(tenants).set({ host, updatedAt: new Date() }).where(eq(tenants.id, id)); }
  catch (e) { const msg = e instanceof Error ? e.message : ""; return { error: /uq_tenants_host/.test(msg) ? "Host ist schon einem anderen Mandanten zugeordnet." : msg }; }
  await audit({ akteur: ops.email, action: "tenant.update", entityType: "tenant", entityId: id, after: { host } });
  revalidatePath(`/unternehmen/${id}`);
  const weiter = String(fd.get("weiter") ?? "");
  if (weiter) redirect(weiter);
  return { info: host ? `Host ${host} gespeichert.` : "Ohne eigenen Host – Einstieg über /m/<kurzname>." };
}

/** Erstes Admin-Konto des Mandanten: Einladung ueber dessen SMTP (Willkommens-Mail), Rueckfall Plattform. */
export async function adminEinladen(_prev: UnternehmenState, fd: FormData): Promise<UnternehmenState> {
  const ops = await requireSuper();
  const id = String(fd.get("id") ?? "");
  const email = String(fd.get("email") ?? "").trim().toLowerCase();
  const name = String(fd.get("displayName") ?? "").trim();
  if (!id) return { error: "Mandant fehlt." };
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email) || !name) return { error: "E-Mail und Name sind Pflicht." };
  const t = (await dbFuer(null).select({ name: tenants.name, slug: tenants.slug, host: tenants.host }).from(tenants).where(eq(tenants.id, id)).limit(1))[0];
  if (!t) return { error: "Mandant nicht gefunden." };
  let token: string;
  try {
    const r = rows<{ t: string }>(await dbFuer(null).execute(sql`SELECT ops_invite_user(${email}, ${name}, 'ADMIN', NULL, NULL, ${id}::uuid) AS t`));
    token = r[0]!.t;
  } catch (e) {
    const msg = e instanceof Error ? e.message : "";
    return { error: /users_email_key|duplicate key/.test(msg) ? "Diese E-Mail-Adresse hat in diesem Mandanten schon ein Konto." : msg || "Einladung fehlgeschlagen." };
  }
  const basis = t.host ? `https://${t.host}` : appUrl();
  const einstieg = t.host ? `${basis}/login` : `${basis}/m/${t.slug}`;
  const link = `${basis}/passwort-neu?token=${token}`;
  const mail = await sendMail({
    tenantId: id, ausloeser: "willkommen", to: email, subject: `Willkommen bei CareOS – ${t.name}`,
    text: `Guten Tag ${name},\n\nfür ${t.name} wurde CareOS eingerichtet und Sie sind als Administrator:in eingetragen.\n\n1. Passwort festlegen (Link gilt 72 Stunden):\n${link}\n\n2. Danach anmelden unter:\n${einstieg}\n\nErste Schritte: Standorte anlegen (Verwaltung → Stammdaten), Personal erfassen, weitere Benutzer einladen.\nBei Fragen hilft der Betreiber: ${ops.email}\n\nFreundliche Grüße\nCareOS · Schär Systems`,
  });
  await audit({ akteur: ops.email, action: "user.invite", entityType: "user", entityId: email, after: { rolle: "ADMIN", tenant: id, mail: mail.sent, ueber: mail.ueber ?? null } });
  revalidatePath(`/unternehmen/${id}`);
  return mail.sent
    ? { info: `Willkommens-Mail an ${email} verschickt (${mail.ueber === "mandant" ? "Mandanten-SMTP" : "Plattform-SMTP"}).` }
    : { info: `Konto angelegt, Mail konnte nicht gesendet werden (${mail.info ?? "SMTP"}). Link zum Weitergeben:`, link };
}

/** Demo-Mandant zuruecksetzen: Fach-App baut den fiktiven Datenbestand neu (Job-Endpunkt, nur Kurzname "demo"). */
export async function demoZuruecksetzen(_prev: UnternehmenState, fd: FormData): Promise<UnternehmenState> {
  const ops = await requireSuper();
  const id = String(fd.get("id") ?? "");
  const t = (await dbFuer(null).select({ slug: tenants.slug }).from(tenants).where(eq(tenants.id, id)).limit(1))[0];
  if (!t || t.slug !== "demo") return { error: "Nur für den Mandanten mit Kurzname „demo“." };
  const token = process.env.JOB_TOKEN;
  if (!token) return { error: "JOB_TOKEN fehlt in der Umgebung der Wartungsplattform." };
  const url = `${process.env.WEB_INTERNAL_URL ?? "http://tdd-web:3000"}/api/jobs/demo-reset`;
  try {
    const r = await fetch(url, { method: "POST", headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(110_000) });
    const j = (await r.json()) as { ok: boolean; error?: string; personen?: number; ausgaben?: number; personal?: number; touren?: number; antraege?: number; benutzer?: number };
    if (!j.ok) return { error: j.error ?? `Fehler ${r.status}` };
    await audit({ akteur: ops.email, action: "tenant.demo.reset", entityType: "tenant", entityId: id, after: { personen: j.personen, ausgaben: j.ausgaben } });
    revalidatePath(`/unternehmen/${id}`); revalidatePath("/unternehmen");
    return { info: `Demo neu aufgebaut: ${j.personen} Personen, ${j.ausgaben} Ausgaben, ${j.personal} Personal, ${j.touren} Touren, ${j.antraege} Anträge, ${j.benutzer} Benutzer.` };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Aufruf fehlgeschlagen" };
  }
}
