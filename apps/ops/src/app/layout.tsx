import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "TDD-Wartung",
  description: "Wartungsplattform der TDD-Verwaltung (Betreiber)",
  icons: { icon: "/icon.svg" },
  robots: { index: false, follow: false },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="de">
      <body>{children}</body>
    </html>
  );
}
