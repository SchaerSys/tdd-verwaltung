# Entscheidungen – TDD-Verwaltung (Interview-Protokoll)

Laufendes Protokoll der gemeinsam getroffenen Planungsentscheidungen. Ergänzt `docs/PLAN.md`.

## Runde 1 (2026-08-17)

| # | Frage | Entscheidung | Konsequenz / offen |
|---|---|---|---|
| 1 | Offline am Tresen bei Internet-Ausfall? | **Offline-fähig (PWA)** | Offline-first + Sync + Konfliktlösung nötig. **Konflikt mit Dublettenziel** → in Runde 2 Scope klären. |
| 2 | Durchsetzung „nur ein Ort"? | **Nur warnen** (mit Standortangabe, protokolliert) | Weiche Regel. Kombiniert mit Offline erhöht das das Dublettenrisiko → Runde 2. |
| 3 | Bestandsgröße gesamt? | **2.000 – 5.000 Personen** | Trigramm-Indizes + Dubletten-Kalibrierung wichtig; Batch-Dublettenlauf einplanen. |
| 4 | Altdaten-Import? | **Import-Funktion Pflicht**; Daten werden noch bereitgestellt | Generischer Importer (Format TBD) + Erst-Dublettenlauf. |

## Runde 2 (2026-08-17)

| # | Frage | Entscheidung | Konsequenz |
|---|---|---|---|
| 5 | Was muss offline gehen? | **Nur Ausgabe/Scan** offline; Neuaufnahme strikt online | Dublettenprüfung läuft immer online gegen zentrale DB. |
| 6 | Ausfall-Realität? | **Praktisch nie** | Kein schwergewichtiger Offline-Sync nötig → dünnes Sicherheitsnetz genügt. |
| 7 | Tresen-Geräte? | **Android-Tablet + Windows-Laptop/PC** (kein iOS) | Windows → USB-Handscanner; Android → Kamera-Scan. PWA-Offline auf beiden gut möglich. |

### Aufgelöste Spannung → Offline-Design (festgelegt)
- **Dünnes Offline-Sicherheitsnetz nur am Tresen:** PWA cached lokal die *aktiven Karten des jeweiligen
  Standorts* (Berechtigung offline prüfbar) und **puffert Ausgabe-Ereignisse** in einer Queue → Sync beim
  Reconnect. Ausgaben sind append-only → keine Konfliktauflösung nötig.
- **Neuaufnahme + Dublettenprüfung: immer online.** Kein Offline-Anlegen von Personen.
- Kein Redis/kein CRDT/kein komplexer Sync-Motor. Bewusst schlank, weil Ausfälle „praktisch nie".

## Runde 3 (2026-08-17)

| # | Frage | Entscheidung | Konsequenz |
|---|---|---|---|
| 8 | Karten-Code-Format | **Ausgabestellen: EAN-13** (App scannt selbst, keine Kassa). **Läden:** hängt an Ländle-Kassa **oder** Nummernkreis-Vergabe | Code-Schema muss Standort-Typ unterscheiden; Nummernkreis-Design offen (Runde 4). |
| 9 | Karten-Produktion | **Etiketten/Aufkleber** | App erzeugt Barcode-Etikett (Name/Foto ggf. separat); Etikettendruck-Layout. |
| 10 | Standard-Gültigkeit | **6 Monate** (frei überschreibbar pro Karte) | Default = Start + 6 Monate; halbjährliche Verlängerung erwartbar. |
| 11 | Ausgabe erfasst | **Nur Ereignis** (Datum/Zeit, Standort, Person/Karte, Erfasser) | Schlanke Ausgabe-Erfassung; keine Menge/Warenkorb in Phase 1. |

## Runde 4 (2026-08-17)

| # | Frage | Entscheidung | Konsequenz |
|---|---|---|---|
| 12 | Nummernvergabe | **Neu designen: EAN-13 mit Präfix 2** (GS1-Eigengebrauch) + Standort-Kennung + laufende Nr. + Prüfziffer | Kollidiert nie mit Handelsware; POS-verträglich. Schema-Detail in PLAN §Karten. |
| 13 | Karten-Ausstellung | **Für beide Bezugsort-Typen zentral** (Läden + Ausgabestellen) | Lückenlose Übersicht gegen Doppelaufnahmen; Läden scannen später via Ländle-Kassa. |
| 14 | Erinnerung ablaufende Karten | **In-App-Liste + Dashboard** UND **E-Mail an Mitarbeiter** | Braucht **SMTP-/Mailversand-Konfiguration** + geplanten Job (z.B. wöchentlich). |

