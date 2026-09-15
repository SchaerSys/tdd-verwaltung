import type { RueckStatus } from "@/lib/portal-status";

export function AntragStatusPill({ s }: { s: string }) {
  if (s === "POSITIV") return <span className="pill good"><span className="dot" />positiv</span>;
  if (s === "NEGATIV") return <span className="pill bad"><span className="dot" />negativ</span>;
  if (s === "IN_PRUEFUNG") return <span className="pill warn"><span className="dot" />in Prüfung</span>;
  return <span className="pill muted">offen</span>;
}

/** Stand bei TDD (Rueckkanal). Ohne Uebergabe: nichts anzeigen. */
export function RueckPill({ r }: { r: RueckStatus | null }) {
  if (!r || r.stufe === "KEINE") return <span className="text-muted">—</span>;
  return <span className={`pill ${r.pill}`}>{r.pill === "good" || r.pill === "bad" || r.pill === "warn" ? <span className="dot" /> : null}{r.text}</span>;
}

export function ZielPill({ t }: { t: string }) {
  return <span className={`pill ${t === "LADEN" ? "tag-shop" : "tag-out"}`}>{t === "LADEN" ? "Laden" : "Ausgabestelle"}</span>;
}
