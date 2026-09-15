"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { takeoverPerson } from "@/app/(app)/bewilligt/actions";

export interface Uebernahme {
  id: string; name: string; org: string | null; orgTyp: string | null; loc: string | null; locTyp: string | null; seit: string;
}

/**
 * Reiter am rechten Fensterrand mit den bewilligten, noch nicht uebernommenen Antraegen.
 * Von jeder Seite aus erreichbar; aufklappen, pruefen, uebernehmen, ohne die Seite zu verlassen.
 */
export function UebernahmenReiter({ eintraege }: { eintraege: Uebernahme[] }) {
  const [offen, setOffen] = useState(false);

  // Escape schliesst; beim Wechsel der Liste (Uebernahme erledigt) bleibt der Reiter offen.
  useEffect(() => {
    if (!offen) return;
    const h = (e: KeyboardEvent) => { if (e.key === "Escape") setOffen(false); };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [offen]);

  const n = eintraege.length;
  return (
    <>
      <button
        type="button"
        className={`ureiter ${n > 0 ? "hat" : ""} ${offen ? "offen" : ""}`}
        onClick={() => setOffen((o) => !o)}
        aria-expanded={offen}
        aria-controls="ureiter-panel"
        title="Bewilligte Anträge"
      >
        <span className="ureiter-text">Anträge</span>
        {n > 0 ? <span className="ureiter-zahl">{n}</span> : null}
      </button>

      {offen ? (
        <aside id="ureiter-panel" className="upanel" aria-label="Bewilligte Anträge">
          <div className="upanel-h">
            <b>Bewilligte Anträge</b>
            <span className="pill muted">{n} offen</span>
            <button type="button" className="btn ghost sm" style={{ marginLeft: "auto" }} onClick={() => setOffen(false)} aria-label="Schließen">✕</button>
          </div>
          {n === 0 ? (
            <div className="empty" style={{ margin: 16 }}>Nichts zu übernehmen. Neue bewilligte Anträge erscheinen hier von selbst.</div>
          ) : (
            <ul className="uliste">
              {eintraege.map((e) => (
                <li key={e.id} className="ueintrag">
                  <div className="ueintrag-kopf">
                    <Link href={`/personen/${e.id}`} className="font-semibold hover:underline" onClick={() => setOffen(false)}>{e.name}</Link>
                    <span className="text-xs text-muted">{e.seit}</span>
                  </div>
                  <div className="ueintrag-meta">
                    {e.org ? <span className="pill muted">{e.orgTyp === "GEMEINDE" ? "Gemeinde" : "Institution"}: {e.org}</span> : null}
                    {e.loc
                      ? <span className={`pill ${e.locTyp === "LADEN" ? "tag-shop" : "tag-out"}`}>{e.loc}</span>
                      : <span className="pill bad">Standort fehlt</span>}
                  </div>
                  <div className="ueintrag-aktion">
                    <Link href={`/personen/${e.id}`} className="btn ghost sm" onClick={() => setOffen(false)}>Prüfen</Link>
                    <form action={takeoverPerson}>
                      <input type="hidden" name="personId" value={e.id} />
                      <button className="btn primary sm" type="submit" disabled={!e.loc} title={!e.loc ? "Zuerst einen Standort zuweisen (Prüfen)" : undefined}>Übernehmen</button>
                    </form>
                  </div>
                </li>
              ))}
            </ul>
          )}
          <div className="upanel-f"><Link href="/bewilligt" onClick={() => setOffen(false)}>Ganze Liste öffnen →</Link></div>
        </aside>
      ) : null}
    </>
  );
}
