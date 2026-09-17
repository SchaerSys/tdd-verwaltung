import { defaultTenantId, istTenantId } from "@tdd/db";
import { verifySession } from "./session";
import { SESSION_COOKIE } from "./constants";

/**
 * Reine Auflösung des Mandanten aus den Rohdaten einer Anfrage (Host, Cookie-Header) –
 * ohne Next-APIs, damit sie im HTTP-Hook (vor Next) und in Unit-Tests laeuft.
 *
 * Reihenfolge:
 *  1. verifizierte Session (tenantId im signierten Payload) – verbindlich fuer angemeldete Personen,
 *  2. Geraete-/Stations-Cookie mit Praefix "<tenant>:<token>" (Fahrzeug-Tablet, Ausgabestation),
 *  3. Mandanten-Cookie (gesetzt ueber /m/<kurzname>, z. B. Demo auf dem gemeinsamen Host),
 *  4. Hostname (Stammdaten tenants.host oder Umgebung TENANT_HOSTS "host=uuid;host2=uuid"),
 *  5. Standard-Mandant.
 */
export const GERAETE_COOKIES = ["tdd_geraet", "tdd_station"] as const;
export const MANDANT_COOKIE = "tdd_mandant";

export interface HostZuordnung { [host: string]: string }

export function cookiesLesen(header: string | undefined): Map<string, string> {
  const m = new Map<string, string>();
  if (!header) return m;
  for (const teil of header.split(";")) {
    const i = teil.indexOf("=");
    if (i <= 0) continue;
    const k = teil.slice(0, i).trim();
    if (!k || m.has(k)) continue; // erster Wert gewinnt (wie bei Browsern)
    try { m.set(k, decodeURIComponent(teil.slice(i + 1).trim())); } catch { m.set(k, teil.slice(i + 1).trim()); }
  }
  return m;
}

/** TENANT_HOSTS aus der Umgebung ("host=uuid;host2=uuid") als Zuordnung. */
export function hostsAusUmgebung(wert = process.env.TENANT_HOSTS ?? ""): HostZuordnung {
  const z: HostZuordnung = {};
  for (const paar of wert.split(";")) {
    const [name, id] = paar.split("=").map((x) => x?.trim().toLowerCase());
    if (name && id && istTenantId(id)) z[name] = id;
  }
  return z;
}

export function tenantAusRohdaten(
  eingabe: { host: string | undefined; cookie: string | undefined },
  hosts: HostZuordnung,
  /** Bekannte aktive Mandanten (Pruefung des Mandanten-Cookies); null = jede gueltige UUID. */
  bekannt: ReadonlySet<string> | null = null,
): string {
  const cookies = cookiesLesen(eingabe.cookie);
  try {
    const s = verifySession(cookies.get(SESSION_COOKIE));
    if (s?.tenantId && istTenantId(s.tenantId)) return s.tenantId.toLowerCase();
  } catch { /* SESSION_SECRET fehlt o. ae. – dann zaehlen nur Geraet/Host */ }
  for (const name of GERAETE_COOKIES) {
    const v = cookies.get(name);
    const t = v?.includes(":") ? v.split(":")[0] : null;
    if (t && istTenantId(t)) return t.toLowerCase();
  }
  const mc = cookies.get(MANDANT_COOKIE)?.toLowerCase();
  if (mc && istTenantId(mc) && (!bekannt || bekannt.has(mc))) return mc;
  const h = eingabe.host?.toLowerCase().split(":")[0];
  const treffer = h ? hosts[h] : undefined;
  if (treffer) return treffer;
  return defaultTenantId();
}
