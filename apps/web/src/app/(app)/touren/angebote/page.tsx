import Link from "next/link";
import { redirect } from "next/navigation";
import { desc } from "drizzle-orm";
import { angeboteEingang } from "@tdd/db";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { hasPermission } from "@/lib/rbac";
import { fmtDateTime } from "@/lib/format";
import { angebotAblehnen, angebotUebernehmen, angeboteAbholen } from "../actions";

export const dynamic = "force-dynamic";

interface Angebot { betrieb: string; ansprechperson?: string; email?: string; telefon?: string; adresse?: { strasse?: string; plz?: string; ort?: string }; abholzeit?: string; warenarten?: string[]; menge?: string; haeufigkeit?: string; kuehlung?: boolean; nachricht?: string }
const WAREN: Record<string, string> = { "obst-gemuese": "Obst/Gemüse", backwaren: "Backwaren", molkerei: "Molkerei", "fleisch-wurst": "Fleisch/Wurst", trocken: "Trockenware", getraenke: "Getränke", tiefkuehl: "Tiefkühl", sonstiges: "Sonstiges" };

/** Posteingang: Abholangebote, die Betriebe ueber die Homepage gemeldet haben. */
export default async function AngeboteSeite() {
  const user = await getCurrentUser();
  if (!user || !hasPermission(user.role, "tour:manage")) redirect("/dashboard");
  const liste = await db().select().from(angeboteEingang).orderBy(desc(angeboteEingang.eingegangen)).limit(200);
  const neu = liste.filter((a) => a.stand === "NEU");
  const konfiguriert = !!process.env.HOMEPAGE_API_URL && !!process.env.UEBERGABE_TOKEN;

  return (
    <div>
      <div className="page-h">
        <div><h1>Abholangebote von der Homepage</h1><div className="sub">{neu.length} offen · {liste.length} gesamt</div></div>
        <div className="flex gap-2">
          <form action={angeboteAbholen}><button className="btn primary" type="submit" disabled={!konfiguriert} title={konfiguriert ? undefined : "HOMEPAGE_API_URL / UEBERGABE_TOKEN fehlen"}>⟳ Neue Angebote abholen</button></form>
          <Link href="/touren" className="btn ghost">← Disposition</Link>
        </div>
      </div>
      {!konfiguriert ? <div className="panel mb-4" style={{ borderColor: "var(--warn)" }}><div className="p-4 text-[.8125rem]">Die Verbindung zur Homepage ist noch nicht eingerichtet (<code className="mono">HOMEPAGE_API_URL</code>, <code className="mono">UEBERGABE_TOKEN</code> in der Server-Konfiguration). Der nächtliche Abruf startet, sobald beides gesetzt ist.</div></div> : null}

      <div className="flex flex-col gap-3">
        {liste.map((a) => {
          const d = a.daten as Angebot;
          return (
            <div key={a.id} className="panel" style={a.stand === "NEU" ? { borderLeft: "4px solid var(--warn)" } : { opacity: .75 }}>
              <div className="panel-h"><h3>{a.betrieb}</h3>
                {a.stand === "NEU" ? <span className="pill warn">neu</span> : a.stand === "UEBERNOMMEN" ? <span className="pill good">übernommen{a.abholstelleId ? <> · <Link href={`/touren/abholstellen/${a.abholstelleId}`}>Abholstelle</Link></> : null}</span> : <span className="pill bad">abgelehnt</span>}
                {d.kuehlung ? <span className="pill tag-out">❄ Kühlung nötig</span> : null}
                <span className="text-xs text-muted" style={{ marginLeft: "auto" }}>eingegangen {fmtDateTime(a.eingegangen)}{!a.rueckgemeldet && a.stand !== "NEU" ? " · Rückmeldung an Homepage ausständig" : ""}</span>
              </div>
              <div className="p-3 grid gap-2 md:grid-cols-2 text-[.8125rem]">
                <div>
                  <div><span className="text-muted">Adresse:</span> {[d.adresse?.strasse, [d.adresse?.plz, d.adresse?.ort].filter(Boolean).join(" ")].filter(Boolean).join(", ") || "—"}</div>
                  <div><span className="text-muted">Kontakt:</span> {d.ansprechperson ?? "—"}{d.telefon ? ` · ${d.telefon}` : ""}{d.email ? ` · ${d.email}` : ""}</div>
                  <div><span className="text-muted">Abholzeit:</span> {d.abholzeit ?? "—"} · <span className="text-muted">Häufigkeit:</span> {d.haeufigkeit ?? "—"}</div>
                </div>
                <div>
                  <div><span className="text-muted">Waren:</span> {(d.warenarten ?? []).map((w) => WAREN[w] ?? w).join(", ") || "—"} · <span className="text-muted">Menge:</span> {d.menge ?? "—"}</div>
                  {d.nachricht ? <div><span className="text-muted">Nachricht:</span> {d.nachricht}</div> : null}
                </div>
              </div>
              {a.stand === "NEU" ? (
                <div className="p-3 border-t border-[color:var(--border)] flex gap-2 items-end flex-wrap">
                  <form action={angebotUebernehmen}><input type="hidden" name="id" value={a.id} /><button className="btn primary sm" type="submit">✓ Als Abholstelle übernehmen</button></form>
                  <form action={angebotAblehnen} className="flex gap-2 items-end"><input type="hidden" name="id" value={a.id} /><input name="vermerk" className="inp sm" placeholder="Grund (geht an den Betrieb nicht raus)" style={{ width: 260 }} /><button className="btn ghost sm" type="submit">✕ Ablehnen</button></form>
                </div>
              ) : null}
            </div>
          );
        })}
        {liste.length === 0 ? <div className="panel"><div className="empty">Noch keine Angebote abgeholt.</div></div> : null}
      </div>
    </div>
  );
}
