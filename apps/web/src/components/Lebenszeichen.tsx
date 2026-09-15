"use client";
import { useEffect } from "react";

/**
 * Lebenszeichen an die Wartung: jede Minute Version, online/offline, Laenge der
 * Kiosk-Warteschlange, Browser und aktuelle Seite. Dazu unbehandelte Fehler im
 * Browser. Kein Personenbezug, keine Eingaben – nur Betriebszustand.
 */
export function Lebenszeichen({ bereich }: { bereich: string }) {
  useEffect(() => {
    const detail = () => {
      let queue = 0;
      try { queue = (JSON.parse(localStorage.getItem("tdd_kiosk_queue") ?? "[]") as unknown[]).length; } catch { /* leer */ }
      return {
        version: process.env.NEXT_PUBLIC_APP_VERSION ?? "dev", online: navigator.onLine, queue,
        ua: navigator.userAgent, screen: `${window.innerWidth}x${window.innerHeight}`,
        nfc: "NDEFReader" in window,
      };
    };
    const senden = (body: Record<string, unknown>) => {
      try {
        const blob = new Blob([JSON.stringify(body)], { type: "application/json" });
        if (!navigator.sendBeacon("/api/ereignis", blob)) void fetch("/api/ereignis", { method: "POST", body: blob, keepalive: true });
      } catch { /* offline */ }
    };
    const puls = () => senden({ kind: "LEBENSZEICHEN", route: `${bereich} ${location.pathname}`, detail: detail() });
    puls();
    const t = setInterval(puls, 60_000);
    const onError = (e: ErrorEvent) => senden({ kind: "FEHLER", route: `${bereich} ${location.pathname}`, message: `${e.message} (${e.filename ?? ""}:${e.lineno ?? 0})`, detail: detail() });
    const onReject = (e: PromiseRejectionEvent) => {
      const r = e.reason as { message?: string } | string | undefined;
      senden({ kind: "FEHLER", route: `${bereich} ${location.pathname}`, message: `Unbehandelt: ${typeof r === "string" ? r : r?.message ?? "?"}`, detail: detail() });
    };
    window.addEventListener("error", onError);
    window.addEventListener("unhandledrejection", onReject);
    window.addEventListener("online", puls);
    window.addEventListener("offline", puls);
    return () => {
      clearInterval(t);
      window.removeEventListener("error", onError);
      window.removeEventListener("unhandledrejection", onReject);
      window.removeEventListener("online", puls);
      window.removeEventListener("offline", puls);
    };
  }, [bereich]);
  return null;
}
