"use client";

import { useEffect, useState } from "react";
import { pushAbonnieren, pushAbbestellen } from "../actions";

function b64ToBytes(b64: string): Uint8Array {
  const pad = "=".repeat((4 - (b64.length % 4)) % 4);
  const s = (b64 + pad).replace(/-/g, "+").replace(/_/g, "/");
  return Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
}

export function PushSchalter({ publicKey }: { publicKey: string }) {
  const [stand, setStand] = useState<"laedt" | "aus" | "an" | "nicht_moeglich" | "verweigert">("laedt");
  const [meldung, setMeldung] = useState<string | null>(null);
  useEffect(() => {
    (async () => {
      if (!("serviceWorker" in navigator) || !("PushManager" in window)) { setStand("nicht_moeglich"); return; }
      if (Notification.permission === "denied") { setStand("verweigert"); return; }
      const reg = await navigator.serviceWorker.ready;
      const abo = await reg.pushManager.getSubscription();
      setStand(abo ? "an" : "aus");
    })().catch(() => setStand("nicht_moeglich"));
  }, []);
  const an = async () => {
    try {
      const reg = await navigator.serviceWorker.ready;
      const perm = await Notification.requestPermission();
      if (perm !== "granted") { setStand("verweigert"); return; }
      const abo = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64ToBytes(publicKey) as BufferSource });
      const j = abo.toJSON();
      const r = await pushAbonnieren({ endpoint: abo.endpoint, keys: { p256dh: j.keys!.p256dh!, auth: j.keys!.auth! } }, navigator.userAgent);
      if (r.ok) { setStand("an"); setMeldung("Benachrichtigungen sind an."); } else setMeldung("Speichern fehlgeschlagen.");
    } catch (e) { setMeldung(e instanceof Error ? e.message : "Fehler"); }
  };
  const aus = async () => {
    const reg = await navigator.serviceWorker.ready;
    const abo = await reg.pushManager.getSubscription();
    if (abo) { await pushAbbestellen(abo.endpoint); await abo.unsubscribe(); }
    setStand("aus"); setMeldung("Benachrichtigungen sind aus.");
  };
  return (
    <div className="flex items-center gap-3 flex-wrap">
      {stand === "laedt" ? <span className="text-muted">…</span> : null}
      {stand === "nicht_moeglich" ? <span className="pill muted">Dieser Browser unterstützt keine Push-Nachrichten (iPhone: erst zum Home-Bildschirm hinzufügen).</span> : null}
      {stand === "verweigert" ? <span className="pill warn">In den Browser-Einstellungen blockiert.</span> : null}
      {stand === "aus" ? <button className="btn primary" onClick={() => void an()}>Benachrichtigungen einschalten</button> : null}
      {stand === "an" ? <><span className="pill good">an</span><button className="btn ghost sm" onClick={() => void aus()}>ausschalten</button></> : null}
      {meldung ? <span className="text-xs text-muted">{meldung}</span> : null}
    </div>
  );
}
