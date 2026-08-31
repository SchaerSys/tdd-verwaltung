"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { lookupCard, searchByName, recordDistribution, getActiveCards, issueCardKiosk, savePersonNote, payDebt, blockCardKiosk, unblockCardKiosk, type Eligibility, type CachedCard, type IssueResult } from "./actions";
import { Footer } from "@/components/Footer";
import { fmtDate } from "@/lib/format";

const CACHE_KEY = "tdd_kiosk_cards";
const QUEUE_KEY = "tdd_kiosk_queue";

interface QueueItem { clientRef: string; cardId: string; name: string; at: string; amountDue?: number; moneyForgotten?: boolean; settleDebt?: boolean; note?: string | null }

const eur = (n: number) => n.toLocaleString("de-AT", { style: "currency", currency: "EUR" });

function readCache(): CachedCard[] {
  try { return JSON.parse(localStorage.getItem(CACHE_KEY) ?? "[]"); } catch { return []; }
}
function readQueue(): QueueItem[] {
  try { return JSON.parse(localStorage.getItem(QUEUE_KEY) ?? "[]"); } catch { return []; }
}
function writeQueue(q: QueueItem[]) { localStorage.setItem(QUEUE_KEY, JSON.stringify(q)); }

function offlineLookup(code: string): Eligibility {
  const clean = code.replace(/\s+/g, "").trim();
  const card = readCache().find((c) => c.cardNumber === clean);
  if (!card) return { status: "NOTFOUND", cardNumber: clean };
  const todayStr = new Date().toISOString().slice(0, 10);
  const base = { cardId: card.cardId, cardNumber: card.cardNumber, name: card.name, validTo: card.validTo };
  if (card.validTo < todayStr) return { ...base, status: "EXPIRED" };
  return { ...base, status: "OK" };
}

