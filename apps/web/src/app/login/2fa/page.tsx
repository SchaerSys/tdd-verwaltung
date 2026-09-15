import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { PRE_AUTH_COOKIE } from "@/lib/session";
import { Footer } from "@/components/Footer";
import { SecondFactorForm } from "./SecondFactorForm";

export default async function SecondFactorPage() {
  // Ohne Vor-Cookie (Passwort noch nicht geprueft oder abgelaufen) zurueck zum Login.
  const store = await cookies();
  if (!store.get(PRE_AUTH_COOKIE)) redirect("/login");
  return (
    <main className="min-h-screen flex flex-col items-center justify-center p-6 gap-2">
      <SecondFactorForm />
      <Footer />
    </main>
  );
}
