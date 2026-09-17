"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect } from "react";

const TABS = [
  { href: "/my", label: "Heute", icon: "🏠" }, { href: "/my/stempeln", label: "Stempeln", icon: "⏱" }, { href: "/my/zeiten", label: "Zeiten", icon: "📅" },
  { href: "/my/antraege", label: "Anträge", icon: "🌴" }, { href: "/my/dienste", label: "Dienste", icon: "🗓" }, { href: "/my/aufgaben", label: "Aufgaben", icon: "✅" },
];

export function MyLeiste() {
  const p = usePathname();
  return (
    <nav className="my-leiste">
      {TABS.map((t) => { const aktiv = t.href === "/my" ? p === "/my" : p.startsWith(t.href); return <Link key={t.href} href={t.href} className={aktiv ? "on" : ""}><span className="ic">{t.icon}</span><span>{t.label}</span></Link>; })}
    </nav>
  );
}

/** Service-Worker der App registrieren (Push, App-Shell). */
export function MyStart() {
  useEffect(() => { if ("serviceWorker" in navigator) navigator.serviceWorker.register("/my-sw.js", { scope: "/my" }).catch(() => {}); }, []);
  return null;
}
