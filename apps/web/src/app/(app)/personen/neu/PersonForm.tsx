"use client";

import { useActionState, useEffect, useRef, useState, type ChangeEvent } from "react";
import { useRouter } from "next/navigation";
import { createPerson, searchCandidates, type CreateState } from "./actions";
import { ocrForm } from "./ocr-actions";
import type { Candidate } from "@/lib/dedupe";

interface Option { id: number; label: string }
interface LocOption { id: number; name: string; type: string }

function bandClass(b: string) {
  return b === "HIGH" ? "bad" : b === "MID" ? "warn" : "muted";
}

export function PersonForm({
  languages, origins, locations, defaultLocationId,
}: {
  languages: Option[]; origins: Option[]; locations: LocOption[]; defaultLocationId?: number | null;
}) {
  const router = useRouter();
  const [state, action, pending] = useActionState<CreateState, FormData>(createPerson, {});

  const [lastName, setLastName] = useState("");
  const [firstName, setFirstName] = useState("");
  const [birthDate, setBirthDate] = useState("");
  const [address, setAddress] = useState("");
  const [postalCode, setPostalCode] = useState("");
  const [city, setCity] = useState("");
  const [phone, setPhone] = useState("");
  const [adults, setAdults] = useState("");
  const [children, setChildren] = useState("");

  const [live, setLive] = useState<Candidate[]>([]);
  const [searching, setSearching] = useState(false);

  const fileRef = useRef<HTMLInputElement>(null);
  const [ocrBusy, setOcrBusy] = useState(false);
  const [ocrMsg, setOcrMsg] = useState<string | null>(null);

  async function onScan(e: ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    setOcrBusy(true); setOcrMsg("Text wird erkannt… (kann einige Sekunden dauern)");
    const fd = new FormData(); fd.append("image", f);
    try {
      const r = await ocrForm(fd);
      if (!r.ok) setOcrMsg(r.error ?? "Erkennung fehlgeschlagen.");
      else {
        const x = r.fields ?? {};
        if (x.lastName) setLastName(x.lastName);
        if (x.firstName) setFirstName(x.firstName);
        if (x.birthDate) setBirthDate(x.birthDate);
        if (x.address) setAddress(x.address);
        if (x.postalCode) setPostalCode(x.postalCode);
        if (x.city) setCity(x.city);
        if (x.phone) setPhone(x.phone);
        if (x.householdSize != null) setAdults(String(Math.max(0, x.householdSize - (x.childrenCount ?? 0))));
        if (x.childrenCount != null) setChildren(String(x.childrenCount));
        setOcrMsg(`Erkannt (Sicherheit ${r.confidence}%). Bitte prüfen und ergänzen.`);
      }
    } finally { setOcrBusy(false); if (fileRef.current) fileRef.current.value = ""; }
  }

  useEffect(() => {
    if (state.personId) router.replace(`/personen/${state.personId}`);
  }, [state.personId, router]);

  // Live-Dublettensuche (debounced)
  useEffect(() => {
    if (lastName.trim().length < 2) { setLive([]); return; }
    setSearching(true);
    const t = setTimeout(async () => {
      try {
        const r = await searchCandidates({ firstName, lastName, birthDate: birthDate || null, address: address || null, postalCode: postalCode || null });
        setLive(r);
      } finally { setSearching(false); }
    }, 400);
    return () => clearTimeout(t);
  }, [lastName, firstName, birthDate, address, postalCode]);

  const highBlocked = state.candidates && state.candidates.length > 0;

  return (
    <form action={action} className="grid gap-4 lg:grid-cols-[1.4fr_.8fr] items-start">
      <div className="panel">
        <div className="panel-h"><h3>Stammdaten</h3><span className="pill muted">Neu</span></div>
        <div className="p-4">
          <div className="mb-3 flex items-center gap-2 flex-wrap p-3 rounded-[var(--r-sm)] bg-[color:var(--surface-2)] border border-[color:var(--border)]">
            <input ref={fileRef} type="file" accept="image/*,.docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document" className="hidden" onChange={onScan} />
            <button type="button" className="btn" onClick={() => fileRef.current?.click()} disabled={ocrBusy}>
              📷 Foto/Scan oder 📄 Word erfassen
            </button>
            <span className="text-[.72rem] text-[color:var(--muted)]">
              {ocrBusy ? "⏳ " : ""}{ocrMsg ?? "Foto/Scan (OCR) oder Word-Datei (.docx) → Felder werden vorbefüllt (assistierend, bitte prüfen)."}
            </span>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="field"><label className="lbl">Nachname *</label>
              <input name="lastName" className="inp" required value={lastName} onChange={(e) => setLastName(e.target.value)} /></div>
            <div className="field"><label className="lbl">Vorname *</label>
              <input name="firstName" className="inp" required value={firstName} onChange={(e) => setFirstName(e.target.value)} /></div>
            <div className="field"><label className="lbl">Geburtsdatum</label>
              <input name="birthDate" type="date" className="inp mono" value={birthDate} onChange={(e) => setBirthDate(e.target.value)} /></div>
            <div className="field"><label className="lbl">Telefon</label><input name="phone" className="inp mono" value={phone} onChange={(e) => setPhone(e.target.value)} /></div>
            <div className="field sm:col-span-2"><label className="lbl">Adresse</label>
              <input name="address" className="inp" value={address} onChange={(e) => setAddress(e.target.value)} /></div>
            <div className="field"><label className="lbl">PLZ</label>
              <input name="postalCode" className="inp mono" value={postalCode} onChange={(e) => setPostalCode(e.target.value)} /></div>
            <div className="field"><label className="lbl">Ort</label><input name="city" className="inp" value={city} onChange={(e) => setCity(e.target.value)} /></div>
            <div className="field"><label className="lbl">E-Mail</label><input name="email" type="email" className="inp" /></div>
            <div className="field"><label className="lbl">Erwachsene</label><input name="adults" className="inp mono" inputMode="numeric" value={adults} onChange={(e) => setAdults(e.target.value)} /></div>
            <div className="field"><label className="lbl">Kinder</label><input name="childrenCount" className="inp mono" inputMode="numeric" value={children} onChange={(e) => setChildren(e.target.value)} /></div>
            <div className="field"><label className="lbl">Sprache</label>
              <select name="languageId" className="inp"><option value="">—</option>
                {languages.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}</select></div>
            <div className="field"><label className="lbl">Herkunft</label>
              <select name="originId" className="inp"><option value="">—</option>
                {origins.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}</select></div>
            <div className="field sm:col-span-2"><label className="lbl">Notiz</label><input name="note" className="inp" /></div>
            <div className="field sm:col-span-2">
              <label className="flex items-center gap-2 text-[.9rem]">
                <input type="checkbox" name="consent" value="1" />
                DSGVO-Einwilligung zur Datenverarbeitung liegt vor (unterschrieben)
              </label>
            </div>
          </div>

          {state.error ? <div className="mt-3 text-[color:var(--bad)] text-[.8125rem]">{state.error}</div> : null}

          <div className="flex gap-2 justify-end mt-4">
            <button type="submit" className="btn primary" disabled={pending}>
              {pending ? "Speichere…" : "Speichern & prüfen"}
            </button>
          </div>
        </div>
      </div>

      <div className="flex flex-col gap-4">
        <div className="panel">
          <div className="panel-h"><h3>Bezugsort</h3></div>
          <div className="p-4">
            <div className="field"><label className="lbl">Standort (Laden ODER Ausgabestelle)</label>
              <select name="locationId" className="inp" defaultValue={defaultLocationId ?? ""}>
                <option value="">— später zuordnen —</option>
                {locations.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
              </select>
            </div>
          </div>
        </div>

        {/* Live-Dubletten-Panel */}
        {(live.length > 0 || searching) ? (
          <div className="panel" style={{ borderColor: live.some((c) => c.band === "HIGH") ? "var(--bad)" : live.some((c) => c.band === "MID") ? "var(--warn)" : "var(--border)" }}>
            <div className="panel-h"><h3>Mögliche Dubletten {searching ? <span className="text-[color:var(--muted)] font-normal">· suche…</span> : null}</h3>
              <span className="pill muted">{live.length}</span></div>
            <div>
              {live.map((c) => (
                <div key={c.id} className="flex items-center gap-3 px-4 py-3 border-b border-[color:var(--border)] last:border-0">
                  <div className="flex-1 min-w-0">
                    <a href={`/personen/${c.id}`} className="font-semibold hover:underline">{c.name}</a>
                    <div className="text-[.72rem] text-[color:var(--muted)]">
                      {c.birthDate ?? "ohne Geburtsdatum"}{c.location ? ` · ${c.location}` : " · kein Standort"}
                    </div>
                  </div>
                  <div className="text-right">
                    <div className={`font-extrabold tabular-nums ${c.band === "HIGH" ? "text-[color:var(--bad)]" : c.band === "MID" ? "text-[color:var(--warn)]" : ""}`}>{c.score.toFixed(2)}</div>
                    <span className={`pill ${bandClass(c.band)}`}>{c.band === "HIGH" ? "sehr hoch" : c.band === "MID" ? "möglich" : "—"}</span>
                  </div>
                </div>
              ))}
              {live.length === 0 && !searching ? <div className="empty">Keine Treffer.</div> : null}
            </div>
          </div>
        ) : null}

        {/* Warn-Dialog bei blockiertem Speichern (HIGH) */}
        {highBlocked ? (
          <div className="panel" style={{ borderColor: "var(--bad)" }}>
            <div className="panel-h" style={{ background: "var(--bad-bg)" }}>
              <h3 style={{ color: "var(--bad)" }}>⚠ Sehr wahrscheinlich Doppelaufnahme</h3>
            </div>
            <div className="p-4 flex flex-col gap-3">
              <div className="text-[.8125rem] text-[color:var(--muted)]">Diese Person wird offenbar bereits geführt. Bitte prüfen, bevor neu angelegt wird.</div>
              {state.candidates!.map((c) => (
                <div key={c.id} className="flex items-center gap-2">
                  <div className="flex-1"><b>{c.name}</b>
                    <div className="text-[.72rem] text-[color:var(--muted)]">{c.birthDate ?? "—"}{c.location ? ` · ${c.location}` : ""}</div></div>
                  <a href={`/personen/${c.id}`} className="btn sm">Öffnen</a>
                </div>
              ))}
              <div className="field"><label className="lbl">Grund für Neuanlage (Protokoll)</label>
                <input name="reason" className="inp" placeholder="z. B. andere Person, gleiche Daten" /></div>
              <button type="submit" name="force" value="1" className="btn danger" disabled={pending}>
                Trotzdem neu anlegen
              </button>
            </div>
          </div>
        ) : null}
      </div>
    </form>
  );
}
