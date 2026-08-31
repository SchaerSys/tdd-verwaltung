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
}
export interface NavGroup {
  title: string;
  items: NavItem[];
}

export function AppSidebar({
  groups,
  user,
  locationName,
  logout,
  favorites,
}: {
  groups: NavGroup[];
  user: { displayName: string; role: string };
  locationName: string;
  logout: () => Promise<void>;
  favorites: string[];
}) {
  const pathname = usePathname();
  const router = useRouter();
  const [menu, setMenu] = useState<{ x: number; y: number; href: string } | null>(null);

  const isActive = (href: string) =>
    pathname === href || (href !== "/dashboard" && pathname.startsWith(href));
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
    <aside className="bg-[color:var(--surface)] border-r border-[color:var(--border)] p-3 flex flex-col gap-1 min-h-screen">
      <div className="brand">
        <div className="logo">Td</div>
        <div>
          <div className="font-bold text-[.95rem]">TDD-Verwaltung</div>
          <div className="text-[.72rem] text-[color:var(--muted)]">Tischlein deck dich</div>
        </div>
      </div>

      {groups.map((g) => (
        <div key={g.title}>
          <div className="nav-group">{g.title}</div>
          {g.items.map((it) => (
            <Link
              key={it.href}
              href={it.href}
              className={`nav${isActive(it.href) ? " active" : ""}`}
              onContextMenu={(e) => onCtx(e, it.href)}
              title={isFavoritable(it.href) ? "Rechtsklick: als Favorit" : undefined}
            >
              {isFav(it.href) ? <span aria-hidden className="mr-1">★</span> : null}
              {it.label}
              {it.badge ? <span className="badge">{it.badge}</span> : null}
            </Link>
          ))}
        </div>
      ))}

      <div className="flex-1" />
      <div className="lock-note">
        🔒 Standort:&nbsp;<b className="text-[color:var(--text)]">{locationName}</b>
      </div>
      <div className="text-[.72rem] text-[color:var(--muted)] px-2 py-2 border-t border-[color:var(--border)] mt-1">
        <div className="font-semibold text-[color:var(--text)]">{user.displayName}</div>
        <div>{user.role}</div>
        <form action={logout} className="mt-2">
          <button className="text-[color:var(--accent)] hover:underline" type="submit">
            Abmelden
          </button>
        </form>
      </div>

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
