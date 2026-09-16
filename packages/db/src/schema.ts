/**
 * Drizzle-Schema (typisierter Zugriff für die App).
 * Quelle der Wahrheit für die physische DB sind die SQL-Dateien in `sql/`;
 * dieses Schema spiegelt sie für typsichere Queries.
 */
import { sql } from "drizzle-orm";
import {
  pgTable,
  integer,
  smallint,
  text,
  boolean,
  uuid,
  date,
  timestamp,
  jsonb,
  real,
  numeric,
  time,
  doublePrecision,
  bigint,
  index,
  uniqueIndex,
} from "drizzle-orm/pg-core";

export const locations = pgTable("locations", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  name: text("name").notNull().unique(),
  type: text("type").notNull(), // 'LADEN' | 'AUSGABESTELLE'
  city: text("city").notNull(),
  locationCode: smallint("location_code").notNull().unique(),
  isActive: boolean("is_active").notNull().default(true),
  priceAdult: numeric("price_adult", { precision: 6, scale: 2 }).notNull().default("2.00"),
  priceChild: numeric("price_child", { precision: 6, scale: 2 }).notNull().default("1.00"),
  groupSize: integer("group_size").notNull().default(20),
  groupCount: integer("group_count").notNull().default(8),
  openingHours: jsonb("opening_hours"),
  strasse: text("strasse"),
  plz: text("plz"),
  lat: doublePrecision("lat"),
  lng: doublePrecision("lng"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const userDashboardPrefs = pgTable("user_dashboard_prefs", {
  userId: uuid("user_id").primaryKey().references(() => users.id, { onDelete: "cascade" }),
  favorites: jsonb("favorites").notNull().default([]),
  widgets: jsonb("widgets").notNull().default([]),
  navCollapsed: boolean("nav_collapsed").notNull().default(false),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const lookupLists = pgTable("lookup_lists", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  code: text("code").notNull().unique(),
});

export const lookupValues = pgTable("lookup_values", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  listId: integer("list_id").notNull().references(() => lookupLists.id, { onDelete: "cascade" }),
  label: text("label").notNull(),
  sort: integer("sort").notNull().default(0),
  isActive: boolean("is_active").notNull().default(true),
});

export const organizations = pgTable("organizations", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  name: text("name").notNull().unique(),
  type: text("type").notNull(), // TDD | GEMEINDE | INSTITUTION
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  email: text("email").notNull().unique(),
  username: text("username"), // vorname.nachname – Login alternativ zur E-Mail (041)
  passwordHash: text("password_hash").notNull(),
  displayName: text("display_name").notNull(),
  role: text("role").notNull(), // ADMIN | ERFASSUNG | AUSGABE | AUSWERTUNG | SACHBEARBEITER | FAHRER
  organizationId: integer("organization_id").references(() => organizations.id),
  locationId: integer("location_id").references(() => locations.id),
  totpSecret: text("totp_secret"),
  totpEnabled: boolean("totp_enabled").notNull().default(false),
  totpRecovery: text("totp_recovery").array().notNull().default([]),
  totpLastWindow: bigint("totp_last_window", { mode: "number" }),
  isActive: boolean("is_active").notNull().default(true),
  emailVerified: boolean("email_verified").notNull().default(true),
  failedAttempts: integer("failed_attempts").notNull().default(0),
  lockedUntil: timestamp("locked_until", { withTimezone: true }),
  mustChangePassword: boolean("must_change_password").notNull().default(false), // Initialpasswort per Mail
  lastLogin: timestamp("last_login", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

/** Konten der Wartungsplattform (Betreiber). Nur ueber tdd_ops erreichbar, Migration 032. */
export const opsUsers = pgTable("ops_users", {
  id: uuid("id").primaryKey().defaultRandom(),
  email: text("email").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  displayName: text("display_name").notNull(),
  totpSecret: text("totp_secret"),
  totpEnabled: boolean("totp_enabled").notNull().default(false),
  totpRecovery: text("totp_recovery").array().notNull().default([]),
  totpLastWindow: bigint("totp_last_window", { mode: "number" }),
  failedAttempts: integer("failed_attempts").notNull().default(0),
  lockedUntil: timestamp("locked_until", { withTimezone: true }),
  lastLogin: timestamp("last_login", { withTimezone: true }),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const persons = pgTable(
  "persons",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    firstName: text("first_name").notNull(),
    lastName: text("last_name").notNull(),
    address: text("address"),
    postalCode: text("postal_code"),
    city: text("city"),
    birthDate: date("birth_date"),
    phone: text("phone"),
    email: text("email"),
    householdSize: smallint("household_size"),
    childrenCount: smallint("children_count"),
    languageId: integer("language_id").references(() => lookupValues.id),
    originId: integer("origin_id").references(() => lookupValues.id),
    photoRef: text("photo_ref"),
    note: text("note"),
    status: text("status").notNull().default("AKTIV"),
    lastNameNorm: text("last_name_norm").notNull().default(""),
    firstNameNorm: text("first_name_norm").notNull().default(""),
    addressNorm: text("address_norm").notNull().default(""),
    lastNamePhon: text("last_name_phon").notNull().default(""),
    firstNamePhon: text("first_name_phon").notNull().default(""),
    createdBy: uuid("created_by").references(() => users.id),
    updatedBy: uuid("updated_by").references(() => users.id),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
    deleteReason: text("delete_reason"),
    consentAt: timestamp("consent_at", { withTimezone: true }),
    retentionUntil: date("retention_until"),
    sourceAntragId: uuid("source_antrag_id"),
    sourceOrganizationId: integer("source_organization_id"),
    takeoverPending: boolean("takeover_pending").notNull().default(false),
    ausgabeNumber: integer("ausgabe_number"),
    gruppe: integer("gruppe"),
    legacyId: integer("legacy_id"),
  },
  (t) => ({
    birthIdx: index("idx_persons_birthdate").on(t.birthDate),
    phonIdx: index("idx_persons_lastname_phon").on(t.lastNamePhon),
  }),
);

export const personLocationAssignments = pgTable(
  "person_location_assignments",
  {
    id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
    personId: uuid("person_id").notNull().references(() => persons.id, { onDelete: "cascade" }),
    locationId: integer("location_id").notNull().references(() => locations.id),
    validFrom: date("valid_from").notNull().defaultNow(),
    validTo: date("valid_to"),
    isActive: boolean("is_active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    activeUq: uniqueIndex("uq_active_assignment").on(t.personId).where(sql`${t.isActive}`),
  }),
);

export const cards = pgTable(
  "cards",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    cardNumber: text("card_number").notNull().unique(),
    personId: uuid("person_id").notNull().references(() => persons.id, { onDelete: "cascade" }),
    locationId: integer("location_id").notNull().references(() => locations.id),
    validFrom: date("valid_from").notNull(),
    validTo: date("valid_to").notNull(),
    status: text("status").notNull().default("AKTIV"),
    blockReason: text("block_reason"),
    predecessorCardId: uuid("predecessor_card_id"),
    note: text("note"),
    legacy: boolean("legacy").notNull().default(false),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
    trashReason: text("trash_reason"),
    createdBy: uuid("created_by").references(() => users.id),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    personIdx: index("idx_cards_person").on(t.personId),
    validToIdx: index("idx_cards_valid_to").on(t.validTo),
  }),
);

export const distributions = pgTable(
  "distributions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    cardId: uuid("card_id").notNull().references(() => cards.id),
    personId: uuid("person_id").notNull().references(() => persons.id),
    locationId: integer("location_id").notNull().references(() => locations.id),
    distributedAt: timestamp("distributed_at", { withTimezone: true }).notNull().defaultNow(),
    distributedBy: uuid("distributed_by").references(() => users.id),
    note: text("note"),
    clientRef: uuid("client_ref").unique(),
    amountDue: numeric("amount_due", { precision: 6, scale: 2 }),
    amountPaid: numeric("amount_paid", { precision: 6, scale: 2 }),
  },
  (t) => ({
    locTimeIdx: index("idx_distributions_location_time").on(t.locationId, t.distributedAt),
  }),
);

export const duplicateDecisions = pgTable("duplicate_decisions", {
  id: uuid("id").primaryKey().defaultRandom(),
  createdPersonId: uuid("created_person_id").references(() => persons.id),
  matchedPersonId: uuid("matched_person_id").references(() => persons.id),
  score: numeric("score", { precision: 4, scale: 3 }),
  band: text("band"),
  shownCandidates: jsonb("shown_candidates").notNull().default([]),
  decision: text("decision").notNull(),
  reason: text("reason"),
  decidedBy: uuid("decided_by").references(() => users.id),
  decidedAt: timestamp("decided_at", { withTimezone: true }).notNull().defaultNow(),
});

export const scanDocuments = pgTable("scan_documents", {
  id: uuid("id").primaryKey().defaultRandom(),
  personId: uuid("person_id").references(() => persons.id, { onDelete: "set null" }),
  fileRef: text("file_ref").notNull(),
  docType: text("doc_type").notNull().default("VEREINSFORMULAR"),
  ocrText: text("ocr_text"),
  ocrConfidence: real("ocr_confidence"),
  uploadedBy: uuid("uploaded_by").references(() => users.id),
  uploadedAt: timestamp("uploaded_at", { withTimezone: true }).notNull().defaultNow(),
  retentionUntil: date("retention_until"),
});

export const auditLogs = pgTable(
  "audit_logs",
  {
    id: bigint("id", { mode: "number" }).primaryKey().generatedAlwaysAsIdentity(),
    actorUserId: uuid("actor_user_id").references(() => users.id),
    action: text("action").notNull(),
    entityType: text("entity_type").notNull(),
    entityId: text("entity_id"),
    before: jsonb("before"),
    after: jsonb("after"),
    ip: text("ip"),
    at: timestamp("at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    entityIdx: index("idx_audit_entity").on(t.entityType, t.entityId),
    atIdx: index("idx_audit_at").on(t.at),
  }),
);

export const retentionRules = pgTable("retention_rules", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  entityType: text("entity_type").notNull().unique(),
  retentionPeriod: text("retention_period").notNull(), // interval als Text
  legalBasis: text("legal_basis"),
  isActive: boolean("is_active").notNull().default(true),
});

export const integrationOutbox = pgTable("integration_outbox", {
  id: bigint("id", { mode: "number" }).primaryKey().generatedAlwaysAsIdentity(),
  eventType: text("event_type").notNull(),
  payload: jsonb("payload").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  deliveredAt: timestamp("delivered_at", { withTimezone: true }),
});

// ── Multi-Mandanten-Plattform: Anträge + Anspruchsprüfung ─────────────────
export const antraege = pgTable(
  "antraege",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: integer("organization_id").notNull().references(() => organizations.id),
    targetType: text("target_type").notNull().default("AUSGABESTELLE"), // LADEN | AUSGABESTELLE
    intendedLocationId: integer("intended_location_id").references(() => locations.id),
    firstName: text("first_name").notNull(),
    lastName: text("last_name").notNull(),
    address: text("address"),
    postalCode: text("postal_code"),
    city: text("city"),
    birthDate: date("birth_date"),
    phone: text("phone"),
    email: text("email"),
    languageId: integer("language_id").references(() => lookupValues.id),
    originId: integer("origin_id").references(() => lookupValues.id),
    adults: smallint("adults").notNull().default(1),
    childrenU12: smallint("children_u12").notNull().default(0),
    childrenO12: smallint("children_o12").notNull().default(0),
    pets: text("pets"),
    financials: jsonb("financials").notNull().default({}),
    incomeTotal: numeric("income_total", { precision: 10, scale: 2 }),
    expenseTotal: numeric("expense_total", { precision: 10, scale: 2 }),
    availableIncome: numeric("available_income", { precision: 10, scale: 2 }),
    incomeLimit: numeric("income_limit", { precision: 10, scale: 2 }),
    status: text("status").notNull().default("OFFEN"), // OFFEN | IN_PRUEFUNG | POSITIV | NEGATIV
    decisionReason: text("decision_reason"),
    decidedBy: uuid("decided_by").references(() => users.id),
    decidedAt: timestamp("decided_at", { withTimezone: true }),
    transferredPersonId: uuid("transferred_person_id").references(() => persons.id),
    vorgaengerAntragId: uuid("vorgaenger_antrag_id"), // Verlaengerung: vorbefuellt aus diesem Antrag
    consentGiven: boolean("consent_given").notNull().default(false),
    consentAt: date("consent_at"),
    lastNameNorm: text("last_name_norm").notNull().default(""),
    firstNameNorm: text("first_name_norm").notNull().default(""),
    createdBy: uuid("created_by").references(() => users.id),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    orgIdx: index("idx_antraege_org").on(t.organizationId),
    statusIdx: index("idx_antraege_status").on(t.status),
    nameIdx: index("idx_antraege_name").on(t.lastNameNorm, t.firstNameNorm),
  }),
);

