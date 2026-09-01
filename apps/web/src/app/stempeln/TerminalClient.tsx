"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { lookupStaff, stamp, type StaffState } from "@/app/(app)/zeit/actions";
import { KIND_LABEL, STATUS_LABEL, allowedActions, type EventKind } from "@/lib/zeit";

interface NDEFReaderLike { scan: () => Promise<void>; onreading: ((e: { serialNumber?: string }) => void) | null; onreadingerror: (() => void) | null }

const ACTION_COLOR: Record<EventKind, string> = {
  IN: "#1f8f5f", OUT: "#c0392b", BREAK_START: "#b0790f", BREAK_END: "#2f4b99",
};

export function TerminalClient({ staff, logout }: { staff: { id: string; name: string }[]; logout: () => Promise<void> }) {
  const [sel, setSel] = useState<StaffState | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [nfc, setNfc] = useState<"off" | "on" | "unsupported">("off");
  const [busy, setBusy] = useState(false);
  const resetTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const clock = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (typeof window === "undefined" || !("NDEFReader" in window)) setNfc("unsupported");
    const t = setInterval(() => { if (clock.current) clock.current.textContent = new Date().toLocaleTimeString("de-AT"); }, 1000);
    return () => clearInterval(t);
  }, []);

  const resolve = useCallback(async (value: string, byCard: boolean) => {
    setErr(null); setMsg(null);
    const s = await lookupStaff(value, byCard);
    if (!s) { setErr(byCard ? "Karte nicht zugeordnet." : "Nicht gefunden."); return; }
    setSel(s); setQ("");
  }, []);

  const startNfc = async () => {
    const R = (window as unknown as { NDEFReader?: new () => NDEFReaderLike }).NDEFReader;
    if (!R) { setNfc("unsupported"); return; }
    try {
      const reader = new R();
      await reader.scan();
      reader.onreading = (e) => { if (e.serialNumber) void resolve(e.serialNumber, true); };
      reader.onreadingerror = () => setErr("Karte konnte nicht gelesen werden.");
      setNfc("on");
    } catch { setErr("NFC konnte nicht gestartet werden (Berechtigung?)."); }
  };

  const reset = useCallback(() => { setSel(null); setMsg(null); setErr(null); if (resetTimer.current) clearTimeout(resetTimer.current); }, []);

  const doStamp = async (kind: EventKind) => {
    if (!sel || busy) return;
    setBusy(true); setErr(null);
    try {
      const r = await stamp(sel.id, kind, nfc === "on");
      if (!r.ok) { setErr(r.error ?? "Fehler."); return; }
      setMsg(`${sel.name}: ${KIND_LABEL[kind]} um ${new Date().toLocaleTimeString("de-AT", { hour: "2-digit", minute: "2-digit" })} erfasst`);
      setSel({ ...sel, status: r.status });
      if (resetTimer.current) clearTimeout(resetTimer.current);
      resetTimer.current = setTimeout(reset, 4000);
    } finally { setBusy(false); }
  };

  const filtered = q.trim() ? staff.filter((s) => s.name.toLowerCase().includes(q.trim().toLowerCase())).slice(0, 8) : [];

  return (
    <div style={{ minHeight: "100vh", background: "#0f1216", color: "#e6e9ee", display: "flex", flexDirection: "column", fontFamily: "system-ui, sans-serif" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 22px", borderBottom: "1px solid #2a313b" }}>
        <div style={{ fontWeight: 800, fontSize: "1.1rem" }}>⏱ Stempel-Terminal</div>
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          <div ref={clock} className="mono" style={{ fontVariantNumeric: "tabular-nums", opacity: .8 }} />
          <form action={logout}><button type="submit" style={{ background: "transparent", border: "1px solid #2a313b", color: "#97a1b0", borderRadius: 8, padding: "6px 12px", cursor: "pointer" }}>Abmelden</button></form>
        </div>
      </div>

      <div style={{ flex: 1, display: "grid", placeItems: "center", padding: 20 }}>
        <div style={{ width: "100%", maxWidth: 560 }}>
          {msg ? (
            <div style={{ background: "#153026", border: "1px solid #1f8f5f", color: "#c9f5dd", borderRadius: 14, padding: "18px 20px", fontSize: "1.15rem", fontWeight: 700, textAlign: "center", marginBottom: 16 }}>✓ {msg}</div>
          ) : null}
          {err ? <div style={{ background: "#37201d", border: "1px solid #ef7a6d", color: "#ffd9d3", borderRadius: 12, padding: "12px 16px", marginBottom: 16, textAlign: "center" }}>{err}</div> : null}

          {!sel ? (
            <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
              <div style={{ textAlign: "center", fontSize: "1.05rem", opacity: .85 }}>
                {nfc === "on" ? "🔵 Karte an das Tablet halten…" : "Karte scannen oder Person wählen"}
              </div>
              {nfc === "off" ? (
                <button type="button" onClick={startNfc} style={{ background: "#2f4b99", border: 0, color: "#fff", borderRadius: 14, padding: "18px", fontSize: "1.1rem", fontWeight: 700, cursor: "pointer" }}>🔵 NFC-Scan starten</button>
              ) : null}
              {nfc === "unsupported" ? <div style={{ textAlign: "center", opacity: .6, fontSize: ".85rem" }}>NFC auf diesem Gerät nicht verfügbar – bitte Person manuell wählen.</div> : null}

              <input
                value={q} onChange={(e) => setQ(e.target.value)} placeholder="🔍 Name suchen…"
                style={{ background: "#171b21", border: "1px solid #2a313b", color: "#e6e9ee", borderRadius: 12, padding: "14px 16px", fontSize: "1.05rem", outline: "none" }}
              />
              {filtered.map((s) => (
                <button key={s.id} type="button" onClick={() => void resolve(s.id, false)}
                  style={{ background: "#171b21", border: "1px solid #2a313b", color: "#e6e9ee", borderRadius: 12, padding: "14px 16px", fontSize: "1.05rem", textAlign: "left", cursor: "pointer" }}>{s.name}</button>
              ))}
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 16, textAlign: "center" }}>
              <div style={{ fontSize: "1.7rem", fontWeight: 800 }}>{sel.name}</div>
              <div style={{ opacity: .8 }}>Status: <b>{STATUS_LABEL[sel.status]}</b></div>
              <div style={{ display: "grid", gap: 12 }}>
                {allowedActions(sel.status).map((k) => (
                  <button key={k} type="button" disabled={busy} onClick={() => void doStamp(k)}
                    style={{ background: ACTION_COLOR[k], border: 0, color: "#fff", borderRadius: 16, padding: "22px", fontSize: "1.35rem", fontWeight: 800, cursor: "pointer", opacity: busy ? .6 : 1 }}>
                    {KIND_LABEL[k]}
                  </button>
                ))}
              </div>
              <button type="button" onClick={reset} style={{ background: "transparent", border: "1px solid #2a313b", color: "#97a1b0", borderRadius: 10, padding: "12px", cursor: "pointer", marginTop: 4 }}>Abbrechen</button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
