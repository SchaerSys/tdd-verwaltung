"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Unterschriftenfeld (Finger/Stift/Maus) – schreibt die Unterschrift als PNG-Data-URL in ein
 * verstecktes Formularfeld. Leer = kein Wert.
 */
export function Unterschrift({ name = "unterschrift", hoehe = 160 }: { name?: string; hoehe?: number }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const [wert, setWert] = useState("");
  const [leer, setLeer] = useState(true);
  useEffect(() => {
    const c = ref.current; if (!c) return;
    const dpr = window.devicePixelRatio || 1;
    const b = c.getBoundingClientRect(); c.width = b.width * dpr; c.height = hoehe * dpr;
    const ctx = c.getContext("2d")!; ctx.scale(dpr, dpr); ctx.lineWidth = 2.2; ctx.lineCap = "round"; ctx.lineJoin = "round"; ctx.strokeStyle = "#111";
    let malt = false;
    const pos = (e: PointerEvent) => { const r = c.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; };
    const start = (e: PointerEvent) => { malt = true; c.setPointerCapture(e.pointerId); const p = pos(e); ctx.beginPath(); ctx.moveTo(p.x, p.y); e.preventDefault(); };
    const move = (e: PointerEvent) => { if (!malt) return; const p = pos(e); ctx.lineTo(p.x, p.y); ctx.stroke(); setLeer(false); e.preventDefault(); };
    const ende = () => { if (!malt) return; malt = false; setWert(c.toDataURL("image/png")); };
    c.addEventListener("pointerdown", start); c.addEventListener("pointermove", move); c.addEventListener("pointerup", ende); c.addEventListener("pointercancel", ende); c.addEventListener("pointerleave", ende);
    return () => { c.removeEventListener("pointerdown", start); c.removeEventListener("pointermove", move); c.removeEventListener("pointerup", ende); c.removeEventListener("pointercancel", ende); c.removeEventListener("pointerleave", ende); };
  }, [hoehe]);
  const loeschen = () => { const c = ref.current; if (!c) return; c.getContext("2d")!.clearRect(0, 0, c.width, c.height); setWert(""); setLeer(true); };
  return (
    <div className="flex flex-col gap-1">
      <canvas ref={ref} style={{ width: "100%", height: hoehe, border: "1px dashed var(--border)", borderRadius: 8, background: "#fff", touchAction: "none" }} />
      <input type="hidden" name={name} value={wert} />
      <div className="flex justify-between text-xs text-muted"><span>{leer ? "Bitte hier unterschreiben (Finger, Stift oder Maus)." : "Unterschrift erfasst."}</span><button type="button" className="btn ghost sm" onClick={loeschen}>Löschen</button></div>
    </div>
  );
}
