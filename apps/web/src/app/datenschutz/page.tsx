import Link from "next/link";

export const metadata = { title: "Datenschutz · TDD-Verwaltung" };

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mb-6">
      <h2 className="text-[1.05rem] font-semibold mb-2">{title}</h2>
      <div className="text-[.875rem] text-[color:var(--text)] flex flex-col gap-1">{children}</div>
    </section>
  );
}

export default function DatenschutzPage() {
  return (
    <main className="max-w-3xl mx-auto p-6">
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-2xl font-semibold">Datenschutzhinweise</h1>
        <Link href="/" className="btn ghost">← Zurück</Link>
      </div>
      <p className="text-[.8125rem] text-[color:var(--muted)] mb-6">
        Diese Plattform verarbeitet sensible Sozialdaten. Wir informieren Sie hier über die Verarbeitung
        gemäß DSGVO. Diese Hinweise sind auf jeder Ansicht der Plattform über „Datenschutz" abrufbar.
      </p>

      <Section title="Verantwortlicher">
        <div><b>Tischlein deck dich Vorarlberg</b></div>
        <div>Ladritschweg 10c, A-6773 Vandans</div>
        <div>Vereinsregister: ZVR 263197010</div>
        <div>Vertreten durch den Obmann Elmar Stüttler</div>
      </Section>

      <Section title="Kontakt für Datenschutzfragen">
        <div>Für Fragen zum Datenschutz und zur Ausübung Ihrer Rechte wenden Sie sich bitte an den
          Verantwortlichen (Tischlein deck dich Vorarlberg, Anschrift siehe oben).</div>
      </Section>

      <Section title="Entwickler / technischer Betrieb der Plattform (Auftragsverarbeiter)">
        <div><b>Schär Systems</b> · Dario Schär (Privatperson, handelnd unter der Geschäftsbezeichnung „Schär Systems")</div>
        <div>Für technische Rückfragen: <a className="text-[color:var(--accent)] hover:underline" href="mailto:info@schaer-systems.at">info@schaer-systems.at</a></div>
        <div className="text-[color:var(--muted)]">Betrieb in der EU (Hetzner Online GmbH, Rechenzentrum Falkenstein, Deutschland). Mit dem Verein besteht ein Auftragsverarbeitungsvertrag (AVV) gemäß Art. 28 DSGVO.</div>
      </Section>

      <Section title="Zwecke der Verarbeitung">
        <div>Prüfung der Anspruchsberechtigung, Verwaltung von Berechtigungskarten und Dokumentation der
          Lebensmittelausgabe im Rahmen der Tätigkeit von Tischlein deck dich.</div>
      </Section>

      <Section title="Verarbeitete Datenkategorien">
        <ul className="list-disc pl-5">
          <li>Stammdaten (Name, Adresse, Geburtsdatum, Kontaktdaten, Haushalt)</li>
          <li>Angaben zur Anspruchsprüfung (Einnahmen/Ausgaben) – nur bei antragstellenden Stellen</li>
          <li>Hochgeladene Dokumente (z. B. Ausweis, ZMR-Auszug, Kontoauszüge, Bescheid)</li>
          <li>Karten- und Ausgabedaten</li>
        </ul>
      </Section>

      <Section title="Empfänger / Weitergabe">
        <div>Zuständige Gemeinde/Stadt bzw. antragstellende Institution und Tischlein deck dich – ausschließlich
          zum Zweck der Anspruchsprüfung und Kartenausstellung. Eine Weitergabe an unbeteiligte Dritte erfolgt nicht.</div>
      </Section>

      <Section title="Zugriffsbeschränkung">
        <div>Der Zugriff ist rollenbasiert beschränkt und mandantengetrennt. Hochgeladene Dokumente sind
          ausschließlich für Administratoren einsehbar; Personal an der Ausgabe bzw. in den Läden sieht keine Dokumente.</div>
      </Section>

      <Section title="Speicherdauer / Löschung">
        <div>Personendaten werden standardmäßig 3 Jahre nach der letzten Aktivität gelöscht, hochgeladene
          Rohscans 90 Tage nach Übernahme, Protokolldaten 3 Jahre. Gelöschte Datensätze werden – soweit keine
          gesetzliche Aufbewahrungspflicht besteht – über einen Papierkorb endgültig entfernt.</div>
      </Section>

      <Section title="Ihre Rechte">
        <div>Sie haben das Recht auf Auskunft, Berichtigung, Löschung, Einschränkung der Verarbeitung,
          Datenübertragbarkeit sowie Widerruf einer erteilten Einwilligung (mit Wirkung für die Zukunft) und
          Beschwerde bei der Datenschutzbehörde. Bitte wenden Sie sich an die oben genannten Kontakte.</div>
      </Section>
    </main>
  );
}
