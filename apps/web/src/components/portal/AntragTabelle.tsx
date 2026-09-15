import Link from "next/link";
import type { PortalAntrag } from "@/lib/portal-daten";
import { fmtDate } from "@/lib/format";
import { AntragStatusPill, RueckPill, ZielPill } from "./Pills";

/**
 * Antragsliste des Portals. `klientBegriff` unterscheidet Gemeinde (Antragsteller:in)
 * und Institution (Klient:in); `mitOrt` zeigt den Wohnort, weil Institutionen
 * Menschen aus mehreren Gemeinden betreuen.
 */
export function AntragTabelle({ liste, klientBegriff, mitOrt, leer }: { liste: PortalAntrag[]; klientBegriff: string; mitOrt: boolean; leer: string }) {
  return (
    <div className="twrap">
      <table className="data">
        <thead><tr><th>{klientBegriff}</th><th>Geburtsdatum</th>{mitOrt ? <th>Wohnort</th> : null}<th>Bezugsort</th><th>Antrag</th><th>Stand bei TDD</th><th></th></tr></thead>
        <tbody>
          {liste.map((r) => (
            <tr key={r.id}>
              <td>
                <Link href={`/portal/${r.id}`} className="font-semibold hover:underline">{r.lastName}, {r.firstName}</Link>
                {r.vorgaengerAntragId ? <span className="pill muted" style={{ marginLeft: 6 }}>Verlängerung</span> : null}
                {r.neueAntworten > 0 ? <span className="pill warn" style={{ marginLeft: 6 }}>✉ {r.neueAntworten} neu</span> : null}
              </td>
              <td className="mono">{fmtDate(r.birthDate)}</td>
              {mitOrt ? <td>{r.city ?? "—"}</td> : null}
              <td><ZielPill t={r.targetType} /></td>
              <td><AntragStatusPill s={r.status} /> <span className="text-xs text-muted mono">{fmtDate(r.createdAt)}</span></td>
              <td><RueckPill r={r.rueck} /></td>
              <td><Link href={`/portal/${r.id}`} className="btn ghost sm">Öffnen →</Link></td>
            </tr>
          ))}
          {liste.length === 0 ? <tr><td colSpan={mitOrt ? 7 : 6}><div className="empty">{leer}</div></td></tr> : null}
        </tbody>
      </table>
    </div>
  );
}
