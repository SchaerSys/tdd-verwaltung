import { getCurrentUser } from "@/lib/auth";
import { meldeEreignis, type EreignisArt } from "@/lib/ereignis";
import { geraetAusCookie } from "@/lib/geraet";

export const dynamic = "force-dynamic";

/**
 * Meldung aus dem Browser: Lebenszeichen (jede Minute) oder Fehler (Error Boundary,
 * window.onerror). Nur fuer angemeldete Benutzer, Inhalt wird serverseitig gefiltert.
 */
export async function POST(req: Request): Promise<Response> {
  const user = await getCurrentUser();
  const geraet = user ? null : await geraetAusCookie();
  if (!user && !geraet) return new Response(null, { status: 204 }); // still: keine Rueckmeldung an Unbekannte
  let body: { kind?: string; route?: string; message?: string; digest?: string; detail?: unknown } = {};
  try { body = (await req.json()) as typeof body; } catch { return new Response(null, { status: 400 }); }
  const kind: EreignisArt = body.kind === "FEHLER" ? "FEHLER" : "LEBENSZEICHEN";
  await meldeEreignis({
    kind, userId: user?.id ?? null, role: user?.role ?? "TABLET", locationId: user?.locationId ?? null, organizationId: user?.organizationId ?? null,
    route: (geraet ? `tablet:${geraet.fahrzeug} ` : "") + (body.route ?? ""), message: body.message ?? null, digest: body.digest ?? null, detail: body.detail as Record<string, unknown>,
  });
  return new Response(null, { status: 204 });
}
