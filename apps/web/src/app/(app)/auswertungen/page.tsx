import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { hasPermission, type Permission } from "@/lib/rbac";
import { mandant } from "@/lib/mandant";
import { modulAktiv, type Modul } from "@/lib/nav";

export const dynamic = "force-dynamic";

interface Karte { titel: string; text: string; href: string; perm: Permission; modul?: Modul; gruppe: string }

/** Alle Auswertungen an einem Ort – je nach Rolle und aktiven Modulen. */
const KARTEN: Karte[] = [
  { gruppe: "Klient:innen & Ausgabe", titel: "Klient:innen & Karten", text: "Berechtigte je Standort, aktive Karten, Neuaufnahmen, Herkunft der Meldungen, ablaufende Karten – mit Excel-Export.", href: "/auswertungen/klienten", perm: "report:view" },
  { gruppe: "Klient:innen & Ausgabe", titel: "Ausgaben je Tag", text: "Personen, Einnahmen und Ausstand je Ausgabestelle und Tag für einen Zeitraum – mit Excel-Export.", href: "/ausgaben", perm: "distribution:record" },
  { gruppe: "Klient:innen & Ausgabe", titel: "Offene Schulden", text: "Personen mit Ausstand je Ausgabestelle, Stufe Warnung/Sperre, sortierbar.", href: "/ausgaben/schulden", perm: "distribution:record" },
  { gruppe: "Klient:innen & Ausgabe", titel: "Kassenabschlüsse", text: "Ausgabe-Sitzungen mit Einnahmen laut System, Kassenzählung und Differenz.", href: "/admin/ausgabestation", perm: "admin:manage", modul: "station" },
  { gruppe: "Logistik", titel: "Wareneingang", text: "Kisten und geschätzte kg aus den Abholungen – je Tag, je Abholstelle, je Tour; Excel-Export.", href: "/auswertungen/wareneingang", perm: "tour:manage", modul: "touren" },
  { gruppe: "Logistik", titel: "Abholstellen", text: "Abholtage, Aufenthaltsdauer (Geofencing) und Verlauf je Abholstelle.", href: "/touren/abholstellen", perm: "tour:manage", modul: "touren" },
  { gruppe: "Personal", titel: "Monatsauswertung Zeiterfassung", text: "Ist/Soll, Gutschriften, Zeitkonto je Person – Druck A4.", href: "/zeit/monat", perm: "staff:manage", modul: "personal" },
  { gruppe: "Personal", titel: "AZG-Prüfung", text: "Hinweise nach AZG/ARG (Höchstarbeitszeit, Pause, Ruhezeit), Mehrarbeit/Überstunden, Monatsabschluss.", href: "/zeit/pruefung", perm: "staff:manage", modul: "personal" },
  { gruppe: "Personal", titel: "Urlaubskonten", text: "Anspruch, Verbrauch, Rest und Übertrag je Person.", href: "/abwesenheiten/konto", perm: "staff:manage", modul: "personal" },
  { gruppe: "Personal", titel: "Lohnexport", text: "Stunden, Salden, Mehrarbeit/Überstunden und Abwesenheitstage je Monat für die Lohnverrechnung (Excel/CSV).", href: "/zeit/lohn", perm: "admin:manage", modul: "personal" },
  { gruppe: "Personal", titel: "Zivildienst", text: "Dienstzeit, Freistellung, Fehltage, Meldeliste an die Zivildienstserviceagentur.", href: "/personal/zivildienst", perm: "staff:manage", modul: "zivildienst" },
  { gruppe: "Portal", titel: "Anträge (Portal)", text: "Bewilligte Anträge, Rückfragen, Bearbeitungsstand – für das Büro.", href: "/bewilligt", perm: "person:write", modul: "portal" },
];

export default async function AuswertungenHub() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const m = await mandant();
  const sichtbar = KARTEN.filter((k) => hasPermission(user.role, k.perm) && (!k.modul || modulAktiv(m.module, k.modul)));
  if (sichtbar.length === 0) redirect("/dashboard");
  const gruppen = [...new Set(sichtbar.map((k) => k.gruppe))];
  return (
    <div>
      <div className="page-h"><div><h1>Auswertungen</h1><div className="sub">Alle Auswertungen an einem Ort – auswählen, was gebraucht wird</div></div></div>
      {gruppen.map((g) => (
        <div key={g} className="mb-5">
          <div className="text-xs font-semibold text-muted uppercase mb-2" style={{ letterSpacing: ".04em" }}>{g}</div>
          <div className="grid gap-3 grid-cols-[repeat(auto-fill,minmax(260px,1fr))]">
            {sichtbar.filter((k) => k.gruppe === g).map((k) => (
              <Link key={k.href} href={k.href} className="panel" style={{ padding: 14, textDecoration: "none", display: "block" }}>
                <div className="font-semibold mb-1">{k.titel} →</div>
                <div className="text-sm text-muted">{k.text}</div>
              </Link>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
