import Link from "next/link";
import { notFound } from "next/navigation";
import { ladeAktionen, ladeBenutzer, ladeEreignisse } from "@/lib/support";
import { EreignisListe, OnlinePill, fmt, kurzUa } from "@/components/SupportTeile";
import { PasswortLink } from "../../benutzer/Einladen";
import { aktivSchalten, entsperren, zfaZuruecksetzen } from "../../benutzer/actions";

export const dynamic = "force-dynamic";

/**
 * Ein Benutzer im Stoerungsfall: Wo war die Person zuletzt, mit welcher Version und
 * welchem Browser, welche Fehler gab es, was hat sie zuletzt getan – und die
 * Handgriffe dazu (Sperre aufheben, Passwort-Link, 2FA-Reset).
 */
export default async function SupportBenutzerSeite({ params }: { params: Promise<{ userId: string }> }) {
  const { userId } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(userId)) notFound();
  const b = (await ladeBenutzer({ id: userId }))[0];
  if (!b) notFound();
  const [ereignisse, aktionen] = await Promise.all([ladeEreignisse({ userId }, 120), ladeAktionen(userId)]);
  const gesperrt = !!b.locked_until && b.locked_until > new Date();

  return (
    <div>
      <div className="page-h">
        <div><h1>{b.display_name}</h1><div className="sub mono">{b.email} · {b.role}{b.organisation ? ` · ${b.organisation}` : ""}{b.standort ? ` · ${b.standort}` : ""}</div></div>
        <Link href={b.organisation_typ && b.organisation_typ !== "TDD" ? "/mandanten" : "/mandanten"} className="btn ghost">← Mandanten</Link>
      </div>

      <div className="grid gap-4 lg:grid-cols-2 items-start mb-4">
        <div className="panel">
          <div className="panel-h"><h3>Zustand</h3><OnlinePill b={b} /></div>
          <div className="p-4 text-[.8125rem] flex flex-col gap-1">
            <Z l="Zuletzt gesehen" v={`${fmt(b.zuletzt_gesehen)}${b.zuletzt_route ? ` · ${b.zuletzt_route}` : ""}`} />
            <Z l="Version beim Benutzer" v={b.version ?? "—"} />
            <Z l="Browser / Gerät" v={b.browser ? kurzUa(b.browser) : "—"} />
            <Z l="Online (Browser)" v={b.online == null ? "—" : b.online ? "ja" : "nein – Offline-Betrieb"} />
            <Z l="Kiosk-Warteschlange" v={b.warteschlange == null ? "—" : String(b.warteschlange)} />
            <Z l="Letzter Login" v={fmt(b.last_login)} />
            <Z l="Konto" v={`${b.is_active ? "aktiv" : "deaktiviert"} · ${b.totp_enabled ? "2FA aktiv" : "ohne 2FA"}${gesperrt ? ` · Login-Sperre bis ${fmt(b.locked_until)}` : b.failed_attempts ? ` · ${b.failed_attempts} Fehlversuche` : ""}`} />
          </div>
        </div>
        <div className="panel">
          <div className="panel-h"><h3>Handgriffe</h3></div>
          <div className="p-4 flex gap-2 flex-wrap text-[.8125rem]">
            {gesperrt || b.failed_attempts > 0 ? <form action={entsperren}><input type="hidden" name="userId" value={b.id} /><button className="btn primary sm" type="submit">Login-Sperre aufheben</button></form> : <span className="pill good"><span className="dot" />keine Sperre</span>}
            <PasswortLink userId={b.id} />
            {b.totp_enabled ? <form action={zfaZuruecksetzen}><input type="hidden" name="userId" value={b.id} /><button className="btn ghost sm" type="submit">2FA zurücksetzen</button></form> : null}
            <form action={aktivSchalten}><input type="hidden" name="userId" value={b.id} /><input type="hidden" name="aktiv" value={b.is_active ? "0" : "1"} /><button className="btn ghost sm" type="submit">{b.is_active ? "Deaktivieren" : "Aktivieren"}</button></form>
          </div>
          <div className="px-4 pb-4 text-[.72rem] text-muted">Was die Person in der Fach-App sieht, bleibt ihr vorbehalten – die Wartung sieht Zustand und Fehler, keine Inhalte.</div>
        </div>
      </div>

      <div className="panel mb-4">
        <div className="panel-h"><h3>Ereignisse</h3><span className="pill muted">{ereignisse.length}</span><span className="pill bad" style={{ marginLeft: 6 }}>{ereignisse.filter((e) => e.kind === "FEHLER").length} Fehler</span></div>
        <EreignisListe liste={ereignisse} />
      </div>

      <div className="panel">
        <div className="panel-h"><h3>Letzte Aktionen (Audit, ohne Datensatz-Bezug)</h3><span className="pill muted">{aktionen.length}</span></div>
        {aktionen.length === 0 ? <div className="empty">Keine Aktionen protokolliert.</div> : (
          <div className="twrap"><table className="data">
            <thead><tr><th>Zeit</th><th>Aktion</th><th>Objekt</th></tr></thead>
            <tbody>{aktionen.map((a, i) => <tr key={i}><td className="mono text-xs">{fmt(a.at)}</td><td className="mono">{a.action}</td><td className="text-muted">{a.entity_type}</td></tr>)}</tbody>
          </table></div>
        )}
      </div>
    </div>
  );
}

function Z({ l, v }: { l: string; v: string }) {
  return <div className="flex gap-2"><span className="text-muted" style={{ minWidth: 170 }}>{l}:</span><span>{v}</span></div>;
}
