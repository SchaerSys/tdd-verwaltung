"use client";

import { useMemo, useState } from "react";
import { createAntrag } from "./actions";
import { INCOME_FIELDS, EXPENSE_FIELDS, sumValues, incomeLimit, suggest, suggestionLabel } from "@/lib/eligibility";

interface Loc { id: number; name: string; type: string }

export function AntragForm({ locations }: { locations: Loc[] }) {
  const [income, setIncome] = useState<Record<string, string>>({});
  const [expense, setExpense] = useState<Record<string, string>>({});
  const [adults, setAdults] = useState("1");
  const [cU12, setCU12] = useState("0");
  const [cO12, setCO12] = useState("0");
  const [targetType, setTargetType] = useState("AUSGABESTELLE");

  const calc = useMemo(() => {
    const toNum = (o: Record<string, string>) => Object.fromEntries(Object.entries(o).map(([k, v]) => [k, parseFloat(v.replace(",", ".")) || 0]));
    const incomeTotal = sumValues(toNum(income));
    const expenseTotal = sumValues(toNum(expense));
    const available = incomeTotal - expenseTotal;
    const limit = incomeLimit(+adults || 1, +cU12 || 0, +cO12 || 0);
    return { incomeTotal, expenseTotal, available, limit, suggestion: suggest(available, limit) };
  }, [income, expense, adults, cU12, cO12]);

  const sColor = calc.suggestion === "BERECHTIGT" ? "good" : calc.suggestion === "HAERTEFALL" ? "warn" : "bad";
  const eur = (v: number) => v.toLocaleString("de-AT", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " €";
  const locOptions = locations.filter((l) => l.type === targetType);

  return (
    <form action={createAntrag} className="flex flex-col gap-4">
      <div className="panel">
        <div className="panel-h"><h3>Antragsteller</h3></div>
        <div className="p-4 grid gap-3 sm:grid-cols-2">
          <div className="field"><label className="lbl">Nachname *</label><input name="lastName" className="inp" required /></div>
          <div className="field"><label className="lbl">Vorname *</label><input name="firstName" className="inp" required /></div>
          <div className="field"><label className="lbl">Geburtsdatum</label><input name="birthDate" type="date" className="inp mono" /></div>
          <div className="field"><label className="lbl">Telefon</label><input name="phone" className="inp mono" /></div>
          <div className="field sm:col-span-2"><label className="lbl">Adresse</label><input name="address" className="inp" /></div>
          <div className="field"><label className="lbl">PLZ</label><input name="postalCode" className="inp mono" /></div>
          <div className="field"><label className="lbl">Ort</label><input name="city" className="inp" /></div>
          <div className="field"><label className="lbl">E-Mail *</label><input name="email" type="email" className="inp" required /></div>
          <div className="field"><label className="lbl">Haustiere</label><input name="pets" className="inp" placeholder="optional" /></div>
        </div>
      </div>

      <div className="panel">
        <div className="panel-h"><h3>Haushalt &amp; Bezugsort</h3></div>
        <div className="p-4 grid gap-3 sm:grid-cols-3">
          <div className="field"><label className="lbl">Erwachsene</label><input name="adults" className="inp mono" inputMode="numeric" value={adults} onChange={(e) => setAdults(e.target.value)} /></div>
          <div className="field"><label className="lbl">Kinder (bis 12)</label><input name="childrenU12" className="inp mono" inputMode="numeric" value={cU12} onChange={(e) => setCU12(e.target.value)} /></div>
          <div className="field"><label className="lbl">Kinder (ab 12)</label><input name="childrenO12" className="inp mono" inputMode="numeric" value={cO12} onChange={(e) => setCO12(e.target.value)} /></div>
          <div className="field"><label className="lbl">Bezugsort-Typ</label>
            <select name="targetType" className="inp" value={targetType} onChange={(e) => setTargetType(e.target.value)}>
              <option value="AUSGABESTELLE">Ausgabestelle</option><option value="LADEN">Laden</option>
            </select></div>
          <div className="field sm:col-span-2"><label className="lbl">Standort (optional)</label>
            <select name="intendedLocationId" className="inp"><option value="">— später —</option>
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

      <label className="flex items-center gap-2 text-[.8125rem]"><input type="checkbox" name="consent" /> DSGVO-Einwilligung des Antragstellers liegt vor (Weitergabe an Gemeinde/Stadt und TDD).</label>

      <div className="flex justify-end"><button type="submit" className="btn primary">Antrag speichern</button></div>
    </form>
  );
}
