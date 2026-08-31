import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "TDD-Verwaltung",
  description: "Verwaltungssystem Tischlein deck dich",
  applicationName: "TDD-Verwaltung",
  manifest: "/app.webmanifest",
  icons: { icon: "/icon.svg", apple: "/icon.svg" },
  appleWebApp: { capable: true, title: "TDD-Verwaltung", statusBarStyle: "default" },
};

export const viewport: Viewport = {
  themeColor: "#2f4b99",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="de">
      <body>{children}</body>
    </html>
  );
}
