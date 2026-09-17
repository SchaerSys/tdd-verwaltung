export const dynamic = "force-dynamic";
/** Build-Stand fuer die Update-Erkennung im Browser (kein Login noetig, keine Fachdaten). */
export function GET() {
  return Response.json({ version: process.env.NEXT_PUBLIC_APP_VERSION ?? "dev" }, { headers: { "Cache-Control": "no-store" } });
}
