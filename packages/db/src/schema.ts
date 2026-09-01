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
  passwordHash: text("password_hash").notNull(),
  displayName: text("display_name").notNull(),
  role: text("role").notNull(), // ADMIN | ERFASSUNG | AUSGABE | AUSWERTUNG | SACHBEARBEITER
  organizationId: integer("organization_id").references(() => organizations.id),
  locationId: integer("location_id").references(() => locations.id),
  totpSecret: text("totp_secret"),
  isActive: boolean("is_active").notNull().default(true),
  emailVerified: boolean("email_verified").notNull().default(true),
  failedAttempts: integer("failed_attempts").notNull().default(0),
  lastLogin: timestamp("last_login", { withTimezone: true }),
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
  isActive: boolean("is_active").notNull().default(true),
  note: text("note"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({ activeIdx: index("idx_staff_active").on(t.isActive), lastIdx: index("idx_staff_lastname").on(t.lastName) }));
