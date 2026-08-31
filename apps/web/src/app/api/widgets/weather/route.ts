import { getCurrentUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

// 7-Tage-Vorhersage für den (vom Nutzer freigegebenen) Gerätestandort.
// Open-Meteo: kostenlos, kein API-Key, EU-Server, keine personenbezogenen Daten.
// Koordinaten kommen als Query (lat/lon), serverseitig ~30 Min. je Ort gecacht.
const TTL_MS = 30 * 60 * 1000;

interface Day { date: string; code: number | null; tmax: number | null; tmin: number | null; pop: number | null }
interface Forecast { place: string; current: { tempC: number | null; code: number | null }; days: Day[] }

const cache = new Map<string, { at: number; data: Forecast }>();
const r = (n: unknown): number | null => (typeof n === "number" ? Math.round(n) : null);

export async function GET(req: Request) {
  const user = await getCurrentUser();
  if (!user) return new Response("Unauthorized", { status: 401 });

  const url = new URL(req.url);
  const lat = Number(url.searchParams.get("lat"));
  const lon = Number(url.searchParams.get("lon"));
  if (!Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180) {
    return new Response("Bad request", { status: 400 });
  }
  const key = `${lat.toFixed(2)},${lon.toFixed(2)}`;
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < TTL_MS) {
    return Response.json(hit.data, { headers: { "Cache-Control": "no-store" } });
  }

  try {
    const api = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}`
      + `&current=temperature_2m,weather_code`
      + `&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max`
      + `&forecast_days=7&timezone=auto`;
    const res = await fetch(api, { cache: "no-store" });
    if (!res.ok) throw new Error(String(res.status));
    const j = (await res.json()) as {
      current?: { temperature_2m?: number; weather_code?: number };
      daily?: { time?: string[]; weather_code?: number[]; temperature_2m_max?: number[]; temperature_2m_min?: number[]; precipitation_probability_max?: (number | null)[] };
    };
    const d = j.daily;
    const days: Day[] = (d?.time ?? []).map((t, i) => ({
      date: t,
      code: d?.weather_code?.[i] ?? null,
      tmax: r(d?.temperature_2m_max?.[i]),
      tmin: r(d?.temperature_2m_min?.[i]),
      pop: typeof d?.precipitation_probability_max?.[i] === "number" ? d!.precipitation_probability_max![i] : null,
    }));
    const data: Forecast = {
      place: "Ihr Standort",
      current: { tempC: r(j.current?.temperature_2m), code: j.current?.weather_code ?? null },
      days,
    };
    cache.set(key, { at: Date.now(), data });
    return Response.json(data, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return Response.json(cache.get(key)?.data ?? { place: "Ihr Standort", current: { tempC: null, code: null }, days: [] }, { headers: { "Cache-Control": "no-store" } });
  }
}
