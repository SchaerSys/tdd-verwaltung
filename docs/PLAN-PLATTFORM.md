# Plattform-Ausbau – Modulare Multi-Mandanten-Plattform

> Erweiterung der TDD-Verwaltung von der reinen Fach-App zu einer modularen Plattform mit
> vorgelagertem Antrags-/Anspruchsprüfungs-Prozess. Stand: 2026-08-19.

## 1. Ziel

Nicht nur TDD verwaltet Personen/Karten, sondern **Gemeinden und Institutionen** stellen **Anträge**
mit voller Datenerfassung + Dokumenten und führen die **Anspruchsprüfung** durch (Mensch entscheidet).
Nach **positivem Bescheid** wird die Person **systemübergreifend automatisch bei TDD** angelegt
(inkl. Dokumente) und kann dort eine Karte erhalten.

## 2. Mandanten (Organisationen)

| Typ | Wer | Aufgabe |
|---|---|---|
| **TDD** | Betreiber-Verein | Personen/Karten/Ausgabe/Kiosk/Läden. Macht die Anspruchsprüfung **selbst für Läden-Kunden**. |
| **GEMEINDE** | Vorarlberger Gemeinden/Städte | Antrag + Anspruchsprüfung für **Ausgabestellen**-Kunden. |
| **INSTITUTION** | Caritas, IFS, Volkshilfe, … | Antrag + Anspruchsprüfung für **Ausgabestellen**-Kunden. |

**Routing:** Ausgabestellen-Anträge laufen über Gemeinden/Institutionen · Läden-Anträge werden bei TDD geprüft.

## 3. Entscheidungen (bestätigt 2026-08-19)

- **Anspruchsprüfung:** System rechnet (Einnahmen − Ausgaben = verfügbares Einkommen) gegen die
  Einkommensgrenze und schlägt „berechtigt / nicht" vor; **der Mensch entscheidet final** mit Begründung.
- **Einkommensgrenze** (aus Formular Seite 3): **€870** Haushaltsvorstand · **+€415** je weitere volljährige
  Person · **+€195** je Kind bzw. Erwachsener mit Familienbeihilfe-Anspruch · **10 % Toleranz** bei Härtefall.
- **Übergabe an TDD:** **Person + Dokumente**; Dokumente sichtbar **nur für TDD-Admin**; **keine Finanz-Detailzahlen**.
- **Mandantentrennung:** **strikt, DB-erzwungen (RLS)**; systemweite Dubletten zeigen fremden Stellen nur
  „Person bereits erfasst" ohne Details.

## 4. Rollen & Dokument-Datenschutz

| Rolle | Kontext | Dokumente? |
|---|---|---|
| **ADMIN** (TDD) | Betrieb | **Ja** |
| **SACHBEARBEITER** | Gemeinde/Institution (bzw. TDD für Läden) | Ja – **nur eigene Anträge** |
| **ERFASSUNG** (TDD) | Personen/Karten | Nein |
| **AUSGABE/Kasse** (TDD) | Tresen | **Nein** – nur Person/Berechtigung |
| **Läden-Personal** | Laden | **Nein** |
| **AUSWERTUNG** | Reports | Nein (nur aggregiert) |

Neue Berechtigung **`document:view`** (nur ADMIN + SACHBEARBEITER für eigene Anträge). Ausgabe/Laden nie.

## 5. Datenmodell (Ergänzungen)

- **organizations** — `id`, `name`, `type` (TDD/GEMEINDE/INSTITUTION), `is_active`.
- **users** += `organization_id`.
- **antraege** — Antrag: `organization_id` (Eigentümer), `target_type` (LADEN/AUSGABESTELLE),
  `intended_location_id`; Antragsteller-Stammdaten (Name/Adresse/Geburtsdatum/Telefon/Haushalt/Sprache/Herkunft);
  Haushalts-Aufschlüsselung `adults`, `children_u12`, `children_o12`; `financials` (jsonb Einnahmen/Ausgaben);
  `income_total`, `expense_total`, `available_income`, `income_limit`; `status`
  (OFFEN/IN_PRUEFUNG/POSITIV/NEGATIV); `decision_reason`, `decided_by`, `decided_at`;
  `transferred_person_id` (bei Übergabe); Schattenfelder für Cross-Mandanten-Dubletten.
