import { NextResponse } from "next/server";
import { eq, sql } from "drizzle-orm";
import { tenants, TENANT_VORARLBERG, runWithTenant } from "@tdd/db";
import { db } from "@/lib/db";
import { MANDANT_COOKIE } from "@/lib/tenant-aufloesung";

export const dynamic = "force-dynamic";

/**
 * Einstieg in einen Mandanten auf dem gemeinsamen Host: /m/<kurzname> merkt den Mandanten
 * im Browser (Cookie, ein Jahr) und fuehrt zur Anmeldung – z. B. /m/demo fuer den
 * Demo-Mandanten. Mandanten mit eigenem Host brauchen das nicht.
 */
export async function GET(_req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const s = slug.trim().toLowerCase();
  const t = /^[a-z0-9][a-z0-9-]{1,60}$/.test(s)
    ? (await runWithTenant(TENANT_VORARLBERG, () => db().select({ id: tenants.id, name: tenants.name }).from(tenants).where(sql`${eq(tenants.slug, s)} AND ${tenants.isActive}`).limit(1)))[0]
    : undefined;
  if (!t) return new NextResponse("Mandant nicht gefunden", { status: 404 });
  // Relativer Redirect: hinter dem Proxy kennt Next nur den internen Host (0.0.0.0:3000)
  const res = new NextResponse(null, { status: 303, headers: { Location: "/login" } });
  res.cookies.set(MANDANT_COOKIE, t.id, { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/", maxAge: 60 * 60 * 24 * 365 });
  // Alte Session eines anderen Mandanten beenden, sonst landet man dort statt beim gewuenschten
  res.cookies.set("tdd_session", "", { path: "/", maxAge: 0 });
  return res;
}
