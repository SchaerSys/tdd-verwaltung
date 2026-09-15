import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentOps, logout } from "@/lib/auth";
import { wartungsmodus } from "@/lib/host";

const NAV = [
  { href: "/", label: "Status" },
  { href: "/kennzahlen", label: "Kennzahlen" },
  { href: "/benutzer", label: "Benutzer" },
  { href: "/konfiguration", label: "Konfiguration" },
  { href: "/protokoll", label: "Protokoll" },
  { href: "/wartung", label: "Wartung" },
];

async function logoutAction() {
  "use server";
  await logout();
  redirect("/login");
}

export default async function OpsLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentOps();
  if (!user) redirect("/login");
  const wartung = await wartungsmodus();

  return (
    <div className="min-h-screen">
      <div className="flex items-center gap-4 px-6 py-3 border-b border-[color:var(--border)] bg-[color:var(--surface)] flex-wrap">
        <Link href="/" className="flex items-center gap-3 no-underline">
          <div className="w-8 h-8 rounded-lg bg-[color:var(--text)] text-white grid place-items-center font-bold text-sm">W</div>
          <div>
            <div className="font-bold text-sm text-[color:var(--text)]">TDD-Wartung</div>
            <div className="text-xs text-muted">Betreiber · nur Metadaten</div>
          </div>
        </Link>
        <nav className="flex gap-3 ml-4 text-[.8125rem] flex-wrap">
          {NAV.map((n) => <Link key={n.href} href={n.href} className="text-[color:var(--muted)] hover:text-[color:var(--text)]">{n.label}</Link>)}
        </nav>
        <div className="flex-1" />
        {wartung ? <Link href="/wartung" className="pill bad"><span className="dot" />Wartungsmodus aktiv</Link> : null}
        {!user.totpEnabled ? <Link href="/konto" className="pill warn">2FA einrichten</Link> : null}
        <Link href="/konto" className="text-sm">{user.displayName}</Link>
        <form action={logoutAction}><button className="btn ghost sm" type="submit">Abmelden</button></form>
      </div>
      <main className="p-6 max-w-6xl mx-auto">
        {children}
        <footer className="flex gap-4 justify-center py-4 text-[.72rem] text-muted border-t border-[color:var(--border)] mt-8">
          <span>TDD-Wartung · Schär Systems</span><span>·</span><span>v{process.env.NEXT_PUBLIC_APP_VERSION ?? "dev"}</span>
        </footer>
      </main>
    </div>
  );
}
