import { createHash, randomBytes } from "node:crypto";
import { and, eq, ne, sql } from "drizzle-orm";
import {
  abholstellen, abwesenheiten, antraege, antragNachrichten, ausgabeSitzungen, cards, currentTenantId, dienste, dienstplanWochen,
  distributions, fahrzeuge, geraete, locations, lookupLists, lookupValues, organizations, personLocationAssignments, persons,
  scanDocuments, staff, tenants, timeEvents, tourEreignisse, tourStopps, tourVorlageStopps, tourVorlagen, touren, users, ziviMeldungen,
  zeitAbschluesse, staffDokumente,
} from "@tdd/db";
import { normalizeName, normalizeAddress, koelnerPhonetik } from "@tdd/core";
import { db } from "./db";
import { nextCardNumber, addMonths } from "./cards";
import { ensureAusgabePlacement } from "./ausgabe";
import { incomeLimit } from "./eligibility";
import { withOrg } from "./org";

/**
 * Demo-Mandant (Auftrag 17.09.2026): fiktive, aber realistische Daten fuer jedes Modul.
 * Laeuft NUR im Mandanten mit Kurzname "demo" (RLS: der Pool traegt den Kontext, es kann
 * nichts anderes getroffen werden). Loescht vorher alle Fachdaten dieses Mandanten – ausser
 * Admin-Konten und der Traegerorganisation – und baut alles deterministisch neu auf
 * (fester Zufalls-Seed, Datumsangaben relativ zu heute). Erkennbar fiktiv: Domain
 * demo.tafelwerk.invalid, Telefon 0660/000…, erfundene Strassennamen in echten Orten.
 */

// ── Zufall mit festem Seed (mulberry32) ──────────────────────────────────
function rng(seed: number) {
  let a = seed >>> 0;
  return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
const rand = rng(20260917);
const pick = <T,>(arr: readonly T[]): T => arr[Math.floor(rand() * arr.length)]!;
const zwischen = (a: number, b: number) => a + Math.floor(rand() * (b - a + 1));

// ── Datum relativ zu heute ────────────────────────────────────────────────
const heute = new Date(); heute.setUTCHours(0, 0, 0, 0);
const iso = (d: Date) => d.toISOString().slice(0, 10);
const tage = (n: number) => { const d = new Date(heute); d.setUTCDate(d.getUTCDate() + n); return d; };
const isoTage = (n: number) => iso(tage(n));
const wochentag = (d: Date) => ((d.getUTCDay() + 6) % 7) + 1; // 1 = Mo … 7 = So
const um = (d: Date, hh: number, mm: number) => new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), hh - 2, mm)); // MESZ → UTC
const montag = (d: Date) => tage(-((wochentag(d) - 1)) + Math.round((d.getTime() - heute.getTime()) / 864e5));

// ── Fundus ────────────────────────────────────────────────────────────────
const VORNAMEN_W = ["Anna", "Sabine", "Mirela", "Fatma", "Olena", "Katharina", "Amira", "Petra", "Jasmin", "Elif", "Nadia", "Birgit", "Lea", "Svetlana", "Aylin"];
const VORNAMEN_M = ["Martin", "Ahmed", "Dragan", "Peter", "Yusuf", "Thomas", "Bogdan", "Markus", "Samir", "Georg", "Ivan", "Daniel", "Hassan", "Florian", "Emir"];
const NACHNAMEN = ["Berger", "Yilmaz", "Petrović", "Huber", "Demir", "Kovač", "Moser", "Öztürk", "Hofer", "Novak", "Wagner", "Kaya", "Steiner", "Ivanenko", "Egger", "Aslan", "Fischer", "Radić", "Pichler", "Sahin"];
const STRASSEN = ["Beispielgasse", "Mustergasse", "Probeweg", "Demoallee", "Testfeldstraße", "Platzhalterweg", "Übungsstraße", "Vorführgasse"];
const ORTE = [
  { ort: "Bregenz", plz: "6900", lat: 47.5031, lng: 9.7471 }, { ort: "Dornbirn", plz: "6850", lat: 47.4125, lng: 9.7417 },
  { ort: "Feldkirch", plz: "6800", lat: 47.2371, lng: 9.5983 }, { ort: "Bludenz", plz: "6700", lat: 47.1536, lng: 9.8219 },
  { ort: "Hard", plz: "6971", lat: 47.4869, lng: 9.6889 }, { ort: "Lustenau", plz: "6890", lat: 47.4264, lng: 9.6589 },
] as const;

function svNummer(geb: string, lauf: number): string {
  // 3-stellige Laufnummer + Pruefziffer + TTMMJJ, Pruefziffer nach Gewichtung 3,7,9,5,8,4,2,1,6
  const d = geb.slice(8, 10) + geb.slice(5, 7) + geb.slice(2, 4);
  const l = String(lauf).padStart(3, "0");
  for (let p = 0; p <= 9; p++) {
    const z = (l + p + d).split("").map(Number);
    const w = [3, 7, 9, 0, 5, 8, 4, 2, 1, 6];
    const s = z.reduce((acc, v, i) => acc + v * w[i]!, 0);
    if (s % 11 === p) return l + p + d;
  }
  return l + "0" + d;
}

export interface DemoErgebnis { personen: number; karten: number; ausgaben: number; personal: number; touren: number; antraege: number; benutzer: number }

