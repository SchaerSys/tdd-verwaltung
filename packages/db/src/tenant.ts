import { AsyncLocalStorage } from "node:async_hooks";

/**
 * Mandanten-Kontext (Unternehmen). Der aktuelle Mandant wird je asynchronem Ablauf gefuehrt
 * (AsyncLocalStorage); ohne gesetzten Kontext gilt der Standard-Mandant (Umgebung
 * DEFAULT_TENANT_ID, sonst Tischlein deck dich Vorarlberg). Die Datenbank erzwingt die
 * Trennung ueber RLS und die GUC app.current_tenant_id, die je Pool gesetzt wird.
 */
export const TENANT_VORARLBERG = "e3b29c11-0000-4000-a000-000000000000";

// Eine Instanz je Prozess – auch wenn das Paket in mehreren Bundles landet (Instrumentation,
// Routen): der Kontext aus dem HTTP-Hook muss in jedem Bundle derselbe sein.
const SCHLUESSEL = Symbol.for("careos.tenant-als");
const g = globalThis as unknown as Record<symbol, AsyncLocalStorage<string> | undefined>;
const speicher: AsyncLocalStorage<string> = g[SCHLUESSEL] ?? (g[SCHLUESSEL] = new AsyncLocalStorage<string>());
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function istTenantId(v: unknown): v is string {
  return typeof v === "string" && UUID.test(v);
}

/** Standard-Mandant, wenn kein Kontext gesetzt ist. */
export function defaultTenantId(): string {
  const env = process.env.DEFAULT_TENANT_ID;
  return istTenantId(env) ? env.toLowerCase() : TENANT_VORARLBERG;
}

/** Aktueller Mandant des Ablaufs (Kontext oder Standard). */
export function currentTenantId(): string {
  return speicher.getStore() ?? defaultTenantId();
}

/** Ist ein Mandant explizit gesetzt (ohne Fallback)? */
export function tenantKontextGesetzt(): boolean {
  return speicher.getStore() != null;
}

/** Fuehrt `fn` im Kontext eines Mandanten aus (Server Actions, Route Handler, Jobs je Mandant). */
export function runWithTenant<T>(tenantId: string, fn: () => T): T {
  if (!istTenantId(tenantId)) throw new Error("Ungueltige Mandanten-ID");
  return speicher.run(tenantId.toLowerCase(), fn);
}
