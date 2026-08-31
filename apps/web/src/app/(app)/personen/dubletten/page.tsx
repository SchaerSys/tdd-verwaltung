import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { hasPermission } from "@/lib/rbac";
import { findDuplicatePairs } from "@/lib/dedupe";
import { fmtDate } from "@/lib/format";
import { mergePersons } from "./actions";

export default async function DublettenPage() {
  const user = await getCurrentUser();
  if (!user || !hasPermission(user.role, "person:write")) redirect("/dashboard");

  const pairs = await findDuplicatePairs(100);

  return (
    <div>
      <div className="page-h">
        <div>
          <h1>Mögliche Dubletten</h1>
          <div className="sub">Bestandsprüfung · {pairs.length} Paar{pairs.length === 1 ? "" : "e"} gefunden</div>
        </div>
      </div>

      {pairs.length === 0 ? (
        <div className="panel"><div className="empty">Keine wahrscheinlichen Dubletten im Bestand. 👍</div></div>
      ) : (
        <div className="flex flex-col gap-3">
          {pairs.map((p, i) => (
            <div key={i} className="panel">
              <div className="panel-h">
                <div className="flex items-center gap-2">
                  <span className={`pill ${p.band === "HIGH" ? "bad" : "warn"}`}>{p.band === "HIGH" ? "sehr hoch" : "möglich"}</span>
                  <span className="mono font-bold">{p.score.toFixed(2)}</span>
                </div>
              </div>
              <div className="p-4 grid gap-4 sm:grid-cols-2">
                {[p.a, p.b].map((person, idx) => {
                  const other = idx === 0 ? p.b : p.a;
                  return (
                    <div key={person.id} className="card">
                      <a href={`/personen/${person.id}`} className="font-semibold hover:underline">{person.name}</a>
                      <div className="text-[.72rem] text-[color:var(--muted)] mt-1">
                        {person.birthDate ? fmtDate(person.birthDate) : "ohne Geburtsdatum"}{person.location ? ` · ${person.location}` : " · kein Standort"}
                      </div>
                      <form action={mergePersons} className="mt-3">
                        <input type="hidden" name="keepId" value={person.id} />
                        <input type="hidden" name="dropId" value={other.id} />
                        <button type="submit" className="btn sm">Diese behalten &amp; zusammenführen</button>
                      </form>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
