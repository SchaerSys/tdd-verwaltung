# Plan – Verwaltungssystem „Tischlein deck dich" (Phase 1)

> Status: **Finaler Plan zur Freigabe** · kein Code, keine Umsetzung begonnen.
> Grundlage: **komplett neue, eigenständige Web-Applikation** (unabhängig von ARCO/Annona 2.0).
> Entscheidungen: siehe `docs/decisions.md` (37 Punkte, Interview vom 2026-08-17).
> Stand: 2026-08-17

---

## 1. Ziel & Kernproblem

Der Verein „Tischlein deck dich" (Lebensmittelhilfe, Vorarlberg) gibt Lebensmittel an
anspruchsberechtigte Personen aus – an **Läden** („Min Guata Lada": Bludenz, Feldkirch, Dornbirn)
und an **Ausgabestellen** (Bludenz, Feldkirch, Götzis, Dornbirn, Hard).

**Kernregel:** Eine Person bezieht an **genau einem** Ort – Laden **ODER** Ausgabestelle, nie beides.

**Kernproblem heute:** Es fehlt die **standortübergreifende Übersicht**, wer wo bereits eine Karte hat →
Doppelaufnahmen. Lösung im Kern: **zentrale Datenbank + zuverlässige, standortübergreifende Dublettenprüfung**.

**Rahmen:** ca. 5 Nutzer, Laptop/PC **und Android-Tablet**, zentrale EU-Datenhaltung, sensible
Sozialdaten → DSGVO erstrangig. Kein fixer Termin – **Qualität vor Tempo**. Betrieb/Wartung durch
**Schär Systems (Dario)**.

---

## 2. Leitentscheidungen (aus dem Interview)

- **MVP zuerst:** Personen-Erfassung **+ Dublettenprüfung** geht zuerst produktiv.
- **Offline bewusst schlank:** Ausfälle „praktisch nie" → **kein** Offline-first-Sync-Motor.
  **Nur der Ausgabe-/Scan-Betrieb** bekommt ein **dünnes Offline-Sicherheitsnetz** (lokale Kopie der
  aktiven Karten des Standorts + Ausgaben-Queue → Sync). **Neuaufnahme strikt online.**
- **Nur-ein-Ort:** **warnend** (Warnung + Standortangabe, protokolliert), nicht hart blockiert.
- **Karten zentral für beide Bezugsort-Typen.**
- **Zwei getrennte UI-Modi:** reiches **Backoffice** (Desktop-first) und schlanker **Tresen-Kiosk** (Tablet, scan-first).
- **Dritte Komponente – Wartungsplattform** (nur Betreiber, **nur Metadaten**, DB-erzwungen ohne PII).
- **Hosting:** bestehender Hetzner-Server, aber **isolierter Stack**.

---

## 3. Systemkomponenten

1. **Fach-App (Verein)** – eine Next.js-Web-App mit zwei Modi:
   - **Backoffice** (Erfassung/Verwaltung, Desktop-first)
   - **Tresen-Kiosk** (Ausgabe/Scan, Tablet, PWA mit Offline-Puffer)
2. **Wartungsplattform (Betreiber)** – eigenes Deployable/Subdomain, **nur Metadaten**, DB-Rolle ohne PII.
3. **PostgreSQL 16** – zentrale Datenhaltung; Extensions `pg_trgm` + `fuzzystrmatch`.

Monorepo, geteilte Typen/Domänenlogik. Beide Apps laufen als getrennte Container im isolierten Docker-Stack.

---

## 4. Technologievorschlag (mit Begründung)

| Baustein | Wahl | Begründung |
|---|---|---|
| **Architektur** | Web-App (responsive) + **PWA** nur für Tresen | Zentrale Daten inhärent; Laptop/PC + Android-Tablet ohne App-Store. |
| **Framework** | **Next.js (App Router, TypeScript)** | Vertraut (Annona-Control-Plane), formularlastige UI, ein Deployable je App. |
| **Datenbank** | **PostgreSQL 16** | Zwingend für unscharfe Dubletten (`pg_trgm`, `fuzzystrmatch`), im Server, keine Fremd-Cloud. |
| **DB-Zugriff** | **Drizzle ORM** + SQL-Migrationen | TS-/SQL-nah (Dubletten-Queries roh), versionierte Migrationen. |
| **UI-Kit** | **shadcn/ui + Tailwind** | Komponenten im eigenen Code, anpassbar, barrierearm, keine Lizenzkosten. |
| **Auth** | E-Mail+Passwort (**argon2id**), Server-Sessions, **optional TOTP-2FA (Admins)** | Volle Datenhoheit, guter Standard. |
| **RBAC** | 4 Rollen, **serverseitig** erzwungen | „Kasse sieht keine Personenlisten". |
| **OCR** | **On-Premise** (Tesseract `deu`, optional PaddleOCR) | Sozialdaten nicht in Fremd-Cloud; assistierend. |
| **Barcode** | `bwip-js` (**EAN-13**, Präfix 2) erzeugen; Scan: USB-Handscanner / `zxing-js` (Kamera) | Etiketten + Tresen-Scan. |
| **Kartendruck** | Zebra **ZC350** (PVC, Ausgabestellen) via Druckertreiber/Zebra Browser Print · `pdf-lib` (Etiketten Läden) | Zwei Ausgabewege je Bezugsort. |
| **E-Mail** | SMTP-Adapter | Erinnerungen, Passwort-Reset. |
| **Excel** | `exceljs` | Auswertungs-Export. |
| **Ablage** | verschlüsseltes Volume, Zugriff nur authentifiziert | Fotos/Scans nicht öffentlich. |
| **Hosting** | Hetzner (EU), bestehender Server, **isolierter Docker-Stack** (App + Kiosk + Ops + eigenes PostgreSQL + Caddy) | EU/DSGVO, Kosten, Abschottung. |

**Bewusst nicht:** kein Redis, keine Microservices, keine native App, keine Fremd-Cloud, kein schwergewichtiger Offline-Sync.

---

## 5. Datenmodell

Stabile **Personen-ID (UUID)**; normalisierte Schattenfelder für die Dublettensuche beim Speichern berechnet.

- **location** — `id`, `name`, `type` = `LADEN`|`AUSGABESTELLE`, `city`, `is_active`
- **person** — `id` (UUID), `first_name`, `last_name`, `address`, `postal_code`, `city`, `birth_date`,
  `phone`, `email`, `household_size` (Zahl), `children_count` (Zahl), `language_id`, `origin_id`,
  `photo_ref` (opt.), `note`, `status`; Schatten `*_norm`, `*_phon`; `created/updated_at/by`, `deleted_at`, `retention_until`
- **lookup_list / lookup_value** — konfigurierbare Listen (Sprache, Herkunft)
- **person_location_assignment** — `person_id`, `location_id`, `valid_from`, `valid_to`, `is_active`
  (höchstens **eine aktive** → „Laden XOR Ausgabestelle" automatisch)
- **card** — `card_number` (EAN-13, unique), `person_id`, `location_id`, `valid_from`, `valid_to`
  (Default +6 Mon.), `status` (`AKTIV`|`ABGELAUFEN`|`GESPERRT`|`ERSETZT`), `block_reason`,
  `predecessor_card_id`, `note`, `created_at/by`
- **distribution** — `card_id`, `person_id`, `location_id`, `distributed_at`, `distributed_by`, `note`
  (nur Ereignis, keine Häufigkeitsgrenze, offline-fähig)
- **user** — `email`, `password_hash`, `display_name`, `role`, `location_id`, `totp_secret` (opt.), `is_active`, …
- **role** — ADMIN · ERFASSUNG · AUSGABE/KASSE · AUSWERTUNG
- **duplicate_decision** — `created_person_id`, `matched_person_id`, `score`, `band`, `shown_candidates` (jsonb),
  `decision`, `reason`, `decided_by`, `decided_at`
- **scan_document** — `person_id` (nullable), `file_ref`, `doc_type`, `ocr_text`, `ocr_confidence`, `retention_until`
- **audit_log** (append-only) — `actor_user_id`, `action`, `entity_type`, `entity_id`, `before`, `after`, `ip`, `at`
- **retention_rule** — `entity_type`, `retention_period`, `legal_basis`, `is_active`
- **integration_outbox** (Phase-2) — `event_type`, `payload`, `created_at`, `delivered_at`
- **Metadaten-Views** (PII-frei) — z.B. `v_stats_by_location` (nur Counts) für die Wartungsplattform

---

## 6. Kartennummern (EAN-13, Präfix 2)

- **Ausgabestellen:** App scannt **EAN-13** selbst (keine Kassa). **Läden:** Karte hier ausgestellt,
  Scannen später via Ländle-Kassa (Phase 2), gleiche stabile EAN-13.
- **Schema:** führende **2** (GS1 „Eigengebrauch" → nie Kollision mit Handelsware) + **Standort-Kennung**
  + **laufende Nummer** + **Prüfziffer** (Modulo-10). Feldbreiten beim Bau.
- **Neuer Code** bei jeder Verlängerung/Ersetzung.

**Kartenproduktion je Bezugsort:**
- **Ausgabestellen → PVC-Plastikkarte**, gedruckt mit **Zebra ZC350** (CR80-Scheckkartenformat,
  85,6 × 54 mm, Layout @300 dpi = 1013 × 638 px). Druck über Windows-Druckertreiber des ZC350
  bzw. optional **Zebra Browser Print** (direkt aus dem Browser). Kartenlayout: Name, Foto (falls
  vorhanden), EAN-13.
- **Läden → Etikett/Aufkleber** (Etikett-PDF mit Name + EAN-13), da die Läden die Karte via
  Ländle-Kassa scannen.

---

## 7. Unscharfe Dublettenprüfung (Verfahren)

Bei **jeder Neuaufnahme** (online) exakt **und** unscharf prüfen und anzeigen, **wo** die Person geführt wird.

1. **Normalisierung:** Kleinschreibung, Trim, Satzzeichen weg, **Umlaut-/ß-Faltung** (Müller = Mueller) → `*_norm`.
2. **Phonetik:** **Kölner Phonetik** (Maier/Mayer/Meier) → `*_phon`.
3. **Kandidaten** (GIN-Trigramm via `pg_trgm`): Nachname-Ähnlichkeit > Schwelle **oder** gleicher Phonetik-Code
   **oder** exaktes Geburtsdatum + ähnlicher Name.
4. **Scoring:** Nachname·w1 + Vorname·w2 + **Geburtsdatum exakt = starker Bonus** + Adresse (Trigramm+PLZ)·w3
   + Phonetik-Bonus. Standort wird angezeigt, nicht bewertet.
5. **Bänder:** HIGH → rote Warnung + Standort; MID → gelbe Liste; sonst keine. Datensparsam: normale Nutzer
   sehen nur „existiert an Standort X", keine vollen Fremddaten.
6. **Entscheidung + Protokoll:** übernehmen/**mergen** (behält `person_id`) · verknüpfen · trotzdem anlegen (Grund)
   → `duplicate_decision`.

**Zusatz:** Batch-Report „mögliche Dubletten im Bestand" (wichtig bei 2.000–5.000) + Merge. Schwellen kalibrierbar.

---

## 8. OCR (früh, assistierend)

- **Nur Vorbefüllung**, nie Auto-Übernahme. Zuverlässigkeitsstufen:
  **Eigenes Vereinsformular** (Priorität, Template, hohe Qualität – ggf. Formular mitdefinieren) ·
  **amtliche Ausweise** (best effort) · **Papierlisten/Handschrift** (niedrig, Ersterfassung).
- On-Prem; Rohscans Löschfrist 90 Tage nach Übernahme.

---

## 9. Benutzeroberfläche (UI)

**Grundlinie:** shadcn/ui + Tailwind, **neutral/schlicht/funktional**, Deutsch, heller Modus.
Zwei bewusst getrennte Modi.

### A) Backoffice (Desktop/Laptop-first)
**Hauptnavigation:** Dashboard · Personen · Karten · Ausgaben · Auswertungen · Admin

- **Dashboard:** Kennzahlen (Berechtigte je Standort), **ablaufende Karten** (Vorschau), offene Dubletten, letzte Aktivität.
- **Personen:** Liste (Suche/Filter, standortgebunden) + **„Neu aufnehmen"**.
  - **Neuaufnahme-Formular** mit **Live-Dubletten-Panel**: bei Eingabe von Nachname/Geburtsdatum erscheinen
    mögliche Treffer live; beim Speichern harte Prüfung → **Warn-Dialog** (rot HIGH / gelb MID) mit Standortangabe
    und Aktionen: *Bestehende öffnen/mergen* · *verknüpfen* · *trotzdem anlegen (Grund pflichtig)*.
  - **Person-Dossier** (Detailseite), Tabs: **Stammdaten · Karten · Ausgaben · Dokumente/Scans · Notizen · Verlauf (Audit)**.
    Foto (optional) oben; Standortzuordnung sichtbar.
- **Karten:** ausstellen (Standort, Gültigkeit Default 6 Mon.), **Etikett drucken** (EAN-13), verlängern/sperren/ersetzen,
  Übersicht ablaufender Karten + Erinnerung.
- **Ausgaben:** Protokoll-Liste (Filter Standort/Zeit).
- **Auswertungen:** Reports + Excel-Export.
- **Admin:** Benutzer/Rollen, Standorte, Auswahllisten (Sprache/Herkunft), Löschfristen, Import.

### B) Tresen-Kiosk (Tablet/PC, scan-first, PWA + Offline-Puffer)
- Großes **Scan-Feld** (Fokus für USB-Handscanner; Kamera-Button für Tablet).
- Ergebnis: große **Ampel** grün/rot.
  - **grün (berechtigt):** **Name + Foto (falls vorhanden) + „gültig bis"**; großer Button **„Ausgabe bestätigen"**
    bucht den Bezug (ein Tipp; offline-fähig via Queue).
  - **rot:** Grund (abgelaufen / gesperrt / nicht gefunden).
- **„Suche ohne Karte"** (Name) → Person → Berechtigung → Ausgabe.
- Minimale Datenanzeige (Kasse-Rolle, keine Personenlisten). **Offline-Indikator + Sync-Status.**
- Große Touch-Ziele, wenige Elemente, fehlerrobust im Ausgabe-Stress.

---

## 10. Wartungsplattform (Super-Admin, nur Metadaten)

- **Eigene Subdomain + eigene Anmeldung**, Zugang **nur Betreiber (Schär Systems)**. Getrenntes Deployable (Monorepo).
- **DB-Rolle `tdd_ops`:** **kein** SELECT auf `persons`/`person_notes`/`scan_document`/PII-Spalten;
  Schreibrecht nur `users`/Konfiguration; Leserecht nur auf **aggregierte/Betriebs-Views**.
  → „Kein PII-Zugriff" ist **in der DB erzwungen**, nicht nur in der UI.
- **Screens:**
  - **Systemstatus/Health:** Uptime, DB-Größe, letztes Backup, App-Version, Zertifikatsstatus.
  - **Kennzahlen:** nur Zahlen (Personen/Karten/Ausgaben je Standort, Neuaufnahmen) – keine Namen.
  - **Benutzer & Konfiguration:** Vereins-Logins anlegen/sperren/Passwort-Reset, Standorte, Löschfristen,
    Feature-Flags, Auswahllisten.
  - **Logs, Backup, Updates:** PII-bereinigte Logs, Backup auslösen/prüfen, Update/Release einspielen, Wartungsmodus.
- Reichweite: **nur diese eine TDD-Installation** (kein Mehrmandanten-Aufbau).

---

## 11. Betrieb / Hosting

- Bestehender Hetzner-VPS (EU), **isolierter** Docker-Compose-Stack: Fach-App + Wartungsplattform +
  **eigene** PostgreSQL-Instanz + Caddy (TLS, eigene Subdomains). Eigenes Docker-Netz, eigene Volumes.
- **Backup:** nächtlicher verschlüsselter `pg_dump` offsite (Storage Box), Restore-Test; Foto-/Scan-Volume mitsichern.
- **Betrieb/Wartung:** Schär Systems. Nutzerverwaltung ggf. an Vereins-Admin delegierbar.
- **Mail:** SMTP für Erinnerungen (Job wöchentlich) + Passwort-Reset.

---

## 12. DSGVO

- **RBAC** serverseitig (Kasse ohne Personenlisten), **Standortbindung**; Querinfo nur als Dubletten-Hinweis.
- **Betreiber-Trennung:** Wartungsplattform ohne PII (DB-Rolle) – Auftragsverarbeiter sieht keine Sozialdaten.
- **Verschlüsselung:** TLS; Scans/Fotos auf verschlüsseltem Volume; DB nur intern.
- **Audit:** append-only inkl. Dubletten-Overrides und Löschungen.
- **Löschfristen (Default, vom Verein/DSB zu bestätigen):** Person **3 J.** nach letzter Aktivität ·
  OCR-Rohscan **90 Tage** nach Übernahme · Audit **3 J.** → konfigurierbare `retention_rule` + Löschjob.
- **Datenminimierung:** Foto optional, Haushalt nur Zahlen, Rohscans kurz. **TOM-Doku**.

---

## 13. Auswertungen

Aktuell Berechtigte (Standort/Typ) · Ausgaben je Standort · Entwicklung über Zeit · **plus** Neuaufnahmen je
Zeitraum, **erkannte/übersteuerte Dubletten**, **Kartenablauf-Vorschau**. **Excel-Export**. Rollen: ADMIN/AUSWERTUNG.

---

## 14. Umsetzungsreihenfolge (kleine, testbare Schritte)

Jeder Schritt: getestet und deploybar. „Walking Skeleton" früh. **MVP = Schritt 1–4.**

1. **Fundament:** Monorepo, Next.js + eigene PostgreSQL + Docker-Compose (isoliert), Migrationstooling,
   **DB-Rollen** (`tdd_app` mit RBAC, `tdd_ops` ohne PII), Login/Session (+2FA-Gerüst), 4-Rollen-RBAC,
   Audit-Infra, Backoffice-Shell (shadcn/Tailwind), Subdomains/TLS. Früh deployen.
2. **Stammdaten:** Standorte (3 Läden + 5 Ausgabestellen), Benutzer/Rollen (~5), Auswahllisten (Sprache/Herkunft).
3. **Personen-Erfassung (manuell):** Formular (Haushalt-Zahlen, optionales Foto), Schattenfelder, Standortbindung,
   Person-Dossier.
4. **Dublettenprüfung (Kernstück, MVP-Abschluss):** Normalisierung, Kölner Phonetik, `pg_trgm`, Scoring,
   **Live-Panel + Warn-Dialog**, `duplicate_decision`, Merge, Batch-Report. → **Erster Produktivgang.**
5. **OCR-Aufnahme:** eigenes Vereinsformular (Template) → Vorbefüllung; Ausweis/Altliste best effort; Rohscan-Ablage + Frist.
6. **Karten:** EAN-13 (Präfix 2); Plastikkarte **Zebra ZC350** (Ausgabestellen) + Etikett-PDF (Läden); Gültigkeit, Verlängern/Sperren/Ersetzen, ablaufende Karten + Erinnerung (Mail-Job).
7. **Tresen-Kiosk (PWA + Offline-Netz):** Scan → Ampel → „Ausgabe bestätigen"; Suche ohne Karte; lokaler Karten-Cache + Ausgabe-Queue → Sync.
8. **Auswertungen + Excel-Export** (inkl. Aufnahme-/Dubletten-Statistik, Kartenablauf-Vorschau).
9. **Import:** generischer Bestandsimport (Excel/CSV) + Erst-Dublettenlauf.
10. **Wartungsplattform:** Health, Kennzahlen (PII-freie Views), Benutzer/Konfig, Logs/Backup/Updates.
11. **DSGVO-Härtung:** Löschjob + Fristen final, sichere Ablage, Backup-Automatik + Restore-Test, Rollen-/Sicht-Feinschliff, TOM-Doku.
12. **Phase-2-Nahtstellen:** Berechtigungs-Service + `integration_outbox` finalisieren/dokumentieren.

---

## 15. Vorbereitung Phase 2 (ohne späteren Umbau)

- **Ländle-Kassa (POS, Läden):** Berechtigungsprüfung als eigener **Service** („EAN → berechtigt + Gültigkeit"),
  später per API aufrufbar. Stabile Referenzen: **Personen-UUID** + **EAN-13** (Präfix-2, POS-verträglich).
- **Event-/Outbox:** `integration_outbox` → Kopplung ohne Schema-Umbau.
- **Gemeinde-Import + Mail-Rückmeldung:** Importer-Baustein + Mail-Adapter angelegt; `origin`-Feld vorhanden.
- **Saubere Schichtung:** Domänen-/Service-Schicht getrennt von Web-Schicht.

---

## 16. Verbleibende Detail-Klärungen (nicht blockierend)

1. **Vereinsformular** für OCR: existiert festes Layout oder mitdefinieren? (Schritt 5)
2. **EAN-13-Feldbreiten** (Standort-Kennung / laufende Nummer).
3. **Subdomains** (Fach-App + Wartungsplattform) + Zertifikate.
4. **Löschfristen** final durch Verein/DSB (Defaults stehen).
5. **Importformat** (Spalten), sobald Bestandsdaten vorliegen.
6. **Person-Dossier-Tabs** final (Vorschlag steht in §9).

---

## 17. Nächster Schritt

**Warten auf dein OK.** Optional vorab: **klickbare Wireframes/Mockups** der Kern-Screens
(Neuaufnahme mit Dubletten-Warnung, Person-Dossier, Tresen-Kiosk, Dashboard, Wartungsplattform).
Bei Freigabe starte ich mit **Schritt 1 (Fundament)** Richtung **MVP (Schritte 1–4)**.
