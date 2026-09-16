import Link from "next/link";
import { NfcZuweisen } from "../NfcZuweisen";
import { redirect, notFound } from "next/navigation";
import { and, asc, desc, eq, ne, or, isNull } from "drizzle-orm";
import { staff, locations, users, staffDokumente, organizations } from "@tdd/db";
import { WOCHENTAGE_KURZ } from "@/lib/touren";
import { verteilungSpeichern } from "../../zeit/azg-actions";
import { urlaubStammdaten } from "../../abwesenheiten/actions";
import { standardSpeichern } from "../../dienstplan/actions";
import { standardAusVerteilung, TAETIGKEIT_LABEL, type DienstStandard } from "@/lib/dienstplan";
import { sollJeWochentag, type Verteilung } from "@/lib/azg";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { hasPermission } from "@/lib/rbac";
import { updateStaff, toggleStaffActive } from "../actions";
import { akteSpeichern, dokumentHochladen, dokumentLoeschen, ziviStammdaten } from "../akte-actions";
import { zivildienstEnde, ziviPruefung } from "@/lib/zivildienst";
import { ladeRegeln } from "@/lib/azg-daten";
import { EinmalPin } from "../../admin/ausgabestation/EinmalPin";
import { pinEntfernenAction } from "../../admin/ausgabestation/actions";
import { aktePruefung, aufbewahrungBis, probezeitMax, BESCHAEFTIGUNG_LABEL, AUSTRITT_GRUND_LABEL, DOK_ART_LABEL } from "@/lib/personalakte";
import { heuteIso } from "@/lib/touren";
import { fmtDate, fmtDateTime } from "@/lib/format";
import { STAFF_TYPES, STAFF_TYPE_LABEL } from "../types";

