import type { Metadata, Viewport } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { and, asc, eq, isNotNull } from "drizzle-orm";
import { dienste, locations, staff } from "@tdd/db";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { hasPermission } from "@/lib/rbac";
import { stationAusCookie } from "@/lib/station";
import { asOpeningHours, todayText, WEEKDAYS } from "@/lib/opening-hours";
import { heuteIso } from "@/lib/touren";
import { Lebenszeichen } from "@/components/Lebenszeichen";
import { STAFF_TYPE_LABEL } from "@/app/(app)/personal/types";
import { AusgabeStart, StationKoppeln } from "./AusgabeStart";

export const metadata: Metadata = { title: "Ausgabe · Tafelwerk", manifest: "/manifest.webmanifest" };
export const viewport: Viewport = { width: "device-width", initialScale: 1 };
export const dynamic = "force-dynamic";

/**
 * Ausgabestation (Laptop): Standort wählen, Person + PIN, Ausgabe starten -> Kiosk.
 * Büro-Konten mit Kassenrecht starten hier ebenfalls eine Sitzung (nur Standortwahl).
 */
export default async function AusgabeSeite({ searchParams }: { searchParams: Promise<{ beendet?: string }> }) {
  const [station, user, sp] = await Promise.all([stationAusCookie(), getCurrentUser(), searchParams]);
  if (user?.sitzungId) redirect("/kiosk");
  const buero = !!user && !station && hasPermission(user.role, "distribution:record");
  if (user && !station && !buero) redirect("/dashboard");

  if (!station && !buero) {
    return <main className="min-h-screen flex items-center justify-center p-6" style={{ background: "var(--bg)" }}><Lebenszeichen bereich="station" /><StationKoppeln /></main>;
  }

  const heute = heuteIso();
  const wt = new Date(heute + "T00:00:00Z").getUTCDay() || 7;
  const [locs, leute, dienstHeute] = await Promise.all([
    db().select({ id: locations.id, name: locations.name, type: locations.type, oh: locations.openingHours }).from(locations).where(eq(locations.isActive, true)).orderBy(asc(locations.name)),
    station ? db().select({ id: staff.id, first: staff.firstName, last: staff.lastName, typ: staff.staffType }).from(staff).where(and(eq(staff.isActive, true), isNotNull(staff.pinHash))).orderBy(asc(staff.lastName)) : Promise.resolve([]),
    db().select({ staffId: dienste.staffId, locationId: dienste.locationId }).from(dienste).where(and(eq(dienste.datum, heute), eq(dienste.taetigkeit, "AUSGABE"))),
  ]);
  const standorte = locs.filter((l) => l.type !== "LAGER").map((l) => {
    const oh = asOpeningHours(l.oh);
    const slots = oh[WEEKDAYS[wt - 1]!] ?? [];
    return { id: l.id, name: l.name, heuteOffen: slots.length ? todayText(oh) : null };
  });
  // Vorbelegung: Standort mit Ausgabe-Dienst heute, sonst der heute geöffnete
  const vorbelegt = dienstHeute.find((d) => d.locationId)?.locationId ?? standorte.find((s) => s.heuteOffen)?.id ?? user?.locationId ?? null;
  const personen = leute.map((p) => ({ id: p.id, name: `${p.first} ${p.last}`, typ: STAFF_TYPE_LABEL[p.typ] ?? p.typ, dienstLoc: dienstHeute.find((d) => d.staffId === p.id)?.locationId ?? null }));

  return (
    <div className="min-h-screen" style={{ background: "var(--bg)" }}>
      <Lebenszeichen bereich="station" />
      <div className="flex items-center gap-3 px-4 py-3 border-b border-[color:var(--border)] bg-[color:var(--surface)]">
        <div className="w-8 h-8 rounded-lg bg-accent text-white grid place-items-center font-bold text-sm">📷</div>
        <div><div className="font-bold text-sm">Ausgabe</div><div className="text-xs text-muted">{station ? station.name : `Büro · ${user?.displayName}`}</div></div>
        {buero ? <Link href="/dashboard" className="btn ghost sm" style={{ marginLeft: "auto" }}>← Verwaltung</Link> : null}
      </div>
      <main className="p-4">
        {sp.beendet ? <div className="max-w-3xl mx-auto mb-4 panel"><div className="p-3 text-[.875rem]"><span className="pill good"><span className="dot" />Ausgabe beendet</span> Danke – der Abschluss ist gespeichert.</div></div> : null}
        <AusgabeStart standorte={standorte} personen={personen} vorbelegt={vorbelegt} modus={station ? "STATION" : "BUERO"} name={user?.displayName} />
        {station ? <p className="text-center text-[.72rem] text-muted mt-6">Gekoppelt seit {station.gekoppeltAt.toLocaleDateString("de-AT")} · Erste Anmeldung mit der Einmal-PIN vom Büro, danach eigene PIN.</p> : null}
      </main>
    </div>
  );
}