export const authTokens = pgTable(
  "auth_tokens",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    type: text("type").notNull(), // RESET | VERIFY
    tokenHash: text("token_hash").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    usedAt: timestamp("used_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({ hashIdx: index("idx_auth_tokens_hash").on(t.tokenHash) }),
);

export const antragDocuments = pgTable(
  "antrag_documents",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    antragId: uuid("antrag_id").notNull().references(() => antraege.id, { onDelete: "cascade" }),
    fileRef: text("file_ref").notNull(),
    docType: text("doc_type").notNull().default("SONSTIGES"),
    note: text("note"),
    uploadedBy: uuid("uploaded_by").references(() => users.id),
    uploadedAt: timestamp("uploaded_at", { withTimezone: true }).notNull().defaultNow(),
    retentionUntil: date("retention_until"),
  },
  (t) => ({ antragIdx: index("idx_antrag_documents_antrag").on(t.antragId) }),
);

/** Rueckfragen/Verlauf je Antrag zwischen Organisation (Portal) und TDD. RLS siehe 031. */
export const antragNachrichten = pgTable(
  "antrag_nachrichten",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    antragId: uuid("antrag_id").notNull().references(() => antraege.id, { onDelete: "cascade" }),
    organizationId: integer("organization_id").notNull().references(() => organizations.id),
    seite: text("seite").notNull(), // ORG | TDD
    autorUserId: uuid("autor_user_id").references(() => users.id),
    autorName: text("autor_name").notNull().default(""),
    text: text("text").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    gelesenAt: timestamp("gelesen_at", { withTimezone: true }),
  },
  (t) => ({ antragIdx: index("idx_antrag_nachrichten_antrag").on(t.antragId, t.createdAt) }),
);

