import type { Metadata, Viewport } from "next";
import { redirect } from "next/navigation";
import { getCurrentUser, logout } from "@/lib/auth";
import { hasPermission } from "@/lib/rbac";
import { Lebenszeichen } from "@/components/Lebenszeichen";

export const metadata: Metadata = { title: "Meine Tour · Tafelwerk" };
export const viewport: Viewport = { width: "device-width", initialScale: 1, maximumScale: 1 };

async function logoutAction() {
  "use server";
  await logout();
  redirect("/login");
}

/** Fahrer-Handy: eigener Vollbild-Bereich, grosse Bedienelemente, kein Backoffice. */
export default async function FahrtLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (user.mustChangePassword) redirect("/passwort-aendern"); // Initialpasswort zuerst ersetzen
  if (!hasPermission(user.role, "tour:drive")) redirect("/dashboard");
  return (
    <div className="min-h-screen" style={{ background: "var(--bg)" }}>
      <Lebenszeichen bereich="fahrt" />
      <div className="flex items-center gap-3 px-4 py-3 border-b border-[color:var(--border)] bg-[color:var(--surface)]">
        <div className="w-8 h-8 rounded-lg bg-accent text-white grid place-items-center font-bold text-sm">🚚</div>
        <div className="font-bold text-sm">Meine Tour</div>
        <div className="flex-1" />
        <span className="text-xs text-muted">{user.displayName}</span>
        <form action={logoutAction}><button className="btn ghost sm" type="submit">Abmelden</button></form>
      </div>
      <main className="p-3 max-w-2xl mx-auto">{children}</main>
    </div>
  );
}
