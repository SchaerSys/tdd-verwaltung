import { NextResponse } from "next/server";
import { MANDANT_COOKIE } from "@/lib/tenant-aufloesung";

export const dynamic = "force-dynamic";

/** Mandantenwahl (/m/<kurzname>) aufheben: zurueck zum Mandanten des Hosts (z. B. von der Demo zu Tischlein deck dich). */
export function GET() {
  const res = new NextResponse(null, { status: 303, headers: { Location: "/login" } });
  res.cookies.set(MANDANT_COOKIE, "", { path: "/", maxAge: 0 });
  res.cookies.set("tdd_session", "", { path: "/", maxAge: 0 });
  return res;
}