/** Fehler und Lebenszeichen der Fach-App fuer die Support-Sicht der Wartung (033). Ohne PII. */
export const appEvents = pgTable(
  "app_events",
  {
    id: bigint("id", { mode: "number" }).primaryKey().generatedAlwaysAsIdentity(),
    at: timestamp("at", { withTimezone: true }).notNull().defaultNow(),
    kind: text("kind").notNull(), // FEHLER | LEBENSZEICHEN
    userId: uuid("user_id").references(() => users.id, { onDelete: "set null" }),
    role: text("role"),
    locationId: integer("location_id"),
    organizationId: integer("organization_id"),
    route: text("route"),
    message: text("message"),
    digest: text("digest"),
    detail: jsonb("detail").notNull().default({}),
  },
  (t) => ({ userAtIdx: index("idx_app_events_user_at").on(t.userId, t.at) }),
);

// ── A2 · Personal-Verzeichnis (Zentralsystem, getrennt von A1 persons) ─────
export const staff = pgTable("staff", {
  id: uuid("id").primaryKey().defaultRandom(),
  firstName: text("first_name").notNull(),
  lastName: text("last_name").notNull(),
  staffType: text("staff_type").notNull().default("ANGESTELLT"), // ANGESTELLT | ZIVILDIENER | EHRENAMT | FAHRER
  email: text("email"),
  phone: text("phone"),
  locationId: integer("location_id").references(() => locations.id),
  employmentStart: date("employment_start"),
  employmentEnd: date("employment_end"),
  weeklyHours: numeric("weekly_hours", { precision: 5, scale: 2 }),
  vacationDaysYear: numeric("vacation_days_year", { precision: 5, scale: 1 }),
  nfcCardId: text("nfc_card_id").unique(),
  userId: uuid("user_id").references(() => users.id, { onDelete: "set null" }), // optionaler Login (A4)
  strasse: text("strasse"),
  plz: text("plz"),
  ort: text("ort"),
  sollVerteilung: jsonb("soll_verteilung"), // Sollminuten je ISO-Wochentag {"1":480,...} (043)
  zeitkontoStart: date("zeitkonto_start"),
  zeitkontoAnfangMin: integer("zeitkonto_anfang_min").notNull().default(0),
  urlaubsjahr: text("urlaubsjahr").notNull().default("ARBEIT"), // ARBEIT (ab Eintritt) | KALENDER
  urlaubWochen: smallint("urlaub_wochen").notNull().default(5),
  urlaubUebertragTage: numeric("urlaub_uebertrag_tage", { precision: 5, scale: 1 }).notNull().default("0"),
  urlaubUebertragAb: date("urlaub_uebertrag_ab"),
  dienstjahreAnrechnung: numeric("dienstjahre_anrechnung", { precision: 4, scale: 1 }).notNull().default("0"),
  // P2 Personalakte (045): Dienstzettel-Daten nach § 2 AVRAG, OeGK-Anmeldung, Notfallkontakt
  geburtsdatum: date("geburtsdatum"),
  svNummer: text("sv_nummer"),
  staatsbuergerschaft: text("staatsbuergerschaft"),
  beschaeftigung: text("beschaeftigung"), // VOLLZEIT | TEILZEIT | GERINGFUEGIG | ZIVILDIENST | EHRENAMT
  taetigkeit: text("taetigkeit"),
  kvEinstufung: text("kv_einstufung"),
  gehaltBrutto: numeric("gehalt_brutto", { precision: 9, scale: 2 }),
  probezeitBis: date("probezeit_bis"),
  befristetBis: date("befristet_bis"),
  kuendigungsfrist: text("kuendigungsfrist"),
  dienstzettelAm: date("dienstzettel_am"),
  notfallName: text("notfall_name"),
  notfallTel: text("notfall_tel"),
  austrittGrund: text("austritt_grund"),
  kannFahren: boolean("kann_fahren").notNull().default(false),
  fuehrerschein: text("fuehrerschein"),
  fahrerTage: smallint("fahrer_tage").array().notNull().default([]),
  isActive: boolean("is_active").notNull().default(true),
  note: text("note"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({ activeIdx: index("idx_staff_active").on(t.isActive), lastIdx: index("idx_staff_lastname").on(t.lastName) }));

// P2 · Personalakte: Dokumente je Person (nur Admin, 7 Jahre nach Austritt) (045)
export const staffDokumente = pgTable("staff_dokumente", {
  id: uuid("id").primaryKey().defaultRandom(),
  staffId: uuid("staff_id").notNull().references(() => staff.id, { onDelete: "cascade" }),
  art: text("art").notNull(), // DIENSTZETTEL | DIENSTVERTRAG | ZEUGNIS | AUSWEIS | FUEHRERSCHEIN | UNTERWEISUNG | AERZTLICH | SONSTIG
  bezeichnung: text("bezeichnung").notNull(),
  fileRef: text("file_ref").notNull(),
  gueltigBis: date("gueltig_bis"),
  uploadedBy: uuid("uploaded_by").references(() => users.id),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({ staffIdx: index("idx_staff_dokumente_staff").on(t.staffId) }));

// ── A2 · Zeiterfassung (Stempel-Ereignisse) ────────────────────────────────
export const timeEvents = pgTable("time_events", {
  id: uuid("id").primaryKey().defaultRandom(),
  staffId: uuid("staff_id").notNull().references(() => staff.id, { onDelete: "cascade" }),
  kind: text("kind").notNull(), // IN | OUT | BREAK_START | BREAK_END
  at: timestamp("at", { withTimezone: true }).notNull().defaultNow(),
  source: text("source").notNull().default("TERMINAL_MANUAL"),
  note: text("note"),
  edited: boolean("edited").notNull().default(false),
  createdBy: uuid("created_by").references(() => users.id),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({ staffAtIdx: index("idx_time_events_staff_at").on(t.staffId, t.at) }));

// ── A4 · Touren & Disposition (Migration 034) ──────────────────────────────
export const abwesenheiten = pgTable("abwesenheiten", {
  id: uuid("id").primaryKey().defaultRandom(),
  staffId: uuid("staff_id").notNull().references(() => staff.id, { onDelete: "cascade" }),
  art: text("art").notNull(), // URLAUB | KRANK | ZEITAUSGLEICH | PFLEGE | SONDERURLAUB | UNBEZAHLT | SONSTIG
  von: date("von").notNull(),
  bis: date("bis").notNull(),
  notiz: text("notiz"),
  status: text("status").notNull().default("GENEHMIGT"), // BEANTRAGT | GENEHMIGT | ABGELEHNT
  halbtag: boolean("halbtag").notNull().default(false),
  bestaetigung: boolean("bestaetigung").notNull().default(false), // Krankenbestaetigung liegt vor
  entschiedenBy: uuid("entschieden_by").references(() => users.id),
  entschiedenAt: timestamp("entschieden_at", { withTimezone: true }),
  createdBy: uuid("created_by").references(() => users.id),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({ staffIdx: index("idx_abwesenheiten_staff").on(t.staffId, t.von, t.bis) }));

export const abholstellen = pgTable("abholstellen", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  name: text("name").notNull(),
  art: text("art").notNull().default("SONSTIGES"),
  strasse: text("strasse"),
  plz: text("plz"),
  ort: text("ort"),
  ansprechperson: text("ansprechperson"),
  telefon: text("telefon"),
  email: text("email"),
  kuehlbedarf: boolean("kuehlbedarf").notNull().default(false),
  abholtage: smallint("abholtage").array().notNull().default([]),
  fensterVon: time("fenster_von"),
  fensterBis: time("fenster_bis"),
  hinweise: text("hinweise"),
  lat: doublePrecision("lat"),
  lng: doublePrecision("lng"),
  isActive: boolean("is_active").notNull().default(true),
  angebotId: integer("angebot_id"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const fahrzeuge = pgTable("fahrzeuge", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  kennzeichen: text("kennzeichen").notNull().unique(),
  bezeichnung: text("bezeichnung").notNull(),
  kuehlung: boolean("kuehlung").notNull().default(false),
  elektrisch: boolean("elektrisch").notNull().default(false),
  reichweiteKm: integer("reichweite_km"),
  ladevolumen: text("ladevolumen"),
  locationId: integer("location_id").references(() => locations.id),
  pickerlBis: date("pickerl_bis"),
  ausserBetriebVon: date("ausser_betrieb_von"),
  ausserBetriebBis: date("ausser_betrieb_bis"),
  hinweise: text("hinweise"),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const tourVorlagen = pgTable("tour_vorlagen", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  name: text("name").notNull(),
  wochentag: smallint("wochentag").notNull(), // 1=Mo … 7=So
  startzeit: time("startzeit"),
  startLocationId: integer("start_location_id").references(() => locations.id),
  fahrzeugId: integer("fahrzeug_id").references(() => fahrzeuge.id),
  fahrerId: uuid("fahrer_id").references(() => staff.id),
  hinweise: text("hinweise"),
  isActive: boolean("is_active").notNull().default(true),
  streckeKm: numeric("strecke_km", { precision: 7, scale: 1 }),
  fahrzeitMin: integer("fahrzeit_min"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const tourVorlageStopps = pgTable("tour_vorlage_stopps", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  vorlageId: integer("vorlage_id").notNull().references(() => tourVorlagen.id, { onDelete: "cascade" }),
  reihenfolge: integer("reihenfolge").notNull(),
  art: text("art").notNull(), // ABHOLUNG | LIEFERUNG
  abholstelleId: integer("abholstelle_id").references(() => abholstellen.id),
  locationId: integer("location_id").references(() => locations.id),
  hinweis: text("hinweis"),
});

export const touren = pgTable("touren", {
  id: uuid("id").primaryKey().defaultRandom(),
  datum: date("datum").notNull(),
  vorlageId: integer("vorlage_id").references(() => tourVorlagen.id, { onDelete: "set null" }),
  name: text("name").notNull(),
  startzeit: time("startzeit"),
  startLocationId: integer("start_location_id").references(() => locations.id),
  fahrzeugId: integer("fahrzeug_id").references(() => fahrzeuge.id),
  fahrerId: uuid("fahrer_id").references(() => staff.id),
  beifahrerId: uuid("beifahrer_id").references(() => staff.id),
  status: text("status").notNull().default("GEPLANT"), // GEPLANT | UNTERWEGS | ABGESCHLOSSEN | AUSGEFALLEN
  gestartetAt: timestamp("gestartet_at", { withTimezone: true }),
  beendetAt: timestamp("beendet_at", { withTimezone: true }),
  kmStart: integer("km_start"),
  kmEnde: integer("km_ende"),
  hinweise: text("hinweise"),
  streckeKm: numeric("strecke_km", { precision: 7, scale: 1 }),
  fahrzeitMin: integer("fahrzeit_min"),
  freigegebenAt: timestamp("freigegeben_at", { withTimezone: true }), // an den Fahrer gesendet
  freigegebenBy: uuid("freigegeben_by").references(() => users.id),
  createdBy: uuid("created_by").references(() => users.id),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({ datumIdx: index("idx_touren_datum").on(t.datum), fahrerIdx: index("idx_touren_fahrer").on(t.fahrerId, t.datum) }));

export const tourStopps = pgTable("tour_stopps", {
  id: uuid("id").primaryKey().defaultRandom(),
  tourId: uuid("tour_id").notNull().references(() => touren.id, { onDelete: "cascade" }),
  reihenfolge: integer("reihenfolge").notNull(),
  art: text("art").notNull(),
  abholstelleId: integer("abholstelle_id").references(() => abholstellen.id),
  locationId: integer("location_id").references(() => locations.id),
  hinweis: text("hinweis"),
  status: text("status").notNull().default("OFFEN"), // OFFEN | ERLEDIGT | NICHT_MOEGLICH
  erledigtAt: timestamp("erledigt_at", { withTimezone: true }),
  mengeKisten: integer("menge_kisten"),
  mengeKg: numeric("menge_kg", { precision: 8, scale: 1 }),
  bemerkung: text("bemerkung"),
});

export const angeboteEingang = pgTable("angebote_eingang", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  homepageId: integer("homepage_id").notNull().unique(),
  betrieb: text("betrieb").notNull(),
  daten: jsonb("daten").notNull(),
  eingegangen: timestamp("eingegangen", { withTimezone: true }).notNull(),
  abgeholtAt: timestamp("abgeholt_at", { withTimezone: true }).notNull().defaultNow(),
  stand: text("stand").notNull().default("NEU"), // NEU | UEBERNOMMEN | ABGELEHNT
  abholstelleId: integer("abholstelle_id").references(() => abholstellen.id),
  entschiedenBy: uuid("entschieden_by").references(() => users.id),
  entschiedenAt: timestamp("entschieden_at", { withTimezone: true }),
  rueckgemeldet: boolean("rueckgemeldet").notNull().default(false),
});

/** Fahrzeug-Tablets (Migration 038): Geraete-Token statt Fahrer-Login. */
export const geraete = pgTable("geraete", {
  id: uuid("id").primaryKey().defaultRandom(),
  fahrzeugId: integer("fahrzeug_id").notNull().references(() => fahrzeuge.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  tokenHash: text("token_hash").notNull().unique(),
  userAgent: text("user_agent"),
  gekoppeltAt: timestamp("gekoppelt_at", { withTimezone: true }).notNull().defaultNow(),
  gekoppeltBy: uuid("gekoppelt_by").references(() => users.id),
  zuletztGesehen: timestamp("zuletzt_gesehen", { withTimezone: true }),
  isActive: boolean("is_active").notNull().default(true),
});

export const geraetCodes = pgTable("geraet_codes", {
  code: text("code").primaryKey(),
  fahrzeugId: integer("fahrzeug_id").notNull().references(() => fahrzeuge.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  usedAt: timestamp("used_at", { withTimezone: true }),
  createdBy: uuid("created_by").references(() => users.id),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// ── P3 Arbeitszeit nach AZG (Migration 043) ────────────────────────────────
export const zeitRegeln = pgTable("zeit_regeln", {
  id: integer("id").primaryKey().default(1),
  maxTagMin: integer("max_tag_min").notNull().default(600),
  maxWocheMin: integer("max_woche_min").notNull().default(3000),
  pauseAbMin: integer("pause_ab_min").notNull().default(360),
  pauseMin: integer("pause_min").notNull().default(30),
  ruhezeitMin: integer("ruhezeit_min").notNull().default(660),
  normalarbeitszeitWocheMin: integer("normalarbeitszeit_woche_min").notNull().default(2400),
  mehrarbeitZuschlag: integer("mehrarbeit_zuschlag").notNull().default(25),
  ueberstundenZuschlag: integer("ueberstunden_zuschlag").notNull().default(50),
  kollektivvertrag: text("kollektivvertrag"),
  // Arbeitgeber-Angaben fuer den Dienstzettel (045)
  arbeitgeberName: text("arbeitgeber_name").notNull().default("Tischlein deck dich Vorarlberg"),
  arbeitgeberAnschrift: text("arbeitgeber_anschrift"),
  bvKasse: text("bv_kasse"),
  svTraeger: text("sv_traeger").notNull().default("Österreichische Gesundheitskasse (ÖGK)"),
  kvEinsicht: text("kv_einsicht"),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const betriebsfreieTage = pgTable("betriebsfreie_tage", {
  datum: date("datum").primaryKey(),
  name: text("name").notNull(),
  createdBy: uuid("created_by").references(() => users.id),
});

export const zeitAbschluesse = pgTable("zeit_abschluesse", {
  staffId: uuid("staff_id").notNull().references(() => staff.id, { onDelete: "cascade" }),
  jahr: integer("jahr").notNull(),
  monat: integer("monat").notNull(),
  istMin: integer("ist_min").notNull(),
  sollMin: integer("soll_min").notNull(),
  gutschriftMin: integer("gutschrift_min").notNull(),
  saldoMin: integer("saldo_min").notNull(),
  kontoMin: integer("konto_min").notNull(),
  mehrarbeitMin: integer("mehrarbeit_min").notNull().default(0),
  ueberstundenMin: integer("ueberstunden_min").notNull().default(0),
  abgeschlossenBy: uuid("abgeschlossen_by").references(() => users.id),
  abgeschlossenAt: timestamp("abgeschlossen_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({ pk: uniqueIndex("uq_zeit_abschluss").on(t.staffId, t.jahr, t.monat) }));
