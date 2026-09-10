# Sprintplan – Härtung & Qualitätsnetz

Umsetzungsplan zu den Befunden aus [`docs/BEGRUENDUNGEN.md`](BEGRUENDUNGEN.md), Kapitel 12.
Vier Sprints, jeder für sich lieferbar und deploybar. Jede Aufgabe enthält den fertigen Code,
die betroffenen Dateien, das Akzeptanzkriterium und den Prüfbefehl.

**Reihenfolge ist nicht beliebig:** Sprint 1 beseitigt Betriebsrisiken, Sprint 2 baut das Netz,
das alle folgenden Änderungen absichert. Erst danach wird umgebaut.

| Sprint | Inhalt | Aufwand |
|---|---|---|
| 1 | Backup, Löschfristen, Login-Härtung, `xlsx` raus | ~10 h |
| 2 | CI, Integrationstests, Lint | ~10 h |
| 3 | Guard-Helper, Validierung, Kartennummern, Kleinkram | ~7 h |
| 4 | Kalibrierungs-Nachweis, Healthcheck, README-Bilder | ~5 h |

**Arbeitsweise pro Sprint**

```bash
git checkout main && git pull
git checkout -b sprint-1-betrieb
# … Aufgaben abarbeiten, pro Aufgabe ein Commit …
npm run typecheck && npm test
git push -u origin sprint-1-betrieb
```

**Definition of Done (für jede Aufgabe)**
- `npm run typecheck` und `npm test` grün
- Akzeptanzkriterium der Aufgabe manuell oder per Test nachgewiesen
- ein Commit pro Aufgabe, Commit-Message beginnt mit der Aufgaben-ID (`S1-2: …`)

---

# Sprint 1 · Betrieb & Sicherheit

Ziel: Kein Datenverlustrisiko mehr, Löschfristen werden vollzogen, Login ist nicht mehr
unbegrenzt angreifbar, eine unglückliche Abhängigkeit ist weg.

---

## S1-1 · Backup mit getestetem Restore  ·  ~3 h

**Warum:** Ohne durchgespielten Restore gibt es kein Backup. Das ist das größte Einzelrisiko
im Projekt (`decisions.md`, Schritt 11 offen).

**Neu:** `scripts/backup.sh`, `scripts/restore-test.sh`

**Vorbereitung einmalig (lokal, nicht am Server):**
```bash
# Schlüsselpaar erzeugen – der PRIVATE Schlüssel bleibt auf deinem Rechner/Passwortmanager,
# NUR der öffentliche Schlüssel kommt auf den Server. Ein kompromittierter Server
# kann damit Backups schreiben, aber keine lesen.
age-keygen -o tdd-backup.key      # Ausgabe: "Public key: age1..."
```

```bash
#!/usr/bin/env bash
# scripts/backup.sh – täglich per Cron auf dem Server.
# Erwartet: AGE_RECIPIENT (öffentlicher age-Schlüssel), optional RCLONE_REMOTE.
set -euo pipefail

PG_CONTAINER="${PG_CONTAINER:-tdd-postgres}"
PG_USER="${PG_USER:-tdd_owner}"
PG_DB="${PG_DB:-tdd}"
UPLOAD_VOLUME="${UPLOAD_VOLUME:-tdd-uploads}"
OUT="${BACKUP_DIR:-$HOME/backups/tdd}"
KEEP_DAYS="${KEEP_DAYS:-14}"
STAMP="$(date -u +%Y%m%dT%H%M%SZ)"

: "${AGE_RECIPIENT:?AGE_RECIPIENT (age1...) muss gesetzt sein}"
mkdir -p "$OUT"

# 1) Datenbank (Custom-Format, erlaubt selektives Restore)
docker exec "$PG_CONTAINER" pg_dump -U "$PG_USER" -Fc "$PG_DB" \
  | age -r "$AGE_RECIPIENT" -o "$OUT/db-$STAMP.dump.age"

# 2) Uploads (Fotos/Scans) aus dem Docker-Volume
docker run --rm -v "$UPLOAD_VOLUME":/data:ro alpine tar czf - -C /data . \
  | age -r "$AGE_RECIPIENT" -o "$OUT/uploads-$STAMP.tgz.age"

# 3) Offsite (nur wenn konfiguriert)
if [ -n "${RCLONE_REMOTE:-}" ]; then
  rclone copy "$OUT/db-$STAMP.dump.age"      "$RCLONE_REMOTE" --quiet
  rclone copy "$OUT/uploads-$STAMP.tgz.age"  "$RCLONE_REMOTE" --quiet
fi

# 4) Rotation lokal
find "$OUT" -name '*.age' -mtime +"$KEEP_DAYS" -delete

echo "Backup ok: db-$STAMP.dump.age ($(du -h "$OUT/db-$STAMP.dump.age" | cut -f1))"
```

```bash
#!/usr/bin/env bash
# scripts/restore-test.sh – stellt das jüngste Backup in eine Wegwerf-DB wieder her
# und prüft die Zeilenzahlen. Lokal ausführen (privater age-Schlüssel nötig).
# Aufruf: ./scripts/restore-test.sh ~/backups/tdd/db-2026….dump.age ~/tdd-backup.key
set -euo pipefail

DUMP="${1:?Pfad zum .dump.age angeben}"
KEY="${2:?Pfad zum privaten age-Schlüssel angeben}"
CONTAINER="tdd-restore-test"
PASS="restore-test"

cleanup() { docker rm -f "$CONTAINER" >/dev/null 2>&1 || true; }
trap cleanup EXIT

docker run -d --name "$CONTAINER" -e POSTGRES_PASSWORD="$PASS" -e POSTGRES_USER=tdd_owner \
  -e POSTGRES_DB=tdd postgres:16-alpine >/dev/null
until docker exec "$CONTAINER" pg_isready -U tdd_owner -q; do sleep 1; done

age -d -i "$KEY" "$DUMP" | docker exec -i "$CONTAINER" pg_restore -U tdd_owner -d tdd --no-owner

echo "── Wiederhergestellter Bestand ──────────────────────────"
docker exec "$CONTAINER" psql -U tdd_owner -d tdd -Atc "
  SELECT 'personen=' || (SELECT count(*) FROM persons WHERE deleted_at IS NULL)
      || ' karten='  || (SELECT count(*) FROM cards WHERE status='AKTIV')
      || ' ausgaben='|| (SELECT count(*) FROM distributions)
      || ' benutzer='|| (SELECT count(*) FROM users)"
echo "── Restore erfolgreich ──────────────────────────────────"
```

**Cron auf dem Server** (`crontab -e` als `dario`):
```cron
AGE_RECIPIENT=age1xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
30 2 * * * /home/dario/projects/tdd/scripts/backup.sh >> /home/dario/backup.log 2>&1
```

**Akzeptanz:** `scripts/restore-test.sh` läuft lokal durch und gibt Zeilenzahlen aus, die zum
Produktivbestand passen. Termin im Kalender: alle 3 Monate wiederholen.

---

## S1-2 · Löschfristen tatsächlich vollziehen  ·  ~3 h

