"use client";

import { useMemo, useState } from "react";
import { createAntrag } from "./actions";
import { INCOME_FIELDS, EXPENSE_FIELDS, sumValues, incomeLimit, suggest, suggestionLabel } from "@/lib/eligibility";
import { antragCheck, checkZusammenfassung } from "@/lib/antrag-check";

interface Loc { id: number; name: string; type: string }

/** Vorbefuellung fuer einen Verlaengerungsantrag (aus dem alten Antrag). */
export interface Vorlage {
  id: string; datum: string;
  firstName: string; lastName: string; birthDate: string; phone: string; email: string;
  address: string; postalCode: string; city: string; pets: string;
  adults: string; childrenU12: string; childrenO12: string;
  targetType: string; intendedLocationId: string;
}

const LEER: Omit<Vorlage, "id" | "datum"> = {
  firstName: "", lastName: "", birthDate: "", phone: "", email: "", address: "", postalCode: "", city: "", pets: "",
  adults: "1", childrenU12: "0", childrenO12: "0", targetType: "AUSGABESTELLE", intendedLocationId: "",
};

export function AntragForm({ locations, vorlage }: { locations: Loc[]; vorlage: Vorlage | null }) {
  const [f, setF] = useState<Omit<Vorlage, "id" | "datum">>(vorlage ?? LEER);
  const [income, setIncome] = useState<Record<string, string>>({});
  const [expense, setExpense] = useState<Record<string, string>>({});
  const [consent, setConsent] = useState(false);
  const set = (k: keyof typeof LEER) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setF({ ...f, [k]: e.target.value });

  const calc = useMemo(() => {
    const toNum = (o: Record<string, string>) => Object.fromEntries(Object.entries(o).map(([k, v]) => [k, parseFloat(v.replace(",", ".")) || 0]));
    const incomeTotal = sumValues(toNum(income));
    const expenseTotal = sumValues(toNum(expense));
    const available = incomeTotal - expenseTotal;
    const limit = incomeLimit(+f.adults || 1, +f.childrenU12 || 0, +f.childrenO12 || 0);
    return { incomeTotal, expenseTotal, available, limit, suggestion: suggest(available, limit) };
  }, [income, expense, f.adults, f.childrenU12, f.childrenO12]);

  const check = antragCheck({ ...f, consent, intendedLocationId: f.intendedLocationId, einnahmenErfasst: calc.incomeTotal > 0 });
  const zsf = checkZusammenfassung(check);

  const sColor = calc.suggestion === "BERECHTIGT" ? "good" : calc.suggestion === "HAERTEFALL" ? "warn" : "bad";
  const eur = (v: number) => v.toLocaleString("de-AT", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " €";
  const locOptions = locations.filter((l) => l.type === f.targetType);

  return (
    <form action={createAntrag} className="flex flex-col gap-4">
      {vorlage ? <input type="hidden" name="vorgaengerAntragId" value={vorlage.id} /> : null}
      <div className="panel">
        <div className="panel-h"><h3>Antragsteller</h3>{vorlage ? <span className="pill muted">aus Antrag vom {vorlage.datum}</span> : null}</div>
        <div className="p-4 grid gap-3 sm:grid-cols-2">
          <div className="field"><label className="lbl">Nachname *</label><input name="lastName" className="inp" required value={f.lastName} onChange={set("lastName")} /></div>
          <div className="field"><label className="lbl">Vorname *</label><input name="firstName" className="inp" required value={f.firstName} onChange={set("firstName")} /></div>
          <div className="field"><label className="lbl">Geburtsdatum</label><input name="birthDate" type="date" className="inp mono" value={f.birthDate} onChange={set("birthDate")} /></div>
          <div className="field"><label className="lbl">Telefon</label><input name="phone" className="inp mono" value={f.phone} onChange={set("phone")} /></div>
          <div className="field sm:col-span-2"><label className="lbl">Adresse</label><input name="address" className="inp" value={f.address} onChange={set("address")} /></div>
          <div className="field"><label className="lbl">PLZ</label><input name="postalCode" className="inp mono" value={f.postalCode} onChange={set("postalCode")} /></div>
          <div className="field"><label className="lbl">Ort</label><input name="city" className="inp" value={f.city} onChange={set("city")} /></div>
          <div className="field"><label className="lbl">E-Mail *</label><input name="email" type="email" className="inp" required value={f.email} onChange={set("email")} /></div>
          <div className="field"><label className="lbl">Haustiere</label><input name="pets" className="inp" placeholder="optional" value={f.pets} onChange={set("pets")} /></div>
        </div>
      </div>

      <div className="panel">
        <div className="panel-h"><h3>Haushalt &amp; Bezugsort</h3></div>
        <div className="p-4 grid gap-3 sm:grid-cols-3">
          <div className="field"><label className="lbl">Erwachsene</label><input name="adults" className="inp mono" inputMode="numeric" value={f.adults} onChange={set("adults")} /></div>
          <div className="field"><label className="lbl">Kinder (bis 12)</label><input name="childrenU12" className="inp mono" inputMode="numeric" value={f.childrenU12} onChange={set("childrenU12")} /></div>
          <div className="field"><label className="lbl">Kinder (ab 12)</label><input name="childrenO12" className="inp mono" inputMode="numeric" value={f.childrenO12} onChange={set("childrenO12")} /></div>
          <div className="field"><label className="lbl">Bezugsort-Typ</label>
            <select name="targetType" className="inp" value={f.targetType} onChange={(e) => setF({ ...f, targetType: e.target.value, intendedLocationId: "" })}>
              <option value="AUSGABESTELLE">Ausgabestelle</option><option value="LADEN">Laden</option>
            </select></div>
          <div className="field sm:col-span-2"><label className="lbl">Standort (empfohlen)</label>
            <select name="intendedLocationId" className="inp" value={f.intendedLocationId} onChange={set("intendedLocationId")}><option value="">— später bei TDD —</option>
              {locOptions.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}</select></div>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-2 items-start">
        <div className="panel">
          <div className="panel-h"><h3>Einnahmen / Monat</h3><b className="mono">{eur(calc.incomeTotal)}</b></div>
          <div className="p-4 flex flex-col gap-2">
            {INCOME_FIELDS.map(([key, label]) => (
              <div key={key} className="flex items-center gap-2">
                <label className="text-[.8125rem] flex-1">{label}</label>
                <input name={`income_${key}`} className="inp mono w-28" inputMode="decimal" placeholder="0" value={income[key] ?? ""} onChange={(e) => setIncome({ ...income, [key]: e.target.value })} />
              </div>
            ))}
          </div>
        </div>
        <div className="panel">
          <div className="panel-h"><h3>Ausgaben / Monat</h3><b className="mono">{eur(calc.expenseTotal)}</b></div>
          <div className="p-4 flex flex-col gap-2">
            {EXPENSE_FIELDS.map(([key, label]) => (
              <div key={key} className="flex items-center gap-2">
                <label className="text-[.8125rem] flex-1">{label}</label>
                <input name={`expense_${key}`} className="inp mono w-28" inputMode="decimal" placeholder="0" value={expense[key] ?? ""} onChange={(e) => setExpense({ ...expense, [key]: e.target.value })} />
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Anspruchsrechner */}
      <div className="panel" style={{ borderColor: `var(--${sColor})` }}>
        <div className="panel-h" style={{ background: `var(--${sColor}-bg)` }}><h3 style={{ color: `var(--${sColor})` }}>Anspruchsprüfung (Vorschlag)</h3>
          <span className={`pill ${sColor}`}>{suggestionLabel(calc.suggestion)}</span></div>
        <div className="p-4 grid grid-cols-2 sm:grid-cols-4 gap-3 text-center">
          <div><div className="text-[.72rem] text-muted">Einnahmen</div><div className="mono font-bold">{eur(calc.incomeTotal)}</div></div>
          <div><div className="text-[.72rem] text-muted">Ausgaben</div><div className="mono font-bold">{eur(calc.expenseTotal)}</div></div>
          <div><div className="text-[.72rem] text-muted">Verfügbar</div><div className="mono font-bold">{eur(calc.available)}</div></div>
          <div><div className="text-[.72rem] text-muted">Einkommensgrenze</div><div className="mono font-bold">{eur(calc.limit)}</div></div>
        </div>
        <div className="px-4 pb-4 text-[.72rem] text-muted">Der Vorschlag ist eine Rechenhilfe – die endgültige Entscheidung trifft der Mensch beim Bescheid.</div>
      </div>

      <label className="flex items-center gap-2 text-[.8125rem]"><input type="checkbox" name="consent" checked={consent} onChange={(e) => setConsent(e.target.checked)} /> DSGVO-Einwilligung des Antragstellers liegt vor (Weitergabe an Gemeinde/Stadt und TDD).</label>

      {/* Vollstaendigkeit – live, vor dem Speichern */}
      <div className="panel" style={{ borderColor: zsf.pflichtFehlt.length ? "var(--bad)" : zsf.empfohlenFehlt.length ? "var(--warn)" : "var(--good)" }}>
        <div className="panel-h"><h3>Vollständigkeit</h3>
          {zsf.vollstaendig ? <span className="pill good"><span className="dot" />vollständig</span>
            : zsf.pflichtFehlt.length ? <span className="pill bad">{zsf.pflichtFehlt.length} Pflichtangabe(n) fehlen</span>
            : <span className="pill warn">{zsf.empfohlenFehlt.length} Empfehlung(en) offen</span>}
        </div>
        <ul className="p-4 flex flex-col gap-1 text-[.8125rem]">
          {check.map((c) => (
            <li key={c.key} className="flex gap-2 items-start">
              <span style={{ color: c.ok ? "var(--good)" : c.pflicht ? "var(--bad)" : "var(--warn)", width: 16, flex: "none" }}>{c.ok ? "✓" : c.pflicht ? "✕" : "○"}</span>
              <span>{c.label}{c.pflicht ? " *" : ""}{!c.ok && c.hinweis ? <span className="text-muted"> – {c.hinweis}</span> : null}</span>
            </li>
          ))}
        </ul>
        <div className="px-4 pb-3 text-[.72rem] text-muted">Speichern geht auch unvollständig – Dokumente kommen im nächsten Schritt dazu. Der positive Bescheid braucht die Pflichtangaben (*).</div>
      </div>

      <div className="flex justify-end"><button type="submit" className="btn primary">{vorlage ? "Verlängerungsantrag speichern" : "Antrag speichern"}</button></div>
    </form>
  );
}
