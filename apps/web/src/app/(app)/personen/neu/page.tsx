import { redirect } from "next/navigation";
import { eq, asc, and } from "drizzle-orm";
import { locations, lookupLists, lookupValues } from "@tdd/db";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { hasPermission } from "@/lib/rbac";
import { PersonForm } from "./PersonForm";

async function valuesFor(code: string) {
  const d = db();
  const list = await d.select().from(lookupLists).where(eq(lookupLists.code, code)).limit(1);
  if (!list[0]) return [];
  return d
    .select({ id: lookupValues.id, label: lookupValues.label })
    .from(lookupValues)
    .where(and(eq(lookupValues.listId, list[0].id), eq(lookupValues.isActive, true)))
    .orderBy(asc(lookupValues.sort));
}

export default async function NeuPage() {
  const user = await getCurrentUser();
  if (!user || !hasPermission(user.role, "person:write")) redirect("/dashboard");

  const [languages, origins, locs] = await Promise.all([
    valuesFor("language"),
    valuesFor("origin"),
    db().select({ id: locations.id, name: locations.name, type: locations.type })
      .from(locations).where(eq(locations.isActive, true)).orderBy(asc(locations.type), asc(locations.name)),
  ]);

  return (
    <div>
      <div className="page-h">
        <div>
          <h1>Person aufnehmen</h1>
          <div className="sub">Neue anspruchsberechtigte Person erfassen</div>
        </div>
      </div>
      <PersonForm languages={languages} origins={origins} locations={locs} defaultLocationId={user.locationId} />
    </div>
  );
}
