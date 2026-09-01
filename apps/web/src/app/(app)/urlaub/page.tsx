import { redirect } from "next/navigation";
import { asc, eq } from "drizzle-orm";
import { staff } from "@tdd/db";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { hasPermission } from "@/lib/rbac";
import { UrlaubClient } from "./UrlaubClient";

export default async function UrlaubPage() {
  const user = await getCurrentUser();
  if (!user || !hasPermission(user.role, "staff:manage")) redirect("/dashboard");

  const rows = await db()
    .select({ id: staff.id, first: staff.firstName, last: staff.lastName, weeklyHours: staff.weeklyHours, employmentStart: staff.employmentStart, employmentEnd: staff.employmentEnd })
    .from(staff).where(eq(staff.isActive, true)).orderBy(asc(staff.lastName), asc(staff.firstName));

  return (
    <div>
      <div className="page-h">
        <div>
          <h1>Urlaub <span className="pill muted">A3</span></h1>
          <div className="sub">Urlaubsrestanspruch nach österr. Urlaubsgesetz · füllt Wochenstunden &amp; Eintritt/Austritt aus dem Personaldatensatz</div>
        </div>
      </div>
      <UrlaubClient staff={rows.map((s) => ({ id: s.id, name: `${s.last}, ${s.first}`, weeklyHours: s.weeklyHours, employmentStart: s.employmentStart, employmentEnd: s.employmentEnd }))} />
    </div>
  );
}
