"use server";

import { redirect } from "next/navigation";
import { antraege } from "@tdd/db";
import { normalizeName } from "@tdd/core";
import { withOrg } from "@/lib/org";
import { antragSchema, betrag, parseForm } from "@/lib/forms";
import { requirePermission } from "@/lib/guard";
import { INCOME_FIELDS, EXPENSE_FIELDS, sumValues, incomeLimit } from "@/lib/eligibility";


export async function createAntrag(formData: FormData): Promise<void> {
  const user = await requirePermission("antrag:manage");
  if (!user.organizationId) throw new Error("Keine Berechtigung"); // Portal nur mit Organisation

  const geprueft = parseForm(antragSchema, formData);
  if (!geprueft.ok) throw new Error("Vor- und Nachname sind Pflicht.");
  const f = geprueft.data;
  const { firstName, lastName, email, adults, childrenU12, childrenO12 } = f;
  if (!email) throw new Error("E-Mail-Adresse ist Pflicht (für den Bescheid-Versand).");

  // Finanzpositionen sind dynamisch benannt (income_<key>), deshalb einzeln ueber den Baustein.
  const income: Record<string, number> = {};
  for (const [key] of INCOME_FIELDS) income[key] = betrag.parse(formData.get(`income_${key}`));
  const expense: Record<string, number> = {};
  for (const [key] of EXPENSE_FIELDS) expense[key] = betrag.parse(formData.get(`expense_${key}`));
  const incomeTotal = sumValues(income);
  const expenseTotal = sumValues(expense);
  const available = incomeTotal - expenseTotal;
  const limit = incomeLimit(adults, childrenU12, childrenO12);

  const orgId = user.organizationId;
  const id = await withOrg(orgId, async (tx) => {
    const ins = await tx.insert(antraege).values({
      organizationId: orgId,
      targetType: f.targetType,
      intendedLocationId: f.intendedLocationId,
      firstName, lastName, address: f.address, postalCode: f.postalCode,
      city: f.city, birthDate: f.birthDate, phone: f.phone, email,
      adults, childrenU12, childrenO12, pets: f.pets,
      financials: { income, expense },
      incomeTotal: String(incomeTotal), expenseTotal: String(expenseTotal),
      availableIncome: String(available), incomeLimit: String(limit),
      status: "OFFEN",
      consentGiven: formData.get("consent") === "on",
      consentAt: formData.get("consent") === "on" ? new Date().toISOString().slice(0, 10) : null,
      lastNameNorm: normalizeName(lastName), firstNameNorm: normalizeName(firstName),
      createdBy: user.id,
    }).returning({ id: antraege.id });
    return ins[0]!.id;
  });

  redirect(`/portal/${id}`);
}
