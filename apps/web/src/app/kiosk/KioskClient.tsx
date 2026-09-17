"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { lookupCard, searchByName, recordDistribution, getActiveCards, issueCardKiosk, savePersonNote, saveBirthDate, payDebt, blockCardKiosk, unblockCardKiosk, todayStats, type Eligibility, type CachedCard, type IssueResult, type Zahlung } from "./actions";
import { KameraScan } from "./KameraScan";
import { Footer } from "@/components/Footer";
import { fmtDate, fmtDateTime } from "@/lib/format";

const CACHE_KEY = "tdd_kiosk_cards";
const QUEUE_KEY = "tdd_kiosk_queue";

interface QueueItem { clientRef: string; cardId: string; name: string; at: string; amountDue?: number; zahlung?: Zahlung; moneyForgotten?: boolean; settleDebt?: boolean; note?: string | null }

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

export function KioskClient({ locationName, initialCards, logout, abschlussHref, wer }: { locationName: string; initialCards: CachedCard[]; logout?: () => Promise<void>; abschlussHref?: string; wer?: string }) {
  const [online, setOnline] = useState(true);
  const [pending, setPending] = useState(0);
  const [scanVal, setScanVal] = useState("");
  const [geb, setGeb] = useState("");
  const [gebFehler, setGebFehler] = useState<string | null>(null);
  const [result, setResult] = useState<Eligibility | null>(null);
  const [confirmed, setConfirmed] = useState<string | null>(null);
  const [today, setToday] = useState<{ count: number; persons: number; sum: number } | null>(null);
  const [nameHits, setNameHits] = useState<Eligibility[] | null>(null);
  const [issued, setIssued] = useState<IssueResult | null>(null);
  const [issuing, setIssuing] = useState(false);
  const [zahlung, setZahlung] = useState<Zahlung>("TOTAL");
  const [fehler, setFehler] = useState<string | null>(null);
  const suchTimer = useRef<number | null>(null);
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
        await recordDistribution(item.cardId, item.clientRef, { amountDue: item.amountDue, zahlung: item.zahlung, moneyForgotten: item.moneyForgotten, settleDebt: item.settleDebt, note: item.note });
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
  const loadToday = useCallback(async () => { try { setToday(await todayStats()); } catch { /* offline – Zähler bleibt */ } }, []);
  useEffect(() => { void loadToday(); const iv = setInterval(() => void loadToday(), 60000); return () => clearInterval(iv); }, [loadToday]);

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

  async function confirm(art: Zahlung = zahlung) {
    if (!result?.cardId) return;
    setFehler(null);
    const clientRef = crypto.randomUUID();
    const opts = { amountDue: result.amountDue, zahlung: art, note };
    const item: QueueItem = { clientRef, cardId: result.cardId, name: result.name ?? "", at: new Date().toISOString(), ...opts };
    if (navigator.onLine) {
      try {
        await recordDistribution(result.cardId, clientRef, opts);
        setConfirmed(new Date().toLocaleTimeString("de-AT")); setZahlung(art); void loadToday();
        if (art === "TOTAL") setResult({ ...result, debt: 0, schuldenStufe: "OK" });
      } catch (e) {
        const msg = e instanceof Error ? e.message : "";
        // Fachlicher Ablehnungsgrund (Standort, Schuldensperre) → anzeigen, NICHT in den Offline-Puffer
        if (/Abholung nur|Schuldensperre/.test(msg)) { setFehler(msg); return; }
        const q = readQueue(); q.push(item); writeQueue(q); setPending(q.length); setConfirmed("offline gespeichert");
      }
    } else {
      const q = readQueue(); q.push(item); writeQueue(q); setPending(q.length); setConfirmed("offline gespeichert");
    }
  }

  function reset() { setResult(null); setConfirmed(null); setNameHits(null); setIssued(null); setScanVal(""); setZahlung("TOTAL"); setFehler(null); setPaying(false); setPaidMsg(null); setNote(""); focusScan(); }

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
  /** Tippen: 200 ms nach der letzten Eingabe suchen (ab 1 Zeichen), nicht bei jedem Tastendruck. */
  function sucheGeplant(v: string) {
    if (suchTimer.current) window.clearTimeout(suchTimer.current);
    const q = v.trim();
    if (q.length < 1) { setNameHits(null); return; }
    suchTimer.current = window.setTimeout(() => void runNameSearch(q), 200);
  }

  const isOk = result?.status === "OK";
  const noReason: Record<string, string> = {
    EXPIRED: "Karte abgelaufen", BLOCKED: "Karte gesperrt", REPLACED: "Karte wurde ersetzt",
    NOTFOUND: "Karte nicht gefunden", NOCARD: "Keine Karte vorhanden", WRONG_LOCATION: "Falsche Ausgabestelle",
  };
  const gesperrtDurchSchulden = isOk && result?.schuldenStufe === "SPERRE";

  return (
    <div className="kiosk">
      <div className="k-top">
        <div className="k-loc">◎ Tresen · {locationName}</div>
        <div className="k-today" title="Heute an diesem Standort">
          Heute: <b>{today?.count ?? 0}</b> Ausgaben · <b>{today?.persons ?? 0}</b> Pers. · <b>{eur(today?.sum ?? 0)}</b>
        </div>
        <div className="k-online">
          {online ? <span className="pill good"><span className="dot" />Online</span> : <span className="pill bad"><span className="dot" />Offline</span>}
          {pending > 0 ? <span className="pill warn">{pending} in Warteschlange</span> : null}
          <span className="rolepill">{wer ?? "Kasse"}</span>
          {abschlussHref ? <a href={abschlussHref} className="k-logout" style={{ textDecoration: "none" }}>Ausgabe beenden</a> : null}
          {logout ? <form action={logout}><button type="submit" className="k-logout">{abschlussHref ? "Person wechseln" : "Abmelden"}</button></form> : null}
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
              <KameraScan onCode={(c) => { setScanVal(c); void doScan(c); }} />
            </div>

            <div className="namesearch">
              <div className="lbl" style={{ marginBottom: 6 }}>Nicht gefunden? Name, Familiennummer (z. B. 12 oder 3/12), Adresse, Telefon oder Kartennummer</div>
              <input className="inp" placeholder="Name, Nummer, Adresse, Telefon…" onChange={(e) => sucheGeplant(e.target.value)} />
              {nameHits && nameHits.length > 0 ? (
                <div className="panel namehits" style={{ marginTop: 8 }}>
                  {nameHits.map((h, i) => {
                    const fremd = h.status === "WRONG_LOCATION";
                    return (
                      <div key={i} className={`namehit${fremd ? " fremd" : ""}`} style={{ cursor: "default" }}>
                        <div className="flex-1 min-w-0" style={{ textAlign: "left" }}>
                          <div className="font-semibold">{h.name}</div>
                          <div className="text-xs text-muted">
                            {h.locationName ?? "kein Standort"}{h.gruppe != null && h.familienNr != null ? ` · Gruppe ${h.gruppe} · Nr. ${h.familienNr}` : ""}{h.cardNumber ? ` · Karte ${h.cardNumber}` : ""}
                          </div>
                          <span className={`pill ${h.status === "OK" ? "good" : fremd ? "bad" : "muted"}`}>{h.status === "OK" ? "berechtigt" : fremd ? (h.reason ?? "andere Ausgabestelle") : (noReason[h.status] ?? h.status)}</span>
                        </div>
                        <div className="flex gap-2">
                          {(h.status === "OK" || fremd) && h.cardNumber ? <button className="btn sm" onClick={() => void doScan(h.cardNumber!)}>Anzeigen</button> : null}
                          {h.personId && !fremd && h.status !== "OK" ? <button className="btn primary sm" disabled={issuing} onClick={() => void issue(h.personId!)}>{issuing ? "…" : "Karte ausstellen"}</button> : null}
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : null}
              {nameHits && nameHits.length === 0 ? <div className="empty" style={{ color: "var(--bad)", fontWeight: 600 }}>⚠ Person nicht registriert.</div> : null}
            </div>
          </div>
        ) : (
          <div className="k-inner k-breit">
            <div className={`k-result ${isOk && !gesperrtDurchSchulden ? "ok" : "no"} show k-zwei`}>
             <div className="k-links">
              <div className="k-kopf">
                <div className="k-badge">{isOk && !gesperrtDurchSchulden ? "✓" : "✕"}</div>
                <div className="k-status">{isOk ? (gesperrtDurchSchulden ? "Schuldensperre" : "Berechtigt") : (result.status === "WRONG_LOCATION" ? "Falsche Ausgabestelle" : "Nicht berechtigt")}</div>
              </div>
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
              {result.status === "WRONG_LOCATION" ? (
                <div role="alert" className="k-alarm">Diese Person holt in <b>{result.standortName ?? "einer anderen Ausgabestelle"}</b> ab. Ein Wechsel der Ausgabestelle ist nur im Büro (Personenakte) möglich.</div>
              ) : null}
              {isOk && result.schuldenStufe === "WARNUNG" ? (
                <div role="alert" className="k-alarm warn">⚠ Schulden {eur(result.debt ?? 0)} ({result.offeneAusgaben ?? 0} unbezahlte Ausgaben) – bitte heute mitkassieren.</div>
              ) : null}
              {gesperrtDurchSchulden ? (
                <div role="alert" className="k-alarm">⛔ Schuldensperre: {eur(result.debt ?? 0)} offen ({result.offeneAusgaben ?? 0} unbezahlte Ausgaben). Ausgabe nur, wenn heute das Total bezahlt wird. Erlass nur durchs Büro.</div>
              ) : null}

              {isOk && (result.visitsToday ?? 0) > 0 ? (
                <div
                  role="alert"
                  style={{ background: "#b0790f", color: "#fff", fontWeight: 800, borderRadius: 10, padding: "10px 14px", marginTop: 10, fontSize: "1.02rem", lineHeight: 1.3 }}
                >
                  ⚠ Bereits heute abgeholt ({result.visitsToday}×){result.lastVisit ? ` · zuletzt ${fmtDateTime(result.lastVisit)}` : ""}
                </div>
              ) : null}

             </div>
             <div className="k-rechts">
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
                  <div className="k-pay-row">
                    <span>Heute</span>
                    <b>{eur(result.amountDue ?? 0)}</b>
                  </div>
                  {result.debt && result.debt > 0 ? (
                    <div className="k-pay-row debt">
                      <span>Offene Schulden</span>
                      <b>{eur(result.debt)}</b>
                    </div>
                  ) : null}
                  {paidMsg ? <div className="k-pay-row"><span /><b style={{ color: "#c9f5dd" }}>{paidMsg}</b></div> : null}
                  <div className="k-pay-row total">
                    <span>Zu zahlen (Total)</span>
                    <b>{eur(confirmed ? (zahlung === "KEINE" ? 0 : zahlung === "HEUTE" ? (result.amountDue ?? 0) : (result.total ?? result.amountDue ?? 0)) : (result.total ?? result.amountDue ?? 0))}</b>
                  </div>
                  {result.personId && !result.birthDate ? (
                    <div className="k-note" style={{ borderColor: "var(--warn)" }}>
                      <span>Geburtsdatum fehlt – bitte erfragen</span>
                      <div className="flex gap-2 items-center">
                        <input type="date" className="inp mono" value={geb} onChange={(e) => setGeb(e.target.value)} max={new Date().toISOString().slice(0, 10)} />
                        <button className="btn sm" disabled={!geb} onClick={() => void (async () => { if (!result.personId) return; const r = await saveBirthDate(result.personId, geb); if (r.ok) { setResult({ ...result, birthDate: geb }); setGeb(""); setGebFehler(null); } else setGebFehler(r.error ?? "Fehler"); })()}>Speichern</button>
                      </div>
                      {gebFehler ? <div className="text-xs" style={{ color: "var(--bad)" }}>{gebFehler}</div> : null}
                    </div>
                  ) : null}
                  <div className="k-note">
                    <span>Notiz</span>
                    <textarea className="k-note-inp" rows={2} value={note} placeholder="Notiz zur Person (bleibt gespeichert)…"
                      onChange={(e) => setNote(e.target.value)} onBlur={() => void persistNote()} />
                  </div>
                </div>
              ) : null}

              {isOk && !confirmed ? (
                <div className="k-zahlen">
                  <button className="btn-huge" onClick={() => void confirm("TOTAL")}>✓ Total bezahlt · {eur(result.total ?? result.amountDue ?? 0)}</button>
                  {!gesperrtDurchSchulden ? (
                    <div className="k-zahlen-neben">
                      {result.debt && result.debt > 0 ? <button className="btn-huge re" onClick={() => void confirm("HEUTE")}>Nur heute · {eur(result.amountDue ?? 0)}</button> : null}
                      <button className="btn-huge re" onClick={() => void confirm("KEINE")}>Geld vergessen</button>
                    </div>
                  ) : null}
                </div>
              ) : null}
              {fehler ? <div role="alert" className="k-alarm">{fehler}</div> : null}
              {confirmed ? <div className="k-confirmed">✓ Ausgabe erfasst · {confirmed}{zahlung === "KEINE" ? " · nichts bezahlt (Schuld)" : zahlung === "HEUTE" ? " · nur heute bezahlt" : " · Total bezahlt"}</div> : null}

              {/* Karte drucken / sperren – klein, in einer Zeile */}
              {isOk && result.cardId ? (
                <div className="k-neben">
                  <a className="btn-huge print" href={`/druck/karte/${result.cardId}`} target="_blank" rel="noreferrer" onClick={() => void persistNote()}>🖨 Karte drucken</a>
                  <button className="btn-huge block" onClick={() => void blockNow()}>🚫 Sperren</button>
                </div>
              ) : null}

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

              <button className="btn-huge re weiter" onClick={reset}>Nächste Karte →</button>
             </div>
            </div>
          </div>
        )}
      </div>
      <Footer />
    </div>
  );
}
