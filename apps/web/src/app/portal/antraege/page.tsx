import Link from "next/link";
import { getCurrentUser } from "@/lib/auth";
import { ladePortalAntraege, portalKennzahlen } from "@/lib/portal-daten";
import { AntragTabelle } from "@/components/portal/AntragTabelle";

const FILTER: Record<string, string> = {
  alle: "Alle", offen: "Offen / in Prüfung", positiv: "Positiv", negativ: "Negativ",
  tdd: "Bei TDD in Übernahme", versorgt: "Versorgt", antworten: "Neue Antworten", einwilligung: "Ohne Einwilligung",
};

/** Vollstaendige Antragsliste mit Filter (Startseite zeigt nur einen Ausschnitt). */
export default async function PortalAntraege({ searchParams }: { searchParams: Promise<{ filter?: string; q?: string }> }) {
  const sp = await searchParams;
  const filter = sp.filter && FILTER[sp.filter] ? sp.filter : "alle";
  const q = (sp.q ?? "").trim().toLowerCase();
  const user = await getCurrentUser();
  const orgId = user?.organizationId ?? 0;
  const liste = orgId ? await ladePortalAntraege(orgId) : [];
  const k = portalKennzahlen(liste);
  const institution = user?.organizationType === "INSTITUTION";

  let rows = filter === "offen" ? k.offen : filter === "positiv" ? k.positiv : filter === "negativ" ? k.negativ
    : filter === "tdd" ? k.beiTdd : filter === "versorgt" ? k.versorgt : filter === "antworten" ? k.neueAntworten
    : filter === "einwilligung" ? k.ohneEinwilligung : liste;
  if (q) rows = rows.filter((r) => `${r.lastName} ${r.firstName} ${r.city ?? ""}`.toLowerCase().includes(q));

  return (
    <div>
      <div className="page-h">
        <div><h1>Alle Anträge</h1><div className="sub">{FILTER[filter]} · {rows.length} von {liste.length}</div></div>
        <div className="flex gap-2"><Link href="/portal" className="btn ghost">← Start</Link><Link href="/portal/neu" className="btn primary">＋ Neuer Antrag</Link></div>
      </div>
      <div className="flex gap-2 flex-wrap items-center mb-3">
        {Object.entries(FILTER).map(([key, label]) => (
          <Link key={key} href={`/portal/antraege?filter=${key}${q ? `&q=${encodeURIComponent(q)}` : ""}`} className={`btn sm ${filter === key ? "primary" : "ghost"}`}>{label}</Link>
        ))}
        <form method="get" className="flex gap-1 ml-auto">
          <input type="hidden" name="filter" value={filter} />
          <input name="q" defaultValue={sp.q ?? ""} placeholder="Name oder Ort" className="inp" style={{ width: 180 }} />
          <button className="btn sm" type="submit">Suchen</button>
        </form>
      </div>
      <div className="panel">
        <AntragTabelle liste={rows} klientBegriff={institution ? "Klient/in" : "Antragsteller/in"} mitOrt={institution} leer="Keine Anträge in dieser Auswahl." />
      </div>
    </div>
  );
}
