import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getCurrentOps } from "@/lib/auth";
import { mandantLaden, smtpLaden } from "@/lib/unternehmen";
import { hostZeigtHierher } from "@/lib/mail";
import { Schritte } from "../../Schritte";
import { SmtpForm } from "../SmtpForm";
import { HostForm, AdminForm } from "./Formulare";

export const dynamic = "force-dynamic";

/** Anlege-Assistent, Schritte 2–4 (Schritt 1 = /unternehmen/neu). */
export default async function Einrichten({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ schritt?: string }> }) {
  const ops = await getCurrentOps();
  if (!ops || ops.rolle !== "SUPER") redirect("/unternehmen");
  const { id } = await params;
  const sp = await searchParams;
  const schritt = Math.min(4, Math.max(2, Number(sp.schritt ?? 2) || 2));
  const t = await mandantLaden(id);
  if (!t) notFound();
  const titel = ["", "", "E-Mail-Versand (SMTP)", "Eigener Host & DNS", "Erstes Admin-Konto"][schritt];
  const dnsCheck = schritt === 3 && t.host ? await hostZeigtHierher(t.host) : null;
  const smtp = schritt === 2 ? await smtpLaden(id) : null;

  return (
    <div>
      <div className="page-h"><div><h1>{t.name} einrichten</h1><div className="sub">Schritt {schritt} von 4 · {titel}</div></div><Link href={`/unternehmen/${id}`} className="btn ghost sm">Zur Mandantenakte</Link></div>
      <Schritte aktiv={schritt} />
      <div className="panel"><div style={{ padding: 12 }}>
        {schritt === 2 ? (
          <>
            <p className="text-sm text-muted mb-3">Über welchen Mailserver verschickt dieser Mandant Einladungen, Passwort-Links, Bescheide und Karten-Erinnerungen? Ohne Angabe wird das Plattform-SMTP verwendet (Absender CareOS).</p>
            <SmtpForm id={id} werte={smtp} weiter={`/unternehmen/${id}/einrichten?schritt=3`} />
          </>
        ) : null}
        {schritt === 3 ? (
          <>
            <p className="text-sm text-muted mb-3">Eigener Hostname (z. B. tirol.careos.at): DNS-A-Eintrag beim Domain-Anbieter auf diesen Server setzen; das Zertifikat holt der Server beim ersten Aufruf automatisch. Ohne eigenen Host melden sich die Benutzer über <span className="mono">/m/{t.slug}</span> an.</p>
            {dnsCheck ? <div className={`pill ${dnsCheck.ok ? "good" : "warn"}`} style={{ display: "block", whiteSpace: "normal", marginBottom: 10 }}>{dnsCheck.info}</div> : null}
            <HostForm id={id} host={t.host} weiter={`/unternehmen/${id}/einrichten?schritt=4`} />
          </>
        ) : null}
        {schritt === 4 ? (
          <>
            <p className="text-sm text-muted mb-3">Das erste Admin-Konto bekommt eine Willkommens-Mail mit Link zum Passwort-Setzen (72 h) und dem Einstiegslink. Alles Weitere (Standorte, Personal, Benutzer) macht der Admin in der Fach-App.</p>
            <AdminForm id={id} />
          </>
        ) : null}
      </div></div>
    </div>
  );
}
