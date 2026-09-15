import type { Instrumentation } from "next";

/**
 * Serverseitige Fehler (Server Components, Server Actions, Routen) landen mit Route
 * und Kennung (digest) in app_events – die Wartung sieht dann, WAS bei WEM kaputt
 * ging, ohne in die Sitzung zu schauen. Der Benutzer wird aus dem Session-Cookie
 * gelesen; ohne Cookie wird der Fehler anonym gemeldet.
 */
export const onRequestError: Instrumentation.onRequestError = async (err, request, context) => {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  try {
    const { meldeEreignis } = await import("@/lib/ereignis");
    const { verifySession, SESSION_COOKIE } = await import("@/lib/session");
    const cookie = request.headers["cookie"];
    const roh = (Array.isArray(cookie) ? cookie.join(";") : cookie ?? "").split(";").map((c) => c.trim()).find((c) => c.startsWith(SESSION_COOKIE + "="));
    const session = roh ? verifySession(decodeURIComponent(roh.slice(SESSION_COOKIE.length + 1))) : null;
    const e = err as { message?: string; digest?: string; name?: string; stack?: string };
    await meldeEreignis({
      kind: "FEHLER", userId: session?.uid ?? null, role: session?.role ?? null, organizationId: session?.orgId ?? null,
      route: `${request.method} ${request.path}`, message: `${e.name ?? "Error"}: ${e.message ?? ""} [${context.routerKind}/${context.routeType}]`,
      digest: e.digest ?? null, detail: { stack: e.stack?.split("\n").slice(0, 6).join("\n") },
    });
  } catch { /* nie selbst scheitern */ }
};
