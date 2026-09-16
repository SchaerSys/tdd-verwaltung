import Link from "next/link";
import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { locations } from "@tdd/db";
import { db } from "@/lib/db";
import { ausgabeSession, getCurrentUser } from "@/lib/auth";
import { sitzungStand } from "@/lib/station";
import { fmtDateTime } from "@/lib/format";
import { ausgabeBeenden } from "../actions";

export const dynamic = "force-dynamic";
const eur = (n: number) => n.toLocaleString("de-AT", { style: "currency", currency: "EUR" });

/** Ausgabe beenden: Zahlen der Sitzung, Kassenzaehlung, Uebergabe. */
export default async function AbschlussSeite() {
  const [user, az] = await Promise.all([getCurrentUser(), ausgabeSession()]);
  if (!user || !az) redirect("/ausgabe");
  const stand = await sitzungStand(az.s);
  if (!stand) redirect("/ausgabe");
  const ort = (await db().select({ name: locations.name }).from(locations).where(eq(locations.id, stand.locationId)).limit(1))[0]?.name ?? "";

  return (
    <main className="min-h-screen flex items-start justify-center p-6" style={{ background: "var(--bg)" }}>
      <form action={ausgabeBeenden} className="w-full max-w-lg bg-surface border border-border rounded-card p-6 shadow-sm flex flex-col gap-4">
        <div><div className="text-lg font-semibold">Ausgabe beenden · {ort}</div><div className="text-sm text-muted">{az.name} · seit {fmtDateTime(stand.beginn)}</div></div>
        <div className="grid grid-cols-2 gap-3">
          <div className="card stat"><div className="k">Ausgaben in dieser Sitzung</div><div className="v">{stand.anzahl}</div></div>
          <div className="card stat"><div className="k">Einnahmen laut System</div><div className="v">{eur(stand.einnahmen)}</div></div>
        </div>
        <div className="field"><label className="lbl">Kasse gezählt (€)</label><input name="kasseGezaehlt" className="inp mono" inputMode="decimal" placeholder={stand.einnahmen.toFixed(2)} style={{ fontSize: "1.3rem" }} autoFocus /><div className="text-[.7rem] text-muted">Bargeld in der Kasse aus dieser Sitzung. Leer lassen, wenn keine Zählung.</div></div>
        <div className="field"><label className="lbl">Übergabe an</label><input name="uebergabeAn" className="inp" placeholder="Name (Kasse/Schlüssel)" /></div>
        <div className="field"><label className="lbl">Bemerkung</label><input name="notiz" className="inp" placeholder="optional" /></div>
        <button className="btn primary" style={{ padding: 14, fontSize: "1.1rem" }} type="submit">Abschließen &amp; abmelden</button>
        <Link href="/kiosk" className="text-[.8rem] text-muted text-center">Zurück zur Ausgabe</Link>
      </form>
    </main>
  );
}
