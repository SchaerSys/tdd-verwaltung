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

  // Konto-Menü schließt bei Klick außerhalb.
  useEffect(() => {
    if (!userMenu) return;
    const close = () => setUserMenu(false);
    window.addEventListener("click", close);
    return () => window.removeEventListener("click", close);
  }, [userMenu]);

  const submitSearch = (e: React.FormEvent) => {
    e.preventDefault();
    const q = query.trim();
    router.push(q ? `/personen?q=${encodeURIComponent(q)}` : "/personen");
  };

  // Beim Laden: sofortige Anzeige aus localStorage (kein Flackern), DB ist die Quelle.
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

  return (
    <div className="grid min-h-screen" style={{ gridTemplateColumns: collapsed ? "1fr" : "248px 1fr" }}>
      {!collapsed ? (
        <AppSidebar groups={groups} user={user} roleLabel={roleLabel} locationName={locationName} logout={logout} favorites={favorites} />
      ) : null}
      <div className="min-w-0">
        <div className="flex items-center gap-4 px-6 pt-5">
          <button
            type="button"
            className="btn ghost"
            onClick={toggle}
            aria-label="Navigation ein- oder ausblenden"
            title="Navigation ein-/ausblenden"
          >
            ☰
          </button>
          {collapsed ? (
            <Link href="/dashboard" className="logo" title="TDD-Verwaltung" style={{ width: 30, height: 30, textDecoration: "none" }}>Td</Link>
          ) : null}
          {!onDashboard ? (
            <Link href="/dashboard" className="btn ghost" title="Zurück zum Dashboard">← Dashboard</Link>
          ) : null}
          <form className="search flex-1 max-w-[420px]" style={{ paddingTop: 6, paddingBottom: 6 }} onSubmit={submitSearch} role="search">
            <span aria-hidden>🔍</span>
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Person, Adresse oder Kartennummer suchen…"
              aria-label="Person, Adresse oder Kartennummer suchen"
              className="flex-1 border-0 bg-transparent text-[color:var(--text)] outline-none"
              style={{ font: "inherit" }}
            />
          </form>
          <div className="flex-1" />
          <InstallButton />
          <ThemeToggle />
          <span className="rolepill">{roleLabel}</span>
          <div className="relative" onClick={(e) => e.stopPropagation()}>
            <button
              type="button"
              className="avatar"
              style={{ cursor: "pointer" }}
              onClick={() => setUserMenu((v) => !v)}
              aria-haspopup="menu"
              aria-expanded={userMenu}
              aria-label="Konto-Menü"
              title={user.displayName}
            >
              {initials}
            </button>
            {userMenu ? (
              <div className="ctx-menu" style={{ position: "absolute", right: 0, top: "calc(100% + 6px)", zIndex: 60, minWidth: 190 }} role="menu">
                <div style={{ padding: "6px 12px" }}>
                  <div className="font-semibold text-[color:var(--text)]">{user.displayName}</div>
                  <div className="text-[color:var(--muted)] text-[.72rem]">{roleLabel} · {locationName}</div>
                </div>
                <div style={{ borderTop: "1px solid var(--border)", margin: "4px 0" }} />
                <form action={logout}>
                  <button type="submit" className="ctx-item" role="menuitem">Abmelden</button>
                </form>
              </div>
            ) : null}
          </div>
        </div>
        <main className="p-6"><UpdateChecker />{children}<Footer /></main>
      </div>
    </div>
  );
}
