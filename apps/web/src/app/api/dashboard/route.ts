import { getCurrentUser } from "@/lib/auth";
import { loadDashboard } from "@/app/(app)/dashboard/data";

export const dynamic = "force-dynamic";

/** Live-Kennzahlen fürs Dashboard (Polling durch DashboardLive). Nur angemeldet. */
export async function GET() {
  const user = await getCurrentUser();
  if (!user) return new Response("Unauthorized", { status: 401 });
  const data = await loadDashboard();
  return Response.json(data, { headers: { "Cache-Control": "no-store" } });
}