export default async function StaffEditPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user || !hasPermission(user.role, "staff:manage")) redirect("/dashboard");
  const { id } = await params;

  const [rows, locs, fahrerLogins, dokumente] = await Promise.all([
    db().select().from(staff).where(eq(staff.id, id)).limit(1),
    db().select({ id: locations.id, name: locations.name }).from(locations).where(eq(locations.isActive, true)).orderBy(asc(locations.name)),
    // Login-Verknuepfung: alle TDD-Konten, die noch keiner anderen Person gehoeren
    db().select({ id: users.id, name: users.displayName, email: users.email, role: users.role, isActive: users.isActive }).from(users)
      .innerJoin(organizations, eq(users.organizationId, organizations.id))
      .leftJoin(staff, eq(staff.userId, users.id))
      .where(and(eq(organizations.type, "TDD"), ne(users.role, "SACHBEARBEITER"), or(isNull(staff.id), eq(staff.id, id)))).orderBy(asc(users.displayName)),
    db().select().from(staffDokumente).where(eq(staffDokumente.staffId, id)).orderBy(desc(staffDokumente.createdAt)),
  ]);
  const p = rows[0];
  if (!p) notFound();
  const admin = hasPermission(user.role, "admin:manage");
  const heute = heuteIso();
  const regeln = p.staffType === "ZIVILDIENER" ? await ladeRegeln() : null;
  const ziviHinweise = regeln ? ziviPruefung(p, { wocheMinMin: regeln.ziviWocheMinMin, wocheMaxMin: regeln.zivi.maxWocheMin }) : [];
  const hinweise = aktePruefung(p, dokumente, heute);
  const stufeFarbe = { FEHLT: "bad", WARN: "warn", INFO: "muted" } as const;

  return (
    <div>
      <div className="page-h">
        <div>
          <h1>{p.firstName} {p.lastName}</h1>
          <div className="sub">Personalnummer <span className="mono">{p.personalnr ?? "—"}</span> · {STAFF_TYPE_LABEL[p.staffType] ?? p.staffType}{p.isActive ? "" : " · inaktiv"}</div>
        </div>
        <div className="flex gap-2">
          <form action={toggleStaffActive}>
            <input type="hidden" name="id" value={p.id} />
            <input type="hidden" name="active" value={p.isActive ? "0" : "1"} />
            <button className="btn ghost" type="submit">{p.isActive ? "Deaktivieren" : "Aktivieren"}</button>
          </form>
          <Link href="/personal" className="btn ghost">← Personal</Link>
          <a href={`/druck/zeit?staff=${p.id}`} className="btn ghost">🖨 Monatsübersicht</a>
          {admin ? <a href={`/druck/dienstzettel?staff=${p.id}`} className="btn ghost">🖨 Dienstzettel</a> : null}
        </div>
      </div>

      <form action={updateStaff} className="panel">
        <input type="hidden" name="id" value={p.id} />
        <div className="p-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <div className="field"><label className="lbl">Nachname *</label><input name="lastName" className="inp" required defaultValue={p.lastName} /></div>
          <div className="field"><label className="lbl">Vorname *</label><input name="firstName" className="inp" required defaultValue={p.firstName} /></div>
          <div className="field"><label className="lbl">Art</label>
            <select name="staffType" className="inp" defaultValue={p.staffType}>
              {STAFF_TYPES.map((t) => <option key={t} value={t}>{STAFF_TYPE_LABEL[t]}</option>)}
            </select></div>
          <div className="field"><label className="lbl">Personalnummer</label><input name="personalnr" className="inp mono" inputMode="numeric" defaultValue={p.personalnr ?? ""} /><div className="text-[.7rem] text-muted">Angestellte 1–99 · Zivildiener 100–199 · Ehrenamt/Fahrer 200–9999; leer = automatisch</div></div>
          <div className="field"><label className="lbl">E-Mail</label><input name="email" type="email" className="inp" defaultValue={p.email ?? ""} /></div>
          <div className="field"><label className="lbl">Telefon</label><input name="phone" className="inp mono" defaultValue={p.phone ?? ""} /></div>
          <div className="field"><label className="lbl">Standort</label>
            <select name="locationId" className="inp" defaultValue={p.locationId ?? ""}><option value="">— keiner —</option>
              {locs.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}</select></div>
          <div className="field"><label className="lbl">Eintritt</label><input name="employmentStart" type="date" className="inp mono" defaultValue={p.employmentStart ?? ""} /></div>
          <div className="field"><label className="lbl">Austritt</label><input name="employmentEnd" type="date" className="inp mono" defaultValue={p.employmentEnd ?? ""} /></div>
          <div className="field"><label className="lbl">Wochenstunden</label><input name="weeklyHours" className="inp mono" inputMode="decimal" defaultValue={p.weeklyHours ?? ""} /></div>
          <div className="field"><label className="lbl">Urlaub (Werktage/Jahr)</label><input name="vacationDaysYear" className="inp mono" inputMode="decimal" defaultValue={p.vacationDaysYear ?? ""} /></div>
          <div className="field">
            <label className="lbl" htmlFor="nfcCardId">Stempelkarte (NFC-Kennung)</label>
            <input id="nfcCardId" name="nfcCardId" className="inp mono" defaultValue={p.nfcCardId ?? ""} placeholder="z. B. 04A32B1C5D6E80" />
            <div className="mt-1"><NfcZuweisen feldId="nfcCardId" /></div>
          </div>
          <div className="field sm:col-span-2 lg:col-span-3"><label className="lbl">Notiz</label><input name="note" className="inp" defaultValue={p.note ?? ""} /></div>
          <div className="sm:col-span-2 lg:col-span-3 border-t border-[color:var(--border)] pt-3 text-[.8125rem] font-semibold">Fahrdienst (A4 Touren)</div>
          <div className="field"><label className="lbl">Fährt Touren</label>
            {p.staffType === "FAHRER"
              ? <div className="mt-2 text-[.8125rem]"><span className="pill good"><span className="dot" />ja – Fahrer:in</span> <span className="text-muted">fest, weil als Fahrer:in geführt</span><input type="hidden" name="kannFahren" value="on" /></div>
              : <label className="flex items-center gap-2 text-[.8125rem] mt-2"><input type="checkbox" name="kannFahren" defaultChecked={p.kannFahren} /> kann zusätzlich als Fahrer:in eingeteilt werden</label>}
          </div>
          <div className="field"><label className="lbl">Führerschein</label><input name="fuehrerschein" className="inp" defaultValue={p.fuehrerschein ?? ""} placeholder="z. B. B, C1" /></div>
          <div className="field"><label className="lbl">Straße</label><input name="strasse" className="inp" defaultValue={p.strasse ?? ""} /></div>
          <div className="field"><label className="lbl">PLZ / Ort</label><div className="flex gap-1"><input name="plz" className="inp mono" defaultValue={p.plz ?? ""} style={{ width: 80 }} /><input name="ort" className="inp" defaultValue={p.ort ?? ""} /></div></div>
          <div className="field"><label className="lbl">Fahrertage (leer = alle)</label>
            <div className="flex gap-2 flex-wrap mt-2 text-[.8125rem]">{[1, 2, 3, 4, 5, 6, 7].map((t) => <label key={t} className="flex items-center gap-1"><input type="checkbox" name="fahrerTage" value={t} defaultChecked={p.fahrerTage.includes(t)} />{WOCHENTAGE_KURZ[t]}</label>)}</div></div>
          <div className="field sm:col-span-2"><label className="lbl">Login (optional – für „Mein Bereich“: eigene Zeiten, Urlaubskonto, Urlaubsantrag)</label>
            <select name="userId" className="inp" defaultValue={p.userId ?? ""}><option value="">— kein Login —</option>{fahrerLogins.map((u) => <option key={u.id} value={u.id}>{u.name} · {u.email} ({u.role}{u.isActive ? "" : ", gesperrt"})</option>)}</select>
            <div className="text-[.72rem] text-muted mt-1">Konten werden in der Benutzerverwaltung angelegt (Rolle „Mitarbeiter:in“ für reinen Selbstservice); hier wird die Person verknüpft. Liegt der Austritt zurück, wird der Login automatisch gesperrt. Touren laufen über das Fahrzeug-Tablet, dafür ist kein Login nötig.</div></div>
        </div>
        <div className="p-4 border-t border-[color:var(--border)]"><button type="submit" className="btn primary">Speichern</button></div>
      </form>

      {/* Arbeitszeit: fixe Wochenverteilung (Teilzeit § 19c AZG) – Soll je Tag statt Wochenstunden ÷ 5 */}
      <form action={verteilungSpeichern} className="panel mt-4">
        <input type="hidden" name="staffId" value={p.id} />
        <div className="panel-h"><h3>Arbeitszeit – Wochenverteilung &amp; Zeitkonto</h3><span className="text-xs text-muted">Soll je Wochentag in Stunden; Summe ergibt die Wochenstunden</span></div>
        <div className="p-4 grid gap-3" style={{ gridTemplateColumns: "repeat(7, minmax(60px, 1fr))" }}>
          {[1, 2, 3, 4, 5, 6, 7].map((t) => { const min = sollJeWochentag((p.sollVerteilung as Verteilung | null) ?? null, p.weeklyHours ? Number(p.weeklyHours) : null)[t] ?? 0; return (
            <div className="field" key={t}><label className="lbl">{WOCHENTAGE_KURZ[t]}</label><input name={`tag${t}`} className="inp mono" inputMode="decimal" defaultValue={min ? String(Math.round((min / 60) * 100) / 100) : ""} placeholder="0" /></div>
          ); })}
        </div>
        <div className="px-4 pb-2 grid gap-3 sm:grid-cols-3">
          <div className="field"><label className="lbl">Zeitkonto ab</label><input name="zeitkontoStart" type="date" className="inp mono" defaultValue={p.zeitkontoStart ?? ""} /><div className="text-[.7rem] text-muted">leer = ab Eintritt</div></div>
          <div className="field"><label className="lbl">Anfangssaldo (h, ± aus der bisherigen Führung)</label><input name="zeitkontoAnfang" className="inp mono" inputMode="decimal" defaultValue={p.zeitkontoAnfangMin ? String(Math.round((p.zeitkontoAnfangMin / 60) * 100) / 100) : ""} placeholder="0" /></div>
        </div>
        <div className="p-4 border-t border-[color:var(--border)] flex gap-2 items-center"><button type="submit" className="btn primary">Verteilung speichern</button><Link href={`/zeit/monat?staff=${p.id}`} className="btn ghost">Monatsauswertung →</Link></div>
      </form>

      {/* Ausgabestation: PIN = Berechtigung, die Ausgabe am Laptop zu fuehren */}
      {admin ? (
        <div className="panel mt-4">
          <div className="panel-h"><h3>Ausgabe-PIN (Ausgabelaptop)</h3>
            {p.pinHash ? (p.pinGesperrtBis && p.pinGesperrtBis > new Date() ? <span className="pill bad">gesperrt bis {fmtDateTime(p.pinGesperrtBis)}</span> : p.pinMussAendern ? <span className="pill warn">Einmal-PIN, noch nicht ersetzt</span> : <span className="pill good"><span className="dot" />eigene PIN gesetzt</span>) : <span className="pill muted">keine PIN – darf die Ausgabe nicht führen</span>}
          </div>
          <div className="p-4 flex gap-3 items-center flex-wrap">
            <EinmalPin staffId={p.id} email={p.email} hatPin={!!p.pinHash} />
            {p.pinHash ? <form action={pinEntfernenAction}><input type="hidden" name="staffId" value={p.id} /><button className="btn ghost sm" type="submit">Berechtigung entziehen</button></form> : null}
          </div>
        </div>
      ) : null}

      {/* P6 Zivildienst: Dienstzeit laut Zuweisungsbescheid (ZDG) */}
      {p.staffType === "ZIVILDIENER" ? (
        <form action={ziviStammdaten} className="panel mt-4">
          <input type="hidden" name="staffId" value={p.id} />
          <div className="panel-h"><h3>Zivildienst (ZDG)</h3><span className="text-xs text-muted">9 Monate ab Dienstantritt · Dienstfreistellung {regeln?.ziviFreistellungMonat ?? 2} Werktage je vollem Monat · Verlängerung ab 24 Fehltagen · Wochendienstzeit laut ZISA {regeln ? `${regeln.ziviWocheMinMin / 60}–${regeln.zivi.maxWocheMin / 60} h` : ""}</span></div>
          {ziviHinweise.length ? <ul className="px-4 pt-3 flex flex-col gap-1 text-[.78rem]">{ziviHinweise.map((h) => <li key={h.code} className="flex gap-2 items-start"><span className={`pill ${h.stufe === "FEHLT" ? "bad" : h.stufe === "WARN" ? "warn" : "muted"}`} style={{ flexShrink: 0 }}>{h.stufe === "FEHLT" ? "fehlt" : h.stufe === "WARN" ? "prüfen" : "Hinweis"}</span><span>{h.text}</span></li>)}</ul> : null}
          <div className="p-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <div className="field"><label className="lbl">Dienstantritt</label><input name="ziviBeginn" type="date" className="inp mono" defaultValue={p.ziviBeginn ?? p.employmentStart ?? ""} /></div>
            <div className="field"><label className="lbl">Reguläres Ende</label><input name="ziviEnde" type="date" className="inp mono" defaultValue={p.ziviEnde ?? ""} placeholder="leer = +9 Monate" />{(p.ziviBeginn ?? p.employmentStart) && !p.ziviEnde ? <div className="text-[.7rem] text-muted">berechnet: {fmtDate(zivildienstEnde((p.ziviBeginn ?? p.employmentStart)!))}</div> : null}</div>
            <div className="field"><label className="lbl">Zuweisungsbescheid (GZ)</label><input name="ziviBescheid" className="inp mono" defaultValue={p.ziviBescheid ?? ""} /></div>
            <div className="field"><label className="lbl">Fehltage aus früherer Einsatzstelle</label><input name="ziviFehltageVor" className="inp mono" inputMode="numeric" defaultValue={p.ziviFehltageVor || ""} placeholder="0" /></div>
          </div>
          <div className="p-4 border-t border-[color:var(--border)] flex gap-2 items-center"><button type="submit" className="btn primary">Zivildienst speichern</button><Link href="/personal/zivildienst" className="btn ghost">Zivildienst-Übersicht →</Link><span className="text-xs text-muted">Wochendienstzeit laut Bescheid oben bei Wochenstunden/Verteilung eintragen.</span></div>
        </form>
      ) : null}

      {/* P5 Dienstplan: Standard-Dienst je Wochentag – Vorlage fuer "Woche aus Standard fuellen" */}
      {(() => {
        const soll = sollJeWochentag((p.sollVerteilung as Verteilung | null) ?? null, p.weeklyHours ? Number(p.weeklyHours) : null);
        const gespeichert = (p.dienstStandard as DienstStandard | null) ?? null;
        const std = gespeichert ?? standardAusVerteilung(soll);
        return (
          <form action={standardSpeichern} className="panel mt-4">
            <input type="hidden" name="staffId" value={p.id} />
            <div className="panel-h"><h3>Dienstplan – Standard-Dienst je Wochentag</h3><span className="text-xs text-muted">{gespeichert ? "gespeichert" : "Vorschlag aus der Wochenverteilung (Beginn 08:00) – noch nicht gespeichert"}</span></div>
            <div className="twrap"><table className="data"><thead><tr><th>Tag</th><th>Von</th><th>Bis</th><th>Pause (min)</th><th>Standort</th><th>Tätigkeit</th></tr></thead>
              <tbody>{[1, 2, 3, 4, 5, 6, 7].map((t) => { const s = std[String(t)]; return (
                <tr key={t}>
                  <td><b>{WOCHENTAGE_KURZ[t]}</b>{soll[t] ? <span className="text-xs text-muted"> Soll {Math.round((soll[t] / 60) * 100) / 100} h</span> : null}</td>
                  <td><input name={`von${t}`} type="time" className="inp mono" defaultValue={s?.von ?? ""} /></td>
                  <td><input name={`bis${t}`} type="time" className="inp mono" defaultValue={s?.bis ?? ""} /></td>
                  <td><input name={`pause${t}`} className="inp mono" inputMode="numeric" defaultValue={s?.pause ?? ""} style={{ width: 70 }} /></td>
                  <td><select name={`loc${t}`} className="inp" defaultValue={s?.location ?? p.locationId ?? ""}><option value="">—</option>{locs.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}</select></td>
                  <td><select name={`taet${t}`} className="inp" defaultValue={s?.taetigkeit ?? (p.kannFahren ? "FAHRDIENST" : "AUSGABE")}>{Object.entries(TAETIGKEIT_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></td>
                </tr>); })}</tbody></table></div>
            <div className="p-4 border-t border-[color:var(--border)] flex gap-2 items-center"><button type="submit" className="btn primary">Standard speichern</button><Link href="/dienstplan" className="btn ghost">Dienstplan →</Link><span className="text-xs text-muted">Leere Zeilen = kein Dienst an dem Tag. „Aus Standard füllen“ im Dienstplan nutzt diese Vorlage.</span></div>
          </form>
        );
      })()}

      {/* Urlaub nach UrlG: Urlaubsjahr, Wochen, Uebertrag aus alter Fuehrung, Vordienstzeiten */}
      <form action={urlaubStammdaten} className="panel mt-4">
        <input type="hidden" name="staffId" value={p.id} />
        <div className="panel-h"><h3>Urlaub – Stammdaten (UrlG)</h3><span className="text-xs text-muted">Anspruch ergibt sich aus Wochen × Arbeitstagen der Verteilung</span></div>
        <div className="p-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <div className="field"><label className="lbl">Urlaubsjahr</label><select name="urlaubsjahr" className="inp" defaultValue={p.urlaubsjahr}><option value="ARBEIT">Arbeitsjahr (ab Eintritt)</option><option value="KALENDER">Kalenderjahr</option></select></div>
          <div className="field"><label className="lbl">Wochen</label><select name="urlaubWochen" className="inp" defaultValue={p.urlaubWochen}><option value="5">5 Wochen</option><option value="6">6 Wochen (ab 25 Dienstjahren)</option></select></div>
          <div className="field"><label className="lbl">Resturlaub aus alter Führung (Tage)</label><input name="urlaubUebertragTage" className="inp mono" inputMode="decimal" defaultValue={Number(p.urlaubUebertragTage) ? String(p.urlaubUebertragTage) : ""} placeholder="0" /></div>
          <div className="field"><label className="lbl">gilt für Urlaubsjahr ab</label><input name="urlaubUebertragAb" type="date" className="inp mono" defaultValue={p.urlaubUebertragAb ?? ""} /></div>
          <div className="field"><label className="lbl">Vordienstzeiten (Jahre)</label><input name="dienstjahreAnrechnung" className="inp mono" inputMode="decimal" defaultValue={Number(p.dienstjahreAnrechnung) ? String(p.dienstjahreAnrechnung) : ""} placeholder="0" /></div>
        </div>
        <div className="p-4 border-t border-[color:var(--border)] flex gap-2 items-center"><button type="submit" className="btn primary">Urlaubsdaten speichern</button><Link href={`/abwesenheiten/konto?staff=${p.id}`} className="btn ghost">Urlaubskonto →</Link>{!p.employmentStart ? <span className="text-xs" style={{ color: "var(--warn)" }}>Eintrittsdatum fehlt – ohne Eintritt kein Urlaubsjahr.</span> : null}</div>
      </form>

      {/* P2 Personalakte: Dienstzettel-Daten (§ 2 AVRAG), OeGK-Anmeldung, Notfallkontakt – nur Admin */}
      {admin ? (
        <>
          <form action={akteSpeichern} className="panel mt-4">
            <input type="hidden" name="staffId" value={p.id} />
            <div className="panel-h"><h3>Personalakte – Dienstverhältnis (AVRAG)</h3>
              {hinweise.length ? <span className={`pill ${hinweise.some((h) => h.stufe === "FEHLT") ? "bad" : hinweise.some((h) => h.stufe === "WARN") ? "warn" : "muted"}`}>{hinweise.filter((h) => h.stufe === "FEHLT").length} fehlend · {hinweise.filter((h) => h.stufe === "WARN").length} Hinweise</span> : <span className="pill good"><span className="dot" />vollständig</span>}
            </div>
            {hinweise.length ? <ul className="px-4 pt-3 flex flex-col gap-1 text-[.78rem]">{hinweise.map((h) => <li key={h.code} className="flex gap-2 items-start"><span className={`pill ${stufeFarbe[h.stufe]}`} style={{ flexShrink: 0 }}>{h.stufe === "FEHLT" ? "fehlt" : h.stufe === "WARN" ? "Frist" : "Hinweis"}</span><span>{h.text}</span></li>)}</ul> : null}
            <div className="p-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <div className="field"><label className="lbl">Geburtsdatum</label><input name="geburtsdatum" type="date" className="inp mono" defaultValue={p.geburtsdatum ?? ""} /></div>
              <div className="field"><label className="lbl">SV-Nummer</label><input name="svNummer" className="inp mono" inputMode="numeric" defaultValue={p.svNummer ?? ""} placeholder="10-stellig" /></div>
              <div className="field"><label className="lbl">Staatsbürgerschaft</label><input name="staatsbuergerschaft" className="inp" defaultValue={p.staatsbuergerschaft ?? ""} placeholder="z. B. Österreich" /></div>
              <div className="field"><label className="lbl">Beschäftigungsart</label><select name="beschaeftigung" className="inp" defaultValue={p.beschaeftigung ?? ""}><option value="">— wählen —</option>{Object.entries(BESCHAEFTIGUNG_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></div>
              <div className="field sm:col-span-2"><label className="lbl">Tätigkeit / Verwendung</label><input name="taetigkeit" className="inp" defaultValue={p.taetigkeit ?? ""} placeholder="z. B. Mitarbeiter:in Ausgabe und Fahrdienst" /></div>
              <div className="field"><label className="lbl">Einstufung</label><input name="kvEinstufung" className="inp" defaultValue={p.kvEinstufung ?? ""} placeholder="kein KV / Verwendungsgruppe" /></div>
              <div className="field"><label className="lbl">Grundgehalt brutto (€/Monat)</label><input name="gehaltBrutto" className="inp mono" inputMode="decimal" defaultValue={p.gehaltBrutto ? String(p.gehaltBrutto) : ""} /></div>
              <div className="field"><label className="lbl">Probezeit bis</label><input name="probezeitBis" type="date" className="inp mono" defaultValue={p.probezeitBis ?? ""} />{p.employmentStart ? <div className="text-[.7rem] text-muted">max. {fmtDate(probezeitMax(p.employmentStart))}</div> : null}</div>
              <div className="field"><label className="lbl">Befristet bis</label><input name="befristetBis" type="date" className="inp mono" defaultValue={p.befristetBis ?? ""} /><div className="text-[.7rem] text-muted">leer = unbefristet</div></div>
              <div className="field"><label className="lbl">Kündigungsfrist</label><input name="kuendigungsfrist" className="inp" defaultValue={p.kuendigungsfrist ?? ""} placeholder="gesetzlich (§ 20 AngG)" /></div>
              <div className="field"><label className="lbl">Dienstzettel ausgehändigt am</label><input name="dienstzettelAm" type="date" className="inp mono" defaultValue={p.dienstzettelAm ?? ""} /></div>
              <div className="field"><label className="lbl">Notfallkontakt</label><input name="notfallName" className="inp" defaultValue={p.notfallName ?? ""} placeholder="Name" /></div>
              <div className="field"><label className="lbl">Notfall-Telefon</label><input name="notfallTel" className="inp mono" defaultValue={p.notfallTel ?? ""} /></div>
              <div className="field"><label className="lbl">Beendigungsart</label><select name="austrittGrund" className="inp" defaultValue={p.austrittGrund ?? ""}><option value="">—</option>{Object.entries(AUSTRITT_GRUND_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></div>
              {p.employmentEnd ? <div className="field"><label className="lbl">Aufbewahrung bis</label><div className="mt-2 text-[.8125rem] mono">{fmtDate(aufbewahrungBis(p.employmentEnd))}</div><div className="text-[.7rem] text-muted">7 Jahre nach Austritt (§ 132 BAO), danach automatische Löschung</div></div> : null}
            </div>
            <div className="p-4 border-t border-[color:var(--border)] flex gap-2 items-center"><button type="submit" className="btn primary">Personalakte speichern</button><a href={`/druck/dienstzettel?staff=${p.id}`} className="btn ghost">Dienstzettel drucken →</a></div>
          </form>

          <div className="panel mt-4">
            <div className="panel-h"><h3>Dokumente</h3><span className="pill muted">{dokumente.length}</span><span className="text-xs text-muted">nur Admin · PDF, Bild oder DOCX bis 20 MB</span></div>
            <div className="twrap"><table className="data"><thead><tr><th>Art</th><th>Bezeichnung</th><th>gültig bis</th><th>abgelegt</th><th></th></tr></thead>
              <tbody>{dokumente.map((d) => <tr key={d.id}>
                <td><span className="pill muted">{DOK_ART_LABEL[d.art] ?? d.art}</span></td>
                <td><a href={`/dokument/personal/${d.id}`} target="_blank" rel="noopener">{d.bezeichnung}</a></td>
                <td className="mono">{d.gueltigBis ? <span style={{ color: d.gueltigBis < heute ? "var(--bad)" : undefined }}>{fmtDate(d.gueltigBis)}</span> : "—"}</td>
                <td className="text-xs text-muted">{fmtDateTime(d.createdAt)}</td>
                <td><form action={dokumentLoeschen}><input type="hidden" name="id" value={d.id} /><button className="btn ghost sm" type="submit">Löschen</button></form></td>
              </tr>)}
              {dokumente.length === 0 ? <tr><td colSpan={5}><div className="empty">Noch keine Dokumente – Dienstzettel unterschrieben, Zeugnisse, Führerschein, Unterweisungen.</div></td></tr> : null}</tbody></table></div>
            <form action={dokumentHochladen} className="p-4 border-t border-[color:var(--border)] grid gap-3 sm:grid-cols-5 items-end">
              <input type="hidden" name="staffId" value={p.id} />
              <div className="field"><label className="lbl">Art</label><select name="art" className="inp" defaultValue="DIENSTZETTEL">{Object.entries(DOK_ART_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></div>
              <div className="field"><label className="lbl">Bezeichnung</label><input name="bezeichnung" className="inp" placeholder="leer = Dateiname" /></div>
              <div className="field"><label className="lbl">gültig bis (optional)</label><input name="gueltigBis" type="date" className="inp mono" /></div>
              <div className="field"><label className="lbl">Datei</label><input name="file" type="file" className="inp" accept=".pdf,.png,.jpg,.jpeg,.webp,.docx" required /></div>
              <div><button className="btn" type="submit">Hochladen</button></div>
            </form>
          </div>
        </>
      ) : null}
    </div>
  );
}
