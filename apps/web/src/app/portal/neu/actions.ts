"use server";

import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { antraege } from "@tdd/db";
import { normalizeName } from "@tdd/core";
import { withOrg } from "@/lib/org";
import { antragSchema, betrag, parseForm } from "@/lib/forms";
import { requirePermission } from "@/lib/guard";
import { INCOME_FIELDS, EXPENSE_FIELDS, sumValues, incomeLimit } from "@/lib/eligibility";
import { unterschriftSpeichern, tokenErzeugen } from "@/lib/einwilligung";
import { sendMail } from "@/lib/mail";
import { mandant } from "@/lib/mandant";
import { appUrl } from "@/lib/auth-tokens";


export async function createAntrag(formData: FormData): Promise<void> {
  const user = await requirePermission("antrag:manage");
  if (!user.organizationId) throw new Error("Keine Berechtigung"); // Portal nur mit Organisation

  const geprueft = parseForm(antragSchema, formData);
  if (!geprueft.ok) throw new Error("Vor- und Nachname sind Pflicht.");
  const f = geprueft.data;
  const { firstName, lastName, email, adults, childrenU12, childrenO12 } = f;
  if (!email) throw new Error("E-Mail-Adresse ist Pflicht (für den Bescheid-Versand).");
  const consentArt = ["UNTERSCHRIFT", "PAPIER", "LINK"].includes(String(formData.get("consentArt") ?? "")) ? String(formData.get("consentArt")) : "";
  const unterschriftRef = consentArt === "UNTERSCHRIFT" ? await unterschriftSpeichern(String(formData.get("unterschrift") ?? "")) : null;
  if (consentArt === "UNTERSCHRIFT" && !unterschriftRef) throw new Error("Bitte unterschreiben (oder eine andere Art der Einwilligung wählen).");
  const consentGiven = consentArt === "UNTERSCHRIFT" || consentArt === "PAPIER";
  const linkToken = consentArt === "LINK" ? tokenErzeugen() : null;

  // Finanzpositionen sind dynamisch benannt (income_<key>), deshalb einzeln ueber den Baustein.
  const income: Record<string, number> = {};
  for (const [key] of INCOME_FIELDS) income[key] = betrag.parse(formData.get(`income_${key}`));
  const expense: Record<string, number> = {};
  for (const [key] of EXPENSE_FIELDS) expense[key] = betrag.parse(formData.get(`expense_${key}`));
  const incomeTotal = sumValues(income);
  const expenseTotal = sumValues(expense);
  const available = incomeTotal - expenseTotal;
  const limit = incomeLimit(adults, childrenU12, childrenO12);

  // Verlaengerung: Vorgaenger muss zur eigenen Organisation gehoeren (RLS liefert sonst nichts).
  const vorRoh = String(formData.get("vorgaengerAntragId") ?? "");
  const vorgaengerAntragId = /^[0-9a-f-]{36}$/i.test(vorRoh) ? vorRoh : null;

  const orgId = user.organizationId;
  const id = await withOrg(orgId, async (tx) => {
    if (vorgaengerAntragId) {
      const alt = await tx.select({ id: antraege.id }).from(antraege).where(eq(antraege.id, vorgaengerAntragId)).limit(1);
      if (!alt[0]) throw new Error("Vorgänger-Antrag nicht gefunden (oder andere Organisation).");
    }
    const ins = await tx.insert(antraege).values({
      organizationId: orgId,
      vorgaengerAntragId,
      targetType: f.targetType,
      intendedLocationId: f.intendedLocationId,
      firstName, lastName, address: f.address, postalCode: f.postalCode,
      city: f.city, birthDate: f.birthDate, phone: f.phone, email,
      adults, childrenU12, childrenO12, pets: f.pets,
      financials: { income, expense },
      incomeTotal: String(incomeTotal), expenseTotal: String(expenseTotal),
      availableIncome: String(available), incomeLimit: String(limit),
      status: "OFFEN",
      consentGiven: consentGiven,
      consentAt: consentGiven ? new Date().toISOString().slice(0, 10) : null,
      consentMethod: consentArt || null, consentSignatureRef: unterschriftRef,
      consentTokenHash: linkToken?.hash ?? null, consentTokenBis: linkToken?.bis ?? null,
      lastNameNorm: normalizeName(lastName), firstNameNorm: normalizeName(firstName),
      createdBy: user.id,
    }).returning({ id: antraege.id });
    return ins[0]!.id;
  });

  if (linkToken && email) {
    const m = await mandant();
    await sendMail({ ausloeser: "einwilligung", to: email, subject: `${m.kurzname} – Bitte Einwilligung bestätigen`,
      text: `Guten Tag ${firstName} ${lastName},\n\nfür Ihren Antrag auf eine Berechtigungskarte bei ${m.name} brauchen wir Ihre Einwilligung zur Verarbeitung Ihrer Daten.\nBitte bestätigen Sie über diesen Link (gültig 14 Tage):\n${appUrl()}/einwilligung/${linkToken.roh}\n\nDie Datenschutzinformation finden Sie unter ${appUrl()}/datenschutz\n\nFreundliche Grüße\n${m.name}` });
  }
  redirect(`/portal/${id}`);
}
