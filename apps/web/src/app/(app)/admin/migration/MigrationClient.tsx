"use client";

import { useState } from "react";
import { importOrte, analyzeFamilien, commitFamilien, type OrteResult, type FamAnalyze, type FamCommit } from "./actions";

function fd(file: File): FormData { const f = new FormData(); f.append("file", file); return f; }

export function MigrationClient() {
  // Orte
  const [orteFile, setOrteFile] = useState<File | null>(null);
  const [orteRes, setOrteRes] = useState<OrteResult | null>(null);
  const [orteBusy, setOrteBusy] = useState(false);

  // Familien
  const [famFile, setFamFile] = useState<File | null>(null);
  const [analyze, setAnalyze] = useState<FamAnalyze | null>(null);
  const [commit, setCommit] = useState<FamCommit | null>(null);
  const [famBusy, setFamBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function runOrte() {
    if (!orteFile) return;
    setOrteBusy(true); setOrteRes(null); setErr(null);
    try { setOrteRes(await importOrte(fd(orteFile))); }
    catch (e) { setErr(`Orte-Import fehlgeschlagen: ${String(e)}`); }
    finally { setOrteBusy(false); }
  }
  async function runAnalyze() {
    if (!famFile) return;
    setFamBusy(true); setAnalyze(null); setCommit(null); setErr(null);
    try { setAnalyze(await analyzeFamilien(fd(famFile))); }
    catch (e) { setErr(`Analyse fehlgeschlagen: ${String(e)}`); }
    finally { setFamBusy(false); }
  }
  async function runCommit() {
    if (!famFile) return;
    setFamBusy(true); setErr(null);
    try { setCommit(await commitFamilien(fd(famFile))); }
    catch (e) { setErr(`Import fehlgeschlagen: ${String(e)}`); }
    finally { setFamBusy(false); }
  }

  return (
    <div className="flex flex-col gap-4">
      {err ? <div className="panel" style={{ borderColor: "var(--bad)" }}><div className="p-4 text-[.9rem]" style={{ color: "var(--bad)" }}>{err}<div className="muted mt-1">Tipp: Seite mit Strg+Shift+R neu laden oder ein privates Fenster nutzen.</div></div></div> : null}
      {/* Schritt 1: Orte */}
      <div className="panel">
        <div className="panel-h"><h3>1 · Orte importieren</h3><span className="sub">Orte.csv (Backup herunterladen → „Orte")</span></div>
        <div className="p-4 flex flex-col gap-3">
          <div className="flex gap-2 items-center flex-wrap">
            <input type="file" accept=".csv,text/csv" className="inp" onChange={(e) => { setOrteFile(e.target.files?.[0] ?? null); setOrteRes(null); }} />
            <button className="btn primary" disabled={!orteFile || orteBusy} onClick={() => void runOrte()}>{orteBusy ? "…" : "Orte importieren"}</button>
          </div>
          {orteRes ? (
            orteRes.ok
              ? <div className="text-[.9rem]">✓ {orteRes.created} neu angelegt, {orteRes.updated} aktualisiert.
                  {orteRes.sample.length ? <div className="muted mt-1">{orteRes.sample.join(" · ")}</div> : null}</div>
              : <div className="pill bad">{orteRes.message}</div>
          ) : null}
        </div>
      </div>

      {/* Schritt 2: Familien */}
      <div className="panel">
        <div className="panel-h"><h3>2 · Familien importieren</h3><span className="sub">Familien.csv (Backup herunterladen → „Familien")</span></div>
        <div className="p-4 flex flex-col gap-3">
          <div className="flex gap-2 items-center flex-wrap">
            <input type="file" accept=".csv,text/csv" className="inp" onChange={(e) => { setFamFile(e.target.files?.[0] ?? null); setAnalyze(null); setCommit(null); }} />
            <button className="btn" disabled={!famFile || famBusy} onClick={() => void runAnalyze()}>{famBusy && !commit ? "…" : "Analysieren"}</button>
          </div>

          {analyze && analyze.ok ? (
            <>
              <div className="text-[.8rem] muted">
                Geparste Zeilen: <b>{analyze.parsedRows}</b> · Erkannte Spalten: {analyze.headers.length ? analyze.headers.join(", ") : "—"}
              </div>
              <div className="grid gap-3 grid-cols-[repeat(auto-fit,minmax(150px,1fr))]">
                <div className="card stat"><div className="k">Importierbar</div><div className="v">{analyze.importable}</div><div className="d">von {analyze.total} Zeilen</div></div>
                <div className="card stat"><div className="k">Gelöscht (übersprungen)</div><div className="v">{analyze.deleted}</div></div>
                <div className="card stat"><div className="k">Gesperrt</div><div className="v">{analyze.blocked}</div></div>
                <div className="card stat"><div className="k">Ohne bekannten Ort</div><div className="v">{analyze.noOrt}</div><div className="d">zuerst Orte importieren</div></div>
                <div className="card stat"><div className="k">Ohne Adresse</div><div className="v">{analyze.noAddress}</div><div className="d">manuell nachtragen</div></div>
                <div className="card stat"><div className="k">Mit Schulden</div><div className="v">{analyze.withDebt}</div></div>
              </div>
              <div className="twrap"><table className="data">
                <thead><tr><th>Name</th><th>Ort</th><th>Gruppe</th><th>Nr.</th><th className="text-right">Schulden</th><th>Status</th></tr></thead>
                <tbody>
                  {analyze.sample.map((s, i) => (
                    <tr key={i}>
                      <td><b>{s.name}</b></td><td>{s.ort ?? "—"}</td><td className="mono">{s.gruppe ?? "—"}</td><td className="mono">{s.nummer ?? "—"}</td>
                      <td className="text-right mono">{s.schulden.toFixed(2)} €</td>
                      <td>{s.status === "gesperrt" ? <span className="pill bad">gesperrt</span> : <span className="pill good">ok</span>}</td>
                    </tr>
                  ))}
                </tbody>
              </table></div>
              {analyze.noOrt > 0 ? <div className="pill warn">Achtung: {analyze.noOrt} Familien haben keinen bekannten Ort – bitte zuerst Schritt 1 (Orte) ausführen.</div> : null}
              <div className="flex gap-2 justify-end">
                <button className="btn primary" disabled={famBusy || analyze.importable === 0} onClick={() => void runCommit()}>{famBusy ? "Importiere…" : `${analyze.importable} Familien importieren`}</button>
              </div>
            </>
          ) : analyze && !analyze.ok ? <div className="pill bad">{analyze.message}</div> : null}

          {commit ? (
            commit.ok
              ? <div className="panel" style={{ borderColor: "var(--good)" }}><div className="p-4">✓ Import abgeschlossen: <b>{commit.persons}</b> Personen, <b>{commit.cards}</b> Karten angelegt, {commit.skipped} übersprungen.</div></div>
              : <div className="pill bad">{commit.message}</div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