**Warum:** `retention_until` wird gesetzt und beim manuellen Purge geprüft — aber **nichts löscht
automatisch**. Rohscans mit 90-Tage-Frist liegen unbegrenzt auf der Platte. Art. 5 Abs 1 lit e
DSGVO verlangt den Vollzug, nicht das Feld.
**Zweiter Befund:** `purgePersons` löscht `scan_documents`-Zeilen, aber nie die zugehörigen
**Dateien** — jeder Hard-Delete hinterlässt verwaiste PII-Dateien im Volume.

### a) Token-Prüfung zentralisieren (Header statt URL)

**Neu:** `apps/web/src/lib/job-auth.ts`
```ts
import { timingSafeEqual } from "node:crypto";

/**
 * Prüft den Job-Token aus dem Authorization-Header (Bearer).
 * Bewusst kein Query-Parameter mehr: Tokens in URLs landen in Zugriffslogs.
 */
export function requireJobToken(req: Request): Response | null {
  const expected = process.env.JOB_TOKEN;
  if (!expected) return new Response("Forbidden", { status: 403 });
  const got = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? "";
  const a = Buffer.from(got);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return new Response("Forbidden", { status: 403 });
  return null; // null = erlaubt
}
```

**Ändern:** `api/jobs/expiry/route.ts` und `api/jobs/cleanup/route.ts` — die ersten vier Zeilen
des Handlers ersetzen durch:
```ts
import { requireJobToken } from "@/lib/job-auth";
// …
export async function GET(req: Request) {
  const denied = requireJobToken(req);
  if (denied) return denied;
  // … unverändert weiter …
```

**Cron-Zeilen entsprechend anpassen:**
```cron
0 3 * * * curl -sS -H "Authorization: Bearer $JOB_TOKEN" http://127.0.0.1:3080/api/jobs/expiry
15 3 * * * curl -sS -H "Authorization: Bearer $JOB_TOKEN" http://127.0.0.1:3080/api/jobs/cleanup
45 3 * * * curl -sS -H "Authorization: Bearer $JOB_TOKEN" http://127.0.0.1:3080/api/jobs/retention
```

### b) Purge-Logik in eine Bibliothek ziehen (inkl. Dateien)

**Neu:** `apps/web/src/lib/purge.ts`
```ts
import { unlink } from "node:fs/promises";
import { join } from "node:path";
import { sql } from "drizzle-orm";
import { db } from "./db";

/**
 * Entfernt Personen (Selektor auf persons.id) samt referenzierender Daten in
 * Abhängigkeitsreihenfolge – und löscht die zugehörigen Scan-DATEIEN von der Platte.
 * Anträge bleiben als Org-Akte erhalten, nur der Personenbezug wird gelöst.
 */
export async function purgePersons(idSel: ReturnType<typeof sql>): Promise<{ persons: number; files: number }> {
  const refs = await db().transaction(async (tx) => {
    await tx.execute(sql`UPDATE antraege SET transferred_person_id = NULL WHERE transferred_person_id ${idSel}`);
    await tx.execute(sql`DELETE FROM duplicate_decisions WHERE created_person_id ${idSel} OR matched_person_id ${idSel}`);
    const scans = await tx.execute(sql`DELETE FROM scan_documents WHERE person_id ${idSel} RETURNING file_ref`);
    await tx.execute(sql`DELETE FROM distributions WHERE person_id ${idSel}`);
    await tx.execute(sql`UPDATE cards SET predecessor_card_id = NULL WHERE predecessor_card_id IN (SELECT id FROM cards WHERE person_id ${idSel})`);
    await tx.execute(sql`DELETE FROM cards WHERE person_id ${idSel}`);
    await tx.execute(sql`DELETE FROM person_location_assignments WHERE person_id ${idSel}`);
    const del = await tx.execute(sql`DELETE FROM persons WHERE id ${idSel} RETURNING id`);
    return {
      fileRefs: (scans as unknown as { file_ref: string }[]).map((s) => s.file_ref),
      count: (del as unknown as { id: string }[]).length,
    };
  });
  const files = await deleteFiles(refs.fileRefs);
  return { persons: refs.count, files };
}

/** Löscht Dateien unterhalb von STORAGE_DIR. Fehlende Dateien sind kein Fehler. */
export async function deleteFiles(fileRefs: string[]): Promise<number> {
  const base = process.env.STORAGE_DIR ?? "./data/uploads";
  let n = 0;
  for (const ref of fileRefs) {
    if (!ref || ref.includes("..")) continue; // Pfad-Sicherheit wie in den Datei-Routen
    try { await unlink(join(base, ref)); n++; } catch { /* schon weg – ok */ }
  }
  return n;
}
```

**Ändern:** `app/(app)/personen/papierkorb/actions.ts` — die private `purgePersons`-Funktion am
Dateiende **löschen** und stattdessen importieren:
```ts
import { purgePersons } from "@/lib/purge";
```
Die beiden Aufrufstellen liefern jetzt ein Objekt statt einer Zahl:
```ts
const res = await purgePersons(sql`IN (SELECT id FROM persons WHERE deleted_at IS NOT NULL AND (retention_until IS NULL OR retention_until <= current_date))`);
await audit({ actorUserId: user.id, action: "person.archive.empty", entityType: "person", after: res });
```

### c) Der eigentliche Löschjob

**Neu:** `apps/web/src/app/api/jobs/retention/route.ts`
```ts
import { sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import { requireJobToken } from "@/lib/job-auth";
import { purgePersons, deleteFiles } from "@/lib/purge";

/**
 * DSGVO-Löschjob (Art. 5 Abs 1 lit e – Speicherbegrenzung). Täglich per Cron:
 *   curl -H "Authorization: Bearer $JOB_TOKEN" http://127.0.0.1:3080/api/jobs/retention
 *
 * 1) Rohscans, deren Aufbewahrungsfrist (90 Tage) abgelaufen ist – Zeile UND Datei.
 * 2) Archivierte Personen, deren Frist (3 Jahre) abgelaufen ist – vollständig.
 */
export async function GET(req: Request) {
  const denied = requireJobToken(req);
  if (denied) return denied;

  // 1) Abgelaufene Rohscans (auch solche ohne Personenbezug)
  const scans = await db().execute(sql`
    DELETE FROM scan_documents
    WHERE retention_until IS NOT NULL AND retention_until <= current_date
    RETURNING file_ref`);
  const scanRefs = (scans as unknown as { file_ref: string }[]).map((s) => s.file_ref);
  const scanFiles = await deleteFiles(scanRefs);

  // 2) Archivierte Personen nach Ablauf der Aufbewahrungsfrist
  const purged = await purgePersons(sql`IN (
    SELECT id FROM persons
    WHERE deleted_at IS NOT NULL
      AND retention_until IS NOT NULL
      AND retention_until <= current_date)`);

  const result = { scans: scanRefs.length, scanFiles, persons: purged.persons, personFiles: purged.files };
  await audit({ action: "job.retention", entityType: "job", after: result });
  return Response.json(result);
}
```

