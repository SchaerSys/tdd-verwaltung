import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentOps } from "@/lib/auth";
import { NeuForm } from "./NeuForm";
import { Schritte } from "../Schritte";

export const dynamic = "force-dynamic";

export default async function NeuerMandantSeite() {
  const ops = await getCurrentOps();
  if (!ops || ops.rolle !== "SUPER") redirect("/unternehmen");
  return (
    <div>
      <div className="page-h"><div><h1>Neues Unternehmen einrichten</h1><div className="sub">Schritt 1 von 4 · Stammdaten</div></div><Link href="/unternehmen" className="btn ghost sm">Abbrechen</Link></div>
      <Schritte aktiv={1} />
      <div className="panel"><div style={{ padding: 12 }}><NeuForm /></div></div>
    </div>
  );
}
