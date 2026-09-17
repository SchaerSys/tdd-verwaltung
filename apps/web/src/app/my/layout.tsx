import type { Metadata, Viewport } from "next";
import { redirect } from "next/navigation";
import { logout } from "@/lib/auth";
import { meinKontext } from "@/lib/my";
import { mandant } from "@/lib/mandant";
import { Lebenszeichen } from "@/components/Lebenszeichen";
import { MyLeiste, MyStart } from "./MyShell";

export const metadata: Metadata = { title: "myTafelwerk", manifest: "/my.webmanifest", appleWebApp: { capable: true, title: "myTafelwerk", statusBarStyle: "default" } };
export const viewport: Viewport = { width: "device-width", initialScale: 1, maximumScale: 1, viewportFit: "cover", themeColor: "#0e7c86" };

async function logoutAction() {
  "use server";
  await logout();
  redirect("/login");
}

/** myTafelwerk: Handy-App der Mitarbeitenden (PWA) – eigener Vollbild-Bereich ohne Backoffice. */
export default async function MyLayout({ children }: { children: React.ReactNode }) {
  const k = await meinKontext();
  if (!k) redirect("/login");
  if (k.user.mustChangePassword) redirect("/passwort-aendern");
  const m = await mandant();
  return (
    <div className="my-app">
      <header className="my-kopf">
        <div><b>myTafelwerk</b><small>{m.kurzname} · {k.user.displayName}</small></div>
        <form action={logoutAction}><button className="btn ghost sm" type="submit">Abmelden</button></form>
      </header>
      <main className="my-inhalt">
        {!k.person ? <div className="panel"><div className="p-4 text-[.9rem]">Dein Login ist noch keinem Personal-Datensatz zugeordnet. Bitte im Büro melden – danach siehst du hier Zeiten, Dienste, Anträge und Aufgaben.</div></div> : children}
      </main>
      <MyLeiste />
      <MyStart />
      <Lebenszeichen bereich="my" />
    </div>
  );
}