- **antrag_documents** — `antrag_id`, `file_ref`, `doc_type`, `uploaded_by`, `retention_until`.
- **persons** += `source_antrag_id` (Herkunft). TDD-seitige Dokumente = bestehende **scan_documents**
  (bei Übergabe kopiert, `person_id` gesetzt); Sichtbarkeit über `document:view`.

**RLS:** `antraege` + `antrag_documents` mit Policy `organization_id = current_setting('app.org_id')`.
App setzt `SET LOCAL app.org_id` je Transaktion aus der Org des angemeldeten Nutzers. Cross-Mandanten-
Dublettenprüfung via `SECURITY DEFINER`-Funktion (liefert nur „existiert / Typ", keine Fremddetails).

## 6. Anspruchsprüfung (Verfahren)

1. Sachbearbeiter erfasst Antragsteller + Haushalt (Erwachsene / Kinder u12 / Kinder o12) + Einnahmen/Ausgaben.
2. System rechnet: `available_income = Σ Einnahmen − Σ Ausgaben`;
   `income_limit = 870 + 415·(weitere Erwachsene) + 195·(Kinder + FB-Erwachsene)`.
3. Vorschlag: berechtigt, wenn `available_income ≤ income_limit` (bzw. innerhalb 10 % Härtefall).
4. **Mensch entscheidet** (positiv/negativ + Begründung) → `status`, `decided_by/at`.
5. Bei **positiv** → Übergabe an TDD.

## 7. Systemübergreifende Übergabe (bei positivem Bescheid)

- Cross-Mandanten-Dublettencheck (existiert die Person schon bei TDD? → verknüpfen statt doppelt anlegen).
- **person** bei TDD anlegen/aktualisieren (Stammdaten aus Antrag) + `source_antrag_id`.
- Standortzuordnung = `intended_location_id` (Laden/Ausgabestelle).
- **Dokumente** aus `antrag_documents` → `scan_documents` (person_id) kopieren (nur Admin sichtbar).
- Keine Finanzzahlen übertragen. Revisionssicher im Audit-Log.
- TDD kann dann eine **Karte ausstellen** (bestehender Flow / Kiosk).

## 8. Portale (UI)

- **Antrags-Portal** (Gemeinde/Institution/TDD-Läden): Antrag anlegen (Stammdaten + Dokumente-Upload +
  Einnahmen/Ausgaben + Berechnungshilfe), Antragsliste (nur eigene), Bescheid setzen.
- **TDD-Fach-App** (bestehend): erhält übergebene Personen; Dokumente nur für Admin; Karten/Ausgabe/Kiosk.
- **Kiosk**: zusätzlich **„neue Karte ausstellen"** direkt am Tresen.

## 9. Bau-Reihenfolge

1. **DB-Fundament** (additiv): organizations, users.organization_id, antraege, antrag_documents,
   Rollen-Erweiterung (`SACHBEARBEITER`, `document:view`), RLS-Policies, Seed-Organisationen; bestehende
   TDD-Nutzer/Daten der TDD-Org zuordnen. *(dieser Schritt)*
2. **Org-Kontext + RLS-Helper** in der App (Session kennt Organisation; `withOrg`-Transaktion).
3. **Antrags-Portal**: Antrag anlegen + Dokumente + Anspruchsprüfung-Rechner.
4. **Bescheid** (positiv/negativ) + **Übergabe an TDD** (Person + Dokumente).
5. **Dokument-Zugriffsrechte** durchsetzen (Ausgabe/Laden sehen keine Dokumente; Admin ja).
6. **Kiosk: neue Karte ausstellen**.
7. Cross-Mandanten-Dublettenprüfung feinschleifen; Wartungsplattform um Org-Verwaltung erweitern.

## 10. Offene Detailpunkte (nicht blockierend)

- Genaue Zuordnung „welche Gemeinde/Institution → welche Ausgabestelle" (feste Zuweisung oder frei?).
- Familienbeihilfe-Logik im income_limit (welche Personen zählen mit €195) – Feinregel mit dem Verein.
- Dokument-Typen-Katalog (Ausweis, ZMR, Kontoauszüge, Mietvertrag, …).
- Login/Onboarding der externen Stellen (Einladung, Passwort-Reset).
