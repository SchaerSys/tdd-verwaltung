import Link from "next/link";
import { fehlerUebersicht, ladeBenutzer, ladeMandanten } from "@/lib/support";
import { BenutzerTabelle, fmt, vorher } from "@/components/SupportTeile";

export const dynamic = "force-dynamic";

/**
 * Mandanten: TDD selbst plus jede Gemeinde/Institution als Einheit – wer ist aktiv,
 * wo haeufen sich Fehler, wo liegt etwas unbeantwortet. Einstieg im Stoerungsfall.
 */
export default async function MandantenSeite({ searchParams }: { searchParams: Promise<{ alle?: string }> }) {
  const sp = await searchParams;
  const [mandanten, fehler, tdd] = await Promise.all([ladeMandanten(), fehlerUebersicht(), ladeBenutzer({ nurTdd: true })]);
  const extern = mandanten.filter((m) => m.type !== "TDD");
  const auffaellig = extern.filter((m) => m.fehler_24h > 0 || m.rueckfragen_offen > 0);
  const aktivGenutzt = extern.filter((m) => m.konten > 0 && (m.letzter_login || m.antraege > 0));
  const liste = sp.alle === "1" ? extern : [...new Set([...auffaellig, ...aktivGenutzt])];

  return (
    <div>
      <div className="page-h">
        <div><h1>Mandanten &amp; Support</h1><div className="sub">{extern.length} Gemeinden/Institutionen · {aktivGenutzt.length} mit Nutzung · {fehler.reduce((s, f) => s + f.n, 0)} Fehler in 24 h</div></div>
      </div>

      {fehler.length > 0 ? (
        <div className="panel mb-4" style={{ borderColor: "var(--bad)" }}>
          <div className="panel-h"><h3>Fehler der letzten 24 Stunden</h3><span className="pill bad">{fehler.length} verschiedene</span></div>
          <div className="twrap"><table className="data">
            <thead><tr><th>Zuletzt</th><th>Route</th><th>Meldung</th><th className="text-right">Anzahl</th><th className="text-right">Betroffene</th><th>Kennung</th></tr></thead>
            <tbody>{fehler.map((f, i) => (
              <tr key={i}><td className="mono text-xs">{fmt(f.zuletzt)}</td><td className="mono text-xs">{f.route}</td><td className="text-xs" style={{ maxWidth: 400 }}>{f.message}</td>
                <td className="mono text-right">{f.n}</td><td className="mono text-right">{f.betroffene}</td>
                <td className="mono text-xs">{f.digest ? <Link href={`/support/fehler/${f.digest}`}>{f.digest.slice(0, 10)} →</Link> : "—"}</td></tr>
            ))}</tbody>
          </table></div>
        </div>
      ) : <div className="panel mb-4"><div className="p-4 text-[.8125rem]"><span className="pill good"><span className="dot" />keine Fehler in den letzten 24 Stunden</span></div></div>}

      <div className="panel mb-4">
        <div className="panel-h"><h3>Tischlein deck dich (Büro, Tresen)</h3><span className="pill muted">{tdd.length} Konten</span></div>
        <BenutzerTabelle liste={tdd} mitOrg={false} />
      </div>

      <div className="panel">
        <div className="panel-h"><h3>Gemeinden &amp; Institutionen</h3><span className="pill muted">{liste.length}</span>
          <Link href={sp.alle === "1" ? "/mandanten" : "/mandanten?alle=1"} className="btn ghost sm" style={{ marginLeft: "auto" }}>{sp.alle === "1" ? "Nur genutzte" : "Alle anzeigen"}</Link></div>
        <div className="twrap"><table className="data">
          <thead><tr><th>Mandant</th><th>Typ</th><th className="text-right">Konten</th><th>Letzter Login</th><th>Zuletzt gesehen</th><th className="text-right">Anträge (offen)</th><th className="text-right">Rückfragen</th><th className="text-right">Fehler 24 h / 7 T</th><th></th></tr></thead>
          <tbody>{liste.map((m) => (
            <tr key={m.id} style={m.is_active ? undefined : { opacity: .55 }}>
              <td><Link href={`/mandanten/${m.id}`} className="font-semibold hover:underline">{m.name}</Link></td>
              <td><span className="pill muted">{m.type === "GEMEINDE" ? "Gemeinde" : "Institution"}</span></td>
              <td className="mono text-right">{m.konten_aktiv}/{m.konten}</td>
              <td className="text-xs">{fmt(m.letzter_login)}</td>
              <td className="text-xs">{vorher(m.zuletzt_gesehen)}</td>
              <td className="mono text-right">{m.antraege} ({m.antraege_offen})</td>
              <td className="mono text-right">{m.rueckfragen_offen ? <span className="pill warn">{m.rueckfragen_offen}</span> : "0"}</td>
              <td className="mono text-right">{m.fehler_24h ? <span className="pill bad">{m.fehler_24h}</span> : "0"} / {m.fehler_7d}</td>
              <td><Link href={`/mandanten/${m.id}`} className="btn ghost sm">Öffnen →</Link></td>
            </tr>
          ))}
          {liste.length === 0 ? <tr><td colSpan={9}><div className="empty">Noch kein Mandant mit Nutzung.</div></td></tr> : null}
          </tbody>
        </table></div>
      </div>
    </div>
  );
}
