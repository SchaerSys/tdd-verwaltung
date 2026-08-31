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
  // Alles außer Login, statische Assets und API-Interna schützen
  matcher: ["/dashboard/:path*", "/personen/:path*", "/karten/:path*", "/ausgaben/:path*", "/auswertungen/:path*", "/admin/:path*", "/portal/:path*"],
};
