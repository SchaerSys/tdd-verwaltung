"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { addFavorite, removeFavorite } from "@/app/(app)/dashboard/prefs-actions";
import { isFavoritable } from "@/lib/nav";

export interface NavItem {
  href: string;
  label: string;
  badge?: string;
  children?: { href: string; label: string }[];
}
export interface NavGroup {
  title: string;
  items: NavItem[];
}

const ICONS: Record<string, string> = {
  "/dashboard": "🏠", "/personen": "👤", "/personen/papierkorb": "🗑", "/personen/dubletten": "⧉",
  "/bewilligt": "✅", "/karten": "💳", "/karten/papierkorb": "🗑", "/auswertungen": "📊",
  "/kiosk": "📷", "/ausgaben": "📦", "/admin": "🛠", "/admin/benutzer": "👥", "/admin/import": "⬆️",
  "/admin/migration": "🔄", "/personal": "🧑‍💼", "/zeit": "⏱️", "/urlaub": "🌴",
  "/touren": "🚚", "/touren/vorlagen": "📅", "/touren/abholstellen": "🏪", "/touren/fahrzeuge": "🚐", "/touren/angebote": "📥", "/touren/standorte": "🗺️",
};

export function AppSidebar({
  groups,
  locationName,
  favorites,
}: {
  groups: NavGroup[];
  locationName: string;
  favorites: string[];
}) {
  const pathname = usePathname();
  const router = useRouter();
  const [menu, setMenu] = useState<{ x: number; y: number; href: string } | null>(null);
  const [offen, setOffen] = useState<Record<string, boolean>>({});

  const activeHref = groups
    .flatMap((g) => g.items.flatMap((i) => [i.href, ...(i.children?.map((c) => c.href) ?? [])]))
    .filter((h) => pathname === h || (h !== "/dashboard" && pathname.startsWith(h + "/")))
    .sort((a, b) => b.length - a.length)[0];
  const isActive = (href: string) => href === activeHref;
  const isFav = (href: string) => favorites.includes(href);

  useEffect(() => {
    if (!menu) return;
    const close = () => setMenu(null);
    window.addEventListener("click", close);
    window.addEventListener("scroll", close, true);
    window.addEventListener("resize", close);
    return () => {
      window.removeEventListener("click", close);
      window.removeEventListener("scroll", close, true);
      window.removeEventListener("resize", close);
    };
  }, [menu]);

  const onCtx = (e: React.MouseEvent, href: string) => {
    if (!isFavoritable(href)) return;
    e.preventDefault();
    setMenu({ x: e.clientX, y: e.clientY, href });
  };

  async function toggleFav() {
    if (!menu) return;
    const href = menu.href;
    setMenu(null);
    if (isFav(href)) await removeFavorite(href);
    else await addFavorite(href);
    router.refresh();
  }

  return (
    <aside className="side-rail">
      {groups.map((g) => (
        <div key={g.title}>
          <div className="nav-group">{g.title}</div>
          {g.items.map((it) => {
            const newWindow = it.href !== "/dashboard";
            // Untermenue: offen, wenn ein Kind oder der Eintrag selbst aktiv ist, oder per Pfeil aufgeklappt.
            const kinderAktiv = !!it.children?.some((c) => isActive(c.href)) || isActive(it.href);
            const aufgeklappt = it.children ? (offen[it.href] ?? kinderAktiv) : false;
            return (
              <div key={it.href}>
                <div className="flex items-center">
                  <Link
                    href={it.href}
                    target={newWindow ? "_blank" : undefined}
                    rel={newWindow ? "noopener" : undefined}
                    className={`nav flex-1${isActive(it.href) ? " active" : ""}`}
                    onContextMenu={(e) => onCtx(e, it.href)}
                    title={newWindow ? "Öffnet in eigenem Fenster · Rechtsklick: als Favorit" : undefined}
                  >
                    <span className="ic" aria-hidden>{ICONS[it.href] ?? "•"}</span>
                    {isFav(it.href) ? <span aria-hidden className="fav-mark">★</span> : null}
                    <span className="nav-label">{it.label}</span>
                    {it.badge ? <span className="badge">{it.badge}</span> : null}
                    {newWindow ? <span aria-hidden className="nav-ext">↗</span> : null}
                  </Link>
                  {it.children ? (
                    <button type="button" className="btn ghost sm" aria-expanded={aufgeklappt} aria-label="Untermenü" style={{ padding: "2px 6px" }}
                      onClick={() => setOffen((o) => ({ ...o, [it.href]: !aufgeklappt }))}>{aufgeklappt ? "▾" : "▸"}</button>
                  ) : null}
                </div>
                {it.children && aufgeklappt ? it.children.map((c) => (
                  <Link key={c.href} href={c.href} target="_blank" rel="noopener" className={`nav nav-sub${isActive(c.href) ? " active" : ""}`} onContextMenu={(e) => onCtx(e, c.href)}>
                    <span className="ic" aria-hidden>{ICONS[c.href] ?? "•"}</span>
                    {isFav(c.href) ? <span aria-hidden className="fav-mark">★</span> : null}
                    <span className="nav-label">{c.label}</span>
                  </Link>
                )) : null}
              </div>
            );
          })}
        </div>
      ))}

      <div className="flex-1" />
      <div className="lock-note">🔒 Standort:&nbsp;<b className="text-[color:var(--text)]">{locationName}</b></div>

      {menu ? (
        <div className="ctx-menu" style={{ position: "fixed", left: menu.x, top: menu.y, zIndex: 60 }} onClick={(e) => e.stopPropagation()}>
          <button type="button" className="ctx-item" onClick={toggleFav}>
            {isFav(menu.href) ? "★ Favorit entfernen" : "☆ Als Favorit hinzufügen"}
          </button>
        </div>
      ) : null}
    </aside>
  );
}
