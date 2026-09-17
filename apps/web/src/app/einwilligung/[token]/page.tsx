import Link from "next/link";
import { sql } from "drizzle-orm";
import { runWithTenant, TENANT_VORARLBERG, istTenantId } from "@tdd/db";
import { db } from "@/lib/db";
import { tokenHash } from "@/lib/einwilligung";
import { mandant, zeilen } from "@/lib/mandant";
import { bestaetigen } from "./actions";

export const dynamic = "force-dynamic";

function rows<T>(res: unknown): T[] { return (Array.isArray(res) ? res : (res as { rows?: T[] }).rows ?? []) as T[]; }

/** Oeffentlich (ohne Login): Einwilligung ueber den per E-Mail erhaltenen Link bestaetigen. */
export default async function EinwilligungSeite({ params, searchParams }: { params: Promise<{ token: string }>; searchParams: Promise<{ ok?: string }> }) {
  const { token } = await params;
  const sp = await searchParams;
  const hash = tokenHash(token);
  const a = rows<{ antrag_id: string; vorname: string; tenant_id: string; schon: boolean }>(await runWithTenant(TENANT_VORARLBERG, () => db().execute(sql`SELECT * FROM einwilligung_link_pruefen(${hash})`)))[0];
  const m = a && istTenantId(a.tenant_id) ? await runWithTenant(a.tenant_id, () => mandant()) : await mandant();
  return (
    <main className="min-h-screen flex items-center justify-center p-6">
      <div className="w-full max-w-lg bg-surface border border-border rounded-card p-6 shadow-sm flex flex-col gap-4">
        <div><div className="text-lg font-semibold">Einwilligung zur Datenverarbeitung</div><div className="text-sm text-muted">{m.name}</div></div>
        {sp.ok || a?.schon ? (
          <div className="text-sm"><span className="pill good">✓ Einwilligung erteilt</span><p className="mt-2 text-muted">Vielen Dank. Sie können dieses Fenster schließen.</p></div>
        ) : !a ? (
          <div className="text-sm text-muted">Dieser Link ist ungültig oder abgelaufen (14 Tage). Bitte bei der Stelle melden, die Ihren Antrag aufgenommen hat.</div>
        ) : (
          <form action={bestaetigen} className="flex flex-col gap-3 text-sm">
            <input type="hidden" name="token" value={token} />
            <p>Guten Tag {a.vorname}, für Ihren Antrag auf eine Berechtigungskarte verarbeitet <b>{m.name}</b> Ihre Angaben (Stammdaten, Haushalt, Einkommensangaben, Dokumente) zur Anspruchsprüfung, Kartenverwaltung und Dokumentation der Lebensmittelausgabe. Empfänger sind die antragstellende Gemeinde/Institution und der Träger. Sie können diese Einwilligung jederzeit widerrufen.</p>
            {zeilen(m.anschrift).length ? <div className="text-xs text-muted">{m.name}, {zeilen(m.anschrift).join(", ")}</div> : null}
            <label className="flex items-start gap-2"><input type="checkbox" name="gelesen" required style={{ marginTop: 3 }} /> Ich habe die <Link href="/datenschutz" target="_blank" className="underline">Datenschutzinformation</Link> gelesen und willige in die beschriebene Verarbeitung ein.</label>
            <button className="btn primary" type="submit">Einwilligung erteilen</button>
          </form>
        )}
      </div>
    </main>
  );
}
