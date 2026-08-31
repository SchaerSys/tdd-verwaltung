"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { fmtDate } from "@/lib/format";
import { asOpeningHours, isOpenNow, todayText } from "@/lib/opening-hours";
import type { WidgetSpec } from "@/lib/dashboard-prefs";
import type { DashboardData } from "./data";
import { addWidget, removeWidget, removeFavorite } from "./prefs-actions";

const POLL_MS = 15000;

interface FavTile { href: string; label: string }
interface LocLite { id: number; name: string; type: string; openingHours: unknown }

interface FcDay { date: string; code: number | null; tmax: number | null; tmin: number | null; pop: number | null }
interface Forecast { place: string; current: { tempC: number | null; code: number | null }; days: FcDay[] }
interface Coords { lat: number; lon: number }

function weatherIcon(code: number | null): string {
  if (code == null) return "🌡";
  if (code === 0) return "☀️";
  if (code <= 3) return "⛅";
  if (code <= 48) return "🌫️";
  if (code <= 57) return "🌦️";
  if (code <= 67) return "🌧️";
  if (code <= 77) return "❄️";
  if (code <= 82) return "🌧️";
  if (code <= 86) return "🌨️";
  return "⛈️";
}

export function DashboardLive({
  initial, favorites, widgets, locations,
}: {
  initial: DashboardData | null;
  favorites: FavTile[];
  widgets: WidgetSpec[];
  locations: LocLite[];
}) {
  const router = useRouter();
  const [data, setData] = useState<DashboardData | null>(initial);
  const [updatedAt, setUpdatedAt] = useState<Date>(new Date());
  const [live, setLive] = useState(true);
  const [pickerOpen, setPickerOpen] = useState(false);
  const busy = useRef(false);

  const refresh = useCallback(async () => {
    if (busy.current) return;
    busy.current = true;
    try {
      const res = await fetch("/api/dashboard", { cache: "no-store" });
      if (!res.ok) { setLive(false); return; }
      setData((await res.json()) as DashboardData | null);
      setUpdatedAt(new Date());
      setLive(true);
    } catch { setLive(false); }
    finally { busy.current = false; }
  }, []);

  useEffect(() => {
    const id = setInterval(refresh, POLL_MS);
    const onVis = () => { if (document.visibilityState === "visible") refresh(); };
    document.addEventListener("visibilitychange", onVis);
    window.addEventListener("focus", refresh);
    return () => {
      clearInterval(id);
      document.removeEventListener("visibilitychange", onVis);
      window.removeEventListener("focus", refresh);
    };
  }, [refresh]);

  const kpi = data?.kpi;
  const stats = [
    { k: "Aktuell berechtigt", v: kpi ? String(kpi.persons) : "–", d: "Personen mit gültiger Karte" },
    { k: "Aktive Karten", v: kpi ? String(kpi.activeCards) : "–", d: "gültig" },
    { k: "Bald ablaufend", v: kpi ? String(kpi.exp30) : "–", d: "≤ 30 Tage", warn: kpi ? kpi.exp30 > 0 : false },
    { k: "Ausgaben (30 Tage)", v: kpi ? String(kpi.dist30) : "–", d: "Anwesenheiten" },
  ];
  const hhmmss = updatedAt.toLocaleTimeString("de-AT", { hour: "2-digit", minute: "2-digit", second: "2-digit" });

  // Verfügbare Widgets fürs Hinzufügen (schon vorhandene ausblenden).
  const has = (spec: WidgetSpec) =>
    widgets.some((w) => w.type === spec.type && (w.type !== "location" || (spec.type === "location" && w.id === spec.id)));
  const addable: { label: string; spec: WidgetSpec }[] = [
    { label: "🌤 Wetter (Vorarlberg)", spec: { type: "weather" } as WidgetSpec },
    { label: "⏳ Bald ablaufende Karten", spec: { type: "expiring" } as WidgetSpec },
    { label: "🕒 Letzte Aktivität", spec: { type: "recent" } as WidgetSpec },
    ...locations.map((l): { label: string; spec: WidgetSpec } => ({ label: `${l.type === "LADEN" ? "🏪" : "📦"} ${l.name}`, spec: { type: "location", id: l.id } })),
  ].filter((o) => !has(o.spec));

  async function doAdd(spec: WidgetSpec) { setPickerOpen(false); await addWidget(spec); router.refresh(); }
  async function doRemoveWidget(spec: WidgetSpec) { await removeWidget(spec); router.refresh(); }
  async function doRemoveFav(href: string) { await removeFavorite(href); router.refresh(); }

  return (
    <div>
      <div className="flex items-center gap-2 mb-3 text-[.78rem]" style={{ color: "var(--muted)" }}>
        <span aria-hidden style={{ width: 8, height: 8, borderRadius: "50%", background: live ? "var(--good)" : "var(--muted-2)", boxShadow: live ? "0 0 0 3px color-mix(in srgb, var(--good) 25%, transparent)" : "none", display: "inline-block" }} />
        <span>{live ? "Live" : "Verbindung unterbrochen"} · aktualisiert {hhmmss}</span>
        <button type="button" onClick={refresh} className="btn ghost sm" style={{ marginLeft: 4 }}>↻ Jetzt aktualisieren</button>
      </div>

      {/* KPI-Kacheln (rechteckig) */}
      <div className="tiles mb-5">
        {stats.map((s) => (
          <div key={s.k} className="tile">
            <div className="tile-k">{s.k}</div>
            <div className="tile-v" style={s.warn ? { color: "var(--warn)" } : undefined}>{s.v}</div>
            <div className="tile-d">{s.d}</div>
          </div>
        ))}
      </div>

      {/* Favoriten */}
      <div className="sec-h"><h3>Favoriten</h3><span className="sec-hint">Rechtsklick auf einen Nav-Eintrag → „als Favorit"</span></div>
      {favorites.length ? (
        <div className="tiles mb-5">
          {favorites.map((f) => (
            <div key={f.href} className="tile fav">
              <button type="button" className="tile-x" title="Favorit entfernen" onClick={() => doRemoveFav(f.href)}>✕</button>
              <a href={f.href} target="_blank" rel="noopener" className="fav-link" title="In eigenem Fenster öffnen – Dashboard bleibt offen">
                <span className="fav-star" aria-hidden>★</span>
                <span className="fav-label">{f.label}</span>
                <span className="fav-ext" aria-hidden>↗</span>
              </a>
            </div>
          ))}
        </div>
      ) : (
        <div className="empty mb-5">Noch keine Favoriten. Rechtsklick auf einen Eintrag in der Navigationsleiste → „☆ Als Favorit hinzufügen".</div>
      )}

      {/* Widgets */}
      <div className="sec-h">
        <h3>Widgets</h3>
        <div style={{ position: "relative" }}>
          <button type="button" className="btn ghost sm" onClick={() => setPickerOpen((o) => !o)}>＋ Widget hinzufügen</button>
          {pickerOpen ? (
            <div className="ctx-menu" style={{ position: "absolute", right: 0, top: "110%", zIndex: 40, minWidth: 220 }}>
              {addable.length ? addable.map((o) => (
                <button key={o.label} type="button" className="ctx-item" onClick={() => doAdd(o.spec)}>{o.label}</button>
              )) : <div className="ctx-item" style={{ color: "var(--muted)" }}>Alle Widgets bereits hinzugefügt</div>}
            </div>
          ) : null}
        </div>
      </div>

      {widgets.length ? (
        <div className="widgets">
          {widgets.map((w, i) => (
            <div key={`${w.type}-${w.type === "location" ? w.id : i}`} className="widget">
              <div className="widget-h">
                <b>{widgetTitle(w, locations)}</b>
                <button type="button" className="tile-x" title="Widget entfernen" onClick={() => doRemoveWidget(w)}>✕</button>
              </div>
              <div className="widget-body">
                {w.type === "weather" ? <WeatherBody /> : null}
                {w.type === "location" ? <LocationBody loc={locations.find((l) => l.id === w.id)} /> : null}
                {w.type === "expiring" ? <ExpiringBody data={data} /> : null}
                {w.type === "recent" ? <RecentBody data={data} /> : null}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="empty">Noch keine Widgets. Über „＋ Widget hinzufügen" Wetter, Standorte oder Listen hinzufügen.</div>
      )}
    </div>
  );
}

function widgetTitle(w: WidgetSpec, locations: LocLite[]): string {
  if (w.type === "weather") return "🌤 Wetter";
  if (w.type === "expiring") return "⏳ Bald ablaufende Karten";
  if (w.type === "recent") return "🕒 Letzte Aktivität";
  const l = locations.find((x) => x.id === w.id);
  return `${l && l.type === "LADEN" ? "🏪" : "📦"} ${l?.name ?? "Standort"}`;
}

const COORDS_KEY = "tdd_weather_coords";

function weekdayShort(dateStr: string): string {
  const d = new Date(`${dateStr}T12:00:00`);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString("de-AT", { weekday: "short" });
}

function WeatherBody() {
  const [coords, setCoords] = useState<Coords | null>(() => {
    if (typeof window === "undefined") return null;
    try { const raw = localStorage.getItem(COORDS_KEY); return raw ? (JSON.parse(raw) as Coords) : null; } catch { return null; }
  });
  const [fc, setFc] = useState<Forecast | null>(null);
  const [status, setStatus] = useState<"idle" | "locating" | "denied" | "error">("idle");
  const [updatedAt, setUpdatedAt] = useState<Date | null>(null);

  const requestLocation = () => {
    if (typeof navigator === "undefined" || !navigator.geolocation) { setStatus("error"); return; }
    setStatus("locating");
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const c: Coords = { lat: Math.round(pos.coords.latitude * 100) / 100, lon: Math.round(pos.coords.longitude * 100) / 100 };
        try { localStorage.setItem(COORDS_KEY, JSON.stringify(c)); } catch { /* ignore */ }
        setStatus("idle");
        setCoords(c);
      },
      (err) => setStatus(err.code === err.PERMISSION_DENIED ? "denied" : "error"),
      { enableHighAccuracy: false, timeout: 10000, maximumAge: 30 * 60 * 1000 },
    );
  };

  const load = useCallback(async (c: Coords) => {
    try {
      const res = await fetch(`/api/widgets/weather?lat=${c.lat}&lon=${c.lon}`, { cache: "no-store" });
      if (!res.ok) { setStatus("error"); return; }
      setFc((await res.json()) as Forecast);
      setUpdatedAt(new Date());
      setStatus("idle");
    } catch { setStatus("error"); }
  }, []);

  // Automatische Aktualisierung: sofort + stündlich, sobald ein Standort freigegeben ist.
  useEffect(() => {
    if (!coords) return;
    load(coords);
    const id = setInterval(() => load(coords), 60 * 60 * 1000);
    const onVis = () => { if (document.visibilityState === "visible") load(coords); };
    document.addEventListener("visibilitychange", onVis);
    return () => { clearInterval(id); document.removeEventListener("visibilitychange", onVis); };
  }, [coords, load]);

  if (!coords) {
    return (
      <div>
        <p className="text-[.85rem] muted mb-2">7-Tage-Vorhersage für Ihren Standort. Der Standortzugriff muss dafür aktiv freigegeben werden.</p>
        <button type="button" className="btn primary sm" onClick={requestLocation} disabled={status === "locating"}>
          {status === "locating" ? "📍 Standort wird ermittelt…" : "📍 Standort freigeben"}
        </button>
        {status === "denied" ? <p className="text-[.8rem] mt-2" style={{ color: "var(--warn)" }}>Standortzugriff wurde abgelehnt – bitte im Browser für diese Seite erlauben.</p> : null}
        {status === "error" ? <p className="text-[.8rem] mt-2 muted">Standort nicht verfügbar.</p> : null}
      </div>
    );
  }
  if (!fc) return <div className="muted">Vorhersage wird geladen…</div>;

  return (
    <div>
      <div className="flex items-center gap-3 mb-3">
        <div style={{ fontSize: "2rem", lineHeight: 1 }}>{weatherIcon(fc.current.code)}</div>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: "1.6rem", fontWeight: 700, lineHeight: 1 }}>{fc.current.tempC != null ? `${fc.current.tempC}°C` : "—"}</div>
          <div className="muted text-[.8rem]">📍 {fc.place}</div>
        </div>
        <button type="button" className="btn ghost sm" title="Standort ändern" onClick={requestLocation}>📍</button>
      </div>
      <div className="wx-days">
        {fc.days.map((d) => (
          <div key={d.date} className="wx-day">
            <div className="wx-dow">{weekdayShort(d.date)}</div>
            <div className="wx-ic">{weatherIcon(d.code)}</div>
            <div className="wx-t"><b>{d.tmax != null ? `${d.tmax}°` : "–"}</b> <span className="muted">{d.tmin != null ? `${d.tmin}°` : ""}</span></div>
            <div className="wx-pop">{d.pop != null ? `💧${d.pop}%` : ""}</div>
          </div>
        ))}
      </div>
      {updatedAt ? <div className="text-[.72rem] muted mt-2">aktualisiert {updatedAt.toLocaleTimeString("de-AT", { hour: "2-digit", minute: "2-digit" })} · stündlich automatisch</div> : null}
    </div>
  );
}

