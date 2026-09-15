import type { Instrumentation } from "next";
import { meldeEreignis } from "@/lib/ereignis";
import { verifySession, SESSION_COOKIE } from "@/lib/session";

/** Node-Teil von instrumentation.ts (node:crypto darf nicht ins Edge-Bundle). */
export const meldeServerFehler: Instrumentation.onRequestError = async (err, request, context) => {
  try {
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
