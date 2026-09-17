import { meinKontext, stempelStand } from "@/lib/my";
import { KIND_LABEL } from "@/lib/zeit";
import { StempelKnoepfe } from "./StempelKnoepfe";

export const dynamic = "force-dynamic";

export default async function MyStempeln() {
  const k = (await meinKontext())!;
  const stand = await stempelStand(k.person!.id);
  const zeit = (d: Date) => d.toLocaleTimeString("de-AT", { hour: "2-digit", minute: "2-digit" });
  return (
    <div className="flex flex-col gap-3">
      <div className="panel p-4"><StempelKnoepfe status={stand.status} /></div>
      <div className="panel">
        <div className="panel-h"><h3>Heute gestempelt</h3></div>
        <div className="p-3 text-sm flex flex-col gap-1">
          {stand.heute.length ? stand.heute.map((e, i) => <div key={i} className="flex justify-between"><span>{KIND_LABEL[e.kind]}</span><b className="mono">{zeit(e.at)}</b></div>) : <span className="text-muted">Noch nichts gestempelt.</span>}
        </div>
      </div>
      <p className="text-xs text-muted px-2">Stempel aus der App werden mit Quelle „App“ gespeichert und im Büro genauso ausgewertet wie am Terminal. Vergessene Stempel trägt das Büro nach (Korrektur mit Begründung).</p>
    </div>
  );
}
