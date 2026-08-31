import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { hasPermission } from "@/lib/rbac";

export const metadata: Metadata = {
  title: "Tresen-Kiosk · TDD",
  manifest: "/manifest.webmanifest",
};

export default async function KioskLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!hasPermission(user.role, "distribution:record")) redirect("/dashboard");
  return <>{children}</>;
}
