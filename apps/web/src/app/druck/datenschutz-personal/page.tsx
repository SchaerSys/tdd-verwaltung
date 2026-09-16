import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { hasPermission } from "@/lib/rbac";
import { PrintButton } from "@/components/PrintButton";
import { ladeRegeln } from "@/lib/azg-daten";

/**
 * Datenschutzinformation für Mitarbeitende (Art. 13 DSGVO) zum Aushändigen mit dem
 * Dienstzettel. Inhalt folgt dem, was die Verwaltung tatsächlich verarbeitet
 * (Personalakte, Zeiterfassung, Abwesenheiten, Disposition, Fahrzeug-Tablet).
 */
export default async function DatenschutzPersonal() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!hasPermission(user.role, "staff:manage")) redirect("/dashboard");
  const r = await ladeRegeln();

  return (
    <div style={{ background: "#fff", color: "#111", minHeight: "100vh" }}>
      <div className="no-print" style={{ padding: "12px 20px", borderBottom: "1px solid #ddd", display: "flex", gap: 12, alignItems: "center" }}>
        <Link href="/personal" className="btn ghost">← Personal</Link>
        <span style={{ fontSize: ".8rem", color: "#555" }}>Wird mit dem Dienstzettel ausgehändigt; Empfang auf dem Dienstzettel bestätigt.</span>
        <span style={{ marginLeft: "auto" }}><PrintButton /></span>
      </div>

      <div className="ds">
        <h1>Datenschutzinformation für Mitarbeitende</h1>
        <div className="meta">Information nach Art. 13 DSGVO · {r.arbeitgeberName}</div>

        <h2>1. Verantwortlicher</h2>
        <p>{r.arbeitgeberName}{r.arbeitgeberAnschrift ? `, ${r.arbeitgeberAnschrift}` : ""}. Ansprechperson für Datenschutz ist die Geschäftsführung/Vereinsleitung.</p>

        <h2>2. Welche Daten wir verarbeiten</h2>
        <ul>
          <li><b>Stammdaten:</b> Name, Anschrift, Geburtsdatum, Staatsbürgerschaft, Sozialversicherungsnummer, Kontaktdaten, Notfallkontakt.</li>
          <li><b>Dienstverhältnis:</b> Eintritt/Austritt, Beschäftigungsausmaß, Tätigkeit, Einstufung, Entgelt, Probezeit/Befristung, Kündigungsfrist, Dienstzettel und Dienstvertrag, Zeugnisse, Nachweise (Führerschein, Unterweisungen, ärztliche Bescheinigungen).</li>
          <li><b>Arbeitszeit:</b> Kommen/Gehen und Pausen (Stempelkarte oder Terminal), Wochenverteilung, Zeitkonto, Monatsauswertungen, Korrekturen samt Begründung.</li>
          <li><b>Abwesenheiten:</b> Urlaub, Zeitausgleich, Krankenstand (nur Dauer und ob eine Bestätigung vorliegt – keine Diagnosen), Pflegefreistellung, Sonderurlaub.</li>
          <li><b>Fahrdienst:</b> Einteilung zu Touren, gefahrenes Fahrzeug, Kilometerstand, erfasste Mengen je Stopp. <b>Fahrzeugortung (Geofencing), nur mit Ihrer Zustimmung:</b> Während eine Tour läuft, meldet das Fahrzeug-Tablet seine Position; gespeichert werden ausschließlich Ankunft und Abfahrt an den geplanten Stellen (Abholstellen, Ausgabestellen, Lager), Stillstände von über 30 Minuten sowie die jeweils letzte Position während der Tour (wird am Tourende gelöscht). Es entsteht <u>kein</u> Bewegungsprofil; außerhalb einer Tour findet keine Ortung statt. Ereignisse werden nach der eingestellten Frist (Standard 90 Tage) gelöscht. Die Zustimmung kann jederzeit widerrufen werden; Stopps werden dann von Hand bestätigt. Navigation läuft in einer separaten App auf dem Tablet.</li>
          <li><b>Login (nur Büro):</b> Benutzername, E-Mail, Rolle, Anmeldezeitpunkte, Version und Browser des Geräts (für Support).</li>
        </ul>

        <h2>3. Zwecke und Rechtsgrundlagen</h2>
        <ul>
          <li>Begründung, Durchführung und Beendigung des Dienstverhältnisses – Art. 6 Abs 1 lit b DSGVO (Vertrag).</li>
          <li>Gesetzliche Pflichten: Anmeldung und Abrechnung bei der Sozialversicherung ({r.svTraeger}), Lohnsteuer, Arbeitszeitaufzeichnung (§ 26 AZG), Urlaubsaufzeichnung (§ 8 UrlG), Entgeltfortzahlung (EFZG), Dienstzettel (§ 2 AVRAG), Aufbewahrung (§ 132 BAO) – Art. 6 Abs 1 lit c DSGVO.</li>
          <li>Betriebliche Organisation (Disposition der Touren, Dienstplanung, Notfallkontakt) – Art. 6 Abs 1 lit f DSGVO (berechtigtes Interesse an einem geordneten Betrieb).</li>
          <li>Gesundheitsdaten (Krankenstand, ärztliche Bescheinigungen) – Art. 9 Abs 2 lit b DSGVO iVm den arbeitsrechtlichen Pflichten; wir speichern keine Diagnosen.</li>
        </ul>

        <h2>4. Empfänger</h2>
        <p>Sozialversicherung ({r.svTraeger}), Finanzamt, {r.bvKasse ? `Betriebliche Vorsorgekasse (${r.bvKasse})` : "Betriebliche Vorsorgekasse"}, die mit der Lohnverrechnung beauftragte Steuerberatung, im Anlassfall Behörden (Arbeitsinspektorat, Gerichte). Die Verwaltungssoftware wird von Schär Systems (Auftragsverarbeiter, Vertrag nach Art. 28 DSGVO) betrieben und auf Servern in der EU gehostet; es findet keine Übermittlung in Drittländer statt. Die Wartung der Software hat technisch keinen Zugriff auf Personaldaten.</p>

        <h2>5. Speicherdauer</h2>
        <ul>
          <li>Personalakte, Entgelt- und Zeitaufzeichnungen: sieben Jahre ab Ende des Kalenderjahres des Austritts (§ 132 BAO, § 76 EStG); danach werden Dokumente und sensible Angaben automatisch gelöscht.</li>
          <li>Protokoll der Anmeldungen und Änderungen (Audit-Log, Rechenschaftspflicht): drei Jahre. Support-Ereignisse (ohne Personenbezug): 30 Tage.</li>
          <li>Bewerbungsunterlagen nicht eingestellter Personen werden nicht in dieser Software gespeichert.</li>
        </ul>

        <h2>6. Ihre Rechte</h2>
        <p>Sie haben das Recht auf Auskunft (Art. 15), Berichtigung (Art. 16), Löschung (Art. 17), Einschränkung (Art. 18), Datenübertragbarkeit (Art. 20) und Widerspruch gegen Verarbeitungen auf Grundlage berechtigter Interessen (Art. 21). Wenden Sie sich dafür an die Vereinsleitung. Sie können sich außerdem bei der Österreichischen Datenschutzbehörde (Barichgasse 40–42, 1030 Wien, dsb@dsb.gv.at) beschweren.</p>

        <h2>7. Bereitstellungspflicht, automatisierte Entscheidungen</h2>
        <p>Die Angaben unter Punkt 2 sind für das Dienstverhältnis gesetzlich bzw. vertraglich erforderlich; ohne sie kann das Dienstverhältnis nicht geführt werden (Ausnahme: Notfallkontakt, freiwillig). Es finden keine automatisierten Entscheidungen im Sinn des Art. 22 DSGVO und kein Profiling statt. Die Software weist lediglich auf Fristen und fehlende Angaben hin.</p>

        <p className="klein" style={{ marginTop: 18 }}>Stand {new Date().toLocaleDateString("de-AT")} · Diese Information ersetzt frühere Fassungen und wird bei Änderungen erneut ausgehändigt.</p>
      </div>

      <style>{`
        @page { size: A4; margin: 16mm; }
        .ds { max-width: 180mm; margin: 0 auto; padding: 18px 12px; font-size: 11px; line-height: 1.45; }
        .ds h1 { font-size: 19px; margin: 0 0 2px; }
        .ds h2 { font-size: 12.5px; margin: 14px 0 4px; }
        .ds .meta { color: #555; margin-bottom: 10px; }
        .ds ul { margin: 2px 0 0 18px; padding: 0; }
        .ds li { margin-bottom: 2px; }
        .ds p { margin: 2px 0; }
        .ds .klein { font-size: 9.5px; color: #555; }
      `}</style>
    </div>
  );
}
