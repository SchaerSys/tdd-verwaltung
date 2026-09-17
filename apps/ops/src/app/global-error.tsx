"use client";

/** Letzte Auffangstelle (Fehler im Root-Layout): immer neu laden anbieten. */
export default function GlobalFehler({ error }: { error: Error & { digest?: string } }) {
  return (
    <html lang="de"><body style={{ fontFamily: "system-ui", padding: 40 }}>
      <h2>Da ist etwas schiefgelaufen.</h2>
      <p style={{ color: "#666" }}>Kennung: {error.digest ?? error.message}</p>
      <button onClick={() => location.reload()} style={{ padding: "8px 14px" }}>Seite neu laden</button>
    </body></html>
  );
}
