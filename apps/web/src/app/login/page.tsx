import { LoginForm } from "./LoginForm";
import { Footer } from "@/components/Footer";
import { cookies } from "next/headers";
import { mandant } from "@/lib/mandant";
import { MANDANT_COOKIE } from "@/lib/tenant-aufloesung";

export const dynamic = "force-dynamic"; // Name des Mandanten (Host) auf der Login-Seite

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ reset?: string; confirmed?: string }> }) {
  const sp = await searchParams;
  const m = await mandant();
  const gewaehlt = (await cookies()).get(MANDANT_COOKIE)?.value; // Mandantenwahl ueber /m/<kurzname>
  const notice = sp.confirmed
    ? "E-Mail bestätigt. Ihr Zugang wird nun von einer Administration freigegeben – Sie erhalten eine E-Mail, sobald er aktiv ist."
    : sp.reset
      ? "Passwort geändert – Sie können sich jetzt anmelden."
      : undefined;
  return (
    <main className="min-h-screen flex flex-col items-center justify-center p-6 gap-2">
      <LoginForm notice={notice} traeger={m.kurzname} />
      {gewaehlt ? (
        <div className="text-xs text-muted">Mandant gewählt: <b>{m.name}</b> · <a className="underline" href="/m/zurueck">zum Standard-Mandanten wechseln</a></div>
      ) : null}
      <Footer />
    </main>
  );
}
