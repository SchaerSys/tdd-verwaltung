import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { staff } from "@tdd/db";
import { db } from "@/lib/db";
import { stationAusCookie } from "@/lib/station";
import { PinForm } from "./PinForm";

export const dynamic = "force-dynamic";

/** Erste Anmeldung an der Station: Einmal-PIN durch eigene PIN ersetzen. */
export default async function PinSeite({ searchParams }: { searchParams: Promise<{ staff?: string; loc?: string }> }) {
  const station = await stationAusCookie();
  if (!station) redirect("/ausgabe");
  const sp = await searchParams;
  const p = sp.staff ? (await db().select({ id: staff.id, first: staff.firstName, last: staff.lastName }).from(staff).where(eq(staff.id, sp.staff)).limit(1))[0] : null;
  if (!p) redirect("/ausgabe");
  return (
    <main className="min-h-screen flex items-center justify-center p-6" style={{ background: "var(--bg)" }}>
      <PinForm staffId={p.id} name={`${p.first} ${p.last}`} />
    </main>
  );
}
