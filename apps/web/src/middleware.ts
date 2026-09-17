import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE } from "@/lib/constants";

/**
 * Leichter Gate: leitet ohne Session-Cookie auf /login um.
 * Die kryptographische Prüfung (Signatur/Ablauf) erfolgt serverseitig in den
 * Layouts via getCurrentUser – hier nur ein schneller Vorfilter.
 *
 * Mandant (Vorbereitung Stufe B): aus dem Host (Zuordnung TENANT_HOSTS = "host=uuid;host2=uuid")
 * oder als unverifizierter Hinweis aus dem Session-Cookie; als Header x-tenant-id an die
 * Route-Handler weitergereicht. Verbindlich ist immer die serverseitig verifizierte Session
 * (lib/tenant-request.ts) – der Header ist nur der Fallback ohne Session.
 */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function tenantAusHost(host: string | null): string | null {
  const karte = process.env.TENANT_HOSTS ?? "";
  if (!host || !karte) return null;
  const h = host.toLowerCase().split(":")[0]!;
  for (const paar of karte.split(";")) {
    const [name, id] = paar.split("=").map((x) => x?.trim().toLowerCase());
    if (name && id && name === h && UUID.test(id)) return id;
  }
  return null;
}

function tenantAusCookie(token: string | undefined): string | null {
  // Payload unverifiziert lesen (nur Hinweis fuer das Routing); Signaturpruefung serverseitig
  if (!token) return null;
  try {
    const body = token.split(".")[0] ?? "";
    const json = atob(body.replace(/-/g, "+").replace(/_/g, "/"));
    const t = (JSON.parse(json) as { tenantId?: unknown }).tenantId;
    return typeof t === "string" && UUID.test(t) ? t.toLowerCase() : null;
  } catch { return null; }
}

export function middleware(req: NextRequest) {
  const sessionCookie = req.cookies.get(SESSION_COOKIE)?.value;
  const tenant = tenantAusHost(req.headers.get("host")) ?? tenantAusCookie(sessionCookie);
  const weiter = new Headers(req.headers);
  if (tenant) weiter.set("x-tenant-id", tenant); else weiter.delete("x-tenant-id");

  if (!sessionCookie) {
    const url = req.nextUrl.clone();
    url.pathname = "/login";
    return NextResponse.redirect(url);
  }
  return NextResponse.next({ request: { headers: weiter } });
}

export const config = {
  // Alles ist geschützt AUSSER: öffentliche Seiten, API-Routen (prüfen selbst),
  // statische Dateien. Vorher stand hier eine Liste der geschützten Bereiche,
  // und die wurde bei jedem neuen Bereich vergessen (/kiosk, /zeit, /personal, /stempeln).
  matcher: [
    "/((?!login|registrieren|passwort-vergessen|passwort-neu|konto-bestaetigen|passwort-aendern|datenschutz|einwilligung|anleitung|fahrzeug|ausgabe|m/|api/|_next/|favicon.ico|icon.svg|.*\\.webmanifest|sw.js|kiosk-sw.js).*)",
  ],
};