## Runde 5 (2026-08-17)

| # | Frage | Entscheidung | Konsequenz |
|---|---|---|---|
| 15 | Rollenmodell | **4 Rollen:** ADMIN / ERFASSUNG / AUSGABE-Kasse / AUSWERTUNG | Serverseitig erzwungene Sicht; Kasse ohne Personenlisten. |
| 16 | Sicht standortübergreifend | **Nur eigener Standort + Dubletten-Hinweis** (Name+Ort, keine vollen Fremddaten) | Datensparsam; Dublettenwarnung zeigt nur „existiert an Standort X". Voller Fremdzugriff nur Admin. |
| 17 | OCR-Priorität | **Wichtig, früh** | OCR rückt in der Bau-Reihenfolge nach vorne. Dokument-Typ klären (Runde 6). |
| 18 | Foto der Person | **Optional** (mit Einwilligung) | Karte funktioniert ohne Foto; Foto-Workflow nicht erzwungen. |

## Runde 6 (2026-08-17)

| # | Frage | Entscheidung | Konsequenz |
|---|---|---|---|
| 19 | OCR-Gegenstand | **Eigenes Vereinsformular** + **amtliche Ausweise** + **bestehende Papierlisten** | Priorität eigenes Formular (Template, hohe Qualität); Ausweise/Handschrift = best effort. OCR immer assistierend + menschliche Bestätigung. |
| 20 | DSGVO-Löschfristen | **Wir schlagen Standardfristen vor, Verein/DSB bestätigt** | Konkrete Default-Fristen im PLAN entwerfen (Person nach letzter Aktivität, OCR-Rohscan nach Übernahme, Audit-Aufbewahrung). |
| 21 | Login-Sicherheit | **Passwort (argon2id) + optional TOTP-2FA (Admins)** | Passwort-Reset-Flow + optionale 2FA-Einrichtung. |
| 22 | Hosting | **Auf bestehendem Hetzner-Server**, aber als **isolierter Stack** | Eigenes Docker-Netz, eigene PostgreSQL-Instanz, eigene Volumes, eigene Subdomain (Caddy), getrennte Backups. Abschottung von Annona/greencover. |

## Runde 7 (2026-08-17)

| # | Frage | Entscheidung | Konsequenz |
|---|---|---|---|
| 23 | Zeitrahmen | **Qualität vor Tempo** (kein fixer Stichtag) | Schrittweiser, sauberer Ausbau möglich. |
| 24 | MVP-Schnitt | **Personen + Dublettenprüfung zuerst** produktiv | Erster Livegang löst das Kernproblem; Karten/Ausgabe danach. |
| 25 | Haushalt | **Nur Zahlen** (Anzahl Haushalt, Anzahl Kinder) | Keine Einzel-Haushaltsmitglieder in Phase 1. |
| 26 | Sprache/Herkunft | **Konfigurierbare Auswahllisten** (Dropdown) | Auswertbar/konsistent; pflegbare Stammdatenlisten. |

## Runde 8 (2026-08-17)

| # | Frage | Entscheidung | Konsequenz |
|---|---|---|---|
| 27 | Löschfristen (Standard) | **Person: 3 J. nach letzter Aktivität · OCR-Rohscan: 90 Tage nach Übernahme · Audit: 3 J.** – vom Verein/DSB final zu bestätigen | Konfigurierbare `retention_rule` mit diesen Defaults; Löschjob. |
| 28 | Betrieb/Wartung | **Du / Schär Systems** (Betrieb, Backups, Updates) | Betriebs-Doku für dich; Nutzerverwaltung ggf. delegierbar an Verein. |
| 29 | Auswertungen | **Brief-Umfang + Aufnahme-/Dubletten-Statistik** (+ Kartenablauf-Vorschau) | Reports: Berechtigte, Ausgaben/Standort, Zeitverlauf, Neuaufnahmen, erkannte/übersteuerte Dubletten; Excel-Export. |

