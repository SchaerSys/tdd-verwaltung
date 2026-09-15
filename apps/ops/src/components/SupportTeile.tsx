import Link from "next/link";
import type { Ereignis, SupportBenutzer } from "@/lib/support";

export const fmt = (d: Date | null | undefined) => (d ? d.toLocaleString("de-AT", { timeZone: "Europe/Vienna", dateStyle: "short", timeStyle: "short" }) : "—");

/** "vor 3 Min" – fuer Lebenszeichen. */
export function vorher(d: Date | null | undefined): string {
  if (!d) return "nie";
  const m = Math.round((Date.now() - d.getTime()) / 60000);
  if (m < 1) return "gerade eben";
  if (m < 60) return `vor ${m} Min`;
  const h = Math.round(m / 60);
  if (h < 48) return `vor ${h} Std`;
  return `vor ${Math.round(h / 24)} Tagen`;
}

export function OnlinePill({ b }: { b: SupportBenutzer }) {
  if (!b.zuletzt_gesehen) return <span className="pill muted">kein Lebenszeichen</span>;
  const alt = (Date.now() - b.zuletzt_gesehen.getTime()) / 60000;
  if (alt <= 3) return <span className={`pill ${b.online === false ? "warn" : "good"}`}><span className="dot" />{b.online === false ? "offline (Browser)" : "aktiv"}</span>;
  return <span className="pill muted">zuletzt {vorher(b.zuletzt_gesehen)}</span>;
}

export function BenutzerTabelle({ liste, mitOrg }: { liste: SupportBenutzer[]; mitOrg: boolean }) {
  const jetzt = new Date();
  return (
    <div className="twrap"><table className="data">
      <thead><tr><th>Benutzer</th><th>Rolle</th><th>{mitOrg ? "Mandant" : "Standort"}</th><th>Zustand</th><th>Zuletzt</th><th>Version</th><th className="text-right">Fehler 24 h</th><th></th></tr></thead>
      <tbody>{liste.map((b) => {
        const gesperrt = !!b.locked_until && b.locked_until > jetzt;
        return (
          <tr key={b.id} style={b.is_active ? undefined : { opacity: .55 }}>
            <td><Link href={`/support/${b.id}`} className="font-semibold hover:underline">{b.display_name}</Link><div className="text-xs text-muted mono">{b.email}</div></td>
            <td><span className="pill muted">{b.role}</span></td>
            <td>{mitOrg ? (b.organisation ?? "TDD") : (b.standort ?? "—")}</td>
            <td className="flex gap-1 flex-wrap">
              <OnlinePill b={b} />
              {gesperrt ? <span className="pill bad">Login-Sperre</span> : null}
              {!b.is_active ? <span className="pill bad">deaktiviert</span> : null}
              {b.warteschlange ? <span className="pill warn">{b.warteschlange} in Warteschlange</span> : null}
            </td>
            <td className="text-xs">{b.zuletzt_route ?? "—"}</td>
            <td className="mono text-xs">{b.version ?? "—"}</td>
            <td className="mono text-right">{b.fehler_24h ? <span className="pill bad">{b.fehler_24h}</span> : "0"}</td>
            <td><Link href={`/support/${b.id}`} className="btn ghost sm">Öffnen →</Link></td>
          </tr>
        );
      })}
      {liste.length === 0 ? <tr><td colSpan={8}><div className="empty">Keine Benutzer.</div></td></tr> : null}
      </tbody>
    </table></div>
  );
}

export function EreignisListe({ liste, mitBenutzer }: { liste: Ereignis[]; mitBenutzer?: Map<string, string> }) {
  if (liste.length === 0) return <div className="empty">Keine Ereignisse.</div>;
  return (
    <div className="twrap"><table className="data">
      <thead><tr><th>Zeit</th><th>Art</th>{mitBenutzer ? <th>Benutzer</th> : null}<th>Route</th><th>Meldung / Zustand</th><th>Kennung</th></tr></thead>
      <tbody>{liste.map((e) => (
        <tr key={e.id} style={e.kind === "FEHLER" ? { background: "var(--bad-bg)" } : undefined}>
          <td className="mono text-xs">{fmt(e.at)}</td>
          <td>{e.kind === "FEHLER" ? <span className="pill bad">Fehler</span> : <span className="pill muted">Lebenszeichen</span>}</td>
          {mitBenutzer ? <td className="text-xs">{e.user_id ? (mitBenutzer.get(e.user_id) ?? e.user_id.slice(0, 8)) : "anonym"}{e.role ? <span className="text-muted"> · {e.role}</span> : null}</td> : null}
          <td className="mono text-xs">{e.route ?? "—"}</td>
          <td className="text-xs" style={{ maxWidth: 420 }}>
            {e.kind === "FEHLER" ? <div>{e.message}</div> : null}
            <div className="text-muted">
              {typeof e.detail.version === "string" ? `v${e.detail.version} · ` : ""}
              {e.detail.online === false ? "offline · " : ""}
              {typeof e.detail.queue === "number" && e.detail.queue > 0 ? `${e.detail.queue} in Warteschlange · ` : ""}
              {typeof e.detail.screen === "string" ? `${e.detail.screen} · ` : ""}
              {e.detail.nfc === true ? "NFC · " : ""}
              {typeof e.detail.ua === "string" ? kurzUa(e.detail.ua) : ""}
            </div>
            {typeof e.detail.stack === "string" ? <details><summary className="cursor-pointer text-muted">Stack</summary><pre className="mono" style={{ whiteSpace: "pre-wrap", fontSize: 10 }}>{e.detail.stack}</pre></details> : null}
          </td>
          <td className="mono text-xs">{e.digest ? <Link href={`/support/fehler/${e.digest}`}>{e.digest.slice(0, 10)}</Link> : "—"}</td>
        </tr>
      ))}</tbody>
    </table></div>
  );
}

/** "Chrome 128 · Android" statt des ganzen User-Agents. */
export function kurzUa(ua: string): string {
  const os = /Android/.test(ua) ? "Android" : /iPhone|iPad/.test(ua) ? "iOS" : /Windows/.test(ua) ? "Windows" : /Mac OS/.test(ua) ? "macOS" : /Linux/.test(ua) ? "Linux" : "?";
  const b = /Edg\/(\d+)/.exec(ua) ? `Edge ${/Edg\/(\d+)/.exec(ua)![1]}` : /Firefox\/(\d+)/.exec(ua) ? `Firefox ${/Firefox\/(\d+)/.exec(ua)![1]}`
    : /Chrome\/(\d+)/.exec(ua) ? `Chrome ${/Chrome\/(\d+)/.exec(ua)![1]}` : /Safari\//.test(ua) ? "Safari" : "Browser";
  return `${b} · ${os}`;
}