**Bekannte Lücke, bewusst offen:** `antrag_documents` trägt ebenfalls `retention_until`, steht
aber unter RLS — ohne gesetztes `app.org_id` sieht `tdd_app` dort nichts, ein `DELETE` träfe null
Zeilen. Sauber wäre eine `SECURITY DEFINER`-Funktion `purge_expired_antrag_documents()`, die
RLS kontrolliert umgeht und nur `file_ref`s zurückgibt. Als Aufgabe für Sprint 3 notieren, nicht
still übergehen.

**Akzeptanz:**
```bash
# Testfall bauen und Job laufen lassen
psql "$DATABASE_URL" -c "UPDATE scan_documents SET retention_until = current_date - 1 WHERE id = '<id>';"
curl -sS -H "Authorization: Bearer $JOB_TOKEN" http://127.0.0.1:3080/api/jobs/retention
# → {"scans":1,"scanFiles":1,...}; Datei ist aus dem Volume verschwunden
curl -sS http://127.0.0.1:3080/api/jobs/retention        # ohne Header → 403
```

---

## S1-3 · Login-Härtung (Zähler + Sperre)  ·  ~2 h

**Warum:** `failed_attempts` wird bei Erfolg auf 0 gesetzt, aber nie hochgezählt. Aktuell kann
ein Passwort unbegrenzt schnell durchprobiert werden.

**Neu:** `packages/db/sql/025_login_hardening.sql`
```sql
-- ════════════════════════════════════════════════════════════════════════
--  025_login_hardening.sql · Sperre nach zu vielen Fehlversuchen
-- ════════════════════════════════════════════════════════════════════════
ALTER TABLE users ADD COLUMN IF NOT EXISTS locked_until timestamptz;
CREATE INDEX IF NOT EXISTS idx_users_locked ON users (locked_until) WHERE locked_until IS NOT NULL;
```

**Ändern:** `packages/db/src/schema.ts`, in `users` nach `failedAttempts`:
```ts
  lockedUntil: timestamp("locked_until", { withTimezone: true }),
```

**Ändern:** `apps/web/src/lib/auth.ts` — `login()` vollständig ersetzen:
```ts
const MAX_ATTEMPTS = 5;
const LOCK_MINUTES = 15;

/**
 * Prüft E-Mail/Passwort (und optional die gewählte Organisation) und setzt die Session.
 * Nach MAX_ATTEMPTS Fehlversuchen wird das Konto LOCK_MINUTES lang gesperrt.
 * Die Rückmeldung nach außen bleibt immer generisch (keine Konto-Aufzählung).
 */
export async function login(email: string, password: string, orgId?: number | null): Promise<CurrentUser | null> {
  const rows = await db().select().from(users).where(eq(users.email, email.toLowerCase())).limit(1);
  const u = rows[0];
  if (!u || !u.isActive) return null;

  // Gesperrt? Dann gar nicht erst prüfen (kostet auch keine argon2-Zeit).
  if (u.lockedUntil && u.lockedUntil > new Date()) return null;

  // Gewählte Organisation muss zur Person gehören (verhindert falschen Org-Kontext)
  if (orgId != null && u.organizationId !== orgId) return null;

  const ok = await verify(u.passwordHash, password).catch(() => false);
  if (!ok) {
    const attempts = u.failedAttempts + 1;
    const locked = attempts >= MAX_ATTEMPTS;
    await db().update(users).set({
      failedAttempts: locked ? 0 : attempts,               // nach der Sperre wieder bei 0 zählen
      lockedUntil: locked ? new Date(Date.now() + LOCK_MINUTES * 60_000) : null,
    }).where(eq(users.id, u.id));
    await audit({
      actorUserId: u.id, action: locked ? "login.locked" : "login.failed",
      entityType: "user", entityId: u.id, after: { attempts },
    });
    return null;
  }

  const store = await cookies();
  store.set(SESSION_COOKIE, signSession({ uid: u.id, role: u.role, orgId: u.organizationId ?? null }), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_MAX_AGE,
  });
  await db().update(users).set({ lastLogin: new Date(), failedAttempts: 0, lockedUntil: null }).where(eq(users.id, u.id));

  return loadUser(eq(users.id, u.id));
}
```
Dazu oben in `auth.ts` ergänzen:
```ts
import { audit } from "./audit";
```

**Bewusste Entscheidung:** Die Fehlermeldung im Login bleibt „E-Mail, Passwort oder Organisation
ist falsch." — auch bei Sperre. Eine Meldung „Konto gesperrt" wäre freundlicher, verrät aber,
dass die Adresse existiert. Der Weg für Betroffene ist „Passwort vergessen" (setzt beim Reset
`locked_until` nicht — deshalb dort ergänzen):
```ts
// login/actions.ts → resetPassword(), im update mit ergänzen:
.set({ passwordHash: await hash(pw), failedAttempts: 0, lockedUntil: null })
```

**Akzeptanz:** Sechs Fehlversuche in Folge → auch mit dem *richtigen* Passwort kommt 15 Minuten
lang keine Anmeldung zustande; `audit_logs` enthält `login.failed` (5×) und `login.locked` (1×).

---

## S1-4 · `xlsx` (SheetJS) durch `exceljs` ersetzen  ·  ~2 h

**Warum:** Die npm-Registry-Version von SheetJS wird nicht mehr gepflegt und hat bekannte
Advisories. `exceljs` ist für die Exporte ohnehin schon im Projekt — eine Bibliothek weniger.

**Ändern:** `apps/web/src/app/(app)/admin/import/actions.ts` — Import-Zeile und `parseWorkbook`
ersetzen:
```ts
import ExcelJS from "exceljs";
import { Readable } from "node:stream";
```

```ts
/** Zellwert auf einen einfachen Wert reduzieren (Formeln, RichText, Hyperlinks). */
function cellValue(v: ExcelJS.CellValue): unknown {
  if (v == null) return null;
  if (v instanceof Date) return v;
  if (typeof v === "object") {
    if ("richText" in v) return v.richText.map((r) => r.text).join("");
    if ("result" in v) return v.result ?? null;
    if ("text" in v) return v.text;
    return null;
  }
  return v;
}

/** Liest das erste Blatt als Liste von {Spaltenüberschrift: Wert}. */
async function readSheet(buf: Buffer, isCsv: boolean): Promise<Record<string, unknown>[]> {
  const wb = new ExcelJS.Workbook();
  const sheet = isCsv
    ? await wb.csv.read(Readable.from(buf.toString("utf8")))
    : (await wb.xlsx.load(buf)).worksheets[0];
  if (!sheet) return [];

  const headers: string[] = [];
  sheet.getRow(1).eachCell({ includeEmpty: false }, (cell, col) => {
    headers[col] = String(cellValue(cell.value) ?? "").trim();
  });

  const out: Record<string, unknown>[] = [];
  sheet.eachRow({ includeEmpty: false }, (row, rowNumber) => {
    if (rowNumber === 1) return;
    const obj: Record<string, unknown> = {};
    let empty = true;
    for (let col = 1; col < headers.length; col++) {
      const key = headers[col];
      if (!key) continue;
      const value = cellValue(row.getCell(col).value);
      obj[key] = value;
      if (value != null && String(value).trim() !== "") empty = false;
    }
    if (!empty) out.push(obj);
  });
  return out;
}

async function parseWorkbook(buf: Buffer, filename: string): Promise<{ headers: string[]; cols: Record<Field, string | null>; rows: ParsedRow[] }> {
  const json = await readSheet(buf, filename.toLowerCase().endsWith(".csv"));
  const headers = json.length ? Object.keys(json[0]!) : [];
  const cols = detectColumns(headers);
  const get = (row: Record<string, unknown>, f: Field) => (cols[f] ? row[cols[f]!] : null);

  const rows: ParsedRow[] = json.map((row) => {
    // … Rumpf unverändert aus der bisherigen Fassung übernehmen …
  });
  return { headers, cols, rows };
}
```

