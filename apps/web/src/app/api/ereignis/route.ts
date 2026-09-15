import { getCurrentUser } from "@/lib/auth";
import { meldeEreignis, type EreignisArt } from "@/lib/ereignis";

export const dynamic = "force-dynamic";

/**
 * Meldung aus dem Browser: Lebenszeichen (jede Minute) oder Fehler (Error Boundary,
 * window.onerror). Nur fuer angemeldete Benutzer, Inhalt wird serverseitig gefiltert.
 */
export async function POST(req: Request): Promise<Response> {
  const user = await getCurrentUser();
  if (!user) return new Response(null, { status: 204 }); // still: keine Rueckmeldung an Unangemeldete
  let body: { kind?: string; route?: string; message?: string; digest?: string; detail?: unknown } = {};
  try { body = (await req.json()) as typeof body; } catch { return new Response(null, { status: 400 }); }
  const kind: EreignisArt = body.kind === "FEHLER" ? "FEHLER" : "LEBENSZEICHEN";
  await meldeEreignis({
    kind, userId: user.id, role: user.role, locationId: user.locationId, organizationId: user.organizationId,
    route: body.route ?? null, message: body.message ?? null, digest: body.digest ?? null, detail: body.detail as Record<string, unknown>,
  });
  return new Response(null, { status: 204 });
}
