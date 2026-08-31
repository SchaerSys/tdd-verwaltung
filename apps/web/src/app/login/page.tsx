import { LoginForm } from "./LoginForm";
import { Footer } from "@/components/Footer";

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ reset?: string; confirmed?: string }> }) {
  const sp = await searchParams;
  const notice = sp.confirmed
    ? "E-Mail bestätigt. Ihr Zugang wird nun von einer Administration freigegeben – Sie erhalten eine E-Mail, sobald er aktiv ist."
    : sp.reset
      ? "Passwort geändert – Sie können sich jetzt anmelden."
      : undefined;
  return (
    <main className="min-h-screen flex flex-col items-center justify-center p-6 gap-2">
      <LoginForm notice={notice} />
      <Footer />
    </main>
  );
}
