import { redirect } from "next/navigation";
import Link from "next/link";
import { getCurrentUser, logout } from "@/lib/auth";
import { hasPermission } from "@/lib/rbac";
import { Footer } from "@/components/Footer";

async function logoutAction() {
  "use server";
  await logout();
  redirect("/login");
}

export default async function PortalLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!hasPermission(user.role, "antrag:manage")) redirect("/dashboard");

  const typeLabel = user.organizationType === "GEMEINDE" ? "Gemeinde"
    : user.organizationType === "INSTITUTION" ? "Institution" : "TDD";

  return (
    <div className="min-h-screen">
      <div className="flex items-center gap-4 px-6 py-4 border-b border-[color:var(--border)] bg-[color:var(--surface)]">
        <Link href="/portal" className="flex items-center gap-3 no-underline">
          <div className="w-8 h-8 rounded-lg bg-accent text-white grid place-items-center font-bold text-sm">A</div>
          <div>
            <div className="font-bold text-sm text-[color:var(--text)]">Antrags-Portal</div>
            <div className="text-xs text-muted">{user.organizationName ?? "—"}</div>
          </div>
        </Link>
        <nav className="flex gap-3 ml-4 text-[.8125rem]">
          <Link href="/portal" className="text-[color:var(--muted)] hover:text-[color:var(--text)]">Anträge</Link>
          <Link href="/portal/pruefung" className="text-[color:var(--muted)] hover:text-[color:var(--text)]">Erneute Überprüfung</Link>
        </nav>
        <div className="flex-1" />
        <span className="rolepill">{typeLabel}</span>
        <span className="text-sm">{user.displayName}</span>
        <form action={logoutAction}><button className="btn ghost sm" type="submit">Abmelden</button></form>
      </div>
      <main className="p-6 max-w-4xl mx-auto">{children}<Footer /></main>
    </div>
  );
}
