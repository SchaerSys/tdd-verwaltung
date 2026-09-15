import Link from "next/link";
import { ladeBenutzer, ladeEreignisse } from "@/lib/support";
import { EreignisListe } from "@/components/SupportTeile";

export const dynamic = "force-dynamic";

/** Alle Vorkommen einer Fehlerkennung (die Kennung steht auf der Fehlerseite der Fach-App). */
export default async function FehlerKennungSeite({ params }: { params: Promise<{ digest: string }> }) {
  const { digest } = await params;
  const liste = await ladeEreignisse({ digest: digest.slice(0, 64) }, 200);
  const ids = [...new Set(liste.map((e) => e.user_id).filter((x): x is string => !!x))];
  const namen = new Map<string, string>();
  for (const id of ids) { const b = (await ladeBenutzer({ id }))[0]; if (b) namen.set(id, b.display_name); }

  return (
    <div>
      <div className="page-h">
        <div><h1>Fehlerkennung</h1><div className="sub mono">{digest} · {liste.length} Vorkommen · {ids.length} Betroffene</div></div>
        <Link href="/mandanten" className="btn ghost">← Mandanten</Link>
      </div>
      <div className="panel"><EreignisListe liste={liste} mitBenutzer={namen} /></div>
    </div>
  );
}
