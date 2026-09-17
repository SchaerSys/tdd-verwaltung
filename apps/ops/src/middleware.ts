import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE } from "@/lib/constants";

/** Ohne Session-Cookie geht es nur zur Anmeldung; die Signatur prueft das Layout. */
export function middleware(req: NextRequest) {
  if (!req.cookies.has(SESSION_COOKIE)) {
    const url = req.nextUrl.clone();
    url.pathname = "/login";
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!login|einrichten|api/health|api/version|api/alarme|_next/|favicon.ico|icon.svg).*)"],
};
