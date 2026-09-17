import http from "node:http";
import { runWithTenant, tenants } from "@tdd/db";
import { db } from "./db";
import { hostsAusUmgebung, tenantAusRohdaten, type HostZuordnung } from "./tenant-aufloesung";

/**
 * Mandanten-Kontext fuer JEDE Anfrage – Server Components, Server Actions und Routen.
 *
 * Next bietet keine Stelle, an der ein AsyncLocalStorage-Kontext um die gesamte Anfrage
 * gelegt werden kann (Layouts, Seiten und Aktionen werden vom Framework getrennt
 * aufgerufen). Deshalb wird hier der Node-HTTP-Server selbst eingehaengt: das
 * "request"-Ereignis laeuft in runWithTenant(...), und weil Node den asynchronen
 * Ablauf durchreicht, sieht alles, was fuer diese Anfrage passiert, denselben Mandanten –
 * derselbe Mechanismus, ueber den Next cookies()/headers() bereitstellt.
 *
 * Die Zuordnung Host → Mandant kommt aus den Stammdaten (tenants.host, 055) und
 * ergaenzend aus TENANT_HOSTS; sie wird im Hintergrund alle 60 s erneuert, die
 * Aufloesung selbst bleibt synchron (kein Warten vor der Anfrage).
 */
const SCHLUESSEL = Symbol.for("careos.tenant-hook");
const g = globalThis as unknown as Record<symbol, boolean | undefined>;

let hosts: HostZuordnung = hostsAusUmgebung();
let bekannt: Set<string> | null = null; // aktive Mandanten (Pruefung des Mandanten-Cookies)
let zuletzt = 0;
let laden: Promise<void> | null = null;

async function hostsErneuern(): Promise<void> {
  try {
    const rows = await db().select({ host: tenants.host, id: tenants.id, aktiv: tenants.isActive }).from(tenants);
    const neu: HostZuordnung = { ...hostsAusUmgebung() };
    const ids = new Set<string>();
    for (const r of rows) {
      if (!r.aktiv) continue;
      ids.add(r.id.toLowerCase());
      if (r.host) neu[r.host.trim().toLowerCase()] = r.id;
    }
    hosts = neu; bekannt = ids;
  } catch (e) {
    console.error("[tenant] Host-Zuordnung konnte nicht geladen werden:", e instanceof Error ? e.message : e);
  } finally {
    zuletzt = Date.now();
    laden = null;
  }
}

function hostsAktuell(): HostZuordnung {
  if (Date.now() - zuletzt > 60_000 && !laden) laden = hostsErneuern();
  return hosts;
}

/** Fuer Tests und Stammdaten-Aenderungen: Zuordnung sofort neu laden. */
export function hostZuordnungNeuLaden(): Promise<void> {
  zuletzt = 0;
  return (laden ??= hostsErneuern());
}

export function installiereMandantenKontext(): void {
  if (g[SCHLUESSEL]) return; // nur einmal je Prozess (Hot-Reload, mehrere Bundles)
  g[SCHLUESSEL] = true;
  // eslint-disable-next-line @typescript-eslint/unbound-method -- wird bewusst mit .call(this, ...) aufgerufen
  const original = http.Server.prototype.emit as (this: http.Server, ereignis: string | symbol, ...args: unknown[]) => boolean;
  const ersatz = function (this: http.Server, ereignis: string | symbol, ...args: unknown[]): boolean {
    if (ereignis === "request") {
      const req = args[0] as http.IncomingMessage;
      const tenant = tenantAusRohdaten({ host: req.headers.host, cookie: req.headers.cookie }, hostsAktuell(), bekannt);
      return runWithTenant(tenant, () => original.call(this, ereignis, ...args));
    }
    return original.call(this, ereignis, ...args);
  };
  http.Server.prototype.emit = ersatz as typeof http.Server.prototype.emit;
  void hostsErneuern();
}