export function KioskClient({ locationName, initialCards, logout }: { locationName: string; initialCards: CachedCard[]; logout?: () => Promise<void> }) {
  const [online, setOnline] = useState(true);
  const [pending, setPending] = useState(0);
  const [scanVal, setScanVal] = useState("");
  const [result, setResult] = useState<Eligibility | null>(null);
  const [confirmed, setConfirmed] = useState<string | null>(null);
  const [nameHits, setNameHits] = useState<Eligibility[] | null>(null);
  const [issued, setIssued] = useState<IssueResult | null>(null);
  const [issuing, setIssuing] = useState(false);
  const [moneyForgotten, setMoneyForgotten] = useState(false);
  const [paying, setPaying] = useState(false);
  const [paidMsg, setPaidMsg] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [photoError, setPhotoError] = useState(false);
  const scanRef = useRef<HTMLInputElement>(null);

  const focusScan = useCallback(() => { setTimeout(() => scanRef.current?.focus(), 50); }, []);

  const syncQueue = useCallback(async () => {
    if (!navigator.onLine) return;
    let q = readQueue();
    for (const item of [...q]) {
      try {
        await recordDistribution(item.cardId, item.clientRef, { amountDue: item.amountDue, moneyForgotten: item.moneyForgotten, settleDebt: item.settleDebt, note: item.note });
        q = q.filter((x) => x.clientRef !== item.clientRef);
        writeQueue(q);
      } catch { /* später erneut */ }
    }
    setPending(readQueue().length);
  }, []);

  useEffect(() => {
    localStorage.setItem(CACHE_KEY, JSON.stringify(initialCards));
    setOnline(navigator.onLine);
    setPending(readQueue().length);
    const on = () => { setOnline(true); void syncQueue(); void refreshCache(); };
    const off = () => setOnline(false);
    window.addEventListener("online", on);
    window.addEventListener("offline", off);
    if ("serviceWorker" in navigator) navigator.serviceWorker.register("/kiosk-sw.js").catch(() => {});
    void syncQueue();
    focusScan();
    const iv = setInterval(() => void syncQueue(), 30000);
    return () => { window.removeEventListener("online", on); window.removeEventListener("offline", off); clearInterval(iv); };
  }, [initialCards, syncQueue, focusScan]);

  // Notiz aus dem Scan-Ergebnis übernehmen (bleibt bei jedem Scan sichtbar).
  useEffect(() => { setNote(result?.note ?? ""); setPhotoError(false); }, [result?.personId, result?.note]);

  async function refreshCache() {
    try { const c = await getActiveCards(); localStorage.setItem(CACHE_KEY, JSON.stringify(c)); } catch { /* offline */ }
  }

  async function doScan(code: string) {
    setNameHits(null); setConfirmed(null);
    const c = code.trim();
    if (!c) return;
    if (navigator.onLine) {
      try { setResult(await lookupCard(c)); }
      catch { setResult(offlineLookup(c)); }
    } else {
      setResult(offlineLookup(c));
    }
    setScanVal("");
  }

  async function persistNote() {
    if (!result?.personId) return;
    if ((result.note ?? "") === note) return; // nichts geändert
    if (navigator.onLine) { try { await savePersonNote(result.personId, note); setResult({ ...result, note }); } catch { /* ignore */ } }
  }

  async function blockNow() {
    if (!result?.cardId) return;
    const reason = window.prompt("Grund der Sperre (optional):", result.note ?? "");
    if (reason === null) return; // abgebrochen
    try { await blockCardKiosk(result.cardId, reason); setResult({ ...result, status: "BLOCKED", reason: reason.trim() || "am Tresen gesperrt" }); }
    catch { alert("Sperren fehlgeschlagen."); }
  }

  async function unblockNow() {
    if (!result?.cardId) return;
    try { await unblockCardKiosk(result.cardId); if (result.cardNumber) await doScan(result.cardNumber); }
    catch { alert("Entsperren fehlgeschlagen."); }
  }

  async function payAndUnblock() {
    if (!result?.cardId) return;
    setPaying(true);
    try {
      await payDebt(result.cardId, crypto.randomUUID()); // begleicht offene Schuld (0 falls keine)
      await unblockCardKiosk(result.cardId);
      if (result.cardNumber) await doScan(result.cardNumber); // zurück auf reguläre Ansicht
    } catch { alert("Aktion fehlgeschlagen (offline?)."); }
    finally { setPaying(false); }
  }

  async function payNow() {
    if (!result?.cardId || !result.debt || result.debt <= 0) return;
    setPaying(true);
    try {
      const r = await payDebt(result.cardId, crypto.randomUUID());
      if (r.ok) { setPaidMsg(`✓ ${eur(r.settled)} beglichen · ${new Date().toLocaleTimeString("de-AT")}`); setResult({ ...result, debt: 0 }); }
    } catch { alert("Zahlung konnte nicht gespeichert werden (offline?)."); }
    finally { setPaying(false); }
  }

  async function confirm() {
    if (!result?.cardId) return;
    const clientRef = crypto.randomUUID();
    const opts = { amountDue: result.amountDue, moneyForgotten, note };
    const item: QueueItem = { clientRef, cardId: result.cardId, name: result.name ?? "", at: new Date().toISOString(), ...opts };
    if (navigator.onLine) {
      try { await recordDistribution(result.cardId, clientRef, opts); setConfirmed(new Date().toLocaleTimeString("de-AT")); }
      catch { const q = readQueue(); q.push(item); writeQueue(q); setPending(q.length); setConfirmed("offline gespeichert"); }
    } else {
      const q = readQueue(); q.push(item); writeQueue(q); setPending(q.length); setConfirmed("offline gespeichert");
    }
  }

  function reset() { setResult(null); setConfirmed(null); setNameHits(null); setIssued(null); setScanVal(""); setMoneyForgotten(false); setPaying(false); setPaidMsg(null); setNote(""); focusScan(); }

  async function issue(personId: string) {
    setIssuing(true);
    try {
      const r = await issueCardKiosk(personId, 6);
      if (r.ok) { setIssued(r); setNameHits(null); setResult(null); }
      else alert(r.error ?? "Kartenausstellung fehlgeschlagen");
    } finally { setIssuing(false); }
  }

  async function runNameSearch(q: string) {
    if (!navigator.onLine) { setNameHits([]); return; }
    setNameHits(await searchByName(q));
  }

  const isOk = result?.status === "OK";
  const noReason: Record<string, string> = {
    EXPIRED: "Karte abgelaufen", BLOCKED: "Karte gesperrt", REPLACED: "Karte wurde ersetzt",
    NOTFOUND: "Karte nicht gefunden", NOCARD: "Keine Karte vorhanden",
  };

  return (
    <div className="kiosk">
      <div className="k-top">
        <div className="k-loc">◎ Tresen · {locationName}</div>
        <div className="k-online">
          {online ? <span className="pill good"><span className="dot" />Online</span> : <span className="pill bad"><span className="dot" />Offline</span>}
          {pending > 0 ? <span className="pill warn">{pending} in Warteschlange</span> : null}
          <span className="rolepill">Kasse</span>
          {logout ? <form action={logout}><button type="submit" className="k-logout">Abmelden</button></form> : null}
        </div>
      </div>

      <div className="k-body">
        {issued ? (
          <div className="k-inner">
            <div className="k-result ok show">
              <div className="k-badge">✓</div>
              <div className="k-status">Karte ausgestellt</div>
              <div className="k-person">
                <div className="k-photo">{(issued.name ?? "?").split(" ").map((w) => w[0]).join("").slice(0, 2).toUpperCase()}</div>
                <div><div className="pn">{issued.name}</div><div className="pd">Karte {issued.cardNumber}</div></div>
              </div>
              <div className="k-valid">Gültig bis <b>{fmtDate(issued.validTo)}</b></div>
              <a className="btn-huge" href={`/druck/karte/${issued.cardId}`} target="_blank" rel="noreferrer">🖨 Karte drucken</a>
              <button className="btn-huge re" onClick={reset}>Fertig</button>
            </div>
          </div>
        ) : !result ? (
          <div className="k-inner">
            <div className="scanbox">
              <div style={{ fontSize: "2.4rem" }}>◎</div>
              <h2 style={{ fontSize: "1.4rem" }}>Karte scannen</h2>
              <div className="muted">Barcode scannen oder Nummer eingeben und Enter</div>
              <input
                ref={scanRef} className="big-inp" value={scanVal} placeholder="2 041 …" inputMode="numeric"
                onChange={(e) => setScanVal(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); void doScan(scanVal); } }}
              />
              <button className="btn primary" onClick={() => void doScan(scanVal)}>Prüfen</button>
            </div>

            <div className="namesearch">
              <div className="lbl" style={{ marginBottom: 6 }}>Nicht gefunden? Suche nach Name, Adresse oder Telefon</div>
              <input className="inp" placeholder="Name, Adresse oder Telefon…" onChange={(e) => { const v = e.target.value; if (v.length >= 2) void runNameSearch(v); else setNameHits(null); }} />
              {nameHits && nameHits.length > 0 ? (
                <div className="panel" style={{ marginTop: 8 }}>
                  {nameHits.map((h, i) => (
                    <div key={i} className="namehit" style={{ cursor: "default" }}>
                      <div className="flex-1 min-w-0">
                        <div className="font-semibold">{h.name}</div>
                        <span className={`pill ${h.status === "OK" ? "good" : "muted"}`}>{h.status === "OK" ? "berechtigt" : (noReason[h.status] ?? h.status)}</span>
                      </div>
                      <div className="flex gap-2">
                        {h.status === "OK" && h.cardNumber ? <button className="btn sm" onClick={() => void doScan(h.cardNumber!)}>Anzeigen</button> : null}
                        {h.personId ? <button className="btn primary sm" disabled={issuing} onClick={() => void issue(h.personId!)}>{issuing ? "…" : "Karte ausstellen"}</button> : null}
                      </div>
                    </div>
                  ))}
                </div>
              ) : null}
              {nameHits && nameHits.length === 0 ? <div className="empty" style={{ color: "var(--bad)", fontWeight: 600 }}>⚠ Person nicht registriert.</div> : null}
            </div>
          </div>
        ) : (
          <div className="k-inner">
            <div className={`k-result ${isOk ? "ok" : "no"} show`}>
              <div className="k-badge">{isOk ? "✓" : "✕"}</div>
              <div className="k-status">{isOk ? "Berechtigt" : "Nicht berechtigt"}</div>
              <div className="k-person">
                <div className="k-photo">
                  {result.photoRef && result.personId && !photoError
                    ? <img src={`/foto/${result.personId}`} alt="" className="k-photo-img" onError={() => setPhotoError(true)} />
                    : (result.name ?? "?").split(" ").map((w) => w[0]).join("").slice(0, 2).toUpperCase()}
                </div>
                <div><div className="pn">{result.name ?? "Unbekannt"}</div><div className="pd">{result.cardNumber ? `Karte ${result.cardNumber}` : "—"}</div></div>
              </div>

              {isOk && result.familienNr != null ? (
                <div className="k-ident">
                  <div><span>Ort</span><b>{result.locationName ?? "—"}</b></div>
                  <div><span>Gruppe</span><b>{result.gruppe ?? "—"}</b></div>
                  <div><span>Nummer</span><b>{result.familienNr}</b></div>
                </div>
              ) : null}

              {isOk && result.reissued
                ? <div className="k-reissued">🆕 Neue Karte erstellt: <b>{result.cardNumber}</b> · bitte drucken</div>
                : null}

              {isOk
                ? <div className="k-valid">Gültig bis <b>{fmtDate(result.validTo)}</b></div>
                : <div className="k-valid">{noReason[result.status] ?? "Nicht berechtigt"}{result.reason ? ` · ${result.reason}` : ""}</div>}

              {isOk && result.adults != null ? (
                <div className="k-pay">
                  <div className="k-pay-row">
                    <span>Erwachsene / Kinder</span>
                    <b>{result.adults} / {result.children ?? 0}</b>
                  </div>
                  <div className="k-pay-row">
                    <span>Letzte Anwesenheit</span>
                    <b>{fmtDate(result.lastVisit)}</b>
                  </div>
                  {result.debt && result.debt > 0 ? (
                    <div className="k-pay-row debt">
                      <span>Offene Schulden</span>
                      <div className="flex items-center gap-2">
                        <b>{eur(result.debt)}</b>
                        <button className="k-pay-btn" disabled={paying} onClick={() => void payNow()}>{paying ? "…" : "💶 Bezahlt"}</button>
                      </div>
                    </div>
                  ) : null}
                  {paidMsg ? <div className="k-pay-row"><span /><b style={{ color: "#c9f5dd" }}>{paidMsg}</b></div> : null}
                  <div className="k-pay-row total">
                    <span>Zu zahlen</span>
                    <b>{eur(moneyForgotten ? 0 : (result.amountDue ?? 0))}</b>
                  </div>
                  {!confirmed ? (
                    <div className="k-pay-opts">
                      <label className={`k-chk ${moneyForgotten ? "on" : ""}`}>
                        <input type="checkbox" checked={moneyForgotten} onChange={(e) => setMoneyForgotten(e.target.checked)} />
                        Geld vergessen
                      </label>
                    </div>
                  ) : null}
                  <div className="k-note">
                    <span>Notiz</span>
                    <textarea className="k-note-inp" rows={2} value={note} placeholder="Notiz zur Person (bleibt gespeichert)…"
                      onChange={(e) => setNote(e.target.value)} onBlur={() => void persistNote()} />
                  </div>
                </div>
              ) : null}

              {isOk && !confirmed ? <button className="btn-huge" onClick={() => void confirm()}>✓ Ausgabe bestätigen</button> : null}
              {confirmed ? <div className="k-confirmed">✓ Ausgabe erfasst · {confirmed}</div> : null}

              {/* Karte (neu) drucken – direkt aus dem Dossier */}
              {isOk && result.cardId
                ? <a className="btn-huge print" href={`/druck/karte/${result.cardId}`} target="_blank" rel="noreferrer" onClick={() => void persistNote()}>🖨 Karte drucken</a>
                : null}

              {/* Person/Karte am Tresen sperren */}
              {isOk && result.cardId
                ? <button className="btn-huge block" onClick={() => void blockNow()}>🚫 Sperren</button>
                : null}

              {/* Abgelaufen / ersetzt / keine Karte: neue Karte direkt am Tresen ausstellen */}
              {!isOk && result.personId && ["EXPIRED", "REPLACED", "NOCARD"].includes(result.status)
                ? <button className="btn-huge" disabled={issuing} onClick={() => void issue(result.personId!)}>{issuing ? "…" : "🪪 Neue Karte ausstellen"}</button>
                : null}

              {/* Gesperrte Person: Schulden begleichen + entsperren, oder nur entsperren */}
              {!isOk && result.cardId && result.status === "BLOCKED" ? (
                <>
                  {result.debt && result.debt > 0 ? <div className="k-reissued">Offene Schulden: <b>{eur(result.debt)}</b></div> : null}
                  <button className="btn-huge" disabled={paying} onClick={() => void payAndUnblock()}>{paying ? "…" : (result.debt && result.debt > 0 ? "💶 Schulden bezahlt & entsperren" : "🔓 Bezahlt & entsperren")}</button>
                  <button className="btn-huge re" onClick={() => void unblockNow()}>Nur entsperren (ohne Zahlung)</button>
                </>
              ) : null}

              <button className="btn-huge re" onClick={reset}>Nächste Karte</button>
            </div>
          </div>
        )}
      </div>
      <Footer />
    </div>
  );
}
