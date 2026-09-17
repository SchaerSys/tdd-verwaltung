import Link from "next/link";
import { redirect } from "next/navigation";
import { and, asc, desc, eq, gte, isNotNull } from "drizzle-orm";
import { ausgabeSitzungen, geraete, locations, staff } from "@tdd/db";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { hasPermission } from "@/lib/rbac";
import { fmtDateTime } from "@/lib/format";
import { StationCode } from "./StationCode";
import { stationTrennenAction, pinEntfernenAction } from "./actions";

export const dynamic = "force-dynamic";
const eur = (n: string | number | null) => n == null ? "—" : Number(n).toLocaleString("de-AT", { style: "currency", currency: "EUR" });

/** Stammdaten: Ausgabelaptop koppeln, PIN-Berechtigungen, letzte Ausgabe-Sitzungen. */
export default async function AusgabestationSeite() {
  const user = await getCurrentUser();
  if (!user || !hasPermission(user.role, "admin:manage")) redirect("/dashboard");
  const seit = new Date(Date.now() - 30 * 864e5);
  const [stationen, mitPin, sitzungen] = await Promise.all([
    db().select().from(geraete).where(eq(geraete.art, "AUSGABE")).orderBy(desc(geraete.isActive), desc(geraete.gekoppeltAt)),
    db().select({ id: staff.id, first: staff.firstName, last: staff.lastName, muss: staff.pinMussAendern, bis: staff.pinGesperrtBis, aktiv: staff.isActive }).from(staff).where(isNotNull(staff.pinHash)).orderBy(asc(staff.lastName)),
    db().select({ s: ausgabeSitzungen, ort: locations.name, first: staff.firstName, last: staff.lastName }).from(ausgabeSitzungen)
      .innerJoin(locations, eq(locations.id, ausgabeSitzungen.locationId)).leftJoin(staff, eq(staff.id, ausgabeSitzungen.staffId))
      .where(and(gte(ausgabeSitzungen.beginn, seit))).orderBy(desc(ausgabeSitzungen.beginn)).limit(100),
  ]);

  return (
    <div>
      <div className="page-h">
        <div><h1>Ausgabestation</h1><div className="sub">Ein Laptop für alle Ausgabestellen · Anmeldung per PIN · Sitzungen mit Kassenabschluss</div></div>
        <div className="flex gap-2"><Link href="/anleitung#ausgabelaptop" className="btn ghost">Anleitung Laptop</Link><Link href="/admin" className="btn ghost">← Stammdaten</Link></div>
      </div>

      <div className="grid gap-4 lg:grid-cols-2 items-start mb-4">
        <div className="panel">
          <div className="panel-h"><h3>Gekoppelte Geräte</h3><span className="pill muted">{stationen.filter((s) => s.isActive).length}</span></div>
          <div className="p-3 border-b border-[color:var(--border)]"><StationCode /></div>
          <div className="twrap"><table className="data"><thead><tr><th>Gerät</th><th>gekoppelt</th><th>zuletzt gesehen</th><th></th></tr></thead>
            <tbody>{stationen.map((s) => (
              <tr key={s.id} style={s.isActive ? undefined : { opacity: .5 }}>
                <td><b>{s.name}</b><div className="text-[.65rem] text-muted">{s.userAgent?.slice(0, 60)}</div></td>
                <td className="mono text-xs">{fmtDateTime(s.gekoppeltAt)}</td>
                <td className="mono text-xs">{s.zuletztGesehen ? fmtDateTime(s.zuletztGesehen) : "—"}</td>
                <td>{s.isActive ? <form action={stationTrennenAction}><input type="hidden" name="id" value={s.id} /><button className="btn ghost sm" type="submit">Trennen</button></form> : <span className="pill muted">getrennt</span>}</td>
              </tr>
            ))}
            {stationen.length === 0 ? <tr><td colSpan={4}><div className="empty">Noch kein Laptop gekoppelt – Code erzeugen und am Laptop unter /ausgabe eingeben.</div></td></tr> : null}</tbody></table></div>
        </div>

        <div className="panel">
          <div className="panel-h"><h3>Ausgabe-Berechtigung (PIN)</h3><span className="pill muted">{mitPin.length}</span><span className="text-xs text-muted">PIN vergeben = darf die Ausgabe am Laptop führen</span></div>
          <div className="twrap"><table className="data"><thead><tr><th>Person</th><th>Stand</th><th></th></tr></thead>
            <tbody>{mitPin.map((p) => (
              <tr key={p.id} style={p.aktiv ? undefined : { opacity: .5 }}>
                <td><Link href={`/personal/${p.id}`} className="font-semibold hover:underline">{p.last} {p.first}</Link></td>
                <td>{p.bis && p.bis > new Date() ? <span className="pill bad">gesperrt bis {fmtDateTime(p.bis)}</span> : p.muss ? <span className="pill warn">Einmal-PIN, noch nicht ersetzt</span> : <span className="pill good"><span className="dot" />eigene PIN</span>}</td>
                <td><form action={pinEntfernenAction}><input type="hidden" name="staffId" value={p.id} /><button className="btn ghost sm" type="submit">Entziehen</button></form></td>
              </tr>
            ))}
            {mitPin.length === 0 ? <tr><td colSpan={3}><div className="empty">Noch keine PIN vergeben – im Personal-Datensatz unter „Ausgabe-PIN“.</div></td></tr> : null}</tbody></table></div>
        </div>
      </div>

      <div className="panel">
        <div className="panel-h"><h3>Ausgabe-Sitzungen</h3><span className="pill muted">30 Tage</span></div>
        <div className="twrap"><table className="data" style={{ fontSize: ".8rem" }}>
          <thead><tr><th>Beginn</th><th>Ende</th><th>Standort</th><th>Person</th><th className="text-right">Ausgaben</th><th className="text-right">Einnahmen</th><th className="text-right">gezählt</th><th className="text-right">Differenz</th><th>Übergabe / Bemerkung</th><th></th></tr></thead>
          <tbody>{sitzungen.map(({ s, ort, first, last }) => (
            <tr key={s.id}>
              <td className="mono">{fmtDateTime(s.beginn)}</td><td className="mono">{s.ende ? fmtDateTime(s.ende) : <span className="pill good"><span className="dot" />läuft</span>}</td>
              <td>{ort}</td><td>{first ? `${first} ${last}` : <span className="text-muted">Büro</span>}</td>
              <td className="mono text-right">{s.ausgabenAnzahl ?? ""}</td><td className="mono text-right">{s.ende ? eur(s.einnahmenSoll) : ""}</td><td className="mono text-right">{eur(s.kasseGezaehlt)}</td>
              <td className="mono text-right" style={{ color: s.differenz && Number(s.differenz) !== 0 ? "var(--bad)" : undefined }}>{s.differenz != null ? eur(s.differenz) : ""}</td>
              <td className="text-xs">{[s.uebergabeAn, s.notiz].filter(Boolean).join(" · ")} <a href={`/druck/kassenabschluss?sitzung=${s.id}`} target="_blank" className="btn ghost sm" title="Kassenabschluss drucken / als PDF">🖨</a></td>
              <td>{!s.ordentlich ? <span className="pill warn" title="Nicht über „Ausgabe beenden“ geschlossen">nicht ordentlich beendet</span> : s.kommenGestempelt ? <span className="pill muted" title="Kommen/Gehen in der Zeiterfassung">⏱</span> : null}</td>
            </tr>
          ))}
          {sitzungen.length === 0 ? <tr><td colSpan={10}><div className="empty">Noch keine Sitzungen.</div></td></tr> : null}</tbody>
        </table></div>
      </div>
    </div>
  );
}
