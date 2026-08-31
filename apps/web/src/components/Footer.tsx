import Link from "next/link";

export function Footer({ dark = false }: { dark?: boolean }) {
  const cls = dark ? "text-white/70 hover:text-white" : "text-[color:var(--muted)] hover:text-[color:var(--text)]";
  return (
    <footer className={`flex flex-wrap gap-4 justify-center items-center py-4 text-[.72rem] ${dark ? "" : "border-t border-[color:var(--border)] mt-8"}`}>
      <Link href="/datenschutz" className={cls}>Datenschutz</Link>
      <span className={dark ? "text-white/30" : "text-[color:var(--border)]"}>·</span>
      <Link href="/anleitung" className={cls}>Benutzeranleitung</Link>
      <span className={dark ? "text-white/30" : "text-[color:var(--border)]"}>·</span>
      <span className={dark ? "text-white/50" : "text-[color:var(--muted)]"}>TDD-Verwaltung · Schär Systems</span>
      <span className={dark ? "text-white/30" : "text-[color:var(--border)]"}>·</span>
      <span className={dark ? "text-white/40" : "text-[color:var(--muted-2)]"} title="Aktuelle Version (Build-Zeitpunkt)">v{process.env.NEXT_PUBLIC_APP_VERSION ?? "dev"}</span>
    </footer>
  );
}