function LocationBody({ loc }: { loc: LocLite | undefined }) {
  if (!loc) return <div className="muted">Standort nicht gefunden.</div>;
  const oh = asOpeningHours(loc.openingHours);
  const open = isOpenNow(oh);
  return (
    <div>
      <div className="mb-2">{open ? <span className="pill good"><span className="dot" />jetzt geöffnet</span> : <span className="pill bad"><span className="dot" />geschlossen</span>}</div>
      <div className="text-[.85rem]"><span className="muted">Heute:</span> <b>{todayText(oh)}</b></div>
      <div className="text-[.8rem] muted mt-1">{loc.type === "LADEN" ? "Laden" : "Ausgabestelle"}</div>
    </div>
  );
}

function ExpiringBody({ data }: { data: DashboardData | null }) {
  if (!data || !data.expiring.length) return <div className="empty">Keine Karten laufen in den nächsten 30 Tagen ab.</div>;
  return (
    <div className="twrap"><table className="data">
      <thead><tr><th>Name</th><th>Karte</th><th>gültig bis</th><th className="text-right">Tage</th></tr></thead>
      <tbody>
        {data.expiring.map((e) => (
          <tr key={e.card_number}>
            <td><b>{e.name}</b></td>
            <td className="mono">{e.card_number}</td>
            <td className="mono">{fmtDate(e.valid_to)}</td>
            <td className="text-right mono"><span className={`pill ${e.days <= 7 ? "bad" : "warn"}`}>{e.days}</span></td>
          </tr>
        ))}
      </tbody>
    </table></div>
  );
}

function RecentBody({ data }: { data: DashboardData | null }) {
  if (!data || !data.recent.length) return <div className="empty">Noch keine Aktivität.</div>;
  return (
    <ul className="list-clean">
      {data.recent.map((a, i) => (
        <li key={i}><span className="dotcol" style={{ background: "var(--good)" }} />{a.name} · <span className="muted">{a.at}</span></li>
      ))}
    </ul>
  );
}