export async function demoSeed(): Promise<DemoErgebnis> {
  const d = db();
  const tenant = (await d.select({ id: tenants.id, slug: tenants.slug, name: tenants.name }).from(tenants).where(eq(tenants.id, currentTenantId())).limit(1))[0];
  if (!tenant || tenant.slug !== "demo") throw new Error("Demo-Daten nur im Mandanten mit Kurzname 'demo'.");

  // ── 1. Aufraeumen (nur dieser Mandant; Admin-Konten und Traegerorganisation bleiben) ──
  for (const t of [tourEreignisse, tourStopps, touren, tourVorlageStopps, tourVorlagen, abholstellen, geraete, ausgabeSitzungen, distributions, cards,
    personLocationAssignments, scanDocuments, antragNachrichten, zeitAbschluesse, timeEvents, abwesenheiten, dienste, dienstplanWochen, ziviMeldungen, staffDokumente]) {
    await d.delete(t);
  }
  // Antraege haengen an der Organisations-Policy (app.org_id): je Organisation im Kontext loeschen
  for (const o of await d.select({ id: organizations.id }).from(organizations)) {
    await withOrg(o.id, async (tx) => { await tx.execute(sql`DELETE FROM antrag_documents WHERE antrag_id IN (SELECT id FROM antraege)`); await tx.delete(antraege); });
  }
  await d.update(persons).set({ sourceAntragId: null });
  await d.delete(persons);
  await d.delete(fahrzeuge);
  await d.update(users).set({ locationId: null, organizationId: null }).where(ne(users.role, "ADMIN"));
  await d.delete(staff);
  await d.delete(users).where(ne(users.role, "ADMIN"));
  await d.delete(organizations).where(ne(organizations.type, "TDD"));
  await d.delete(locations);
  await d.execute(sql`DELETE FROM card_sequences`);

  // ── 2. Standorte ──────────────────────────────────────────────────────
  const oeff = (tag: string, von: string, bis: string) => ({ [tag]: [{ from: von, to: bis }] });
  const locRows = await d.insert(locations).values([
    { name: "Ausgabestelle Bregenz", type: "AUSGABESTELLE", city: "Bregenz", locationCode: 201, priceAdult: "3.00", priceChild: "1.00", strasse: "Beispielgasse 4", plz: "6900", lat: 47.5031, lng: 9.7471, openingHours: { ...oeff("tue", "14:00", "16:00"), ...oeff("fri", "09:00", "11:00") } },
    { name: "Ausgabestelle Dornbirn", type: "AUSGABESTELLE", city: "Dornbirn", locationCode: 202, priceAdult: "3.00", priceChild: "1.00", strasse: "Mustergasse 12", plz: "6850", lat: 47.4125, lng: 9.7417, openingHours: oeff("wed", "14:00", "16:30") },
    { name: "Ausgabestelle Feldkirch", type: "AUSGABESTELLE", city: "Feldkirch", locationCode: 203, priceAdult: "3.00", priceChild: "1.00", strasse: "Probeweg 7", plz: "6800", lat: 47.2371, lng: 9.5983, openingHours: oeff("thu", "15:00", "17:00") },
    { name: "Laden Bludenz", type: "LADEN", city: "Bludenz", locationCode: 301, priceAdult: "0.00", priceChild: "0.00", strasse: "Demoallee 2", plz: "6700", lat: 47.1536, lng: 9.8219, openingHours: { ...oeff("mon", "09:00", "12:00"), ...oeff("thu", "09:00", "12:00") } },
    { name: "Lager Hard", type: "LAGER", city: "Hard", locationCode: 901, priceAdult: "0.00", priceChild: "0.00", strasse: "Platzhalterweg 1", plz: "6971", lat: 47.4869, lng: 9.6889 },
  ]).returning({ id: locations.id, code: locations.locationCode, type: locations.type, name: locations.name, lat: locations.lat, lng: locations.lng });
  const ausgabestellen = locRows.filter((l) => l.type === "AUSGABESTELLE");
  const lager = locRows.find((l) => l.type === "LAGER")!;
  const ausgabeTag: Record<number, number> = { 201: 2, 202: 3, 203: 4, 301: 1 };

  // ── 3. Organisationen ─────────────────────────────────────────────────
  const tdd = (await d.select({ id: organizations.id }).from(organizations).where(eq(organizations.type, "TDD")).limit(1))[0]
    ?? (await d.insert(organizations).values({ name: tenant.name, type: "TDD" }).returning({ id: organizations.id }))[0]!;
  const orgRows = await d.insert(organizations).values([
    { name: "Gemeinde Bregenz (Demo)", type: "GEMEINDE" }, { name: "Gemeinde Dornbirn (Demo)", type: "GEMEINDE" },
    { name: "Gemeinde Feldkirch (Demo)", type: "GEMEINDE" }, { name: "Gemeinde Hard (Demo)", type: "GEMEINDE" },
    { name: "Sozialberatung Rheintal (Demo)", type: "INSTITUTION" }, { name: "Frauenberatung Vorarlberg (Demo)", type: "INSTITUTION" },
  ]).returning({ id: organizations.id, name: organizations.name, type: organizations.type });

  // ── 4. Auswahlwerte ───────────────────────────────────────────────────
  const listen = await d.select({ id: lookupLists.id, code: lookupLists.code }).from(lookupLists);
  const werte = await d.select({ id: lookupValues.id, listId: lookupValues.listId, label: lookupValues.label }).from(lookupValues);
  const sprachen = werte.filter((w) => w.listId === listen.find((l) => l.code === "language")?.id);
  const herkunft = werte.filter((w) => w.listId === listen.find((l) => l.code === "origin")?.id);

  // ── 5. Personen, Zuordnung, Karten ────────────────────────────────────
  const admin = (await d.select({ id: users.id }).from(users).where(eq(users.role, "ADMIN")).limit(1))[0];
  interface P { id: string; loc: typeof locRows[number]; adults: number; kinder: number; kartenId: string; kartenStatus: string; nummer: string }
  const leute: P[] = [];
  const typen = [...Array(8).fill("FAMILIE"), ...Array(6).fill("EINZEL"), ...Array(4).fill("PAAR"), ...Array(2).fill("SENIOR")] as string[];
  const gesehen = new Set<string>();
  for (let i = 0; i < 20; i++) {
    const typ = typen[i]!;
    const weiblich = rand() < 0.5;
    let vor = pick(weiblich ? VORNAMEN_W : VORNAMEN_M), nach = pick(NACHNAMEN);
    while (gesehen.has(vor + nach)) { vor = pick(weiblich ? VORNAMEN_W : VORNAMEN_M); nach = pick(NACHNAMEN); }
    gesehen.add(vor + nach);
    const ort = i < 6 ? ORTE[0] : i < 12 ? ORTE[1] : i < 17 ? ORTE[2] : ORTE[3];
    const loc = i < 6 ? ausgabestellen[0]! : i < 12 ? ausgabestellen[1]! : i < 17 ? ausgabestellen[2]! : locRows.find((l) => l.type === "LADEN")!;
    const jahr = typ === "SENIOR" ? zwischen(1948, 1958) : zwischen(1968, 2001);
    const geb = `${jahr}-${String(zwischen(1, 12)).padStart(2, "0")}-${String(zwischen(1, 28)).padStart(2, "0")}`;
    const kinder = typ === "FAMILIE" ? zwischen(1, 4) : 0;
    const adults = typ === "PAAR" ? 2 : typ === "FAMILIE" ? zwischen(1, 2) : 1;
    const adresse = `${pick(STRASSEN)} ${zwischen(1, 48)}`;
    const notiz = i === 3 ? "Bitte Schulden ansprechen – Zahlung vereinbart." : i === 9 ? "Bringt Nachbarin mit (Übersetzung)." : null;
    const [p] = await d.insert(persons).values({
      firstName: vor, lastName: nach, address: adresse, postalCode: ort.plz, city: ort.ort, birthDate: geb,
      phone: `0660 000 ${String(1000 + i * 37).slice(-4)}`, email: rand() < 0.6 ? `${vor.toLowerCase()}.${nach.toLowerCase().replace(/[^a-z]/g, "")}@demo.tafelwerk.invalid` : null,
      householdSize: adults + kinder, childrenCount: kinder, languageId: pick(sprachen)?.id ?? null, originId: pick(herkunft)?.id ?? null,
      note: notiz, status: "AKTIV", lastNameNorm: normalizeName(nach), firstNameNorm: normalizeName(vor), addressNorm: normalizeAddress(adresse),
      lastNamePhon: koelnerPhonetik(nach), firstNamePhon: koelnerPhonetik(vor), createdBy: admin?.id ?? null, consentAt: tage(-zwischen(60, 400)),
      retentionUntil: isoTage(365 * 3), sourceOrganizationId: pick(orgRows.filter((o) => o.type === "GEMEINDE")).id,
    }).returning({ id: persons.id });
    await d.insert(personLocationAssignments).values({ personId: p!.id, locationId: loc.id, validFrom: isoTage(-zwischen(60, 400)) });
    await ensureAusgabePlacement(p!.id, loc.id);
    const status = i === 12 ? "ABGELAUFEN" : i === 7 ? "GESPERRT" : "AKTIV";
    const validFrom = status === "ABGELAUFEN" ? isoTage(-220) : isoTage(-zwischen(10, 150));
    const validTo = status === "ABGELAUFEN" ? isoTage(-40) : addMonths(validFrom, 6);
    const nummer = await nextCardNumber(loc.code);
    const [k] = await d.insert(cards).values({ cardNumber: nummer, personId: p!.id, locationId: loc.id, validFrom, validTo, status, blockReason: status === "GESPERRT" ? "Schulden über der Sperrgrenze – Büro" : null, createdBy: admin?.id ?? null })
      .returning({ id: cards.id });
    leute.push({ id: p!.id, loc, adults, kinder, kartenId: k!.id, kartenStatus: status, nummer });
  }

  // ── 6. Ausgaben: 8 Wochen Historie ────────────────────────────────────
  let ausgaben = 0;
  for (const p of leute) {
    if (p.loc.type === "LADEN") continue;
    const tag = ausgabeTag[p.loc.code] ?? 2;
    const due = p.adults * 3 + p.kinder * 1;
    for (let w = 8; w >= 1; w--) {
      const datum = tage(-7 * w + (tag - wochentag(heute)));
      if (datum > heute) continue;
      const idx = leute.indexOf(p);
      if (idx !== 3 && idx !== 7 && rand() > 0.8) continue;
      // Schuldenmuster: Person 3 zwei offene (Warnung), Person 7 sechs offene (Sperre), Person 15 einmal Geld vergessen
      const offen = (idx === 3 && w <= 2) || (idx === 7 && w <= 6) || (idx === 15 && w === 4);
      await d.insert(distributions).values({
        cardId: p.kartenId, personId: p.id, locationId: p.loc.id, distributedAt: um(datum, 14, zwischen(5, 110)),
        distributedBy: admin?.id ?? null, amountDue: due.toFixed(2), amountPaid: offen ? "0.00" : due.toFixed(2), clientRef: crypto.randomUUID(),
      });
      ausgaben++;
    }
  }
  // Person 15: Schuld inzwischen getilgt; Person 3: Buero hat 4 € erlassen
  const p15 = leute[15]!, p3 = leute[3]!;
  await d.insert(distributions).values({ cardId: p15.kartenId, personId: p15.id, locationId: p15.loc.id, distributedAt: um(tage(-9), 15, 12), amountDue: "0.00", amountPaid: (p15.adults * 3 + p15.kinder).toFixed(2), note: "Schulden beglichen", buchungsart: "TILGUNG", clientRef: crypto.randomUUID() });
  await d.insert(distributions).values({ cardId: p3.kartenId, personId: p3.id, locationId: p3.loc.id, distributedAt: um(tage(-3), 10, 30), amountDue: "-4.00", amountPaid: "0.00", note: "Erlass: Härtefall, Beschluss Büro (Demo)", buchungsart: "ERLASS", distributedBy: admin?.id ?? null });

  // ── 7. Portal: Antraege und Rueckfrage ────────────────────────────────
  const gemeinde = orgRows.find((o) => o.name.startsWith("Gemeinde Dornbirn"))!;
  const institution = orgRows.find((o) => o.type === "INSTITUTION")!;
  const antrag = (vor: string, nach: string, org: number, status: string, adults: number, ku12: number, income: number, expense: number, tageAlt: number) => ({
    organizationId: org, targetType: "AUSGABESTELLE", intendedLocationId: ausgabestellen[1]!.id, firstName: vor, lastName: nach, address: `${pick(STRASSEN)} ${zwischen(1, 40)}`,
    postalCode: "6850", city: "Dornbirn", birthDate: `${zwischen(1970, 1998)}-05-1${zwischen(0, 9)}`, phone: "0660 000 0999", email: `${vor.toLowerCase()}.${nach.toLowerCase()}@demo.tafelwerk.invalid`,
    adults, childrenU12: ku12, childrenO12: 0, financials: { income: { lohn: income }, expense: { miete: expense } }, incomeTotal: income.toFixed(2), expenseTotal: expense.toFixed(2),
    availableIncome: (income - expense).toFixed(2), incomeLimit: incomeLimit(adults, ku12, 0).toFixed(2), status, consentGiven: true, consentAt: isoTage(-tageAlt),
    lastNameNorm: normalizeName(nach), firstNameNorm: normalizeName(vor), createdAt: um(tage(-tageAlt), 9, 15),
    decidedAt: status === "OFFEN" ? null : um(tage(-tageAlt + 2), 11, 0), decidedBy: status === "OFFEN" ? null : admin?.id ?? null,
    decisionReason: status === "NEGATIV" ? "Verfügbares Einkommen über der Grenze" : null,
  });
  const antragRows: { id: string; organizationId: number }[] = [];
  for (const a of [antrag("Selma", "Demirci", gemeinde.id, "OFFEN", 2, 2, 1850, 900, 3), antrag("Robert", "Kessler", gemeinde.id, "POSITIV", 1, 0, 1100, 620, 12), antrag("Milan", "Jovanović", institution.id, "NEGATIV", 2, 0, 3400, 900, 20)]) {
    // Organisations-Policy: Insert nur im Kontext der antragstellenden Organisation
    const r = await withOrg(a.organizationId, (tx) => tx.insert(antraege).values(a).returning({ id: antraege.id, organizationId: antraege.organizationId }));
    antragRows.push(r[0]!);
  }
  await d.insert(antragNachrichten).values([
    { antragId: antragRows[0]!.id, organizationId: antragRows[0]!.organizationId, seite: "TDD", autorName: "Büro", text: "Bitte den aktuellen Mietvertrag nachreichen – die Miete erscheint hoch.", createdAt: um(tage(-2), 10, 5) },
    { antragId: antragRows[0]!.id, organizationId: antragRows[0]!.organizationId, seite: "ORG", autorName: "Gemeinde Dornbirn", text: "Mietvertrag liegt vor, Betrag stimmt (inkl. Betriebskosten). Wird nachgereicht.", createdAt: um(tage(-1), 8, 40) },
  ]);

  // ── 8. Personal ───────────────────────────────────────────────────────
  const demoAdmin = (await d.select({ id: users.id, email: users.email, name: users.displayName }).from(users).where(and(eq(users.role, "ADMIN"), sql`${users.email} LIKE '%+demo@%'`)).limit(1))[0];
  // Soll-Verteilung in MINUTEN je Wochentag (azg.ts sollJeWochentag)
  const vollzeit = { "1": 402, "2": 402, "3": 402, "4": 402, "5": 402 }; // 33,5 h
  const teilzeit = { "1": 300, "2": 300, "3": 300, "4": 300 };             // 20 h
  const zivi = { "1": 480, "2": 480, "3": 480, "4": 480, "5": 480 };       // 40 h
  const dienstStd = (von: string, bis: string, loc: number | null) => ({ "1": { von, bis, pause: 30, location: loc }, "2": { von, bis, pause: 30, location: loc }, "3": { von, bis, pause: 30, location: loc }, "4": { von, bis, pause: 30, location: loc }, "5": { von, bis, pause: 30, location: loc } });
  const staffRows = await d.insert(staff).values([
    { personalnr: 1, firstName: demoAdmin ? demoAdmin.name.split(" ")[0]! : "Dario", lastName: demoAdmin ? (demoAdmin.name.split(" ").slice(1).join(" ") || "Schär") : "Schär", staffType: "ANGESTELLT", email: demoAdmin?.email ?? "leitung@demo.tafelwerk.invalid", userId: demoAdmin?.id ?? null,
      employmentStart: isoTage(-900), weeklyHours: "33.50", vacationDaysYear: "25", sollVerteilung: vollzeit, dienstStandard: dienstStd("08:00", "15:30", lager.id), locationId: lager.id, zeitkontoStart: isoTage(-42), zeitkontoAnfangMin: 310,
      geburtsdatum: "1989-03-14", svNummer: svNummer("1989-03-14", 123), staatsbuergerschaft: "Österreich", beschaeftigung: "TEILZEIT", taetigkeit: "Leitung / Verwaltung", kvEinstufung: "SWÖ VG 7/3", gehaltBrutto: "3120.00", probezeitBis: isoTage(-870), dienstzettelAm: isoTage(-895), notfallName: "Notfallkontakt (Demo)", notfallTel: "0660 000 0001", strasse: "Beispielgasse 9", plz: "6900", ort: "Bregenz", urlaubWochen: 5, kannFahren: true, fuehrerschein: "B", ortungZustimmungAm: isoTage(-30) },
    { personalnr: 2, firstName: "Claudia", lastName: "Winkler", staffType: "ANGESTELLT", email: "claudia.winkler@demo.tafelwerk.invalid", phone: "0660 000 0002", employmentStart: isoTage(-1400), weeklyHours: "20.00", vacationDaysYear: "25", sollVerteilung: teilzeit, dienstStandard: dienstStd("08:30", "13:30", ausgabestellen[0]!.id), locationId: ausgabestellen[0]!.id, zeitkontoStart: isoTage(-42), zeitkontoAnfangMin: -45,
      geburtsdatum: "1976-11-02", svNummer: svNummer("1976-11-02", 456), staatsbuergerschaft: "Österreich", beschaeftigung: "TEILZEIT", taetigkeit: "Ausgabe & Büro", kvEinstufung: "SWÖ VG 5/4", gehaltBrutto: "1480.00", probezeitBis: isoTage(-1370), dienstzettelAm: isoTage(-1395), notfallName: "Notfallkontakt (Demo)", notfallTel: "0660 000 0003", strasse: "Mustergasse 3", plz: "6850", ort: "Dornbirn", urlaubWochen: 5 },
    { personalnr: 100, firstName: "Jonas", lastName: "Amann", staffType: "ZIVILDIENER", email: "jonas.amann@demo.tafelwerk.invalid", phone: "0660 000 0100", employmentStart: isoTage(-100), weeklyHours: "40.00", sollVerteilung: zivi, dienstStandard: dienstStd("07:30", "16:00", lager.id), locationId: lager.id, zeitkontoStart: isoTage(-42),
      ziviBeginn: isoTage(-100), ziviEnde: addMonths(isoTage(-100), 9), ziviBescheid: "ZD-2026-0417 (Demo)", geburtsdatum: "2006-07-21", svNummer: svNummer("2006-07-21", 789), staatsbuergerschaft: "Österreich", beschaeftigung: "ZIVILDIENST", taetigkeit: "Fahrer / Ausgabe", strasse: "Probeweg 11", plz: "6971", ort: "Hard", kannFahren: true, fuehrerschein: "B", ortungZustimmungAm: isoTage(-95), notfallName: "Eltern (Demo)", notfallTel: "0660 000 0101" },
    { personalnr: 101, firstName: "Luca", lastName: "Bertsch", staffType: "ZIVILDIENER", email: "luca.bertsch@demo.tafelwerk.invalid", phone: "0660 000 0102", employmentStart: isoTage(-40), weeklyHours: "40.00", sollVerteilung: zivi, dienstStandard: dienstStd("07:30", "16:00", ausgabestellen[1]!.id), locationId: ausgabestellen[1]!.id, zeitkontoStart: isoTage(-35),
      ziviBeginn: isoTage(-40), ziviEnde: addMonths(isoTage(-40), 9), ziviBescheid: "ZD-2026-0522 (Demo)", geburtsdatum: "2007-02-09", svNummer: svNummer("2007-02-09", 321), staatsbuergerschaft: "Österreich", beschaeftigung: "ZIVILDIENST", taetigkeit: "Ausgabe / Lager", strasse: "Demoallee 5", plz: "6850", ort: "Dornbirn", notfallName: "Eltern (Demo)", notfallTel: "0660 000 0103" },
    { personalnr: 200, firstName: "Herbert", lastName: "Gmeiner", staffType: "EHRENAMT", email: "herbert.gmeiner@demo.tafelwerk.invalid", phone: "0660 000 0200", employmentStart: isoTage(-600), beschaeftigung: "EHRENAMT", taetigkeit: "Fahrer", kannFahren: true, fuehrerschein: "B, C1", fahrerTage: [2, 4], strasse: "Übungsstraße 20", plz: "6900", ort: "Bregenz", ortungZustimmungAm: isoTage(-200) },
    { personalnr: 201, firstName: "Rosa", lastName: "Mathis", staffType: "EHRENAMT", email: "rosa.mathis@demo.tafelwerk.invalid", phone: "0660 000 0201", employmentStart: isoTage(-300), beschaeftigung: "EHRENAMT", taetigkeit: "Ausgabe", strasse: "Vorführgasse 2", plz: "6800", ort: "Feldkirch" },
  ]).returning({ id: staff.id, nr: staff.personalnr, typ: staff.staffType });
  const [leitung, claudia, jonas, luca, herbert] = staffRows as [typeof staffRows[number], typeof staffRows[number], typeof staffRows[number], typeof staffRows[number], typeof staffRows[number], typeof staffRows[number]];

  // ── 9. Zeiterfassung: 6 Wochen, ein Ruhezeit-Verstoss, Ueberstunden ───
  const stempeln = async (s: typeof staffRows[number], tagesplan: { von: [number, number]; bis: [number, number]; tage: number[] }, wochen: number, ausnahmen: (d: Date) => { von?: [number, number]; bis?: [number, number]; frei?: boolean } | null) => {
    for (let n = 7 * wochen; n >= 1; n--) {
      const dat = tage(-n);
      if (!tagesplan.tage.includes(wochentag(dat))) continue;
      const a = ausnahmen(dat);
      if (a?.frei) continue;
      const von = a?.von ?? tagesplan.von, bis = a?.bis ?? tagesplan.bis;
      const lang = (bis[0] * 60 + bis[1]) - (von[0] * 60 + von[1]) > 360; // ueber 6 h: Pause stempeln (§ 11 AZG)
      await d.insert(timeEvents).values([
        { staffId: s.id, kind: "IN", at: um(dat, von[0], von[1] + zwischen(-4, 6)), source: "TERMINAL_NFC" },
        ...(lang ? [
          { staffId: s.id, kind: "BREAK_START", at: um(dat, 12, zwischen(0, 10)), source: "TERMINAL_NFC" },
          { staffId: s.id, kind: "BREAK_END", at: um(dat, 12, 30 + zwischen(2, 8)), source: "TERMINAL_NFC" },
        ] : []),
        { staffId: s.id, kind: "OUT", at: um(dat, bis[0], bis[1] + zwischen(-5, 12)), source: "TERMINAL_NFC" },
      ]);
    }
  };
  const krankVon = tage(-17), krankBis = tage(-15), urlaubVon = tage(-31), urlaubBis = tage(-25);
  await stempeln(leitung, { von: [8, 0], bis: [15, 30], tage: [1, 2, 3, 4, 5] }, 6, (dat) => {
    if (dat >= urlaubVon && dat <= urlaubBis) return { frei: true };
    if (wochentag(dat) === 4 && Math.abs(dat.getTime() - tage(-22).getTime()) < 864e5) return { bis: [21, 45] }; // langer Tag → Ruhezeit-Verstoss zum Folgetag
    if (wochentag(dat) === 5 && dat > tage(-22) && dat < tage(-20)) return { von: [6, 30] };
    return null;
  });
  await stempeln(claudia, { von: [8, 30], bis: [13, 30], tage: [1, 2, 3, 4] }, 6, (dat) => (dat >= krankVon && dat <= krankBis ? { frei: true } : wochentag(dat) === 2 ? { bis: [16, 0] } : null));
  await stempeln(jonas, { von: [7, 30], bis: [16, 0], tage: [1, 2, 3, 4, 5] }, 6, () => null);
  await stempeln(luca, { von: [7, 30], bis: [16, 0], tage: [1, 2, 3, 4, 5] }, 5, () => null);
  await d.insert(abwesenheiten).values([
    { staffId: claudia.id, art: "KRANK", von: iso(krankVon), bis: iso(krankBis), status: "GENEHMIGT", bestaetigung: true, notiz: "Grippe (Demo)" },
    { staffId: leitung.id, art: "URLAUB", von: iso(urlaubVon), bis: iso(urlaubBis), status: "GENEHMIGT", entschiedenAt: um(tage(-45), 9, 0) },
    { staffId: jonas.id, art: "URLAUB", von: isoTage(12), bis: isoTage(13), status: "BEANTRAGT", notiz: "Dienstfreistellung (Demo)" },
  ]);

  // ── 10. Dienstplan: laufende und naechste Woche veroeffentlicht ───────
  const wocheStart = montag(heute);
  for (const w of [0, 1]) {
    const start = new Date(wocheStart); start.setUTCDate(start.getUTCDate() + 7 * w);
    await d.insert(dienstplanWochen).values({ wocheStart: iso(start), status: "VEROEFFENTLICHT", veroeffentlichtAt: um(tage(-3), 16, 0), veroeffentlichtBy: admin?.id ?? null });
    for (let t = 0; t < 5; t++) {
      const dat = new Date(start); dat.setUTCDate(dat.getUTCDate() + t);
      const wt = wochentag(dat);
      await d.insert(dienste).values([
        { datum: iso(dat), staffId: leitung.id, locationId: lager.id, von: "08:00", bis: "15:30", pauseMin: 30, taetigkeit: "BUERO" },
        { datum: iso(dat), staffId: jonas.id, locationId: wt === 2 ? ausgabestellen[0]!.id : wt === 3 ? ausgabestellen[1]!.id : lager.id, von: "07:30", bis: "16:00", pauseMin: 30, taetigkeit: wt <= 3 ? "AUSGABE" : "FAHRDIENST" },
        { datum: iso(dat), staffId: luca.id, locationId: wt === 4 ? ausgabestellen[2]!.id : lager.id, von: "07:30", bis: "16:00", pauseMin: 30, taetigkeit: "LAGER" },
        ...(wt <= 4 ? [{ datum: iso(dat), staffId: claudia.id, locationId: ausgabestellen[0]!.id, von: "08:30", bis: "13:30", pauseMin: 0, taetigkeit: "BUERO" }] : []),
      ]);
    }
  }

  // ── 11. Logistik: Abholstellen, Fahrzeuge, Vorlagen, Touren ───────────
  const abhol = await d.insert(abholstellen).values([
    { name: "Supermarkt Seeufer (Demo)", art: "SUPERMARKT", strasse: "Beispielgasse 30", plz: "6900", ort: "Bregenz", ansprechperson: "Filialleitung", telefon: "0660 000 0301", kuehlbedarf: true, abholtage: [2, 4], fensterVon: "08:00", fensterBis: "09:30", lat: 47.5052, lng: 9.7418, hinweise: "Hintereingang, klingeln" },
    { name: "Bäckerei Rheintal (Demo)", art: "BAECKEREI", strasse: "Mustergasse 8", plz: "6850", ort: "Dornbirn", ansprechperson: "Frau Muster", telefon: "0660 000 0302", kuehlbedarf: false, abholtage: [2, 3, 4], fensterVon: "07:30", fensterBis: "08:30", lat: 47.4148, lng: 9.7445 },
    { name: "Großmarkt Lustenau (Demo)", art: "GROSSHANDEL", strasse: "Probeweg 100", plz: "6890", ort: "Lustenau", ansprechperson: "Lagerleitung", telefon: "0660 000 0303", kuehlbedarf: true, abholtage: [2, 4], fensterVon: "09:00", fensterBis: "11:00", lat: 47.4301, lng: 9.6612 },
    { name: "Hofladen Walgau (Demo)", art: "LANDWIRT", strasse: "Demoallee 40", plz: "6700", ort: "Bludenz", ansprechperson: "Familie Beispiel", telefon: "0660 000 0304", kuehlbedarf: false, abholtage: [4], fensterVon: "10:00", fensterBis: "12:00", lat: 47.1601, lng: 9.8102 },
    { name: "Drogerie Stadtmitte (Demo)", art: "SONSTIGES", strasse: "Übungsstraße 5", plz: "6800", ort: "Feldkirch", ansprechperson: "Marktleitung", telefon: "0660 000 0305", kuehlbedarf: false, abholtage: [4], fensterVon: "13:00", fensterBis: "14:00", lat: 47.2402, lng: 9.5971 },
  ]).returning({ id: abholstellen.id, name: abholstellen.name, lat: abholstellen.lat, lng: abholstellen.lng });
  const fz = await d.insert(fahrzeuge).values([
    { kennzeichen: "B-DEMO 1", bezeichnung: "Kühltransporter (Demo)", kuehlung: true, elektrisch: false, ladevolumen: "12 m³", locationId: lager.id, pickerlBis: isoTage(200) },
    { kennzeichen: "B-DEMO 2", bezeichnung: "E-Kastenwagen (Demo)", kuehlung: false, elektrisch: true, reichweiteKm: 220, ladevolumen: "8 m³", locationId: lager.id, pickerlBis: isoTage(25), hinweise: "Pickerl bald fällig" },
  ]).returning({ id: fahrzeuge.id });
  const vorlagen = await d.insert(tourVorlagen).values([
    { name: "Dienstag Nord", wochentag: 2, startzeit: "07:30", startLocationId: lager.id, fahrzeugId: fz[0]!.id, fahrerId: jonas.id, hinweise: "Kühlware zuerst" },
    { name: "Donnerstag Süd", wochentag: 4, startzeit: "08:00", startLocationId: lager.id, fahrzeugId: fz[1]!.id, fahrerId: herbert.id },
  ]).returning({ id: tourVorlagen.id, name: tourVorlagen.name, wochentag: tourVorlagen.wochentag, fahrzeugId: tourVorlagen.fahrzeugId, fahrerId: tourVorlagen.fahrerId, startzeit: tourVorlagen.startzeit });
  const stoppsNord = [{ art: "ABHOLUNG", abholstelleId: abhol[1]!.id }, { art: "ABHOLUNG", abholstelleId: abhol[0]!.id }, { art: "ABHOLUNG", abholstelleId: abhol[2]!.id }, { art: "LIEFERUNG", locationId: ausgabestellen[0]!.id }, { art: "LIEFERUNG", locationId: ausgabestellen[1]!.id }];
  const stoppsSued = [{ art: "ABHOLUNG", abholstelleId: abhol[3]!.id }, { art: "ABHOLUNG", abholstelleId: abhol[4]!.id }, { art: "LIEFERUNG", locationId: ausgabestellen[2]!.id }, { art: "LIEFERUNG", locationId: locRows.find((l) => l.type === "LADEN")!.id }];
  for (const [v, st] of [[vorlagen[0]!, stoppsNord], [vorlagen[1]!, stoppsSued]] as const) {
    await d.insert(tourVorlageStopps).values(st.map((s, i) => ({ vorlageId: v.id, reihenfolge: i + 1, art: s.art, abholstelleId: "abholstelleId" in s ? s.abholstelleId : null, locationId: "locationId" in s ? s.locationId : null })));
  }
  let tourenN = 0;
  for (let n = 21; n >= 0; n--) {
    const dat = tage(-n);
    const wt = wochentag(dat);
    const v = wt === 2 ? vorlagen[0] : wt === 4 ? vorlagen[1] : null;
    if (!v) continue;
    const st = wt === 2 ? stoppsNord : stoppsSued;
    const istHeute = n === 0;
    const [tour] = await d.insert(touren).values({
      datum: iso(dat), vorlageId: v.id, name: v.name, startzeit: v.startzeit, startLocationId: lager.id, fahrzeugId: v.fahrzeugId, fahrerId: v.fahrerId,
      status: istHeute ? "GEPLANT" : "ABGESCHLOSSEN", gestartetAt: istHeute ? null : um(dat, 7, 35), beendetAt: istHeute ? null : um(dat, 11, zwischen(10, 50)),
      kmStart: istHeute ? null : 40000 + n * 3, kmEnde: istHeute ? null : 40000 + n * 3 + zwischen(55, 80), freigegebenAt: um(tage(-n - 1), 16, 0), freigegebenBy: admin?.id ?? null, createdBy: admin?.id ?? null,
    }).returning({ id: touren.id });
    const stoppRows = await d.insert(tourStopps).values(st.map((s, i) => ({
      tourId: tour!.id, reihenfolge: i + 1, art: s.art, abholstelleId: "abholstelleId" in s ? s.abholstelleId : null, locationId: "locationId" in s ? s.locationId : null,
      status: istHeute ? "OFFEN" : "ERLEDIGT", erledigtAt: istHeute ? null : um(dat, 8 + i, zwischen(0, 50)),
      mengeKisten: istHeute ? null : s.art === "ABHOLUNG" ? zwischen(4, 18) : -zwischen(6, 20), mengeKg: istHeute ? null : String(zwischen(40, 220)),
    }))).returning({ id: tourStopps.id, reihenfolge: tourStopps.reihenfolge, abholstelleId: tourStopps.abholstelleId, locationId: tourStopps.locationId });
    // Geofence-Ereignisse fuer die letzte abgeschlossene Tour
    if (n >= 1 && n <= 7 && !istHeute) {
      await d.insert(tourEreignisse).values({ tourId: tour!.id, art: "LAGER_ABFAHRT", stelleTyp: "STANDORT", stelleId: lager.id, stelleName: lager.name, at: um(dat, 7, 36), lat: lager.lat, lng: lager.lng, genauigkeitM: 12 });
      for (const s of stoppRows) {
        const a = s.abholstelleId ? abhol.find((x) => x.id === s.abholstelleId) : null;
        const l = s.locationId ? locRows.find((x) => x.id === s.locationId) : null;
        const name = a?.name ?? l?.name ?? "Stelle"; const lat = a?.lat ?? l?.lat ?? 47.4; const lng = a?.lng ?? l?.lng ?? 9.7;
        await d.insert(tourEreignisse).values([
          { tourId: tour!.id, stoppId: s.id, art: "ANKUNFT", stelleTyp: a ? "ABHOLSTELLE" : "STANDORT", stelleId: a?.id ?? l?.id ?? null, stelleName: name, at: um(dat, 7 + s.reihenfolge, 50), lat, lng, genauigkeitM: 15 },
          { tourId: tour!.id, stoppId: s.id, art: "ABFAHRT", stelleTyp: a ? "ABHOLSTELLE" : "STANDORT", stelleId: a?.id ?? l?.id ?? null, stelleName: name, at: um(dat, 8 + s.reihenfolge, zwischen(5, 20)), lat, lng, genauigkeitM: 15 },
        ]);
      }
      await d.insert(tourEreignisse).values({ tourId: tour!.id, art: "LAGER_ANKUNFT", stelleTyp: "STANDORT", stelleId: lager.id, stelleName: lager.name, at: um(dat, 11, 40), lat: lager.lat, lng: lager.lng, genauigkeitM: 10 });
    }
    tourenN++;
  }

  // ── 12. Benutzer (Einladungen ohne Passwort – Passwort-Link ueber die Wartungsplattform) ──
  const konto = async (email: string, name: string, role: string, extra: { locationId?: number; organizationId?: number } = {}) => {
    const uname = (await d.execute(sql`SELECT mach_benutzername(${name}) AS u`) as unknown as { u: string }[])[0]?.u ?? null;
    return d.insert(users).values({ email, displayName: name, role, passwordHash: "!", isActive: true, emailVerified: true, username: uname, organizationId: extra.organizationId ?? tdd.id, locationId: extra.locationId ?? null });
  };
  await konto("erfassung@demo.tafelwerk.invalid", "Erfassung Demo", "ERFASSUNG");
  await konto("kasse@demo.tafelwerk.invalid", "Kasse Bregenz Demo", "AUSGABE", { locationId: ausgabestellen[0]!.id });
  await konto("auswertung@demo.tafelwerk.invalid", "Auswertung Demo", "AUSWERTUNG");
  await konto("gemeinde@demo.tafelwerk.invalid", "Sachbearbeitung Dornbirn Demo", "SACHBEARBEITER", { organizationId: gemeinde.id });
  await konto("fahrer@demo.tafelwerk.invalid", "Fahrer Demo", "FAHRER");
  const fahrerUser = (await d.select({ id: users.id }).from(users).where(eq(users.email, "fahrer@demo.tafelwerk.invalid")).limit(1))[0];
  if (fahrerUser) await d.update(staff).set({ userId: fahrerUser.id }).where(eq(staff.id, herbert.id));

  // ── 13. Ausgabestation: gekoppelter Demo-Laptop ───────────────────────
  await d.insert(geraete).values({ art: "AUSGABE", name: "Demo-Laptop", tokenHash: createHash("sha256").update(randomBytes(32)).digest("hex"), userAgent: "Demo", gekoppeltBy: admin?.id ?? null, zuletztGesehen: um(tage(-1), 16, 2) });

  return { personen: leute.length, karten: leute.length, ausgaben, personal: staffRows.length, touren: tourenN, antraege: antragRows.length, benutzer: 5 };
}
