import Link from "next/link";
import { getCurrentUser } from "@/lib/auth";
import { datumPlus, heuteIso, WOCHENTAGE, wochentag } from "@/lib/touren";
import { fahrerZuBenutzer, ladeTouren } from "@/lib/touren-daten";
import { fmtDate } from "@/lib/format";
import { streckeBerechnen } from "@/app/(app)/touren/karte-actions";
import { TourAblauf } from "@/components/TourAblauf";

export const dynamic = "force-dynamic";

/**
 * Tour des Tages fuer die angemeldete Fahrerin / den Fahrer: Stopps abhaken, Mengen
 * eintragen, Navigation starten. Grosse Knoepfe, eine Spalte, funktioniert am Handy.
 */
export default async function FahrtSeite({ searchParams }: { searchParams: Promise<{ datum?: string }> }) {
  const user = (await getCurrentUser())!;
  const sp = await searchParams;
  const datum = /^\d{4}-\d{2}-\d{2}$/.test(sp.datum ?? "") ? sp.datum! : heuteIso();
  const me = await fahrerZuBenutzer(user.id);
  const alle = user.role !== "FAHRER";
  // Fahrer:innen sehen nur, was das Buero gesendet hat (Freigabe); Buero sieht alles.
  const roh = me ? (await ladeTouren({ datum })).filter((t) => alle || t.fahrerId === me.id || t.beifahrerId === me.id) : alle ? await ladeTouren({ datum }) : [];
  const liste = roh.filter((t) => alle || t.freigegebenAt || t.status !== "GEPLANT");
  const strecken = new Map(await Promise.all(liste.map(async (t) => [t.id, await streckeBerechnen("tour", t.id)] as const)));

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-2">
        <Link href={`/fahrt?datum=${datumPlus(datum, -1)}`} className="btn ghost sm">←</Link>
        <div className="flex-1 text-center"><b>{WOCHENTAGE[wochentag(datum)]}</b><div className="text-xs text-muted">{fmtDate(datum)}</div></div>
        <Link href={`/fahrt?datum=${datumPlus(datum, 1)}`} className="btn ghost sm">→</Link>
      </div>

      {!me && !alle ? <div className="panel"><div className="p-4 text-[.9rem]">Dein Login ist noch keiner Person im Personal-Verzeichnis zugeordnet. Bitte im Büro melden.</div></div> : null}
      {liste.length === 0 ? <div className="panel"><div className="empty">Keine Tour für dich an diesem Tag.</div></div> : null}

      <TourAblauf liste={liste} strecken={strecken} />
    </div>
  );
}
