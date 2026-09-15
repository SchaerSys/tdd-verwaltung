import type { Instrumentation } from "next";

/**
 * Serverseitige Fehler (Server Components, Server Actions, Routen) landen mit Route
 * und Kennung (digest) in app_events – die Wartung sieht dann, WAS bei WEM kaputt
 * ging, ohne in die Sitzung zu schauen. Nur in der Node-Laufzeit (documented pattern:
 * Import im if-Block, damit node:crypto nicht ins Edge-Bundle geraet).
 */
export const onRequestError: Instrumentation.onRequestError = async (err, request, context) => {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { meldeServerFehler } = await import("./instrumentation-node");
    await meldeServerFehler(err, request, context);
  }
};
