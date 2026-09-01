"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { AppSidebar, type NavGroup } from "./AppSidebar";
import { ThemeToggle } from "./ThemeToggle";
import { Footer } from "./Footer";
import { InstallButton } from "./InstallButton";
import { UpdateChecker } from "./UpdateChecker";
import { setNavCollapsed } from "@/app/(app)/dashboard/prefs-actions";

export function AppShell({
  groups,
  user,
  roleLabel,
  locationName,
  initials,
  favorites,
  collapsedInit,
  logout,
  children,
}: {
  groups: NavGroup[];
  user: { displayName: string; role: string };
  roleLabel: string;
  locationName: string;
  initials: string;
  favorites: string[];
  collapsedInit: boolean;
  logout: () => Promise<void>;
  children: React.ReactNode;
}) {
  const [collapsed, setCollapsed] = useState(collapsedInit);
  const [query, setQuery] = useState("");
  const [userMenu, setUserMenu] = useState(false);
  const pathname = usePathname();
  const router = useRouter();
  const onDashboard = pathname === "/dashboard";

  useEffect(() => {
    if (!userMenu) return;
    const close = () => setUserMenu(false);
    window.addEventListener("click", close);
    return () => window.removeEventListener("click", close);
  }, [userMenu]);

  useEffect(() => {
    const ls = localStorage.getItem("tdd_nav_collapsed");
    if (ls !== null) setCollapsed(ls === "1");
    if ("serviceWorker" in navigator) navigator.serviceWorker.register("/sw.js").catch(() => {});
  }, []);

  const toggle = () => {
    setCollapsed((c) => {
      const v = !c;
      try { localStorage.setItem("tdd_nav_collapsed", v ? "1" : "0"); } catch {}
      void setNavCollapsed(v);
      return v;
    });
  };

  const submitSearch = (e: React.FormEvent) => {
    e.preventDefault();
    const q = query.trim();
    router.push(q ? `/personen?q=${encodeURIComponent(q)}` : "/personen");
  };

  return (
    <div className="approot">
      {/* Marken-Header (rotes Kopfband über die ganze App) */}
      <header className="topbar">
        <button type="button" className="btn ghost icon" onClick={toggle} aria-label="Navigation ein-/ausblenden" title="Navigation ein-/ausblenden">☰</button>
        <Link href="/dashboard" className="hdr-brand" title="TDD-Verwaltung">
          <span className="hdr-logo">Td</span>
          <span className="hdr-name"><b>TDD-Verwaltung</b><small>Tischlein deck dich</small></span>
        </Link>
        {!onDashboard ? <Link href="/dashboard" className="btn ghost" title="Zurück zum Dashboard">← Dashboard</Link> : null}

        <form className="search" role="search" onSubmit={submitSearch}>
          <span aria-hidden>🔍</span>
          <input
            type="search" value={query} onChange={(e) => setQuery(e.target.value)}
            placeholder="Person, Adresse oder Kartennummer suchen…"
            aria-label="Person, Adresse oder Kartennummer suchen"
            className="flex-1 border-0 bg-transparent outline-none" style={{ font: "inherit" }}
          />
        </form>

        <div className="hdr-actions">
          <InstallButton />
          <ThemeToggle />
          <span className="rolepill">{roleLabel}</span>
          <div className="relative" onClick={(e) => e.stopPropagation()}>
            <button type="button" className="avatar" style={{ cursor: "pointer" }} onClick={() => setUserMenu((v) => !v)}
              aria-haspopup="menu" aria-expanded={userMenu} aria-label="Konto-Menü" title={user.displayName}>
              {initials}
            </button>
            {userMenu ? (
              <div className="ctx-menu" style={{ position: "absolute", right: 0, top: "calc(100% + 8px)", zIndex: 60, minWidth: 200 }} role="menu">
                <div style={{ padding: "6px 12px" }}>
                  <div className="font-semibold text-[color:var(--text)]">{user.displayName}</div>
                  <div className="text-[color:var(--muted)] text-[.72rem]">{roleLabel} · {locationName}</div>
                </div>
                <div style={{ borderTop: "1px solid var(--border)", margin: "4px 0" }} />
                <Link href="/konto" className="ctx-item" role="menuitem">Mein Konto</Link>
                <form action={logout}><button type="submit" className="ctx-item" role="menuitem">Abmelden</button></form>
              </div>
            ) : null}
          </div>
        </div>
      </header>

      <div className="appbody" style={{ gridTemplateColumns: collapsed ? "1fr" : "248px 1fr" }}>
        {!collapsed ? <AppSidebar groups={groups} locationName={locationName} favorites={favorites} /> : null}
        <div className="appmain-col min-w-0">
          <main className="p-6"><UpdateChecker />{children}<Footer /></main>
        </div>
      </div>
    </div>
  );
}
