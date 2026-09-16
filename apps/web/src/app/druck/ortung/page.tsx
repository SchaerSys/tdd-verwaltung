import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { staff } from "@tdd/db";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { hasPermission } from "@/lib/rbac";
import { PrintButton } from "@/components/PrintButton";
import { ladeRegeln } from "@/lib/azg-daten";

/** Zustimmungserklärung zur Fahrzeugortung (Geofencing) – § 10 AVRAG, § 96 ArbVG sinngemäß; /druck/ortung?staff=<id>. */
export default async function OrtungDruck({ searchParams }: { searchParams: Promise<{ staff?: string }> }) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!hasPermission(user.role, "staff:manage")) redirect("/dashboard");
  const sp = await searchParams;
  if (!sp.staff) redirect("/personal");
  const [p, r] = await Promise.all([db().select().from(staff).where(eq(staff.id, sp.staff)).limit(1).then((x) => x[0]), ladeRegeln()]);
  if (!p) notFound();

  return (
    <div style={{ background: "#fff", color: "#111", minHeight: "100vh" }}>
      <div className="no-print" style={{ padding: "12px 20px", borderBottom: "1px solid #ddd", display: "flex", gap: 12, alignItems: "center" }}>
        <Link href={`/personal/${p.id}`} className="btn ghost">← Personal</Link>
        <span style={{ fontSize: ".8rem", color: "#555" }}>Unterschreiben lassen, als Dokument ablegen und das Datum im Personal-Datensatz eintragen.</span>
        <span style={{ marginLeft: "auto" }}><PrintButton /></span>
      </div>
      <div className="zu">
        <div className="kopf"><div><b>{r.arbeitgeberName}</b><br />{r.arbeitgeberAnschrift ?? ""}</div><div style={{ textAlign: "right" }}>Personalnummer {p.personalnr ?? "—"}</div></div>
        <h1>Zustimmung zur Fahrzeugortung (Geofencing)</h1>
        <div className="meta">gemäß § 10 AVRAG · Kontrollmaßnahme, die die Menschenwürde berührt, nur mit Zustimmung</div>

        <p><b>{p.firstName} {p.lastName}</b>{p.geburtsdatum ? `, geboren am ${new Date(p.geburtsdatum + "T00:00:00Z").toLocaleDateString("de-AT")}` : ""}</p>

        <h2>1. Was geortet wird</h2>
        <p>Das Tablet im Fahrzeug meldet seine Position an die Verwaltungssoftware – ausschließlich solange eine Tour den Stand „unterwegs“ hat, also zwischen „Tour starten“ und „Tour beenden“. Außerhalb einer Tour, in Pausen ohne laufende Tour und an privaten Geräten findet keine Ortung statt. Geortet wird das Fahrzeug-Tablet, nicht die Person; die Zuordnung zur Person ergibt sich aus der Wahl „Wer fährt?“ beim Tourstart.</p>

        <h2>2. Was gespeichert wird</h2>
        <ul>
          <li>Ankunft und Abfahrt an den <b>geplanten Stellen</b> der Tour (Abholstellen, Ausgabestellen, Lager) mit Uhrzeit – erkannt über einen Kreis von etwa 150 m um die Stelle.</li>
          <li>Stillstände von mehr als 30 Minuten außerhalb geplanter Stellen (Zeitpunkt und nächstgelegene Stelle) – als Hinweis für die Disposition, z. B. bei Panne oder Stau.</li>
          <li>Die jeweils <b>letzte Position</b> während der Tour, damit die Disposition weiß, wo die Tour steht; sie wird beim Tourende gelöscht.</li>
        </ul>
        <p><b>Nicht gespeichert</b> wird ein Bewegungsprofil (keine Fahrstrecke, keine Geschwindigkeit, kein Verlauf). Die Ereignisse werden nach {r.ortungAufbewahrungTage} Tagen automatisch gelöscht.</p>

        <h2>3. Zweck</h2>
        <p>Organisation der Abholungen und Lieferungen (Stand der Tour, Unterstützung beim Abhaken der Stopps, Planung der Zeitfenster bei den Betrieben, Hilfe bei Panne oder Verspätung). Die Daten werden nicht zur Leistungs- oder Verhaltenskontrolle verwendet und nicht an Dritte weitergegeben.</p>

        <h2>4. Zugriff</h2>
        <p>Disposition und Verwaltung (Admin) sehen die Ereignisse und die letzte Position in der Tour; der Betreiber der Software hat keinen Zugriff auf Personendaten. Jede Einsicht ist protokolliert.</p>

        <h2>5. Freiwilligkeit und Widerruf</h2>
        <p>Die Zustimmung ist freiwillig. Ohne Zustimmung werden Stopps am Tablet wie bisher von Hand bestätigt; daraus entstehen keine Nachteile. Die Zustimmung kann jederzeit ohne Angabe von Gründen widerrufen werden (mündlich oder schriftlich beim Büro); die Ortung wird dann ab sofort abgeschaltet.</p>

        <p style={{ marginTop: 18 }}>Ich habe die Information gelesen und stimme der beschriebenen Fahrzeugortung während meiner Touren zu.</p>

        <div className="unterschrift">
          <div>Ort, Datum</div>
          <div>Unterschrift {p.firstName} {p.lastName}</div>
          <div>Für den Arbeitgeber</div>
        </div>
      </div>
      <style>{`
        @page { size: A4; margin: 18mm; }
        .zu { max-width: 175mm; margin: 0 auto; padding: 18px 12px; font-size: 11.5px; line-height: 1.5; }
        .zu .kopf { display: flex; justify-content: space-between; font-size: 10.5px; color: #333; margin-bottom: 18px; }
        .zu h1 { font-size: 19px; margin: 0 0 2px; }
        .zu h2 { font-size: 12.5px; margin: 14px 0 3px; }
        .zu .meta { color: #555; margin-bottom: 12px; }
        .zu ul { margin: 2px 0 6px 18px; padding: 0; }
        .zu .unterschrift { margin-top: 56px; display: flex; gap: 30px; }
        .zu .unterschrift div { flex: 1; border-top: 1px solid #333; padding-top: 4px; font-size: 10px; color: #555; }
      `}</style>
    </div>
  );
}
