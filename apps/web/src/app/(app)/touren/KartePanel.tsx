"use client";
import { useActionState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { TourKarte, type KartenPunkt } from "@/components/TourKarte";
import { geocodieren, koordinatenSetzen, optimieren, type KarteState } from "./karte-actions";

/** Karte einer Tour/Vorlage mit Knopf „Reihenfolge optimieren“. */
export function TourKartePanel({ art, id, punkte, route, km, minuten, ohneKoordinaten, optimierbar, osrm }: {
  art: "tour" | "vorlage"; id: string | number; punkte: KartenPunkt[]; route?: [number, number][];
  km: number | null; minuten: number | null; ohneKoordinaten: string[]; optimierbar: boolean; osrm: boolean;
}) {
  const [state, action, pending] = useActionState<KarteState, FormData>(optimieren, {});
  return (
    <div className="panel">
      <div className="panel-h"><h3>Karte</h3>
        {km != null ? <span className="pill muted">{km} km · ca. {minuten} min</span> : null}
        {!osrm ? <span className="pill warn">Routing-Dienst nicht erreichbar</span> : null}
        <form action={action} style={{ marginLeft: "auto" }}>
          <input type="hidden" name="art" value={art} /><input type="hidden" name="id" value={id} />
          <button className="btn primary sm" disabled={pending || !optimierbar || !osrm} title={!optimierbar ? "Mindestens zwei Abholungen mit Koordinaten nötig" : undefined}>{pending ? "Rechne…" : "⇄ Reihenfolge optimieren"}</button>
        </form>
      </div>
      {punkte.length === 0 ? <div className="empty">Keine Stopps mit Koordinaten – Adressen der Abholstellen geocodieren.</div> : <div className="p-2"><TourKarte punkte={punkte} route={route} /></div>}
      {ohneKoordinaten.length ? <div className="px-3 pb-2 text-[.75rem]" style={{ color: "var(--warn)" }}>Ohne Koordinaten (nicht auf der Karte): {ohneKoordinaten.join(", ")}</div> : null}
      {state.error ? <div className="px-3 pb-3 text-[.8125rem]" style={{ color: "var(--bad)" }}>{state.error}</div> : null}
      {state.info ? <div className="px-3 pb-3 text-[.8125rem]" style={{ color: "var(--good)" }}>{state.info}</div> : null}
      <div className="px-3 pb-3 text-[.7rem] text-muted">Start ist der Startstandort (Lager Vandans), Ziel die letzte Lieferung; dazwischen die kürzeste Runde. Kartenkacheln von OpenStreetMap, Routing auf dem eigenen Server.</div>
    </div>
  );
}

/** Ein Punkt (Abholstelle/Standort): geocodieren, Marker von Hand verschieben. */
export function PunktPanel({ art, id, name, adresse, lat, lng }: { art: "abholstelle" | "standort"; id: number; name: string; adresse: string; lat: number | null; lng: number | null }) {
  const [state, action, pending] = useActionState<KarteState, FormData>(geocodieren, {});
  const router = useRouter();
  const verschoben = useCallback((p: { lat: number; lng: number }) => { void koordinatenSetzen(art, id, p).then(() => router.refresh()); }, [art, id, router]);
  const punkte: KartenPunkt[] = lat != null && lng != null ? [{ lat, lng, nr: "●", label: name, untertitel: adresse }] : [];
  return (
    <div className="panel">
      <div className="panel-h"><h3>Auf der Karte</h3>
        {lat != null ? <span className="pill good"><span className="dot" />{lat.toFixed(5)}, {lng!.toFixed(5)}</span> : <span className="pill warn">keine Koordinaten</span>}
        <form action={action} style={{ marginLeft: "auto" }}><input type="hidden" name="art" value={art} /><input type="hidden" name="id" value={id} />
          <button className="btn sm" disabled={pending || !adresse}>{pending ? "Suche…" : lat != null ? "Adresse neu suchen" : "📍 Adresse suchen"}</button></form>
      </div>
      {punkte.length ? <div className="p-2"><TourKarte punkte={punkte} hoehe={260} onVerschoben={verschoben} /></div> : <div className="p-3 text-[.8125rem] text-muted">{adresse ? "Auf „Adresse suchen“ klicken. Danach lässt sich der Marker mit der Maus genau auf die Rampe ziehen." : "Zuerst Straße, PLZ und Ort speichern."}</div>}
      {state.error ? <div className="px-3 pb-3 text-[.8125rem]" style={{ color: "var(--bad)" }}>{state.error}</div> : null}
      {state.info ? <div className="px-3 pb-3 text-[.8125rem]" style={{ color: "var(--good)" }}>{state.info}</div> : null}
    </div>
  );
}