**Beide Aufrufstellen** (`analyzeImport`, `commitImport`) auf `await` umstellen:
```ts
const { headers, cols, rows } = await parseWorkbook(buf, file.name);
```

**Ändern:** `apps/web/src/app/(app)/admin/import/ImportClient.tsx`
```tsx
accept=".xlsx,.csv"
```
und den Hinweistext ergänzen: „Alte `.xls`-Dateien bitte vorher in Excel als `.xlsx` speichern."

**Ändern:** `apps/web/package.json` — Zeile `"xlsx": "^0.18.5",` **entfernen**, dann:
```bash
npm install
npm audit --omit=dev        # sollte für xlsx nichts mehr melden
```

**Akzeptanz:** `docs/beispiel-import.xlsx` hochladen → dieselbe Vorschau wie bisher
(4 Personen, 1 Dublette „Mueller"), Import legt dieselben Datensätze an.

---

# Sprint 2 · Qualitätsnetz

Ziel: Nichts Kaputtes kommt mehr unbemerkt auf den Server, und die zentralen
Sicherheitszusagen sind automatisiert bewiesen statt einmalig manuell verifiziert.

---

## S2-1 · CI-Pipeline  ·  ~1 h  ·  größter Hebel pro Stunde

**Neu:** `.github/workflows/ci.yml`
```yaml
name: CI

on:
  push:
    branches: ["**"]
  pull_request:

jobs:
  check:
    name: Typecheck · Tests · Build
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: "22"
          cache: npm
      - run: npm ci
      - run: npm run typecheck
      - run: npm test
      - run: npm run build
        env:
          # Build rendert nichts Dynamisches, braucht aber gültig aussehende Werte.
          SESSION_SECRET: ci-dummy-secret-0123456789abcdef
          DATABASE_URL: postgresql://tdd_app:ci@127.0.0.1:5432/tdd

  integration:
    name: Integrationstests (echte Postgres)
    runs-on: ubuntu-latest
    services:
      postgres:
        image: postgres:16-alpine
        env:
          POSTGRES_USER: tdd_owner
          POSTGRES_PASSWORD: test
          POSTGRES_DB: tdd_test
        ports: ["5432:5432"]
        options: >-
          --health-cmd pg_isready
          --health-interval 5s
          --health-timeout 5s
          --health-retries 10
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: "22"
          cache: npm
      - run: npm ci
      - run: npm run test:integration -w @tdd/web
```

**Akzeptanz:** Ein absichtlich eingebauter Typfehler lässt die Pipeline rot werden.

---

## S2-2 · Integrationstests gegen echte Postgres  ·  ~6 h  ·  wertvollste Aufgabe im Plan

**Warum:** RLS-Trennung, die PII-Barriere von `tdd_ops` und die Idempotenz der Ausgabe sind die
drei Zusagen, an denen das System hängt. Bisher sind sie einmal manuell geprüft worden.

**Neu:** `apps/web/vitest.integration.config.ts`
```ts
import { defineConfig } from "vitest/config";
import path from "node:path";
import { fileURLToPath } from "node:url";

const dir = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  test: {
    include: ["test/integration/**/*.test.ts"],
    environment: "node",
    hookTimeout: 120_000,   // Migrationen brauchen beim ersten Lauf etwas
    fileParallelism: false, // eine gemeinsame Test-DB
  },
  resolve: { alias: { "@": path.resolve(dir, "src") } },
});
```

**Ändern:** `apps/web/package.json`, Skripte:
```json
    "test": "vitest run",
    "test:integration": "vitest run --config vitest.integration.config.ts",
```

**Neu:** `apps/web/test/integration/db.ts`
```ts
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import postgres from "postgres";

const SQL_DIR = join(process.cwd(), "..", "..", "packages", "db", "sql");
const HOST = process.env.TEST_PG_HOST ?? "127.0.0.1:5432";
const DBNAME = process.env.TEST_PG_DB ?? "tdd_test";

export const adminUrl = () => `postgresql://tdd_owner:test@${HOST}/${DBNAME}`;
export const appUrl = () => `postgresql://tdd_app:test@${HOST}/${DBNAME}`;
export const opsUrl = () => `postgresql://tdd_ops:test@${HOST}/${DBNAME}`;

/** Spielt alle SQL-Migrationen der Reihe nach ein und setzt die Rollen-Passwörter. */
export async function applyMigrations(): Promise<void> {
  const admin = postgres(adminUrl(), { max: 1 });
  try {
    const files = readdirSync(SQL_DIR).filter((f) => f.endsWith(".sql")).sort();
    for (const file of files) {
      await admin.unsafe(readFileSync(join(SQL_DIR, file), "utf8"));
    }
    await admin.unsafe("ALTER ROLE tdd_app PASSWORD 'test'; ALTER ROLE tdd_ops PASSWORD 'test';");
  } finally {
    await admin.end();
  }
}
```

**Neu:** `apps/web/test/integration/rls.test.ts`
```ts
import { beforeAll, expect, test } from "vitest";
import postgres from "postgres";
import { applyMigrations, appUrl } from "./db";

beforeAll(applyMigrations);

test("RLS trennt Mandanten strikt", async () => {
  const sql = postgres(appUrl(), { max: 1 });
  try {
    const orgs = await sql<{ id: number }[]>`SELECT id FROM organizations WHERE type = 'GEMEINDE' ORDER BY id LIMIT 2`;
    expect(orgs.length).toBe(2);
    const [a, b] = orgs;

    // Antrag im Kontext von Organisation A anlegen
    await sql.begin(async (tx) => {
      await tx`SELECT set_config('app.org_id', ${String(a!.id)}, true)`;
      await tx`INSERT INTO antraege (organization_id, first_name, last_name)
               VALUES (${a!.id}, 'Test', 'Mandant-A')`;
    });

    // Aus Sicht von Organisation B darf er nicht existieren
    const foreign = await sql.begin(async (tx) => {
      await tx`SELECT set_config('app.org_id', ${String(b!.id)}, true)`;
      return tx`SELECT id FROM antraege WHERE last_name = 'Mandant-A'`;
    });
    expect(foreign.length).toBe(0);

    // Ohne Org-Kontext ebenfalls nicht
    const noCtx = await sql`SELECT id FROM antraege WHERE last_name = 'Mandant-A'`;
    expect(noCtx.length).toBe(0);
  } finally {
    await sql.end();
  }
});
```

**Neu:** `apps/web/test/integration/ops-role.test.ts`
```ts
import { beforeAll, expect, test } from "vitest";
import postgres from "postgres";
import { applyMigrations, opsUrl } from "./db";

beforeAll(applyMigrations);

test("tdd_ops kommt an keine Personendaten, aber an Kennzahlen", async () => {
  const sql = postgres(opsUrl(), { max: 1 });
  try {
    for (const table of ["persons", "cards", "distributions", "scan_documents", "antraege"]) {
      await expect(sql.unsafe(`SELECT * FROM ${table} LIMIT 1`)).rejects.toThrow(/permission denied/i);
    }
    const counts = await sql`SELECT * FROM v_system_counts`;
    expect(counts.length).toBe(1);
  } finally {
    await sql.end();
  }
});
```

**Neu:** `apps/web/test/integration/distribution.test.ts`
```ts
import { beforeAll, expect, test } from "vitest";
import postgres from "postgres";
import { applyMigrations, appUrl } from "./db";

beforeAll(applyMigrations);

test("gleicher client_ref bucht die Ausgabe nur einmal", async () => {
  const sql = postgres(appUrl(), { max: 1 });
  try {
    const [loc] = await sql<{ id: number }[]>`
      INSERT INTO locations (name, type, city, location_code)
      VALUES ('Testort', 'AUSGABESTELLE', 'Testdorf', 999)
      ON CONFLICT (name) DO UPDATE SET city = EXCLUDED.city RETURNING id`;
    const [person] = await sql<{ id: string }[]>`
      INSERT INTO persons (first_name, last_name) VALUES ('Test', 'Idempotenz') RETURNING id`;
    const [card] = await sql<{ id: string }[]>`
      INSERT INTO cards (card_number, person_id, location_id, valid_from, valid_to)
      VALUES ('2999000000015', ${person!.id}, ${loc!.id}, current_date, current_date + 180) RETURNING id`;

    const ref = crypto.randomUUID();
    for (let i = 0; i < 2; i++) {
      await sql`INSERT INTO distributions (card_id, person_id, location_id, client_ref)
                VALUES (${card!.id}, ${person!.id}, ${loc!.id}, ${ref})
                ON CONFLICT (client_ref) DO NOTHING`;
    }
    const rows = await sql`SELECT id FROM distributions WHERE client_ref = ${ref}`;
    expect(rows.length).toBe(1);
  } finally {
    await sql.end();
  }
});
```

**Neu:** `apps/web/test/rbac.test.ts` (reiner Unit-Test, läuft in `npm test` mit)
```ts
import { describe, expect, test } from "vitest";
import { hasPermission, permissionsFor, type Role } from "@/lib/rbac";

describe("Rechtematrix", () => {
  test("Kasse sieht keine Personenlisten und keine Dokumente", () => {
    expect(hasPermission("AUSGABE", "person:read")).toBe(false);
    expect(hasPermission("AUSGABE", "document:view")).toBe(false);
    expect(hasPermission("AUSGABE", "distribution:record")).toBe(true);
  });

  test("Erfassung darf keine Dokumente sehen", () => {
    expect(hasPermission("ERFASSUNG", "document:view")).toBe(false);
  });

  test("Sachbearbeiter bleibt im Portal", () => {
    expect(permissionsFor("SACHBEARBEITER")).toEqual(["antrag:manage", "document:view"]);
    expect(hasPermission("SACHBEARBEITER", "person:read")).toBe(false);
  });

  test("nur ADMIN darf verwalten", () => {
    const roles: Role[] = ["ERFASSUNG", "AUSGABE", "AUSWERTUNG", "SACHBEARBEITER"];
    for (const r of roles) expect(hasPermission(r, "admin:manage")).toBe(false);
    expect(hasPermission("ADMIN", "admin:manage")).toBe(true);
  });
});
```

**Lokal ausführen:**
```bash
docker run -d --name tdd-test-db -p 5432:5432 \
  -e POSTGRES_USER=tdd_owner -e POSTGRES_PASSWORD=test -e POSTGRES_DB=tdd_test postgres:16-alpine
npm run test:integration -w @tdd/web
docker rm -f tdd-test-db
```

**Akzeptanz:** Alle vier Testdateien grün. Gegenprobe: In `002_roles.sql` das `REVOKE` auskommentieren
→ `ops-role.test.ts` wird rot. (Danach zurücknehmen!)

---

## S2-3 · ESLint + Prettier  ·  ~1,5 h

**Warum:** Nicht wegen Stil — wegen `no-floating-promises`. Bei der Menge an `await db()`-Aufrufen
findet die Regel echte Fehler (vergessenes `await` bei Schreiboperationen).

```bash
npm i -D -w @tdd/web eslint @eslint/js typescript-eslint eslint-config-next prettier
```

**Neu:** `eslint.config.mjs` (Repo-Wurzel)
```js
import js from "@eslint/js";
import ts from "typescript-eslint";

export default [
  { ignores: ["**/.next/**", "**/node_modules/**", "**/dist/**", "apps/web/public/**"] },
  js.configs.recommended,
  ...ts.configs.recommendedTypeChecked,
  {
    languageOptions: { parserOptions: { projectService: true, tsconfigRootDir: import.meta.dirname } },
    rules: {
      "@typescript-eslint/no-floating-promises": "error",
      "@typescript-eslint/no-misused-promises": "error",
      "@typescript-eslint/require-await": "off",
      "@typescript-eslint/no-unsafe-assignment": "off", // rohe SQL-Ergebnisse sind bewusst `unknown`
      "@typescript-eslint/no-unsafe-member-access": "off",
    },
  },
];
```

**Neu:** `.prettierrc.json`
```json
{ "printWidth": 120, "semi": true, "singleQuote": false, "trailingComma": "all" }
```

**Ändern:** Wurzel-`package.json`, Skripte ergänzen:
```json
    "lint": "eslint .",
    "format": "prettier --write \"**/*.{ts,tsx,md,json,css}\""
```

Dann in `.github/workflows/ci.yml` nach `npm run typecheck` einfügen:
```yaml
      - run: npm run lint
```

**Akzeptanz:** `npm run lint` läuft durch. Erwartung: Die ersten Läufe finden echte Fundstellen —
diese fixen, **nicht** die Regel abschalten.

---

# Sprint 3 · Konsistenz & Robustheit

Ziel: Wiederholungen zusammenführen, die kleinen bekannten Mängel abräumen.

---

## S3-1 · Zentraler Berechtigungs-Guard  ·  ~2 h

**Warum:** Das Paar `getCurrentUser()` + `hasPermission()` steht in 47 Dateien, jedes Mal leicht
anders. Eine vergessene Prüfung fällt so nicht auf.

**Neu:** `apps/web/src/lib/guard.ts`
```ts
import { getCurrentUser, type CurrentUser } from "./auth";
import { hasPermission, type Permission } from "./rbac";

/** Fehlende Berechtigung – bewusst ohne Detail nach außen. */
export class Forbidden extends Error {
  constructor() { super("Keine Berechtigung"); this.name = "Forbidden"; }
}

/**
 * Liefert den angemeldeten Benutzer oder wirft. Mehrere Rechte = ODER
 * (z. B. Kiosk-Kartenausstellung: distribution:record ODER card:manage).
 */
export async function requirePermission(...perms: Permission[]): Promise<CurrentUser> {
  const user = await getCurrentUser();
  if (!user) throw new Forbidden();
  if (perms.length && !perms.some((p) => hasPermission(user.role, p))) throw new Forbidden();
  return user;
}

/** Wie requirePermission, aber ohne Wurf – für Actions mit Result-Rückgabe. */
export async function tryPermission(...perms: Permission[]): Promise<CurrentUser | null> {
  try { return await requirePermission(...perms); } catch { return null; }
}
```

**Fundstellen finden:**
```bash
grep -rn "hasPermission" apps/web/src/app --include=*.ts --include=*.tsx | cut -d: -f1 | sort -u
```

**Muster der Umstellung** – aus
```ts
async function guard() {
  const user = await getCurrentUser();
  if (!user || !hasPermission(user.role, "distribution:record")) throw new Error("Keine Berechtigung");
  return user;
}
```
wird
```ts
import { requirePermission } from "@/lib/guard";
const guard = () => requirePermission("distribution:record");
```

**Akzeptanz:** `grep -rn "Keine Berechtigung" apps/web/src/app | wc -l` geht deutlich zurück;
`npm test` und `npm run test:integration` bleiben grün.

---

## S3-2 · Eingabevalidierung mit zod  ·  ~2 h

**Warum:** `zod` ist als Abhängigkeit deklariert, aber nirgends benutzt; validiert wird mit
`s()`/`n()`/`i()`-Helfern, die in mehreren Actions dupliziert sind.

**Neu:** `apps/web/src/lib/forms.ts`
```ts
import { z } from "zod";

/** Leerer String → null (FormData liefert nie undefined). */
const optionalText = z.string().trim().transform((v) => (v === "" ? null : v)).nullable();
const money = z.coerce.number().finite().nonnegative().catch(0);
const count = z.coerce.number().int().nonnegative().catch(0);

export const personSchema = z.object({
  firstName: z.string().trim().min(1, "Vorname fehlt"),
  lastName: z.string().trim().min(1, "Nachname fehlt"),
  address: optionalText,
  postalCode: optionalText,
  city: optionalText,
  birthDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Datum im Format JJJJ-MM-TT").nullable().catch(null),
  phone: optionalText,
  email: z.string().email("E-Mail ungültig").nullable().catch(null),
  householdSize: count,
  childrenCount: count,
});

export const antragFinanzSchema = z.object({
  adults: count.default(1),
  childrenU12: count,
  childrenO12: count,
});

export type PersonInput = z.infer<typeof personSchema>;
export { money };

/** FormData → Objekt, damit zod es parsen kann. */
export function formObject(fd: FormData): Record<string, unknown> {
  return Object.fromEntries([...fd.entries()].map(([k, v]) => [k, typeof v === "string" ? v : null]));
}

/** Einheitliches Ergebnis für Server Actions. */
export type ActionResult<T> = { ok: true; data: T } | { ok: false; error: string };

export function parseForm<T>(schema: z.ZodType<T>, fd: FormData): ActionResult<T> {
  const res = schema.safeParse(formObject(fd));
  if (res.success) return { ok: true, data: res.data };
  const first = res.error.issues[0];
  return { ok: false, error: first?.message ?? "Eingabe ungültig" };
}
```

**Anwenden auf** `personen/neu/actions.ts` und `portal/neu/actions.ts` (die lokalen `s()`/`n()`/`i()`
dort entfernen). Danach:
```bash
grep -rn "function s(fd: FormData" apps/web/src   # muss leer sein
```

**Akzeptanz:** Eine Person mit leerem Nachnamen anlegen → Formular zeigt „Nachname fehlt" statt
einer generischen Fehlerseite.

---

## S3-3 · Kartennummern über eine Sequenz  ·  ~1,5 h

**Warum:** `nextCardNumber` zählt `count(*)` und probiert bis zu 100 Nummern einzeln durch;
bei gleichzeitiger Ausstellung an zwei Tresen entscheidet der Unique-Constraint, ein Retry gibt es nicht.

**Neu:** `packages/db/sql/026_card_sequences.sql`
```sql
-- ════════════════════════════════════════════════════════════════════════
--  026_card_sequences.sql · Atomare Nummernvergabe je Standort
-- ════════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS card_sequences (
  location_code smallint PRIMARY KEY,
  next_value    bigint NOT NULL DEFAULT 1
);

-- Bestand übernehmen: höchste bereits vergebene laufende Nummer je Standort.
INSERT INTO card_sequences (location_code, next_value)
SELECT substring(card_number FROM 2 FOR 3)::smallint,
       MAX(substring(card_number FROM 5 FOR 8)::bigint) + 1
FROM cards
WHERE card_number ~ '^2[0-9]{12}$'
GROUP BY 1
ON CONFLICT (location_code) DO UPDATE
  SET next_value = GREATEST(card_sequences.next_value, EXCLUDED.next_value);

-- Atomar: sperrt die Zeile, erhöht, gibt die vergebene Nummer zurück.
CREATE OR REPLACE FUNCTION next_card_sequence(p_code smallint) RETURNS bigint
LANGUAGE sql AS $$
  INSERT INTO card_sequences (location_code, next_value) VALUES (p_code, 2)
  ON CONFLICT (location_code) DO UPDATE SET next_value = card_sequences.next_value + 1
  RETURNING next_value - 1;
$$;

GRANT SELECT, INSERT, UPDATE ON card_sequences TO tdd_app;
GRANT EXECUTE ON FUNCTION next_card_sequence(smallint) TO tdd_app;
REVOKE ALL ON card_sequences FROM tdd_ops;
```

**Ändern:** `apps/web/src/lib/cards.ts`
```ts
import { sql } from "drizzle-orm";
import { buildCardNumber } from "@tdd/core";
import { db } from "./db";

/** Nächste EAN-13-Kartennummer für eine Standort-Kennung (atomar, kollisionsfrei). */
export async function nextCardNumber(locationCode: number): Promise<string> {
  const res = await db().execute(sql`SELECT next_card_sequence(${locationCode}::smallint) AS seq`);
  const seq = Number((res as unknown as { seq: string | number }[])[0]?.seq ?? 0);
  if (!seq) throw new Error("Kartennummer konnte nicht vergeben werden");
  return buildCardNumber(locationCode, seq);
}

/** Addiert Monate zu einem ISO-Datum (yyyy-mm-dd), ohne Monatsende-Überlauf. */
export function addMonths(isoDate: string, months: number): string {
  const d = new Date(`${isoDate}T00:00:00Z`);
  const day = d.getUTCDate();
  d.setUTCDate(1);                                   // erst auf den 1. – verhindert den Überlauf
  d.setUTCMonth(d.getUTCMonth() + months);
  const lastOfMonth = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
  d.setUTCDate(Math.min(day, lastOfMonth));          // 31.08. + 6 Mon. → 28./29.02.
  return d.toISOString().slice(0, 10);
}
```

**Neu:** `apps/web/test/cards.test.ts`
```ts
import { expect, test } from "vitest";
import { addMonths } from "@/lib/cards";

test("addMonths klemmt auf das Monatsende statt überzulaufen", () => {
  expect(addMonths("2026-08-31", 6)).toBe("2027-02-28");
  expect(addMonths("2024-08-31", 6)).toBe("2025-02-28");
  expect(addMonths("2026-01-31", 1)).toBe("2026-02-28");
  expect(addMonths("2026-01-15", 6)).toBe("2026-07-15");
  expect(addMonths("2026-12-15", 1)).toBe("2027-01-15");
});
```

**Akzeptanz:** Test grün; zwei Karten kurz hintereinander ausstellen → aufeinanderfolgende
Nummern ohne Lücke; `SELECT * FROM card_sequences;` zeigt den fortgeschriebenen Stand.

---

## S3-4 · Kleinkram-Sammelaufgabe  ·  ~1,5 h

Vier kleine Punkte, ein Commit je Punkt.

**a) Middleware-Matcher umdrehen** (`apps/web/src/middleware.ts`) — statt einer Liste der
geschützten Bereiche (die bei jedem neuen Bereich vergessen wird) eine Liste der Ausnahmen:
```ts
export const config = {
  // Alles ist geschützt AUSSER: öffentliche Seiten, API-Routen (prüfen selbst), statische Assets.
  matcher: [
    "/((?!login|registrieren|passwort-vergessen|passwort-neu|konto-bestaetigen|datenschutz|anleitung|api/|_next/|favicon.ico|icon.svg|.*\\.webmanifest|sw.js|kiosk-sw.js).*)",
  ],
};
```
*Prüfen:* abgemeldet `/kiosk`, `/zeit`, `/personal`, `/stempeln`, `/druck/karte/x` aufrufen →
jeweils Weiterleitung auf `/login`; `/datenschutz` und `/login` bleiben erreichbar.

**b) Client-IP im Audit-Log** — `apps/web/src/lib/audit.ts` ergänzen:
```ts
import { headers } from "next/headers";

/** Client-IP aus dem Reverse-Proxy-Header (Caddy setzt X-Forwarded-For). */
export async function clientIp(): Promise<string | null> {
  try {
    const h = await headers();
    return h.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null;
  } catch {
    return null; // außerhalb eines Requests (z. B. Cron-Job)
  }
}
```
und in `audit()` den Default setzen:
```ts
    ip: entry.ip ?? (await clientIp()),
```

**c) Passwort-Mindestlänge vereinheitlichen** — `apps/web/src/lib/constants.ts`:
```ts
/** Mindestlänge für Passwörter – gilt für Registrierung, Reset und Selbst-Service. */
export const MIN_PASSWORD_LENGTH = 10;
```
In `login/actions.ts` (`resetPassword`, `registerSachbearbeiter`) und `konto/actions.ts` die
Zahlen `8` bzw. `10` durch `MIN_PASSWORD_LENGTH` ersetzen und die Meldung angleichen:
```ts
if (pw.length < MIN_PASSWORD_LENGTH) return { error: `Das Passwort muss mindestens ${MIN_PASSWORD_LENGTH} Zeichen haben.` };
```

**d) N+1 in der Tresen-Suche** (`apps/web/src/app/kiosk/actions.ts`, `searchByName`) — statt einer
Kartenabfrage je Treffer eine Abfrage mit `DISTINCT ON`:
```ts
  const ids = people.map((p) => p.id);
  if (ids.length === 0) return [];
  const cardRows = await db().execute(sql`
    SELECT DISTINCT ON (person_id) person_id, id, card_number, status, valid_to
    FROM cards
    WHERE person_id = ANY(${ids}::uuid[]) AND deleted_at IS NULL
    ORDER BY person_id, created_at DESC`);
  const byPerson = new Map((cardRows as unknown as {
    person_id: string; id: string; card_number: string; status: string; valid_to: string;
  }[]).map((c) => [c.person_id, c]));
  // … danach über `people` iterieren und `byPerson.get(p.id)` verwenden (kein `continue`-Sonderfall ändern) …
```

---

## S3-5 · Offene Lücke aus S1-2 schließen: Anträge-Dokumente  ·  ~1 h

**Neu:** `packages/db/sql/027_purge_antrag_documents.sql`
```sql
-- Löscht abgelaufene Antrags-Dokumente über alle Mandanten hinweg.
-- SECURITY DEFINER, weil RLS den Job sonst nichts sehen ließe. Gibt nur file_refs
-- zurück – keine Antragsinhalte.
CREATE OR REPLACE FUNCTION purge_expired_antrag_documents()
RETURNS TABLE(file_ref text)
LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  DELETE FROM antrag_documents
  WHERE retention_until IS NOT NULL AND retention_until <= current_date
  RETURNING file_ref;
$$;
GRANT EXECUTE ON FUNCTION purge_expired_antrag_documents() TO tdd_app;
```

**Ändern:** `api/jobs/retention/route.ts`, vor dem `audit(...)`:
```ts
  const docs = await db().execute(sql`SELECT * FROM purge_expired_antrag_documents()`);
  const docRefs = (docs as unknown as { file_ref: string }[]).map((d) => d.file_ref);
  const docFiles = await deleteFiles(docRefs);
```
und `docs: docRefs.length, docFiles` mit ins `result`-Objekt aufnehmen.

---

# Sprint 4 · Nachweis & Wirkung

Ziel: Das, was das System kann, wird belegbar und sichtbar.

---

## S4-1 · Dubletten-Engine kalibrieren und belegen  ·  ~3 h

**Warum:** Die Gewichte sind plausibel, aber nie gemessen. Das ist die Kennzahl, die das
Kernversprechen des Projekts trägt.

**Neu:** `scripts/dedupe-eval.ts` (Aufruf: `npx tsx scripts/dedupe-eval.ts pairs.csv`)
```ts
/**
 * Misst die Dubletten-Engine gegen manuell markierte Paare.
 * CSV-Format (Semikolon, mit Kopfzeile):
 *   vorname_a;nachname_a;gebdat_a;adresse_a;plz_a;vorname_b;nachname_b;gebdat_b;adresse_b;plz_b;dublette
 * Spalte `dublette`: 1 = ist dieselbe Person, 0 = ist es nicht.
 */
import { readFileSync } from "node:fs";
import { scoreCandidate, type PersonKey } from "../packages/core/src/index";

const file = process.argv[2];
if (!file) { console.error("Aufruf: npx tsx scripts/dedupe-eval.ts <pairs.csv>"); process.exit(1); }

const lines = readFileSync(file, "utf8").split(/\r?\n/).filter((l) => l.trim() !== "").slice(1);
const cases = lines.map((line) => {
  const c = line.split(";");
  const a: PersonKey = { firstName: c[0] ?? "", lastName: c[1] ?? "", birthDate: c[2] || null, address: c[3] || null, postalCode: c[4] || null };
  const b: PersonKey = { firstName: c[5] ?? "", lastName: c[6] ?? "", birthDate: c[7] || null, address: c[8] || null, postalCode: c[9] || null };
  return { a, b, isDup: (c[10] ?? "0").trim() === "1", score: scoreCandidate(a, b).score };
});

console.log(`Paare: ${cases.length} (davon ${cases.filter((c) => c.isDup).length} echte Dubletten)\n`);
console.log("Schwelle | Precision | Recall | F1    | FP | FN");
console.log("---------|-----------|--------|-------|----|----");
for (let t = 0.5; t <= 0.95001; t += 0.05) {
  const tp = cases.filter((c) => c.score >= t && c.isDup).length;
  const fp = cases.filter((c) => c.score >= t && !c.isDup).length;
  const fn = cases.filter((c) => c.score < t && c.isDup).length;
  const precision = tp + fp === 0 ? 1 : tp / (tp + fp);
  const recall = tp + fn === 0 ? 1 : tp / (tp + fn);
  const f1 = precision + recall === 0 ? 0 : (2 * precision * recall) / (precision + recall);
  const p = (v: number) => (v * 100).toFixed(1).padStart(5) + " %";
  console.log(`   ${t.toFixed(2)} | ${p(precision)}   | ${p(recall)} | ${f1.toFixed(3)} | ${String(fp).padStart(2)} | ${String(fn).padStart(2)}`);
}

// Fehlklassifikationen an der aktuellen HIGH-Schwelle zeigen
console.log("\nFalsch-Positive bei 0.85:");
for (const c of cases.filter((c) => c.score >= 0.85 && !c.isDup))
  console.log(`  ${c.score.toFixed(2)}  ${c.a.firstName} ${c.a.lastName} ≠ ${c.b.firstName} ${c.b.lastName}`);
console.log("\nÜbersehene Dubletten bei 0.85:");
for (const c of cases.filter((c) => c.score < 0.85 && c.isDup))
  console.log(`  ${c.score.toFixed(2)}  ${c.a.firstName} ${c.a.lastName} = ${c.b.firstName} ${c.b.lastName}`);
```

**Datengrundlage erzeugen** (ca. 100–200 Paare reichen): Batch-Report auf dem Produktivbestand
laufen lassen, Ergebnis als CSV exportieren, Spalte `dublette` von Hand füllen. **Nur pseudonymisiert
lokal**, nicht ins Repo committen — `pairs.csv` in `.gitignore` aufnehmen.

**Ergebnis dokumentieren:** die Tabelle nach `docs/BEGRUENDUNGEN.md`, Abschnitt 3.4, und einen Satz
ins README: „Gegen N markierte Paare: Recall X %, Precision Y % bei Schwelle 0.85."
Danach Punkt 12.1 im Begründungsdokument streichen — er ist dann erledigt.

---

## S4-2 · Healthcheck  ·  ~1 h

**Neu:** `apps/web/src/app/api/health/route.ts`
```ts
import { sql } from "drizzle-orm";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

/** Liveness/Readiness: DB erreichbar? Keine Fachdaten, kein Token nötig. */
export async function GET() {
  const started = Date.now();
  try {
    await db().execute(sql`SELECT 1`);
    return Response.json(
      { ok: true, db: "up", ms: Date.now() - started, version: process.env.NEXT_PUBLIC_APP_VERSION ?? "dev" },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch {
    return Response.json({ ok: false, db: "down" }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
}
```

**Ändern:** `docker/docker-compose.yml`, im `web`-Service:
```yaml
    healthcheck:
      test: ["CMD", "node", "-e", "fetch('http://127.0.0.1:3000/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"]
      interval: 30s
      timeout: 5s
      retries: 3
      start_period: 30s
```
und beim `postgres`-Service:
```yaml
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U tdd_owner -d tdd"]
      interval: 10s
      timeout: 5s
      retries: 5
```
Dazu `depends_on` im `web`-Service auf `condition: service_healthy` umstellen:
```yaml
    depends_on:
      postgres:
        condition: service_healthy
```

**Akzeptanz:** `docker compose ps` zeigt `healthy`; bei gestopptem Postgres liefert
`/api/health` 503.

---

## S4-3 · README sichtbar machen  ·  ~1 h

Das README erklärt das System gut, zeigt aber kein einziges Bild. Für ein Referenzprojekt ist
das der größte Wirkungsverlust pro Aufwand.

1. Vier Screenshots aufnehmen (Testdaten, keine echten Personen!):
   `docs/img/dashboard.png`, `docs/img/kiosk-ampel.png`, `docs/img/dubletten-panel.png`,
   `docs/img/karte-druck.png`
2. Im README direkt nach den Highlights einfügen:
```markdown
| Backoffice-Dashboard | Tresen-Kiosk (Ampel) |
|---|---|
| ![Dashboard](docs/img/dashboard.png) | ![Kiosk](docs/img/kiosk-ampel.png) |

| Live-Dublettenprüfung | Kartendruck (CR80) |
|---|---|
| ![Dubletten](docs/img/dubletten-panel.png) | ![Karte](docs/img/karte-druck.png) |
```
3. CI-Badge in die erste Zeile:
```markdown
![CI](https://github.com/SchaerSys/tdd-verwaltung/actions/workflows/ci.yml/badge.svg)
```
4. Verweis auf die Begründungen ergänzen (steht in `docs/BEGRUENDUNGEN.md` beschrieben, im README
   aber noch nicht verlinkt):
```markdown
**Warum der Code so aussieht:** [`docs/BEGRUENDUNGEN.md`](docs/BEGRUENDUNGEN.md) begründet jede
tragende technische Entscheidung inklusive verworfener Alternativen und offener Schwachstellen.
```

---

# Abschluss

Nach Sprint 4 sind aus `docs/BEGRUENDUNGEN.md` Kapitel 12 erledigt:
**12.1** (Kalibrierung, S4-1) · **12.2** (Matcher, S3-4a) · **12.3** (Login-Sperre, S1-3) ·
**12.4** (Kartennummern, S3-3) · **12.5** (Job-Token, S1-2a) · **12.7** (Tests, S2-2) ·
**12.8** (N+1, S3-4d) · **12.9** (addMonths, S3-3) · **12.10** (xlsx, S1-4) ·
**12.11** (Audit-IP, S3-4b) · **12.12** (zod, S3-2) — plus Backup, Löschjob und Healthcheck,
die dort gar nicht als Code-Mängel, sondern als Betriebslücken auftauchen.

**Bewusst offen bleiben:** 2FA für Admins (`totp_secret` liegt bereit), **12.6**
(`deleted_at IS NULL` per View erzwingen) und **12.13** (pg_trgm-Schwelle explizit setzen).
Alle drei sind Kandidaten für einen Sprint 5 — sinnvoll erst, wenn die Integrationstests
aus Sprint 2 stehen, weil sie sonst nicht gefahrlos änderbar sind.
