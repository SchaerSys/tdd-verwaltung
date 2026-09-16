"use server";

import { headers } from "next/headers";
import { koppeln } from "@/lib/geraet";
import { audit } from "@/lib/audit";

export interface KoppelnState { error?: string; ok?: boolean }

/** Tablet: 6-stelligen Code aus der Disposition einloesen. */
export async function tabletKoppeln(_prev: KoppelnState, fd: FormData): Promise<KoppelnState> {
  const code = String(fd.get("code") ?? "").replace(/\s+/g, "");
  if (!/^\d{6}$/.test(code)) return { error: "Bitte den 6-stelligen Code eingeben." };
  const ua = (await headers()).get("user-agent");
  const g = await koppeln(code, ua);
  if (!g) return { error: "Code ungültig oder abgelaufen (10 Minuten). In der Disposition unter Fahrzeuge einen neuen Code erzeugen." };
  await audit({ action: "geraet.paired", entityType: "geraet", entityId: g.id, after: { fahrzeug: g.fahrzeug, name: g.name } });
  return { ok: true };
}
