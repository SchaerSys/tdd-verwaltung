import Link from "next/link";
import { notFound } from "next/navigation";
import { ladeBenutzer, ladeEreignisse, ladeMandanten } from "@/lib/support";
import { BenutzerTabelle, EreignisListe, fmt, vorher } from "@/components/SupportTeile";
import { Einladen } from "../../benutzer/Einladen";
import { db } from "@/lib/db";
import { asc, eq } from "drizzle-orm";
import { locations, organizations } from "@tdd/db";

export const dynamic = "force-dynamic";

/** Ein Mandant: Konten, Ereignisse, Kennzahlen – und direkt handeln (einladen, Sperren aufheben ueber Benutzerseite). */
export default async function MandantSeite({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const orgId = Number(id);
  if (!orgId) notFound();
  const m = (await ladeMandanten()).find((x) => x.id === orgId);
  if (!m) notFound();
  const d = await db();
  const [benutzer, ereignisse, standorte, orgs] = await Promise.all([
    ladeBenutzer({ orgId }), ladeEreignisse({ orgId }, 150),
    d.select({ id: locations.id, name: locations.name }).from(locations).where(eq(locations.isActive, true)).orderBy(asc(locations.name)),
    d.select({ id: organizations.id, name: organizations.name, type: organizations.type }).from(organizations).where(eq(organizations.id, orgId)),
  ]);
  const namen = new Map(benutzer.map((b) => [b.id, b.display_name]));
  const fehler = ereignisse.filter((e) => e.kind === "FEHLER");

  return (
    <div>
      <div className="page-h">
        <div><h1>{m.name}</h1><div className="sub">{m.type === "GEMEINDE" ? "Gemeinde" : m.type === "INSTITUTION" ? "Institution" : "TDD"} · {m.is_active ? "aktiv" : "deaktiviert"} · Mandant #{m.id}</div></div>
        <Link href="/mandanten" className="btn ghost">← Mandanten</Link>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 mb-4">
        <Zahl label="Konten (aktiv/gesamt)" v={`${m.konten_aktiv}/${m.konten}`} />
        <Zahl label="Zuletzt gesehen" v={vorher(m.zuletzt_gesehen)} sub={`letzter Login ${fmt(m.letzter_login)}`} />
        <Zahl label="Anträge (offen)" v={`${m.antraege} (${m.antraege_offen})`} sub={`letzter ${fmt(m.letzter_antrag)}`} />
        <Zahl label="Fehler 24 h / 7 Tage" v={`${m.fehler_24h} / ${m.fehler_7d}`} ton={m.fehler_24h ? "bad" : undefined} sub={m.rueckfragen_offen ? `${m.rueckfragen_offen} Rückfragen unbeantwortet` : undefined} />
      </div>

      <div className="panel mb-4">
        <div className="panel-h"><h3>Konten</h3><span className="pill muted">{benutzer.length}</span></div>
        <BenutzerTabelle liste={benutzer} mitOrg={false} />
        <details className="border-t border-[color:var(--border)]">
          <summary className="p-3 text-[.8125rem] cursor-pointer">＋ Konto für diesen Mandanten einladen</summary>
          <Einladen standorte={standorte} organisationen={orgs} vorgabeOrg={orgId} vorgabeRolle="SACHBEARBEITER" />
        </details>
      </div>

      <div className="panel mb-4" style={fehler.length ? { borderColor: "var(--bad)" } : undefined}>
        <div className="panel-h"><h3>Fehler</h3><span className={`pill ${fehler.length ? "bad" : "muted"}`}>{fehler.length}</span></div>
        <EreignisListe liste={fehler} mitBenutzer={namen} />
      </div>

      <div className="panel">
        <div className="panel-h"><h3>Alle Ereignisse (Lebenszeichen + Fehler)</h3><span className="pill muted">{ereignisse.length}</span></div>
        <EreignisListe liste={ereignisse} mitBenutzer={namen} />
      </div>
    </div>
  );
}

function Zahl({ label, v, sub, ton }: { label: string; v: string; sub?: string; ton?: "bad" }) {
  return <div className="panel p-4" style={ton ? { borderColor: `var(--${ton})` } : undefined}><div className="text-[1.3rem] font-bold mono">{v}</div><div className="text-[.75rem] text-muted">{label}</div>{sub ? <div className="text-[.68rem] text-muted mt-1">{sub}</div> : null}</div>;
}
