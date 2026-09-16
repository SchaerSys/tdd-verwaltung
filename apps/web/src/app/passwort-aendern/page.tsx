import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { Footer } from "@/components/Footer";
import { ErstesPasswortForm } from "./ErstesPasswortForm";

/** Pflichtseite nach dem ersten Login mit Initialpasswort – vorher geht es nirgends weiter. */
export default async function PasswortAendernSeite() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!user.mustChangePassword) redirect("/dashboard");
  return (
    <main className="min-h-screen flex flex-col items-center justify-center p-6 gap-2">
      <ErstesPasswortForm name={user.displayName} />
      <Footer />
    </main>
  );
}
