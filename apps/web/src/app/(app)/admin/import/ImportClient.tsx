"use client";

import { useState } from "react";
import { analyzeImport, commitImport, type AnalyzeResult, type CommitResult } from "./actions";
import { fmtDate } from "@/lib/format";

const FIELD_LABELS: Record<string, string> = {
  lastName: "Nachname", firstName: "Vorname", address: "Adresse", postalCode: "PLZ",
  city: "Ort", birthDate: "Geburtsdatum", phone: "Telefon", email: "E-Mail",
  householdSize: "Haushalt", childrenCount: "Kinder", location: "Standort",
};

export function ImportClient() {
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<AnalyzeResult | null>(null);
  const [commit, setCommit] = useState<CommitResult | null>(null);

  async function analyze() {
    if (!file) return;
    setBusy(true); setCommit(null); setResult(null);
    const fd = new FormData(); fd.append("file", file);
    try { setResult(await analyzeImport(fd)); } finally { setBusy(false); }
  }

  async function doImport() {
    if (!file) return;
    setBusy(true);
    const fd = new FormData(); fd.append("file", file);
    try { setCommit(await commitImport(fd)); } finally { setBusy(false); }
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="panel">
        <div className="panel-h"><h3>Excel-Datei wählen</h3></div>
        <div className="p-4 flex flex-col gap-3">
          <label className="dropzone cursor-pointer block">
            <input
              type="file"
              accept=".xlsx,.xls,.csv"
              className="hidden"
              onChange={(e) => { setFile(e.target.files?.[0] ?? null); setResult(null); setCommit(null); }}
            />
            {file ? <b className="text-[color:var(--text)]">{file.name}</b> : "📄 Klicken und .xlsx auswählen"}
            <div className="text-[.72rem] mt-1">Erwartete Spalten: Nachname, Vorname, Adresse, PLZ, Ort, Geburtsdatum, Telefon, E-Mail, Haushalt, Kinder, Standort</div>
          </label>
          <div className="flex gap-2">
            <button className="btn primary" onClick={analyze} disabled={!file || busy}>
              {busy && !commit ? "Analysiere…" : "Analysieren"}
            </button>
          </div>
        </div>
      </div>

      {result && !result.ok ? (
        <div className="panel"><div className="p-4 text-[color:var(--bad)]">{result.message}</div></div>
      ) : null}

      {result && result.ok ? (
        <>
          <div className="grid gap-4 grid-cols-[repeat(auto-fit,minmax(160px,1fr))]">
            <div className="card stat"><div className="k">Zeilen gesamt</div><div className="v">{result.total}</div></div>
            <div className="card stat"><div className="k">Neu</div><div className="v" style={{ color: "var(--good)" }}>{result.newCount}</div></div>
            <div className="card stat"><div className="k">Dubletten</div><div className="v" style={{ color: "var(--warn)" }}>{result.dupCount}</div></div>
            <div className="card stat"><div className="k">Fehler</div><div className="v" style={{ color: result.errorCount ? "var(--bad)" : undefined }}>{result.errorCount}</div></div>
          </div>

          <div className="panel">
            <div className="panel-h"><h3>Erkannte Spalten</h3></div>
            <div className="p-4 flex flex-wrap gap-2">
              {Object.entries(FIELD_LABELS).map(([f, label]) => {
                const col = result.detected[f];
                return (
                  <span key={f} className={`pill ${col ? "good" : "muted"}`}>
                    {label}{col ? ` ← ${col}` : " (nicht erkannt)"}
                  </span>
                );
              })}
            </div>
          </div>

          <div className="panel">
            <div className="panel-h"><h3>Vorschau (erste Zeilen)</h3></div>
            <div className="twrap">
              <table className="data">
                <thead><tr><th>Nachname</th><th>Vorname</th><th>Geburtsdatum</th><th>Ort</th><th>Status</th></tr></thead>
                <tbody>
                  {result.sample.map((r, i) => (
                    <tr key={i}>
                      <td><b>{r.lastName}</b></td><td>{r.firstName}</td>
                      <td className="mono">{fmtDate(r.birthDate)}</td><td>{r.city ?? "—"}</td>
                      <td>
                        <span className={`pill ${r.status === "Neu" ? "good" : r.status === "Dublette" ? "warn" : "bad"}`}>{r.status}</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {!commit ? (
            <div className="flex gap-2 items-center">
              <button className="btn primary" onClick={doImport} disabled={busy || result.newCount === 0}>
                {busy ? "Importiere…" : `${result.newCount} neue Personen importieren`}
              </button>
              <span className="text-[.72rem] text-[color:var(--muted)]">Dubletten werden übersprungen und nicht angelegt.</span>
            </div>
          ) : null}
        </>
      ) : null}

      {commit ? (
        <div className="panel">
          <div className="p-4">
            {commit.ok ? (
              <div className="flex items-center gap-3">
                <span className="pill good"><span className="dot" />Import abgeschlossen</span>
                <span><b>{commit.inserted}</b> Personen angelegt · <b>{commit.skipped}</b> übersprungen (Dublette/Fehler)</span>
              </div>
            ) : (
              <div className="text-[color:var(--bad)]">{commit.message}</div>
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}
