import Link from "next/link";
import { notFound } from "next/navigation";
import { mandantLaden, mandantenStatus } from "@/lib/unternehmen";
import { fmt } from "@/components/SupportTeile";
import { checkliste } from "../checkliste";
import { Stammdaten } from "./Stammdaten";

export const dynamic = "force-dynamic";

export default async function UnternehmenDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [t, status] = await Promise.all([mandantLaden(id), mandantenStatus()]);
  const m = status.find((x) => x.id === id);
  if (!t || !m) notFound();
  const punkte = checkliste(m);
  const offen = punkte.filter((p) => !p.ok).length;

  return (
    <div>
      <div className="page-h">
        <div><h1>{t.name}</h1><div className="sub mono">{t.slug} · {t.id} · angelegt {fmt(t.createdAt)}</div></div>
        <Link href="/unternehmen" className="btn ghost sm">← Alle Mandanten</Link>
      </div>

      <div className="panel mb-4">
        <div className="panel-h"><h3>Inbetriebnahme</h3>{offen === 0 ? <span className="pill good">vollständig</span> : <span className="pill warn">{offen} von {punkte.length} offen</span>}</div>
        <div className="twrap"><table className="data">
          <tbody>{punkte.map((p) => (
            <tr key={p.key}>
              <td style={{ width: 28 }}>{p.ok ? <span className="pill good">✓</span> : <span className="pill warn">·</span>}</td>
              <td><b>{p.titel}</b></td>
              <td className="text-muted text-sm">{p.hinweis}</td>
              <td>{!p.ok && p.href ? <Link href={p.href} className="btn ghost sm">Erledigen</Link> : null}</td>
            </tr>
          ))}</tbody>
        </table></div>
        <div className="grid gap-3 sm:grid-cols-4" style={{ padding: 12 }}>
          <div><div className="text-xs text-muted">Benutzer</div><div className="text-lg font-bold">{m.benutzer}</div></div>
          <div><div className="text-xs text-muted">Personal</div><div className="text-lg font-bold">{m.personal}</div></div>
          <div><div className="text-xs text-muted">Personen (Klient:innen)</div><div className="text-lg font-bold">{m.personen}</div></div>
          <div><div className="text-xs text-muted">Organisationen</div><div className="text-lg font-bold">{m.organisationen}</div></div>
        </div>
      </div>

      <div className="panel" id="stammdaten">
        <div className="panel-h"><h3>Stammdaten</h3><span className="text-xs text-muted" style={{ marginLeft: 8 }}>erscheinen in Drucken, Datenschutzinformation und E-Mails der Fach-App</span></div>
        <div style={{ padding: 12 }}>
          <Stammdaten t={{ id: t.id, name: t.name, host: t.host, kurzname: t.kurzname, anschrift: t.anschrift, vertretung: t.vertretung, kontaktEmail: t.kontaktEmail, kontaktTelefon: t.kontaktTelefon, website: t.website }} />
        </div>
      </div>
    </div>
  );
}
