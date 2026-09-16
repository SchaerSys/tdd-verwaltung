"use client";

import { mandantSetzen } from "@/app/(ops)/unternehmen/actions";
import { ALLE } from "@/lib/tenant-const";
import type { Mandant } from "@/lib/unternehmen";

/** Mandanten-Auswahl im Kopf: bestimmt, welches Unternehmen alle Seiten der Wartungsplattform zeigen. */
export function MandantWahl({ mandanten, gewaehlt }: { mandanten: Mandant[]; gewaehlt: string | null }) {
  if (mandanten.length <= 1 && gewaehlt !== null) return null; // ein Mandant: nichts zu waehlen
  return (
    <form action={mandantSetzen} className="flex items-center gap-2">
      <label className="text-xs text-muted" htmlFor="mandant">Mandant</label>
      <select id="mandant" name="mandant" className="inp sm" defaultValue={gewaehlt ?? ALLE}
        onChange={(e) => e.currentTarget.form?.requestSubmit()}>
        {mandanten.map((m) => <option key={m.id} value={m.id}>{m.name}{m.isActive ? "" : " (inaktiv)"}</option>)}
        <option value={ALLE}>Alle Mandanten</option>
      </select>
    </form>
  );
}
