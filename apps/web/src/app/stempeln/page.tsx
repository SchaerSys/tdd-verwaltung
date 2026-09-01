import { redirect } from "next/navigation";
import { asc, eq } from "drizzle-orm";
import { staff } from "@tdd/db";
import { db } from "@/lib/db";
import { getCurrentUser, logout } from "@/lib/auth";
import { hasPermission } from "@/lib/rbac";
import { TerminalClient } from "./TerminalClient";

async function logoutAction() {
  "use server";
  await logout();
  redirect("/login");
}

export default async function StempelnPage() {
  const user = await getCurrentUser();
  if (!user || !hasPermission(user.role, "staff:manage")) redirect("/dashboard");

  const people = await db()
    .select({ id: staff.id, first: staff.firstName, last: staff.lastName })
    .from(staff).where(eq(staff.isActive, true)).orderBy(asc(staff.lastName), asc(staff.firstName));

  return <TerminalClient staff={people.map((p) => ({ id: p.id, name: `${p.last}, ${p.first}` }))} logout={logoutAction} />;
}
