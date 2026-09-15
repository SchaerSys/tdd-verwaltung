# Begründungen – warum der Code so aussieht, wie er aussieht

Ergänzt `docs/decisions.md` (dort steht **was** entschieden wurde, chronologisch aus den
Planungs-Interviews) um das **Warum auf Code-Ebene**: jede tragende technische Entscheidung
mit Begründung, verworfener Alternative und dem Preis, den sie kostet.

Aufbau je Eintrag: **Entscheidung → Begründung → Alternative & Trade-off**.
Am Ende ein ehrlicher Abschnitt: [Wo die Begründung dünn ist](#12-wo-die-begründung-dünn-ist).

---

## 1. Architektur im Großen

### 1.1 Monorepo mit npm-Workspaces (`package.json`)
- **Begründung:** Die Domänenlogik (Dubletten, EAN, Phonetik) muss unabhängig von Next.js
  testbar sein, aber gemeinsam mit der App versioniert werden. Workspaces geben genau das:
  ein `npm install`, ein Typecheck über alles, keine Paket-Registry, kein Versions-Drift
  zwischen App und Bibliothek.
- **Alternative:** getrennte Repos + privates npm-Registry (Overhead ohne Nutzen bei einem
  Entwickler), oder alles in `apps/web` (dann wäre die Dubletten-Engine an Next.js gekoppelt und
  nur noch über die App testbar).
- **Preis:** Docker-Build muss die Workspace-Manifeste einzeln kopieren und `outputFileTracingRoot`
  auf die Repo-Wurzel setzen (`apps/web/next.config.mjs:20`) — beides einmalig gelöst.

### 1.2 Drei Pakete: `core` (framework-frei) · `db` (Schema) · `web` (App)
- **Begründung:** Die Trennlinie verläuft entlang der Testbarkeit. Alles, was fachlich
  begründbar und ohne Datenbank entscheidbar ist (Normalisierung, Phonetik, Prüfziffer,
  Scoring), liegt in `packages/core` und ist unit-getestet. Alles, was Zustand braucht, liegt
  darüber. Deshalb konnte die Dublettenlogik kalibriert werden, ohne die App zu starten.
- **Alternative:** Scoring in SQL (Postgres kann `similarity()` selbst). Verworfen, weil die
  Gewichtung dann nicht mehr unit-testbar und nur mit laufender DB nachvollziehbar wäre.
- **Preis:** Die Trigramm-Metrik existiert zweimal (in SQL für die Vorauswahl, in TypeScript für
  die Bewertung). Bewusst in Kauf genommen — siehe 3.3.

### 1.3 Next.js 15 App Router mit Server Components und Server Actions
- **Begründung:** Der Kern der Anwendung ist „Formular ausfüllen → serverseitig prüfen →
  speichern → Liste anzeigen". Server Actions liefern genau diesen Pfad ohne eigene API-Schicht,
  ohne Client-State-Management und ohne doppelte Typen. Personendaten (PII) werden serverseitig
  gerendert und gelangen nur als fertiges HTML an den Browser — datenschutzseitig die günstigere
  Variante gegenüber einer JSON-API, die Rohdaten ausliefert.
- **Alternative:** SPA + REST/tRPC. Das hätte eine zweite Autorisierungsschicht, ein Client-Cache
  und mehr PII im Browser bedeutet.
- **Preis:** Bindung an Next.js; Server Actions hinter dem Reverse-Proxy brauchen
  `experimental.serverActions.allowedOrigins` (`apps/web/next.config.mjs:25`).

### 1.4 Kein Redis, keine Message-Queue, kein CRDT
- **Begründung:** In Runde 2 der Planung wurde erhoben, dass Internet-Ausfälle am Tresen
  „praktisch nie" vorkommen (`docs/decisions.md`, Runde 2). Ein Sync-Motor wäre Infrastruktur,
  die dauerhaft betrieben und verstanden werden müsste, für ein Risiko, das faktisch nicht
  eintritt. Stattdessen: `localStorage`-Queue im Kiosk + idempotenter Insert (siehe 6.2).
- **Alternative:** Offline-first mit CRDT/PouchDB. Verworfen — verteilte Konfliktauflösung
  widerspricht dem Kernziel (**eine** zentrale Wahrheit gegen Dubletten).
- **Preis:** Bei einem längeren Ausfall kann am Tresen nur *ausgegeben*, nicht *aufgenommen* werden.
  Genau so gewollt.

### 1.5 TypeScript strict + `noUncheckedIndexedAccess` (`tsconfig.base.json`)
- **Begründung:** Das System verarbeitet Daten, die aus OCR, Excel-Import und Handeingabe
  stammen — dort ist „Feld fehlt" der Normalfall, nicht die Ausnahme. `noUncheckedIndexedAccess`
  erzwingt, dass jeder Array-/Record-Zugriff als möglicherweise `undefined` behandelt wird.
- **Preis:** Viele `?.`/`!`-Stellen. Der Compiler ersetzt hier die fehlende Integrationstest-Abdeckung.

---

## 2. Datenbank & Schema

### 2.1 PostgreSQL 16 mit `pg_trgm` und `fuzzystrmatch` (`packages/db/sql/001_init.sql:8`)
- **Begründung:** Die Dublettenprüfung ist das Kernproblem des Projekts. Postgres kann
  unscharfe Namenssuche mit GIN-Trigramm-Index nativ — ohne Suchcluster daneben.
- **Alternative:** Elasticsearch/OpenSearch. Für 2.000–5.000 Personen (Planungsrunde 1) grotesk
  überdimensioniert und ein zweiter Ort, an dem PII liegt.

### 2.2 SQL-Migrationen als Quelle der Wahrheit, Drizzle als getippte Spiegelung
- **Begründung:** Rollen, Grants, Row-Level-Security-Policies, `SECURITY DEFINER`-Funktionen und
  partielle Indizes lassen sich in keinem ORM-Migrationsgenerator sauber ausdrücken — genau diese
  Konstrukte tragen hier aber die DSGVO-Trennung. Deshalb: handgeschriebene, nummerierte
  SQL-Dateien (`001` … `024`), und `packages/db/src/schema.ts` bildet sie nur für typsichere
  Queries ab (so auch im Dateikopf dokumentiert).
- **Alternative:** `drizzle-kit generate`. Verworfen, weil generierte Migrationen die
  Sicherheitsobjekte nicht kennen und beim „Angleichen" wieder wegräumen könnten.
- **Preis:** Schema und Drizzle-Definition können auseinanderlaufen; es gibt keinen automatischen
  Abgleich. Aufgefangen durch Typecheck + Live-Verifikation nach jedem Schritt.

### 2.3 Additive Migrationen (`ADD COLUMN IF NOT EXISTS`, `CREATE TABLE IF NOT EXISTS`)
- **Begründung:** Das System lief bereits produktiv, während die Plattform-Erweiterung gebaut
  wurde (`004_platform.sql` trägt das explizit im Kopf: „ADDITIV … bricht die bestehende App nicht").
  Idempotente Migrationen sind auf einem Ein-Server-Setup ohne Staging-Umgebung die sicherste Form.
- **Preis:** Keine Down-Migrationen. Rückbau erfolgt über eine neue Vorwärts-Migration
  (z. B. `017_fix_stats_view.sql`).

### 2.4 UUID für PII-Tabellen, `identity`-Integer für Stammdaten
- **Begründung:** `persons`, `cards`, `distributions` bekommen UUIDs, weil ihre IDs in URLs
  auftauchen (`/personen/[id]`, `/dokument/[id]`) — fortlaufende Zahlen wären dort aufzählbar und
  würden zusätzlich die Bestandsgröße verraten. Standorte und Auswahllisten sind kleine,
  nicht-sensible Stammdaten und bleiben als Integer les- und debugbar.
- **Preis:** Uneinheitliche ID-Typen. Der Unterschied ist aber sachlich begründet, nicht zufällig.

### 2.5 Soft-Delete (`deleted_at`) statt `DELETE`
- **Begründung:** Zwei unabhängige Gründe: (a) DSGVO verlangt definierte Fristen, nicht sofortiges
  Löschen — Aufbewahrung mit späterem Löschjob ist die rechtlich korrekte Form; (b) im laufenden
  Betrieb wurde bereits einmal ein Datensatz versehentlich entfernt (dokumentiert in
  `docs/decisions.md`, Schritt 7). Soft-Delete macht solche Fehler reversibel. Der Papierkorb-Job
  (`apps/web/src/app/api/jobs/cleanup/route.ts`) setzt deshalb nur `deleted_at` — endgültiges
  Löschen bleibt eine bewusste manuelle Handlung.
- **Preis:** Jede Query muss `deleted_at IS NULL` mitführen; wird das vergessen, tauchen
  gelöschte Sätze wieder auf. Das ist eine echte Fehlerquelle (siehe 12.6).

### 2.6 Schattenfelder `*_norm` / `*_phon` in der Tabelle statt berechneter Ausdrücke
- **Begründung:** Ein GIN-Trigramm-Index braucht eine materialisierte Spalte, wenn die
  Normalisierung nicht in SQL, sondern in `@tdd/core` passiert. Die Normalisierung gehört aber
  in die getestete TypeScript-Logik (siehe 1.2) — also schreibt die App die Schattenwerte mit.
- **Alternative:** Generated Columns mit SQL-Normalisierung. Dann läge die Umlaut-Faltung
  doppelt vor (SQL + TS) und könnte divergieren.
- **Preis:** Schreibpfade müssen die Schattenfelder pflegen; ein Import, der das vergisst, ist
  für die Dublettensuche unsichtbar.

### 2.7 Partieller Unique-Index statt Trigger (`uq_active_assignment`)
```sql
CREATE UNIQUE INDEX uq_active_assignment
  ON person_location_assignments (person_id) WHERE is_active;
```
- **Begründung:** Die Fachregel „eine Person ist zu einem Zeitpunkt genau einem Standort
  zugeordnet" wird damit von der Datenbank garantiert — auch bei parallelen Requests und auch
  gegenüber manuellen Eingriffen per `psql`. Ein Trigger oder eine Prüfung im Anwendungscode
  wäre schwächer.

### 2.8 Geldbeträge als `numeric(10,2)`, nicht `float`
- **Begründung:** Es geht um Unkostenbeiträge und Schuldenstände von Menschen in finanzieller
  Not. Binäre Gleitkommazahlen dürfen hier nicht in die Nähe der Buchhaltung. In der App werden
  Beträge als String an Drizzle übergeben (`String(amountDue)`, `kiosk/actions.ts`) — genau um
  eine Float-Konvertierung zu vermeiden.
- **Preis:** Beim Lesen ist `Number(...)` nötig, und die Summenbildung passiert in SQL
  (`SUM(...)`), nicht in JS.

### 2.9 `jsonb` nur für formularnahe, nicht auswertbare Daten
- **Begründung:** `antraege.financials`, `user_dashboard_prefs.favorites/widgets` und
  `locations.opening_hours` sind Strukturen, die sich mit dem Formular bzw. den Nutzerwünschen
  ändern und über die nie gefiltert oder aggregiert wird. Die *auswertbaren* Größen daraus
  (`income_total`, `expense_total`, `available_income`, `income_limit`) stehen daneben als
  eigene, indexierbare Spalten. Genau diese Zweiteilung verhindert das übliche „alles im JSON"-Problem.

---

## 3. Dubletten-Engine (das Herzstück)

### 3.1 Kölner Phonetik statt Soundex (`packages/core/src/phonetik.ts`)
- **Begründung:** Soundex ist für englische Namen entworfen. Die Fälle, die hier real auftreten
  — Maier/Mayer/Meier, Müller/Mueller, Schmid/Schmitt — trennt Soundex falsch, die Kölner
  Phonetik nicht. `fuzzystrmatch` ist zwar installiert, wird für den Produktivpfad aber nicht
  benutzt: der phonetische Schlüssel kommt aus der eigenen, getesteten Implementierung.
- **Preis:** ~90 Zeilen eigener Code mit kontextabhängigen Regeln (C vor A/H/K/L/O/Q/R/U/X,
  X nach C/K/Q, P vor H). Deshalb 20 Tests dagegen.

### 3.2 Umlaut-Faltung vor der Normalisierung (`normalize.ts`)
- **Begründung:** `Müller` → `mueller`, nicht `muller`. Deutsche Schreibvarianten sind der
  häufigste Dublettengrund im Bestand — die Faltung muss *deutsch* sein, nicht generisch
  (`NFD` + Diakritika streichen käme sonst bei `ü` auf `u`). Die generische Diakritika-Entfernung
  läuft erst *danach*, für alles Übrige (`é`, `č`, …).
- **Preis:** Türkisches `ı` wird noch nicht auf `i` gefaltet (bekannt und in `decisions.md` notiert).

### 3.3 Trigramm-Ähnlichkeit doppelt: `%` in SQL, Dice-Koeffizient in TS (`dedupe.ts`)
- **Begründung:** Zwei verschiedene Aufgaben. SQL macht die **Vorauswahl** (indexgestützt, muss
  schnell sein, darf großzügig sein); TypeScript macht die **Bewertung** (muss erklärbar,
  testbar und ohne DB reproduzierbar sein). Die TS-Variante bildet die pg_trgm-Semantik samt
  Randmarkierung nach, damit beide Seiten dieselbe Vorstellung von Ähnlichkeit haben.
- **Alternative:** Score in SQL rechnen (eine Implementierung). Dann wäre die Gewichtung eine
  SQL-Zeichenkette ohne Test.
- **Preis:** Zwei Implementierungen derselben Metrik, die auseinanderlaufen können.

### 3.4 Gewichtung 0.35 / 0.15 / 0.30 / 0.15 / 0.05 und Schwellen 0.85 / 0.60
- **Korrektur 15.09.2026:** Dieses Dokument nannte den Vornamen mit 0.30 – im Code steht
  0.15 (Nachname 0.35, Vorname 0.15, Geburtsdatum 0.30, Adresse 0.15, Phonetik 0.05). Es gilt
  der Code.
- **Begründung:** Nachname und Geburtsdatum tragen zusammen 65 % — das sind die beiden Merkmale,
  die im Bestand am stabilsten erfasst sein *sollten*. Vorname ist schwächer gewichtet (Rufnamen,
  Abkürzungen, Zweitnamen), Adresse ebenfalls (Umzüge), die Phonetik nur 0.05 als Bonus, weil sie
  bereits in der Kandidatenauswahl gewirkt hat. Ein exakt gleiches Geburtsdatum allein (0.30)
  löst nie eine Warnung aus; Nachname + Geburtsdatum zusammen erreichen HIGH.
- **Renormalisierung (seit 15.09.2026, Sprint 5):** Ein Merkmal, das auf einer der beiden Seiten
  fehlt, kann weder für noch gegen eine Dublette sprechen und fällt aus dem Nenner. Anlass war
  der Befund unter 12.1: Der migrierte Bestand hat praktisch kein Geburtsdatum und kaum Adressen;
  ohne Renormalisierung lag ein identischer Name bei 0.55 – unter MID, also **keine Warnung**.
  Jetzt: identischer Name ohne weitere Merkmale = 1.0 (HIGH), ähnlicher Name = MID. Sind beide
  Seiten vollständig, ist das Ergebnis exakt wie vorher (Nenner 1.0).
- **PLZ-Faktor:** Adressähnlichkeit wird bei abweichender PLZ halbiert — „Bahnhofstraße 12" gibt
  es in jeder Gemeinde.
- **Ehrlich:** Die Zahlen sind fachlich begründet, aber **nicht empirisch gegen den Echtbestand
  kalibriert** (siehe 12.1).

### 3.5 Zwei Bänder statt Ja/Nein — HIGH blockiert, MID warnt nur
- **Begründung:** Fachliche Vorgabe (`decisions.md` #2, #39): Das System soll **warnen**,
  nicht verhindern. Eine automatische Zusammenführung würde bei Namensvettern echte
  Berechtigte ausschließen — in einem Lebensmittelhilfe-Kontext der teurere Fehler.
- **Konsequenz im Code:** Jede Übersteuerung landet mit Score, Band, angezeigten Kandidaten und
  Begründungstext in `duplicate_decisions`. Die Übersteuerung wird damit selbst zum auswertbaren
  Datum (Dubletten-Statistik in den Auswertungen).

### 3.6 Kandidaten-Vorauswahl per `OR` über drei Wege, Limit 50 → Top 8
- **Begründung:** Trigramm-Treffer *oder* gleicher Phonetik-Schlüssel *oder* exakt gleiches
  Geburtsdatum. Jeder Weg fängt Fälle, die die anderen verlieren (Tippfehler / Schreibvariante /
  völlig andere Schreibweise bei gleichem Geburtsdatum). `LIMIT 50` deckelt die Kosten bei
  häufigen Namen, `slice(0, 8)` hält das Live-Panel während der Eingabe lesbar.
- **Preis:** Bei sehr häufigen Namen kann der richtige Treffer theoretisch außerhalb der ersten
  50 liegen. Für den Batch-Report ist das irrelevant (eigener Self-Join), für die Live-Prüfung
  bei dieser Bestandsgröße vertretbar.

---

## 4. Karten & EAN-13

### 4.1 EAN-13 mit Präfix 2 (`packages/core/src/ean.ts`)
- **Begründung:** Ziffer 2 ist im GS1-Standard für innerbetrieblichen Eigengebrauch reserviert.
  Damit kollidiert eine TDD-Karte nie mit Handelsware — entscheidend, weil die Karten in den
  Läden künftig über die Ländle-Kassa laufen sollen. Aufbau `2 | Standort(3) | laufend(8) | Prüfziffer`
  macht die Karte am Barcode dem Standort zuordenbar.
- **Alternative:** Code128/QR (mehr Nutzdaten). Verworfen, weil Ladenkassen EAN-13 verstehen und
  QR am Handscanner nicht durchgängig funktioniert.
- **Preis:** 8 Stellen laufende Nummer pro Standort — ausreichend, aber fix.

### 4.2 Prüfziffer im Code statt Vertrauen in den Scanner
- **Begründung:** Ein Handscanner liefert Ziffern, keine Garantie. `isValidEan13` erlaubt es,
  Tippfehler bei manueller Eingabe sofort zu erkennen, statt sie als „Karte unbekannt" zu zeigen.

### 4.3 Alt-Karten (`legacy`) werden beim ersten Scan automatisch ersetzt
  (`apps/web/src/app/kiosk/actions.ts`)
- **Begründung:** Der Bestand aus dem Altsystem hat 6-stellige Familien-IDs. Eine
  Stichtags-Umstellung hätte bedeutet, alle Karten auf einmal neu zu drucken und auszugeben.
  Stattdessen migriert das System **beim Erstkontakt**: Alt-Code wird erkannt (auch ohne führende
  Nullen), eine EAN-Karte am Standort erzeugt, die Alt-Karte auf `ERSETZT` gesetzt, `reissued: true`
  signalisiert dem Tresen „bitte drucken". Die Migration verteilt sich damit auf den normalen Betrieb.
- **Preis:** Eine schreibende Operation im Lesepfad des Scans — fachlich gerechtfertigt, aber
  ungewöhnlich, deshalb hier explizit dokumentiert.

### 4.4 Verlängern erzeugt eine **neue** Karte mit `predecessor_card_id`
- **Begründung:** Nachvollziehbarkeit. Eine Ausgabe von 2026 muss auch später noch auf die
  damals gültige Karte zeigen; ein `UPDATE` des Gültigkeitsdatums würde diese Historie zerstören.

### 4.5 Automatik-Papierkorb nach 6 Monaten Inaktivität, aber nie hartes Löschen
- **Begründung:** Siehe 2.5. Der Job räumt nur auf, die endgültige Entscheidung bleibt beim Menschen.

---

## 5. Sicherheit, Rollen und DSGVO

### 5.1 Zwei Datenbankrollen: `tdd_app` und `tdd_ops` (`002_roles.sql`)
- **Begründung:** Der Betreiber (Schär Systems) braucht Wartungszugriff, darf aber keine
  Personendaten sehen. Diese Zusage ist nur belastbar, wenn sie **in der Datenbank** erzwungen
  wird und nicht in der UI: `tdd_ops` hat kein `SELECT` auf `persons`, `cards`, `distributions`,
  `scan_documents`, `antraege`; Kennzahlen kommen ausschließlich aus PII-freien Aggregat-Views.
  Der Nachweis wurde live geführt (`permission denied for table persons`, `decisions.md`).
- **Alternative:** Ein DB-Benutzer + Filter in der Anwendung. Dann hinge die Zusage an jeder
  einzelnen Query — nicht auditierbar.
- **Preis:** Zwei Verbindungsstrings, zwei Passwörter, Grants müssen bei jeder neuen Tabelle
  mitgedacht werden (`REVOKE` ist explizit als „Sicherheitsnetz" gesetzt).

### 5.2 Row-Level-Security für Mandanten statt `WHERE organization_id = …` (`004_platform.sql`)
- **Begründung:** 96 Gemeinden und mehrere Sozialinstitutionen arbeiten in derselben Tabelle.
  Ein vergessenes `WHERE` wäre ein meldepflichtiger Datenschutzvorfall. Mit RLS + transaktionslokalem
  `app.org_id` (`lib/org.ts`) ist die Trennung auch dann intakt, wenn Anwendungscode fehlerhaft ist.
- **Umsetzung:** `withOrg()` kapselt jede Portal-Query in eine Transaktion mit
  `set_config('app.org_id', …, true)` — das `true` macht die Einstellung transaktionslokal, sodass
  sie sich über den Connection-Pool nicht in andere Requests verschleppt. Das ist der kritische
  Parameter dieser gesamten Konstruktion.
- **Preis:** Wer `withOrg` vergisst, sieht **nichts** (nicht: alles) — der Fehler fällt sofort auf
  und ist damit in die sichere Richtung gebaut.

### 5.3 Cross-Mandanten-Dublettenhinweis als `SECURITY DEFINER`-Funktion
- **Begründung:** Zielkonflikt: Die Dublettenprüfung muss über Mandantengrenzen hinweg wirken,
  aber eine Gemeinde darf die Klienten einer anderen nicht sehen. Die Funktion umgeht RLS
  kontrolliert und gibt **nur ein Label** zurück (`'TDD'`, `'GEMEINDE'`, `'INSTITUTION'`) — kein
  Name, kein Datum, keine ID. Genau das minimal Nötige, um „existiert bereits" zu sagen.
- **Absicherung:** `SET search_path = public` verhindert Search-Path-Angriffe auf die
  Definer-Funktion — bei `SECURITY DEFINER` der klassische Fehler.

### 5.4 RBAC als eine Matrix (`lib/rbac.ts`)
- **Begründung:** Die zentrale Zusage „die Kasse sieht keine Personenlisten" ist an *einer*
  Stelle nachlesbar und damit gegenüber dem Verein und der Datenschutzbeauftragten prüfbar.
  Fein granulierte Rechte pro Objekt wären bei fünf Rollen und einem Verein nicht wartbar.
- **Preis:** Keine benutzerindividuellen Rechte. Bewusst — Rollen sind hier organisatorisch klar.

### 5.5 Foto und Dokument haben *verschiedene* Rechte (`/foto/[personId]` vs. `/dokument/[id]`)
- **Begründung:** Das ist keine Inkonsistenz, sondern die Fachlage: Am Tresen muss das
  Erkennungsfoto sichtbar sein (Sichtkontrolle bei der Ausgabe), Ausweisscans und Antragsdokumente
  dagegen niemals. Deshalb hängt das Foto an `distribution:record` **oder** `person:read`, das
  Dokument strikt an `document:view` (nur Admin/Sachbearbeiter). Beide Routen prüfen zusätzlich
  auf `..` im Dateipfad (Path-Traversal) und laden über `STORAGE_DIR`, nie über Nutzereingaben.

### 5.6 Eigenes signiertes Session-Cookie statt Auth-Bibliothek (`lib/session.ts`)
- **Begründung:** Gebraucht werden genau drei Dinge: Benutzer-ID, Rolle, Organisation, mit
  Ablauf. HMAC-SHA256 über `node:crypto`, Vergleich mit `timingSafeEqual`, `httpOnly` + `secure`
  + `sameSite=lax`, 8 Stunden Laufzeit (eine Dienstschicht). NextAuth/Auth.js hätte
  OAuth-Provider, Adapter und Datenbanktabellen mitgebracht, die dieses System nicht benutzt —
  und mehr Angriffsfläche, die man verstehen müsste.
- **Wichtig:** Das Cookie ist nur ein *Ausweis*. Rolle, Standort und Aktivstatus werden bei
  **jedem** Request frisch aus der DB gelesen (`getCurrentUser` → `loadUser`, prüft `isActive`).
  Ein deaktivierter Benutzer ist damit sofort ausgesperrt, obwohl das Cookie noch gültig wäre.
  Das ist der Grund, warum die zustandslose Session hier vertretbar ist.
- **Preis:** Kein serverseitiger Widerruf einzelner Sessions (siehe 12.3).

### 5.7 argon2id (`@node-rs/argon2`)
- **Begründung:** Aktueller Standardempfehlung entsprechend (speicherhart, GPU-resistent);
  die Rust-Bindings sind deutlich schneller als reine JS-Implementierungen, was bei einem
  Login-Pfad auf einem kleinen VPS zählt. bcrypt wäre die schwächere, ältere Wahl.

### 5.8 Middleware nur als Vorfilter, echte Prüfung im Server-Code (`middleware.ts`)
- **Begründung:** Die Middleware läuft in der Edge-Runtime — dort ist `node:crypto` mit HMAC nicht
  verfügbar und ein DB-Zugriff ohnehin nicht. Sie prüft deshalb nur die *Anwesenheit* des Cookies
  und spart den Renderdurchlauf; die kryptografische Prüfung und die Rechteprüfung passieren in
  Layout und Server Action. Der Kommentar im Code sagt das ausdrücklich — wichtig, damit niemand
  die Middleware später für eine Sicherheitsgrenze hält.
- **Konsequenz:** Ein gefälschtes Cookie kommt durch die Middleware und scheitert danach. Korrekt,
  aber nur, solange jede geschützte Seite ihre Prüfung wirklich selbst macht (siehe 12.2).

### 5.9 Reset-/Bestätigungs-Token: Klartext nur in der E-Mail, DB speichert SHA-256
- **Begründung:** Ein Datenbankleck darf keine gültigen Passwort-Reset-Links enthalten. Zusätzlich
  Einmalverwendung (`used_at`) und Ablaufzeit. SHA-256 genügt hier (im Gegensatz zu Passwörtern),
  weil das Token 32 Byte Zufall ist und nicht erraten werden kann.

### 5.10 On-Premise-OCR mit tesseract.js (`lib/ocr.ts`)
- **Begründung:** Die Alternative wäre eine Cloud-OCR-API — dann verließen Ausweisscans von
  Hilfesuchenden das Haus und es bräuchte einen Auftragsverarbeitungsvertrag mit einem Dritten.
  Lokale WASM-OCR ist ungenauer, aber datenschutzrechtlich sauber; und weil OCR ohnehin nur
  **vorbefüllt** und ein Mensch bestätigt, ist die geringere Genauigkeit fachlich verkraftbar.
- **Preis:** Deutlich langsamer, und die WASM-Dateien mussten im Dockerfile explizit nachkopiert
  werden, weil Nexts Standalone-Tracing sie nicht findet (dokumentiert im Dockerfile).

### 5.11 Append-only Audit-Log
- **Begründung:** Jede fachlich relevante Änderung (Karte ausstellen/sperren/ersetzen, Ausgabe,
  Merge, Job-Läufe) schreibt `before`/`after`. Das ist die Grundlage, um im Streitfall zu
  rekonstruieren, wer was getan hat — bei Leistungen an Hilfesuchende eine reale Anforderung.

---

## 6. Tresen-Kiosk

### 6.1 Eigene Shell außerhalb `(app)`
- **Begründung:** Am Tresen arbeiten Zivildiener unter Zeitdruck an einem Tablet. Sie sollen
  keine Navigation in die Personenverwaltung sehen — weder aus Bedien- noch aus Datenschutzgründen.
  Die Trennung ist deshalb eine eigene Route-Gruppe mit eigenem Layout, nicht ein ausgeblendetes Menü.
  Passend dazu landet die Rolle `AUSGABE` nach dem Login direkt auf `/kiosk` (`landingFor`).

### 6.2 Idempotenz über `client_ref` statt Sperren
```ts
.onConflictDoNothing({ target: distributions.clientRef })
```
- **Begründung:** Der Offline-Puffer kann dieselbe Ausgabe mehrfach senden (Reconnect,
  Doppelklick, Reload). Ein vom Client erzeugter Referenzschlüssel mit Unique-Constraint macht
  den Insert wiederholbar, ohne verteilte Sperren oder Transaktionsketten. Ausgaben sind
  append-only — deshalb genügt das (so schon in Planungsrunde 2 festgelegt).

### 6.3 Beträge werden **serverseitig** neu berechnet
- **Begründung:** Der Client schickt „Geld vergessen" / „Schulden beglichen" als *Absicht*, nicht
  als Betrag. Preis je Erwachsene/Kind kommt aus dem Standort, der Schuldensaldo aus der Summe
  der bisherigen Ausgaben. Ein manipulierter oder veralteter Client kann so keine falschen
  Beträge buchen. Der Kommentar im Code hält das fest.

### 6.4 Schulden als Saldo, nicht als Feld
- **Begründung:** `debt = max(0, Σ fällig − Σ bezahlt)`. Es gibt keinen Zustand, der „falsch
  stehen" kann; jede Korrektur ist eine Buchung. Ein `persons.debt`-Feld hätte irgendwann von
  den Bewegungsdaten abgewichen.
- **Preis:** Aggregation bei jedem Scan. Bei diesen Datenmengen unkritisch.

### 6.5 Tagesabgrenzung explizit in `Europe/Vienna`
```sql
(distributed_at AT TIME ZONE 'Europe/Vienna')::date = (now() AT TIME ZONE 'Europe/Vienna')::date
```
- **Begründung:** Zeitstempel liegen als `timestamptz` in UTC. „Heute" ist am Tresen aber der
  Wiener Kalendertag — ohne die explizite Umrechnung würde die Doppelausgabe-Warnung im Sommer
  zwei Stunden zu früh umspringen. Dasselbe Prinzip in `lib/zeit.ts` (`viennaLocalToUtc`,
  `viennaDayRange`), dort DST-sicher über `Intl.DateTimeFormat` statt fixem Offset.

### 6.6 Zwei Service Worker (`sw.js` und `kiosk-sw.js`)
- **Begründung:** Unterschiedliche Ziele. Das Backoffice soll nur *installierbar* sein — es
  cached bewusst **nichts**, weil veraltete Personendaten schlimmer wären als ein Ladefehler.
  Der Kiosk braucht dagegen eine cachende App-Shell, damit der Scan-Bildschirm bei kurzem
  Netzausfall überhaupt lädt. POST-Requests (Server Actions) werden nie gecached.

### 6.7 Gruppen-/Nummernvergabe „am wenigsten volle Gruppe" (`lib/ausgabe.ts`)
- **Begründung:** Die Gruppe steuert, wann jemand am Ausgabetag drankommt. Gleichmäßige Auslastung
  ist die faire Vorbelegung; sie wird nur einmal vergeben (`ensureAusgabePlacement` schreibt nur,
  wenn leer) und bleibt danach stabil, damit Leute nicht jede Woche zu einer anderen Zeit kommen müssen.

---

## 7. Antragsportal & Anspruchsprüfung

### 7.1 Rechnen ja, entscheiden nein (`lib/eligibility.ts`)
- **Begründung:** Die Einkommensgrenzen (870 € Haushaltsvorstand, +415 € je weitere volljährige
  Person, +195 € je Kind, 10 % Härtefall-Toleranz) stammen aus der TDD-Richtlinie und sind im
  Code als Konstanten mit Herkunftsangabe hinterlegt. Das System liefert einen **Vorschlag**
  (`BERECHTIGT` / `HAERTEFALL` / `NICHT_BERECHTIGT`); die Entscheidung trifft ein Mensch und wird
  mit `decided_by`, `decided_at` und Begründung gespeichert. Eine Automatik wäre bei Existenz-
  hilfe weder rechtlich noch ethisch vertretbar.
- **Preis:** Ändern sich die Grenzen, ist ein Deploy nötig (sie stehen nicht in den Stammdaten).
  Für jährlich angepasste Richtwerte akzeptabel — es ist bewusst kein konfigurierbarer Automat.

### 7.2 Einkommens-/Ausgabenpositionen als benannte Konstantenlisten
- **Begründung:** Die Listen bilden 1:1 das Papierformular ab. Wer den Antrag am Bildschirm
  ausfüllt, füllt dieselben Felder in derselben Reihenfolge aus — das reduziert Übertragungsfehler
  und macht den Bescheid nachvollziehbar.

### 7.3 Kein Finanzdatentransfer an TDD
- **Begründung:** TDD braucht die Information „berechtigt", nicht das Haushaltseinkommen.
  Übergeben werden Person und (nur für Admins) Dokumente — Datenminimierung als Architekturregel,
  nicht als UI-Einstellung.

---

## 8. Betrieb & Deployment

### 8.1 Isolierter Docker-Stack auf einem gemeinsam genutzten Server
- **Begründung:** Auf dem Hetzner-Host laufen weitere Projekte. Eigenes Netz (`tdd-net`), eigene
  PostgreSQL-Instanz, eigene Volumes, eigene Domain. Eine gemeinsam genutzte DB hätte die
  DSGVO-Trennung (5.1) unterlaufen.
- **Detail:** Der Postgres-Container veröffentlicht **keinen** Port — er ist nur im internen Netz
  erreichbar (im Compose-File ausdrücklich kommentiert). Die Datenbank ist damit auch bei
  fehlerhafter Firewall nicht von außen erreichbar.

### 8.2 Caddy statt nginx
- **Begründung:** Automatisches Let's-Encrypt inklusive Erneuerung, vier Zeilen Konfiguration.
  Bei einem Ein-Personen-Betrieb ist „Zertifikat läuft ab" ein realer Ausfallgrund; Caddy nimmt
  diese Klasse von Vorfällen komplett heraus.

### 8.3 `output: "standalone"` + Multi-Stage-Dockerfile
- **Begründung:** Das Runtime-Image enthält nur den tatsächlich benötigten Code, nicht die
  Build-Toolchain. Die Manifeste werden vor dem Quellcode kopiert, damit `npm ci` in einer eigenen
  Layer landet und ein Code-Deploy die Abhängigkeiten nicht neu installiert.

### 8.4 `serverExternalPackages` für native/schwere Module
- **Begründung:** `@node-rs/argon2` (natives Binary), `postgres`, `bwip-js`, `tesseract.js`,
  `exceljs`, `mammoth`, `nodemailer` dürfen nicht gebundlet werden — sie laden Binärdateien oder
  WASM zur Laufzeit. Das ist keine Vorsichtsmaßnahme, sondern die Bedingung dafür, dass der
  Standalone-Build startet.

### 8.5 Build-Zeit als Versionsnummer + Update-Banner
- **Begründung:** Der Tresen läuft auf Tablets, die tagelang offen bleiben. Ohne Hinweis arbeitet
  jemand nach einem Deploy auf einer alten Client-Version weiter. `NEXT_PUBLIC_APP_VERSION` wird
  zur Build-Zeit eingebacken, `/api/version` liefert den Serverstand.
- **Lehrreiches Detail:** Der `UpdateChecker` vergleicht bewusst **nicht** gegen die eingebackene
  Client-Konstante, sondern gegen die *erste* Antwort dieser Sitzung — sonst blieb das Banner
  nach einem Deploy dauerhaft hängen (der Bug ist real aufgetreten, siehe Commit „Fix:
  Update-Banner bleibt nicht mehr haengen"). Beim Neuladen werden Service Worker und Caches
  verworfen, damit tatsächlich die neue Version kommt.

### 8.6 Jobs als tokengeschützte HTTP-Routen, nicht als Scheduler im Prozess
- **Begründung:** Ein In-Process-Scheduler läuft in jeder Instanz und beim lokalen Entwickeln mit.
  Eine HTTP-Route ist von Cron aus aufrufbar, manuell testbar und im Audit-Log sichtbar
  (`job.card.expiry`, `job.card.trash`).
- **Preis:** Das Token steht in der URL (siehe 12.5).

---

## 9. Frontend

### 9.1 Eigenes CSS-Design-System in `globals.css` statt Komponentenbibliothek
- **Begründung:** Geplant war shadcn/ui (`decisions.md` #31); gebaut wurde gegen die abgenommenen
  Mockups, weil der erste Scaffold *nicht* wie das abgenommene Mockup aussah (dokumentierte Rüge,
  Schritt 2). Design-Tokens plus wenige Klassen (`card`, `panel`, `pill`, `btn`) bilden das
  Mockup exakt ab, inklusive Dark-Mode über Custom Properties — ohne dass eine Bibliothek den
  Look vorgibt. Das ist eine bewusste Abweichung von der Planung, mit Grund.
- **Preis:** Keine fertigen Komponenten mit Barrierefreiheit ab Werk.

### 9.2 Druckseiten außerhalb der App-Shell (`/druck/karte/[id]`)
- **Begründung:** Eine PVC-Karte im CR80-Format bei 300 dpi verträgt keine Sidebar und keine
  Print-Stylesheets, die gegen die App-Shell ankämpfen. Eigene Route, eigenes Layout, exakte
  Millimeterangaben.

### 9.3 Barcode serverseitig als PNG-Data-URL (`bwip-js/node`)
- **Begründung:** Der Barcode muss beim Druck exakt und ohne JavaScript-Laufzeit stimmen; ein
  clientseitig gerenderter Barcode kann beim Drucken skaliert oder gar nicht gezeichnet werden.

### 9.4 Live-Dublettenprüfung debounced während der Eingabe
- **Begründung:** Der Hinweis muss kommen, *bevor* jemand das Formular fertig ausfüllt — sonst
  wird die Warnung als Hindernis erlebt und weggeklickt. Debounce hält die Abfragelast klein.

---

## 10. Recht & Zeit als eigene, testbare Module

`lib/zeit.ts` (AZG) und `lib/urlaub.ts` (UrlG) sind bewusst **reine Funktionen ohne DB- oder
Framework-Bezug**, mit Paragraphenverweisen im Code (§ 9, § 11 AZG; § 2 Abs 2 UrlG).
- **Begründung:** Gesetzliche Berechnungen müssen gegen Beispiele prüfbar sein und sich ändern
  können, ohne dass eine Datenbank läuft. Deshalb liegen sie in Modulen mit Unit-Tests
  (`apps/web/test/zeit.test.ts`, `urlaub.test.ts`), nicht in Server Actions.
- **Bewusst zurückhaltend:** Die AZG-Prüfungen sind als **Hinweise** formuliert, nicht als Sperren —
  das System soll auf Verstöße aufmerksam machen, nicht Arbeitszeit verhindern.

---

## 11. Bewusst *nicht* getroffene Entscheidungen

| Verzichtet auf | Warum |
|---|---|
| Microservices | Ein Verein, ein Server, ein Entwickler. Verteilte Systeme kosten Betrieb, den niemand leistet. |
| GraphQL/tRPC | Server Actions decken den Bedarf ohne zweite Schicht ab. |
| Redis/Queue | Siehe 1.4 — der Anwendungsfall existiert nicht. |
| Cloud-OCR, Cloud-Storage | PII soll das Haus nicht verlassen (5.10, 8.1). |
| ORM-Migrationsgenerator | Sicherheitsobjekte lassen sich nicht generieren (2.2). |
| Automatisches Zusammenführen von Dubletten | Falsch-positiv schließt Hilfesuchende aus (3.5). |
| E2E-Tests | Unit-Tests auf der Domänenlogik + Live-Verifikation nach jedem Schritt. Bewusster Kompromiss, keine Ideallösung (12.7). |

---

## 12. Wo die Begründung dünn ist

Die ehrliche Kehrseite: Nicht jede Stelle im Code ist so begründbar wie die oben. Diese
Punkte sind bekannt, priorisiert und nicht schöngeredet.

1. **Dubletten-Gewichte sind nicht empirisch kalibriert — und beim Ist-Bestand kann die
   HIGH-Schwelle gar nicht erreicht werden.** Befund vom 15.09.2026 (S4-1): Von 5.487
   Personen hat **eine** ein Geburtsdatum, 133 haben eine Adresse, keine eine PLZ. Die
   Altsoftware kannte kein Geburtsdatum. Damit fallen 0,45 der Gewichtung weg; das Maximum
   liegt bei 0,70 = MID. Die Prüfung kann beim migrierten Bestand nur warnen, nie blockieren.
   162 normalisierte Namen kommen mehrfach vor. Werkzeug und Kandidatenliste liegen bereit
   (`scripts/dedupe-eval.ts`, `scripts/dedupe-pairs.sh`, Datei auf dem Server, nur root),
   markiert ist noch nichts. **Vorher zu entscheiden:** Renormalisierung der Gewichte, wenn
   Geburtsdatum/Adresse auf beiden Seiten fehlen (dann erreicht ein identischer Name HIGH),
   und Nacherfassung des Geburtsdatums beim ersten Kontakt am Tresen. Sonst ist jede
   Kalibrierung eine Kalibrierung auf einem Datenbestand, den es so nicht mehr geben sollte.
2. **Der Middleware-Matcher deckt nicht alle Bereiche ab** (`apps/web/src/middleware.ts:21`):
   `/kiosk`, `/zeit`, `/personal`, `/stempeln` fehlen. Sicherheitsrelevant ist das nicht — diese
   Routen prüfen serverseitig selbst —, aber die Liste sieht aus, als sollte sie vollständig sein,
   und wird beim nächsten neuen Bereich wieder vergessen. Besser: alles matchen und Ausnahmen
   listen.
3. **Keine Sperre nach Fehlversuchen.** `users.failed_attempts` existiert und wird bei Erfolg auf
   0 gesetzt (`lib/auth.ts:70`), aber nie hochgezählt — es gibt weder Zähler noch Rate-Limit noch
   Lockout. Ebenso ist `totp_secret` im Schema vorhanden, 2FA (`decisions.md` #21) aber nicht
   implementiert. Beides sind offene Punkte, keine bewussten Entscheidungen.
4. **`nextCardNumber` ist naiv** (`apps/web/src/lib/cards.ts:7`): `count(*)` als Startwert und
   danach bis zu 100 Einzelabfragen; bei gleichzeitiger Ausstellung an zwei Tresen entscheidet
   der Unique-Constraint, ein Retry gibt es nicht. Robuster wäre eine Sequenz je Standort.
5. **Job-Token in der Query-String** (`api/jobs/*/route.ts`): Tokens in URLs landen in Logs.
   Ein Header wäre sauberer.
6. **`deleted_at IS NULL` ist Disziplinsache.** Es gibt keine View und keine RLS-Policy, die das
   erzwingt — jede neue Query muss daran denken (2.5).
7. **Keine automatisierten Tests auf den Schreibpfaden.** Getestet sind die reinen Funktionen
   (Dubletten, EAN, Phonetik, Anspruch, Zeit, Urlaub, Öffnungszeiten); Server Actions,
   RLS-Policies und die Rechtematrix werden nur manuell verifiziert. Ein Integrationstest gegen
   eine Wegwerf-Postgres-Instanz wäre der größte Qualitätsgewinn pro Aufwand.
8. **`searchByName` macht N+1-Abfragen** (`apps/web/src/app/kiosk/actions.ts:176`): pro Treffer
   eine Kartenabfrage. Bei `LIMIT 10` unkritisch, aber es ist ein Muster, das man nicht wachsen
   lassen sollte.
9. **`addMonths` rollt über** (`lib/cards.ts:19`): 31.08. + 6 Monate ergibt den 03.03. Fachlich
   bei Kartengültigkeiten unerheblich, formal falsch.
10. **`xlsx` (SheetJS) aus der npm-Registry** für den Import: Die Registry-Version wird vom
    Projekt nicht mehr gepflegt und hat bekannte Advisories. Der Import ist zwar auf Admins
    beschränkt, trotzdem gehört das auf die Wartungsliste.
11. **`audit.ip` wird nie befüllt** — das Feld ist vorgesehen, aber kein Aufrufer übergibt die
    Client-IP.
12. **`zod` ist als Abhängigkeit deklariert, aber nirgends verwendet.** Formularvalidierung
    passiert mit handgeschriebenen Helfern (`s()`, `n()`, `i()` in den Actions). Entweder das
    Paket entfernen oder — besser — die Eingabevalidierung damit vereinheitlichen.
13. ~~**Die pg_trgm-Ähnlichkeitsschwelle wird nicht gesetzt.**~~ Erledigt 15.09.2026 (Sprint 5):
    `TRGM_THRESHOLD` steht in `@tdd/core`, die Kandidatensuche setzt sie per `SET LOCAL` in
    ihrer Transaktion – explizit, reproduzierbar, und der GIN-Index bleibt nutzbar (ein
    `similarity() >= …` wäre nicht indexgestützt gewesen).

---

*Stand: siehe Git-Historie dieser Datei. Zu jedem Punkt gehört der Code als Beleg — wo Code und
dieses Dokument auseinandergehen, gilt der Code, und dieses Dokument ist zu korrigieren.*
