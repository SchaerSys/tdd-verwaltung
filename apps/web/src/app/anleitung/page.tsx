import Link from "next/link";

export const metadata = { title: "Benutzeranleitung · TDD-Verwaltung" };

function Step({ n, title, children }: { n: string; title: string; children: React.ReactNode }) {
  return (
    <div className="flex gap-3 mb-4">
      <div className="w-7 h-7 rounded-full bg-[color:var(--accent-weak)] text-[color:var(--accent)] grid place-items-center font-bold text-[.8rem] flex-none">{n}</div>
      <div><div className="font-semibold">{title}</div><div className="text-[.875rem] text-[color:var(--text)] mt-0.5">{children}</div></div>
    </div>
  );
}

export default function AnleitungPage() {
  return (
    <main className="max-w-3xl mx-auto p-6">
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-2xl font-semibold">Benutzeranleitung</h1>
        <Link href="/" className="btn ghost">← Zurück</Link>
      </div>
      <p className="text-[.8125rem] text-[color:var(--muted)] mb-6">Kurzanleitung für die drei Zugänge. Über „Datenschutz" sind die DSGVO-Hinweise abrufbar.</p>

      <div className="panel mb-4"><div className="panel-h"><h3>Anmeldung</h3></div><div className="p-4">
        <Step n="1" title="Zugang wählen">Wählen Sie <b>Tischlein deck dich</b>, <b>Gemeinde</b> oder <b>Institution</b>.</Step>
        <Step n="2" title="Organisation suchen">Bei Gemeinde/Institution die Stelle über das <b>Suchfeld</b> auswählen.</Step>
        <Step n="3" title="Anmelden">E-Mail und Passwort eingeben. Je nach Rolle landen Sie im Portal oder im TDD-Bereich.</Step>
      </div></div>

      <div className="panel mb-4"><div className="panel-h"><h3>Gemeinde / Institution – Antrag &amp; Anspruchsprüfung</h3></div><div className="p-4">
        <Step n="1" title="Neuer Antrag">Antragsteller-Stammdaten, Haushalt und Einnahmen/Ausgaben erfassen. Der <b>Anspruchsrechner</b> zeigt live einen Vorschlag (berechtigt / Härtefall / nicht).</Step>
        <Step n="2" title="Dokumente hochladen">Ausweis, ZMR-Auszug, Kontoauszüge etc. zum Antrag hinzufügen (Bild, PDF, Word).</Step>
        <Step n="3" title="Bescheid">Sie entscheiden final <b>positiv</b> oder <b>negativ</b> (mit Begründung). Bei positivem Bescheid erhält der Antragsteller automatisch eine E-Mail mit dem Bescheid und die Person wird an TDD übergeben.</Step>
      </div></div>

      <div className="panel mb-4"><div className="panel-h"><h3>TDD – Übernahme &amp; Verwaltung</h3></div><div className="p-4">
        <Step n="1" title="Bewilligte Anträge">Neue positiv beschiedene Personen erscheinen unter „Bewilligte Anträge". Prüfen und <b>Übernehmen</b>.</Step>
        <Step n="2" title="Personen &amp; Dubletten">Personen erfassen/bearbeiten; die Dublettenprüfung warnt bei möglichen Doppelaufnahmen (standortübergreifend).</Step>
        <Step n="3" title="Karten">Karte ausstellen (EAN-13), drucken (Plastikkarte Zebra ZC350 / Etikett), verlängern, sperren/entsperren, ersetzen.</Step>
        <Step n="4" title="Auswertungen">Kennzahlen je Standort, Ausgaben, Herkunft der Anträge, Kartenablauf – filterbar und als Excel-Export.</Step>
      </div></div>

      <div className="panel"><div className="panel-h"><h3>Tresen-Kiosk (Ausgabestelle)</h3></div><div className="p-4">
        <Step n="1" title="Karte scannen">Barcode scannen → Ampel grün (berechtigt) oder rot (Grund). Bei Grün „Ausgabe bestätigen".</Step>
        <Step n="2" title="Ohne Karte">Über „Suche ohne Karte" die Person finden.</Step>
        <Step n="3" title="Neue Karte ausstellen">Kommt ein Klient mit positivem Bescheid: Person suchen → <b>Karte ausstellen</b> → drucken.</Step>
        <Step n="4" title="Offline">Bei Netzausfall bleibt der Ausgabe-Betrieb möglich; Buchungen werden gepuffert und automatisch synchronisiert.</Step>
      </div></div>
    </main>
  );
}
