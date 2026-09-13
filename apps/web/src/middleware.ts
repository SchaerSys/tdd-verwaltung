import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE } from "@/lib/constants";

/**
 * Leichter Gate: leitet ohne Session-Cookie auf /login um.
 * Die kryptographische Prüfung (Signatur/Ablauf) erfolgt serverseitig in den
 * Layouts via getCurrentUser – hier nur ein schneller Vorfilter.
 */
export function middleware(req: NextRequest) {
  const hasCookie = req.cookies.has(SESSION_COOKIE);
  if (!hasCookie) {
    const url = req.nextUrl.clone();
    url.pathname = "/login";
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = {
  // Alles ist geschützt AUSSER: öffentliche Seiten, API-Routen (prüfen selbst),
  // statische Dateien. Vorher stand hier eine Liste der geschützten Bereiche,
  // und die wurde bei jedem neuen Bereich vergessen (/kiosk, /zeit, /personal, /stempeln).
  matcher: [
    "/((?!login|registrieren|passwort-vergessen|passwort-neu|konto-bestaetigen|datenschutz|anleitung|api/|_next/|favicon.ico|icon.svg|.*\\.webmanifest|sw.js|kiosk-sw.js).*)",
  ],
};
