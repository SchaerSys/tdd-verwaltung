"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
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
  const pathname = usePathname();
  const onDashboard = pathname === "/dashboard";

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
        <AppSidebar groups={groups} user={user} locationName={locationName} logout={logout} favorites={favorites} />
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
          {!onDashboard ? (
            <Link href="/dashboard" className="btn ghost" title="Zurück zum Dashboard">← Dashboard</Link>
          ) : null}
          <div className="search flex-1 max-w-[420px]">🔍 Person, Kartennummer oder Adresse suchen…</div>
          <div className="flex-1" />
          <InstallButton />
          <ThemeToggle />
          <span className="rolepill">{roleLabel}</span>
          <div className="avatar">{initials}</div>
        </div>
        <main className="p-6"><UpdateChecker />{children}<Footer /></main>
      </div>
    </div>
  );
}