---

## UI-Runde 1 (2026-08-17)

| # | Frage | Entscheidung | Konsequenz |
|---|---|---|---|
| 30 | Backoffice vs. Tresen | **Zwei klar getrennte Modi** (reiches Backoffice / schlanker Kiosk-Ausgabemodus) | Getrennte Layouts/Routen; Kiosk = groß, scan-first, Ampel. |
| 31 | Designsystem | **shadcn/ui + Tailwind** | Komponenten im eigenen Code, anpassbar, barrierearm, keine Lizenzkosten. |
| 32 | Branding | **Neutral/schlicht**, funktional | Kein starkes Vereins-Branding; Fokus Bedienbarkeit. |
| 33 | Backoffice-Gerät | **Desktop/Laptop-first** (Tablet nutzbar) | Formular-/Tabellen-Layout für großen Screen optimiert. |

## Wartungsplattform (Super-Admin) – Runde (2026-08-17)

| # | Frage | Entscheidung | Konsequenz |
|---|---|---|---|
| 34 | Plattform-Umfang | **Systemstatus/Health + aggregierte Kennzahlen + Benutzer/Konfiguration + Logs/Backup/Updates** | Vollwertige Betriebs-/Wartungsplattform, aber ausschließlich Metadaten. |
| 35 | PII-Trennung | **Eigene DB-Rolle ohne PII-Leserecht** (nur aggregierte Views/Metadaten) | In der DB erzwungen, nicht nur UI. Kennzahlen via PII-freie Views (SECURITY DEFINER/Metadaten-Schema). |
| 36 | Reichweite | **Nur diese eine TDD-Installation** | Kein Mehrmandanten-Aufbau; einfachste Architektur. |
| 37 | Zugang | **Nur Betreiber (Schär Systems)** | Eigene Anmeldung, getrennte Subdomain; Verein arbeitet nur in der Fach-App. |

**Architektur-Folge:** dritte Komponente **Wartungsplattform** – eigenes Deployable/Subdomain,
verbindet sich mit DB-Rolle `tdd_ops` (kein SELECT auf `persons`/`person_notes`/`scan_document`/PII-Spalten;
Schreibrecht nur auf `users`/Konfiguration; Leserecht nur auf aggregierte/Betriebs-Views). Monorepo, geteilte Typen.

## UI-Runde 2 (2026-08-17)

| # | Frage | Entscheidung | Konsequenz |
|---|---|---|---|
| 38 | Tresen-Scan-Verhalten | **Anzeigen + 1× „Ausgabe bestätigen" bucht** | Schnell, aber bewusst; kein Auto-Buchen. |
| 39 | Dubletten-Warnung-Timing | **Live während Eingabe + harte Prüfung beim Speichern** | Live-Panel + Warn-Dialog. |
| 40 | Kiosk-Anzeige (grün) | **Name + Foto (falls vorhanden) + „gültig bis"** | Sichtkontrolle an der Ausgabe. |
| 41 | Backoffice-Navigation | **Dashboard·Personen·Karten·Ausgaben·Auswertungen·Admin** | Sechs Bereiche. |

