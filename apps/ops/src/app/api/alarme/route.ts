import { alarmeLaufen } from "@/lib/alarme";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** Betreiber-Alarme: Cron alle 15 Minuten mit JOB_TOKEN (scripts/alarm-cron.sh). */
export async function GET(req: Request) {
  const token = process.env.JOB_TOKEN;
  const auth = req.headers.get("authorization") ?? "";
  if (!token || auth !== `Bearer ${token}`) return new Response("forbidden", { status: 403 });
  try { return Response.json(await alarmeLaufen()); }
  catch (e) { return Response.json({ ok: false, error: e instanceof Error ? e.message : "Fehler" }, { status: 500 }); }
}
