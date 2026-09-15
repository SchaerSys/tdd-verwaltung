import { redirect } from "next/navigation";
import { getCurrentOps } from "@/lib/auth";
import { einrichtungOffen } from "../einrichten/actions";
import { LoginForm } from "./LoginForm";

export default async function LoginPage() {
  if (await getCurrentOps()) redirect("/");
  if (await einrichtungOffen()) redirect("/einrichten"); // noch kein Konto: zuerst einrichten
  return (
    <main className="min-h-screen flex flex-col items-center justify-center p-6 gap-2">
      <LoginForm />
      <div className="text-[.72rem] text-muted">TDD-Wartung · Schär Systems · v{process.env.NEXT_PUBLIC_APP_VERSION ?? "dev"}</div>
    </main>
  );
}
