import Link from "next/link";
import { redirect } from "next/navigation";
import { asc, eq, sql } from "drizzle-orm";
import { abholstellen, tourVorlageStopps } from "@tdd/db";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { hasPermission } from "@/lib/rbac";
import { WOCHENTAGE_KURZ } from "@/lib/touren";
import { abholstelleAnlegen } from "../actions";
import { ABHOL_ART_LABEL, AbholstelleFelder } from "./AbholstelleFelder";

export const dynamic = "force-dynamic";

export default async function AbholstellenSeite({ searchParams }: { searchParams: Promise<{ q?: string; alle?: string }> }) {
  const user = await getCurrentUser();
  if (!user || !hasPermission(user.role, "tour:manage")) redirect("/dashboard");
  const sp = await searchParams;
  const q = (sp.q ?? "").trim().toLowerCase();
  const nutzung = db().select({ id: tourVorlageStopps.abholstelleId, n: sql<number>`count(*)::int`.as("n") }).from(tourVorlageStopps).groupBy(tourVorlageStopps.abholstelleId).as("nutzung");
  const liste = (await db().select({ a: abholstellen, n: nutzung.n }).from(abholstellen).leftJoin(nutzung, eq(nutzung.id, abholstellen.id)).orderBy(asc(abholstellen.ort), asc(abholstellen.name)))
    .filter((r) => (sp.alle === "1" || r.a.isActive) && (!q || `${r.a.name} ${r.a.ort ?? ""} ${r.a.ansprechperson ?? ""}`.toLowerCase().includes(q)));

  return (
    <div>
      <div className="page-h">
        <div><h1>Abholstellen</h1><div className="sub">{liste.length} Betriebe{q ? ` · Suche „${q}“` : ""}</div></div>
        <div className="flex gap-2 items-center">
          <form method="get" className="flex gap-1"><input name="q" defaultValue={sp.q ?? ""} placeholder="Name, Ort, Person" className="inp" /><button className="btn" type="submit">Suchen</button></form>
          <Link href={sp.alle === "1" ? "/touren/abholstellen" : "/touren/abholstellen?alle=1"} className="btn ghost">{sp.alle === "1" ? "Nur aktive" : "Auch inaktive"}</Link>
          <Link href="/touren" className="btn ghost">← Disposition</Link>
        </div>
      </div>

      <div className="panel mb-4">
        <details>
          <summary className="p-3 cursor-pointer font-semibold text-[.8125rem]">＋ Abholstelle anlegen</summary>
          <form action={abholstelleAnlegen} className="p-4 border-t border-[color:var(--border)] flex flex-col gap-3"><AbholstelleFelder /><div><button className="btn primary" type="submit">Anlegen</button></div></form>
        </details>
      </div>

      <div className="panel">
        <div className="twrap"><table className="data">
          <thead><tr><th>Betrieb</th><th>Art</th><th>Ort</th><th>Abholtage</th><th>Fenster</th><th>Kontakt</th><th className="text-right">In Vorlagen</th><th></th></tr></thead>
          <tbody>{liste.map(({ a, n }) => (
            <tr key={a.id} style={a.isActive ? undefined : { opacity: .55 }}>
              <td><Link href={`/touren/abholstellen/${a.id}`} className="font-semibold hover:underline">{a.name}</Link>{a.kuehlbedarf ? <span className="pill tag-out" style={{ marginLeft: 6 }}>❄</span> : null}{a.angebotId ? <span className="pill muted" style={{ marginLeft: 6 }} title="aus Homepage-Angebot">Web</span> : null}</td>
              <td className="text-xs">{ABHOL_ART_LABEL[a.art] ?? a.art}</td>
              <td>{[a.plz, a.ort].filter(Boolean).join(" ")}</td>
              <td className="mono text-xs">{a.abholtage.length ? a.abholtage.map((t) => WOCHENTAGE_KURZ[t]).join(" ") : "—"}</td>
              <td className="mono text-xs">{a.fensterVon || a.fensterBis ? `${(a.fensterVon ?? "").slice(0, 5)}–${(a.fensterBis ?? "").slice(0, 5)}` : "—"}</td>
              <td className="text-xs">{a.ansprechperson ?? ""}{a.telefon ? ` · ${a.telefon}` : ""}</td>
              <td className="mono text-right">{n ?? 0}</td>
              <td><Link href={`/touren/abholstellen/${a.id}`} className="btn ghost sm">Öffnen →</Link></td>
            </tr>
          ))}
          {liste.length === 0 ? <tr><td colSpan={8}><div className="empty">Noch keine Abholstellen. Oben anlegen – oder Liste schicken, dann importiere ich sie.</div></td></tr> : null}
          </tbody>
        </table></div>
      </div>
    </div>
  );
}
