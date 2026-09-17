import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "CareOS",
  description: "CareOS – Verwaltungssystem für soziale Einrichtungen",
  applicationName: "CareOS",
  manifest: "/app.webmanifest",
  icons: { icon: "/icon.svg", apple: "/icon.svg" },
  appleWebApp: { capable: true, title: "CareOS", statusBarStyle: "default" },
};

export const viewport: Viewport = {
  themeColor: "#0e7c86",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="de">
      <body>{children}</body>
    </html>
  );
}
