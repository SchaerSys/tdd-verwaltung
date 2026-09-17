import { notFound } from "next/navigation";
import { sql } from "drizzle-orm";
import { dbFuer } from "@/lib/db";
import { mandantLaden, smtpLaden } from "@/lib/unternehmen";

export const dynamic = "force-dynamic";

function rows<T>(res: unknown): T[] { return (Array.isArray(res) ? res : (res as { rows?: T[] }).rows ?? []) as T[]; }

/** Angaben fuer den Auftragsverarbeitungsvertrag (Art. 28 DSGVO) je Mandant – druckbar, keine Personendaten. */
export default async function AvvSeite({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const t = await mandantLaden(id);
  if (!t) notFound();
  const smtp = await smtpLaden(id);
  const fristen = rows<{ entity_type: string; retention_period: string; legal_basis: string | null; is_active: boolean }>(await dbFuer(id).execute(sql`SELECT entity_type, retention_period::text, legal_basis, is_active FROM retention_rules ORDER BY entity_type`));
  const module = Object.entries({ portal: "Antragsportal Gemeinden/Institutionen", personal: "Personal & Arbeitszeit", zivildienst: "Zivildienst", touren: "Touren & Logistik (inkl. Geofencing des Fahrzeug-Tablets)", station: "Ausgabestation" })
    .filter(([k]) => t.module?.[k] !== false).map(([, v]) => v);
  const heute = new Date().toLocaleDateString("de-AT");
  return (
    <main style={{ maxWidth: 800, margin: "0 auto", padding: 24, fontSize: 13, lineHeight: 1.5 }}>
      <style>{`@media print { .noprint { display: none } } table { border-collapse: collapse; width: 100% } td, th { border: 1px solid #ccc; padding: 4px 6px; text-align: left; vertical-align: top } h2 { margin-top: 18px; font-size: 15px }`}</style>
      <div className="noprint" style={{ marginBottom: 12, color: "#666" }}>Drucken mit Strg+P (Browser) – die Seite ist druckoptimiert.</div>
      <h1 style={{ fontSize: 20 }}>Angaben zur Auftragsverarbeitung (Art. 28 DSGVO)</h1>
      <div style={{ color: "#666" }}>Tafelwerk · erstellt {heute} · Beilage zum Auftragsverarbeitungsvertrag</div>

      <h2>1. Verantwortlicher (Auftraggeber)</h2>
      <table><tbody>
        <tr><th style={{ width: 200 }}>Unternehmen</th><td>{t.name}</td></tr>
        <tr><th>Anschrift</th><td style={{ whiteSpace: "pre-line" }}>{t.anschrift ?? "—"}</td></tr>
        <tr><th>Vertretung / Register</th><td style={{ whiteSpace: "pre-line" }}>{t.vertretung ?? "—"}</td></tr>
        <tr><th>Kontakt</th><td>{[t.kontaktEmail, t.kontaktTelefon, t.website].filter(Boolean).join(" · ") || "—"}</td></tr>
        <tr><th>Ansprechpartner</th><td>{t.ansprechpartner ?? "—"}</td></tr>
      </tbody></table>

      <h2>2. Auftragsverarbeiter</h2>
      <table><tbody>
        <tr><th style={{ width: 200 }}>Betreiber</th><td>Schär Systems · Dario Schär · info@schaer-systems.at</td></tr>
        <tr><th>Leistung</th><td>Betrieb, Wartung und Weiterentwicklung der Software Tafelwerk als Mandant in einer gemeinsamen Installation; Support ohne Zugriff auf Personendaten (Betreiberrolle mit Spaltenrechten, nur Metadaten und Aggregate)</td></tr>
        <tr><th>Hosting (Sub-Auftragsverarbeiter)</th><td>Hetzner Online GmbH, Rechenzentrum Falkenstein (Deutschland, EU); verschlüsselte Backups auf Hetzner Storage Box (EU)</td></tr>
        <tr><th>E-Mail-Versand</th><td>{smtp ? `Mailserver des Verantwortlichen: ${smtp.host} (Absender ${smtp.absenderEmail})` : "Plattform-Mailserver des Betreibers (World4You, Österreich) – bis der Verantwortliche eigene Zugangsdaten hinterlegt"}</td></tr>
        <tr><th>Weitere Dienste</th><td>Routing (OSRM) und Kartenkacheln (OpenStreetMap) ohne Personenbezug; Geocoding von Standort- und Abholstellen-Adressen (Photon/komoot, EU) ohne Personenbezug</td></tr>
      </tbody></table>

      <h2>3. Gegenstand, Zwecke, Module</h2>
      <p>Verwaltung von Klient:innen und Berechtigungskarten, Dokumentation der Lebensmittelausgabe, Antragsprüfung durch Gemeinden/Institutionen, Personalverwaltung inkl. Arbeitszeit und Abwesenheiten nach österreichischem Arbeitsrecht, Tourenplanung.</p>
      <p><b>Aktive Module:</b> Grundmodule (Personen, Karten, Ausgabe, Auswertungen){module.length ? ", " + module.join(", ") : ""}.</p>

      <h2>4. Kategorien betroffener Personen und Daten</h2>
      <table><thead><tr><th>Betroffene</th><th>Datenkategorien</th></tr></thead><tbody>
        <tr><td>Klient:innen (Bezugsberechtigte)</td><td>Stammdaten, Geburtsdatum, Kontakt, Haushalt, Herkunft/Sprache, Foto (optional), Karten- und Ausgabedaten inkl. Zahlungen/Ausstand, Anträge mit Einkommens-/Ausgabenangaben und Dokumenten (nur Portal)</td></tr>
        <tr><td>Mitarbeitende, Zivildiener, Ehrenamtliche</td><td>Personalakte (Dienstverhältnis, SV-Nummer, Gehalt, Notfallkontakt), Arbeitszeiten, Abwesenheiten inkl. Krankenstand, Dienstplan, Positionsdaten des Fahrzeug-Tablets während Touren (nur mit Zustimmung)</td></tr>
        <tr><td>Benutzer:innen (Mitarbeitende, Gemeinden, Institutionen)</td><td>Konto, Rolle, Login-Verlauf, Audit-Protokoll</td></tr>
        <tr><td>Geschäftskontakte (Abholstellen)</td><td>Ansprechperson, Telefon, E-Mail</td></tr>
      </tbody></table>

      <h2>5. Löschfristen (Konfiguration des Verantwortlichen)</h2>
      <table><thead><tr><th>Datenart</th><th>Frist</th><th>Rechtsgrundlage</th><th>aktiv</th></tr></thead><tbody>
        {fristen.map((f) => <tr key={f.entity_type}><td>{f.entity_type}</td><td>{f.retention_period}</td><td>{f.legal_basis ?? "—"}</td><td>{f.is_active ? "ja" : "nein"}</td></tr>)}
        <tr><td>Personalakte</td><td>7 Jahre nach Ende des Austrittsjahres</td><td>§ 132 BAO</td><td>ja</td></tr>
        <tr><td>Geofencing-Ereignisse</td><td>laut Zeitregeln (Standard 90 Tage)</td><td>Einwilligung, § 10 AVRAG</td><td>ja</td></tr>
      </tbody></table>

      <h2>6. Technische und organisatorische Maßnahmen (Auszug)</h2>
      <ul>
        <li>Mandantentrennung auf Datenbankebene (Row-Level-Security), getrennte Datenbankrollen für Fach-App und Betreiber; Betreiber ohne Lesezugriff auf Personendaten.</li>
        <li>Transportverschlüsselung (TLS), Passwörter als argon2id-Hash, Zwei-Faktor-Anmeldung für Administration und Betreiber, Sperre nach Fehlversuchen.</li>
        <li>Tägliche, mit age verschlüsselte Backups (Schlüssel nicht auf dem Server), regelmäßige Rückspielproben, Sicherheitsupdates, Firewall, fail2ban.</li>
        <li>Append-only Audit-Protokoll, Löschfristen als nächtliche Jobs, SMTP-Zugangsdaten nur verschlüsselt gespeichert.</li>
        <li>Löschung des Mandanten nur mit Zwei-Personen-Regel und Wartefrist; Datenexport auf Anfrage.</li>
      </ul>
      <p style={{ color: "#666", marginTop: 24 }}>Diese Beilage wird aus der Konfiguration erzeugt und ersetzt keinen unterschriebenen Vertrag.</p>
    </main>
  );
}
