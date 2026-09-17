import type { Metadata, Viewport } from "next";
import Link from "next/link";
import { geraetAusCookie } from "@/lib/geraet";
import { datumPlus, heuteIso, WOCHENTAGE, wochentag } from "@/lib/touren";
import { ladeTouren, planStammdaten } from "@/lib/touren-daten";
import { streckeBerechnen } from "@/app/(app)/touren/karte-actions";
import { fmtDate } from "@/lib/format";
import { TourAblauf } from "@/components/TourAblauf";
import { ortungErlaubt } from "@/lib/touren-daten";
import { Lebenszeichen } from "@/components/Lebenszeichen";
import { KoppelnForm } from "./KoppelnForm";
import { mandant } from "@/lib/mandant";

export const metadata: Metadata = { title: "Fahrzeug-Tablet · CareOS", manifest: "/manifest.webmanifest" };
export const viewport: Viewport = { width: "device-width", initialScale: 1, maximumScale: 1 };
export const dynamic = "force-dynamic";

/**
 * Fahrzeug-Tablet: kein Login. Das Tablet ist einmal mit dem Fahrzeug gekoppelt und zeigt
 * die Touren, die das Buero an dieses Fahrzeug gesendet hat. Route vorgegeben, nur Start druecken.
 */
export default async function FahrzeugSeite({ searchParams }: { searchParams: Promise<{ datum?: string }> }) {
  const g = await geraetAusCookie();
  if (!g) {
    return <main className="min-h-screen flex items-center justify-center p-6" style={{ background: "var(--bg)" }}><KoppelnForm /></main>;
  }
  const sp = await searchParams;
  const datum = /^\d{4}-\d{2}-\d{2}$/.test(sp.datum ?? "") ? sp.datum! : heuteIso();
  const liste = (await ladeTouren({ datum })).filter((t) => t.fahrzeugId === g.fahrzeugId && (t.freigegebenAt || t.status === "UNTERWEGS" || t.status === "ABGESCHLOSSEN"));
  const strecken = new Map(await Promise.all(liste.map(async (t) => [t.id, await streckeBerechnen("tour", t.id)] as const)));
  const fahrerListe = (await planStammdaten()).fahrer.filter((f) => f.kannFahren).map((f) => ({ id: f.id, name: `${f.firstName} ${f.lastName}` }));

  return (
    <div className="min-h-screen" style={{ background: "var(--bg)" }}>
      <Lebenszeichen bereich="tablet" />
      <div className="flex items-center gap-3 px-4 py-3 border-b border-[color:var(--border)] bg-[color:var(--surface)]">
        <div className="w-8 h-8 rounded-lg bg-accent text-white grid place-items-center font-bold text-sm">🚚</div>
        <div><div className="font-bold text-sm">{g.fahrzeug}</div><div className="text-xs text-muted">{g.name}{g.kuehlung ? " · ❄ Kühlfahrzeug" : ""}</div></div>
      </div>
      <main className="p-3 max-w-2xl mx-auto flex flex-col gap-3">
        <div className="flex items-center gap-2">
          <Link href={`/fahrzeug?datum=${datumPlus(datum, -1)}`} className="btn ghost sm">←</Link>
          <div className="flex-1 text-center"><b>{WOCHENTAGE[wochentag(datum)]}</b><div className="text-xs text-muted">{fmtDate(datum)}</div></div>
          <Link href={`/fahrzeug?datum=${datumPlus(datum, 1)}`} className="btn ghost sm">→</Link>
        </div>
        {liste.length === 0 ? <div className="panel"><div className="empty">Keine Tour für dieses Fahrzeug an diesem Tag. Sobald das Büro eine Tour sendet, erscheint sie hier von selbst.</div></div> : null}
        <TourAblauf liste={liste} strecken={strecken} fahrer={fahrerListe} ortung={await ortungErlaubt(liste)} />
        <div className="text-[.7rem] text-muted text-center py-4">{(await mandant()).kurzname} · Fahrzeug-Tablet · Seite lädt Änderungen beim Öffnen; zum Aktualisieren nach unten ziehen.</div>
      </main>
    </div>
  );
}