## Meilenstein: Mockups abgenommen (2026-08-17)
Klickbare Wireframes (`docs/mockups.html`, Artifact) aller Kern-Screens von Dario **abgenommen**
(„passt perfekt so"). Damit ist die **komplette Planung Phase 1 abgeschlossen** (41 Entscheidungen).

## Änderung Kartenproduktion (2026-08-18) — ersetzt #9

| # | Frage | Entscheidung (neu) | Konsequenz |
|---|---|---|---|
| 9b | Karten-Produktion je Bezugsort | **Ausgabestellen: PVC-Plastikkarten** gedruckt mit **Zebra ZC350** (CR80-Scheckkartenformat). **Läden: Etiketten/Aufkleber.** | Zwei Druck-Ausgabewege in Schritt 6: (a) Kartenlayout CR80 @300 dpi → Zebra ZC350 (Windows-Druckertreiber bzw. Zebra Browser Print), (b) Etikett-PDF für Läden. |

## Meilenstein: Schritt 1 (Fundament) gebaut & verifiziert (2026-08-18)
Monorepo (npm-Workspaces), `@tdd/core` (Dubletten-Engine, **20/20 Tests grün**), `@tdd/db`
(Schema + SQL-Migrationen + Rollen `tdd_app`/`tdd_ops` mit PII-freien Views), `@tdd/web`
(Next.js 15: Login/argon2, Session, 4-Rollen-RBAC, Audit, Backoffice-Shell, Dashboard).
**Typecheck sauber, `next build` erfolgreich.** Deployment-Dateien (Docker/Caddy) vorhanden.

## Deployment Fundament auf Hetzner (2026-08-18)
Server `167.233.201.130` (host „Schaer-System"), Docker als `dario` (kein sudo). Dort laufen produktiv
**greencover (gc-caddy auf 80/443), werkr, annona (annona-caddy auf 8443)** — alle **unangetastet**.
TDD als **isolierter Stack**: `~/projects/tdd`, `docker-compose.server.yml`, Netz `tdd-net`,
`tdd-postgres` (Owner `tdd_owner`) + `tdd-web` (Next standalone), Web nur an **`127.0.0.1:3080`** gebunden
(keine Portkollision, keine Firewall-Änderung). Secrets in `~/projects/tdd/.env` (chmod 600).
Migrationen 001/002/003 eingespielt, Rollen-Passwörter gesetzt. **DSGVO-Barriere live bewiesen**
(`tdd_ops` → „permission denied for table persons"; Aggregat-View lesbar). Login end-to-end verifiziert.
Admin: `info@schaer-systems.at`. **Freigabe (2026-08-18): vorerst nur SSH-Tunnel** gewählt
(`ssh -L 3080:127.0.0.1:3080 dario@167.233.201.130` → http://localhost:3080). Öffentliche Domain/Port
erst beim Go-live (Optionen: gc-caddy+DNS oder eigener Caddy Alt-Port).

## Schritt 2 + UI-Angleichung + Excel-Import (2026-08-18)
**Wichtige Korrektur:** deployter Scaffold entsprach NICHT dem Mockup (berechtigte Rüge). Behoben:
Mockup-Design-System nach `globals.css` portiert (Tokens, Karten, Panels, Tabellen, Pills, Sidebar, Topbar,
Dark-Mode + Theme-Toggle); Shell-Layout (`AppSidebar`/`ThemeToggle`) + Dashboard im Mockup-Look neu gebaut.
**Schritt 2 Stammdaten:** `/admin` zeigt Standorte, Benutzer/Rollen, Auswahllisten aus der DB.
**Excel-Import:** `/admin/import` (SheetJS + `@tdd/core`): Upload → Spaltenerkennung → Vorschau + Zählung
(neu/Dublette/Fehler) → Import mit Exakt-Dubletten-Skip + optionaler Standort-Zuordnung. Redeployt & live
verifiziert (auth. UI rendert mit Mockup-Markern + Seed-Daten; Import-Parse gegen echte Beispieldatei getestet:
Müller/Mueller korrekt als 1 Dublette erkannt). Beispieldatei: `docs/beispiel-import.xlsx`.
Offen (klein): türkisches „ı" in Normalisierung noch nicht auf „i" gefaltet.

## Schritt 3: Personen-Erfassung (2026-08-18)
`/personen` (Liste, standortgebunden für Nicht-Admins, Suche), `/personen/neu` (Formular: alle Felder,
Sprache/Herkunft aus Listen, Standort-Select; Schattenfelder via @tdd/core; person_location_assignment;
Audit; **Exakt-Dubletten-Warnung** mit „Trotzdem neu anlegen" als Brücke zu Schritt 4), `/personen/[id]`
(Dossier: Stammdaten-Kopf, Tabs, Karten/Ausgaben-Panels). Redeployt & live verifiziert (auth. Rendering
von Liste/Formular/Dossier). **Excel-Import vom Nutzer live über Tunnel bestätigt:** 4 Personen aus
`beispiel-import.xlsx` angelegt, Mueller-Dublette korrekt übersprungen.

## Schritt 4: Dublettenprüfung-UI (2026-08-18)
`lib/dedupe.ts`: `findCandidates` (pg_trgm `%` + Kölner Phonetik + Geburtsdatum → `scoreCandidate` aus
@tdd/core) und `findDuplicatePairs` (Self-Join, Batch). Neuaufnahme: **Live-Panel** (debounced Fuzzy-Suche
während Eingabe, Kandidaten mit Score/Band/Standort) + **Warn-Dialog** bei HIGH beim Speichern mit Grund-Feld;
Override wird in `duplicate_decisions` protokolliert (CREATE_NEW, shown_candidates, Score/Band, Grund).
`/personen/dubletten`: Batch-Report der Bestands-Dubletten + **Merge** (`mergePersons`: Karten/Ausgaben/Scans/
Zuordnung umhängen, Quelle soft-delete, `duplicate_decisions`=MERGED, Transaktion). Nav „Dubletten" ergänzt.
**Live verifiziert:** Batch-Report findet Müller/Mueller (gleiches Geburtsdatum) als HIGH. Merge-Ausführung,
Live-Panel-Debounce und HIGH-Block der Neuaufnahme sind typecheck+build-geprüft und nutzen dieselbe verifizierte
Engine — per Tunnel interaktiv testbar.

## Schritt 6: Karten (2026-08-18)
`lib/cards.ts` (nextCardNumber = EAN-13 via @tdd/core buildCardNumber, kollisionsfrei; addMonths).
`karten/actions.ts`: issueCard (Standort aus aktiver Zuordnung, Default 6 Mon.), renewCard (neuer Code,
alte→ERSETZT, predecessor), blockCard (GESPERRT+Grund), replaceCard (Verlust: alte sperren + neue). Alle mit
Audit. `/karten`: Übersicht + Sektion „bald ablaufende Karten" (30 Tage) + Aktionen. Dossier: Karte-ausstellen-
Formular + Aktionen + Karten-Tab. **Druck** `/druck/karte/[id]` (außerhalb der App-Shell, print-CSS): PVC-Karte
CR80 (Ausgabestelle, „Zebra ZC350") bzw. Etikett (Laden) mit echtem **EAN-13-Barcode via bwip-js** (`bwip-js/node`,
`toBuffer` → PNG-DataURL). Live verifiziert (Karte gelistet, Druck rendert Barcode + Layout). **E-Mail-Erinnerung
an ablaufende Karten noch offen** (braucht Scheduler/SMTP) — In-App-Ansicht ist da.

## Schritt 7: Tresen-Kiosk (2026-08-18)
`kiosk/actions.ts`: lookupCard (EAN→Berechtigung/Gültigkeit), searchByName (ohne Karte), recordDistribution
(idempotent via client_ref, onConflictDoNothing), getActiveCards (Offline-Cache je Standort). `/kiosk`
(eigene Shell außerhalb (app), guard distribution:record): Scan-Feld (Enter/Handscanner), **Ampel grün/rot**,
Name+gültig-bis, **„Ausgabe bestätigen"**, Suche ohne Karte. **Offline-Netz:** localStorage Karten-Cache +
Ausgabe-Queue mit Sync (online-Event + 30s-Intervall), Offline-Indikator + Queue-Zähler. **PWA:**
`public/manifest.webmanifest` + minimaler `public/kiosk-sw.js` (GET-Cache). Nav-Gruppe „Tresen-Kiosk". Live
verifiziert: Kiosk rendert, prefetcht aktive Karten, Manifest+SW liefern 200, Distribution-Insert ok.

**Panne & behoben:** bei der Verifikation versehentlich eine vom Nutzer via UI ausgestellte Karte gelöscht
(2202000000013, Johann Bereuter) → exakt wiederhergestellt. Lehre in Memory (nie Live-Daten per geteiltem
Attribut löschen).

## Schritt 5: OCR (2026-08-18)
Vereinsformular analysiert (Seite 1 = Antragsformular/Haushaltsplan mit Personendaten oben; Werte
handschriftlich → OCR bleibt best-effort/assistierend). `lib/ocr.ts`: **tesseract.js (deu, on-prem/WASM)**
runOcr + extractFields (Labels: Vorname/Nachname, PLZ/Ort, Adresse, Telefon, Anzahl Erwachsene/Kinder,
Geburtsdatum aus Ausweis/ZMR). `personen/neu/ocr-actions.ts` ocrForm: Bild-Upload → Scan auf verschlüsseltem
Volume (`STORAGE_DIR/scans`) + scan_documents (Frist 90 Tage) → OCR → Vorbefüllung. PersonForm: „📷 Formular/
Ausweis scannen" (Tablet-Kamera via capture) füllt Felder vor (editierbar). Kein PII verlässt den Server (nur
Sprachmodell wird gecached). **Dockerfile-Fix:** tesseract.js + tesseract.js-core explizit in Runtime kopiert
(Standalone-Tracing lässt die WASM-Datei weg). **Live im Container verifiziert:** Confidence 94, korrekte
Extraktion; Scan-Button rendert.

## Schritt 8: Auswertungen + Excel-Export (2026-08-19)
`lib/reports.ts` (loadReports): Berechtigte je Standort (v_stats_by_location), Ausgaben je Standort (30T/gesamt),
Ausgaben+Neuaufnahmen monatlich (12 Mon.), Dubletten-Statistik (MERGED/CREATE_NEW/LINKED), Kartenablauf 30/60/90.
`/auswertungen` (report:view): Stat-Kacheln, Balken je Standort, Monats-Balken, Dubletten/Ablauf. `/auswertungen/
export` (Route, exceljs, serverExternalPackages): 5 Sheets als `.xlsx`-Download. Live verifiziert (Render + gültige
xlsx, PK-Signatur).

## Storage-Klärung
Scans + DB liegen auf **lokalen Docker-Volumes** (`tdd-uploads` `/data/uploads`, `tdd-db-data`) auf der VPS-Platte
(`/var/lib/docker/volumes/…`), **kein Object Storage**. „Verschlüsseltes Volume" + Offsite-`pg_dump`-Backup aus
dem Plan sind **noch NICHT umgesetzt** (gehört zu Schritt 11; dort Entscheidung lokal-verschlüsselt vs. Hetzner
Object Storage/S3).

## Verfeinerungen (2026-08-19)
Person **bearbeiten** (`/personen/[id]/bearbeiten` + updatePerson, inkl. Standortwechsel) und **löschen**
(deletePerson = Soft-Delete deleted_at + Zuordnung inaktiv, Audit). Karte **entsperren** (unblockCard →
GESPERRT zurück auf AKTIV). `ConfirmButton`-Client für Lösch-Bestätigung. Alle live verifiziert.

## Plattform-Ausbau gestartet (2026-08-19)
Entscheidungen: Anspruchsprüfung = rechnen (Grenzen €870/+415/+195, 10% Härtefall) + Mensch entscheidet ·
Übergabe an TDD = Person+Dokumente (Dokumente nur Admin, keine Finanzzahlen) · strikte Mandantentrennung (RLS) ·
Organisationen als Vorlage geseedet. Design: `docs/PLAN-PLATTFORM.md`.
**Fundament (additiv, live):** `004_platform.sql` (organizations 15 Stk, users.organization_id, antraege +
antrag_documents, RLS-Policies, Rolle SACHBEARBEITER, `document:view`/`antrag:manage`, Cross-Mandanten-
Dublettenfunktion). Drizzle-Schema + rbac erweitert. Bestehende App unversehrt, RLS bewiesen (tdd_app 0 Anträge
ohne Org-Kontext, tdd_ops permission denied auf antraege).
**Login-Flow neu (live):** Zugangsauswahl (TDD/Gemeinde/Institution) mit **Suchfeld** → dann Login; Session
kennt `orgId`; login prüft Org-Zugehörigkeit; Routing SACHBEARBEITER→/portal, TDD→/dashboard; `/portal`-Landing
(Platzhalter). Test-Sachbearbeiter: `sachbearbeiter@caritas.test` / `Sachbearbeiter-2026` (Caritas).

## Status
Planung abgenommen · **Schritte 1–8 + Verfeinerungen + Plattform-Fundament & neuer Login live**
(intern, 127.0.0.1:3080). Offen: Wartungsplattform (10), DSGVO-Härtung/Löschjob + Backup (11),
Phase-2-Nahtstellen (12), E-Mail-Erinnerungs-Job, UI-Feinschliff, sowie die im Formular-Abgleich
identifizierten Lücken (Handlungsvollmacht, Erwachsene/Kinder-Aufschlüsselung, Haustiere, DSGVO-Einwilligung,
Unkostenbeitrag, Einnahmen/Ausgaben-Prüfung = Phase 2).
