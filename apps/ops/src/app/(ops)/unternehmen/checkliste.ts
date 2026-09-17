import type { MandantStatus } from "@/lib/unternehmen";

export interface Punkt { key: string; titel: string; ok: boolean; hinweis: string; href?: string }

/** Inbetriebnahme eines Mandanten: was fehlt noch, bis das Unternehmen arbeiten kann. */
export function checkliste(m: MandantStatus): Punkt[] {
  return [
    { key: "host", titel: "Eigener Host zugeordnet", ok: !!m.host, hinweis: m.host ? m.host : "Ohne Host melden sich Benutzer über ihre E-Mail-Adresse an; die Fach-App zeigt dann zunächst den Standard-Mandanten (Login-Seite).", href: `/unternehmen/${m.id}/einrichten?schritt=3` },
    { key: "smtp", titel: "E-Mail-Versand (SMTP) hinterlegt", ok: m.smtp, hinweis: m.smtp ? "eigener Mailserver" : "Ohne eigenes SMTP gehen Mails über die Plattform (Absender Tafelwerk).", href: `/unternehmen/${m.id}?tab=smtp` },
    { key: "admin", titel: "Erstes Admin-Konto eingeladen", ok: m.admins > 0, hinweis: m.admins > 0 ? `${m.admins} Admin-Konto/-Konten aktiv` : "Mandant oben wählen, dann unter „Benutzer“ ein Konto mit Rolle ADMIN einladen.", href: `/unternehmen/${m.id}/einrichten?schritt=4` },
    { key: "zeit", titel: "Zeitregeln vorhanden", ok: m.zeitregeln, hinweis: m.zeitregeln ? "AZG-Standard angelegt; Feinabstimmung macht der Admin unter Personal → Zeitregeln" : "Fehlt – beim Anlegen über die Wartungsplattform wird sie automatisch erzeugt." },
    { key: "standorte", titel: "Standorte angelegt", ok: m.standorte > 0, hinweis: m.standorte > 0 ? `${m.standorte} aktiv, davon ${m.lager} Lager` : "Der Admin legt Ausgabestellen/Läden und ein Lager (Tourenstart) in der Fach-App unter Verwaltung → Standorte an." },
    { key: "lager", titel: "Lager als Tourenstart", ok: m.lager > 0, hinweis: m.lager > 0 ? "vorhanden" : "Ein Standort vom Typ Lager ist der Startpunkt der Touren." },
    { key: "personal", titel: "Personal erfasst", ok: m.personal > 0, hinweis: m.personal > 0 ? `${m.personal} Datensätze` : "Mitarbeitende, Zivildiener, Fahrer:innen unter Personal anlegen; Admin-Login mit Personal-Datensatz verknüpfen." },
    { key: "login", titel: "Erster Login erfolgt", ok: !!m.letzter_login, hinweis: m.letzter_login ? "ja" : "Noch hat sich niemand angemeldet." },
  ];
}
