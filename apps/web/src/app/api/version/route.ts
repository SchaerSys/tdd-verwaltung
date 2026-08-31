export const dynamic = "force-dynamic";

/** Aktuelle Server-Version (Build-Zeitpunkt). Basis der Update-Erkennung im Client. */
export async function GET() {
  return Response.json(
    { version: process.env.NEXT_PUBLIC_APP_VERSION ?? "dev" },
    { headers: { "Cache-Control": "no-store" } },
  );
}
