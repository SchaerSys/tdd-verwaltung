"use server";

import { redirect } from "next/navigation";
import { antraege } from "@tdd/db";
import { normalizeName } from "@tdd/core";
import { getCurrentUser } from "@/lib/auth";
import { hasPermission } from "@/lib/rbac";
import { withOrg } from "@/lib/org";
import { INCOME_FIELDS, EXPENSE_FIELDS, sumValues, incomeLimit } from "@/lib/eligibility";

function s(fd: FormData, k: string): string | null {
  const v = fd.get(k);
  const str = typeof v === "string" ? v.trim() : "";
  return str === "" ? null : str;
}
function n(fd: FormData, k: string): number {
  const v = parseFloat(String(fd.get(k) ?? "").replace(",", "."));
  return Number.isFinite(v) ? v : 0;
}
function i(fd: FormData, k: string, def = 0): number {
  const v = parseInt(String(fd.get(k) ?? ""), 10);
  return Number.isFinite(v) ? v : def;
}

export async function createAntrag(formData: FormData): Promise<void> {
  const user = await getCurrentUser();
  if (!user || !hasPermission(user.role, "antrag:manage") || !user.organizationId) throw new Error("Keine Berechtigung");

  const firstName = s(formData, "firstName");
  const lastName = s(formData, "lastName");
  const email = s(formData, "email");
  if (!firstName || !lastName) throw new Error("Vor- und Nachname sind Pflicht.");
  if (!email) throw new Error("E-Mail-Adresse ist Pflicht (für den Bescheid-Versand).");

  const income: Record<string, number> = {};
  for (const [key] of INCOME_FIELDS) income[key] = n(formData, `income_${key}`);
  const expense: Record<string, number> = {};
  for (const [key] of EXPENSE_FIELDS) expense[key] = n(formData, `expense_${key}`);

  const adults = i(formData, "adults", 1);
  const childrenU12 = i(formData, "childrenU12", 0);
  const childrenO12 = i(formData, "childrenO12", 0);
  const incomeTotal = sumValues(income);
  const expenseTotal = sumValues(expense);
  const available = incomeTotal - expenseTotal;
  const limit = incomeLimit(adults, childrenU12, childrenO12);

  const orgId = user.organizationId;
  const id = await withOrg(orgId, async (tx) => {
    const ins = await tx.insert(antraege).values({
      organizationId: orgId,
      targetType: s(formData, "targetType") ?? "AUSGABESTELLE",
      intendedLocationId: formData.get("intendedLocationId") ? i(formData, "intendedLocationId") : null,
      firstName, lastName, address: s(formData, "address"), postalCode: s(formData, "postalCode"),
      city: s(formData, "city"), birthDate: s(formData, "birthDate"), phone: s(formData, "phone"), email: s(formData, "email"),
      adults, childrenU12, childrenO12, pets: s(formData, "pets"),
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
