import path from "node:path";
import { fileURLToPath } from "node:url";

const dir = path.dirname(fileURLToPath(import.meta.url));

// Build-Version = Zeitpunkt des Builds (UTC). Wird zur Compile-Zeit fest
// eingebacken → ändert sich bei jedem Deploy → Grundlage der Update-Erkennung.
const APP_VERSION = new Date().toISOString().slice(0, 16).replace("T", " ") + " UTC";

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  output: "standalone",
  env: { NEXT_PUBLIC_APP_VERSION: APP_VERSION },
  // Monorepo: Tracing-Wurzel = Repo-Root, damit Workspace-Pakete im Standalone landen
  outputFileTracingRoot: path.join(dir, "../../"),
  // Workspace-Pakete werden von Next transpiliert (kein Vorab-Build nötig)
  transpilePackages: ["@tdd/core", "@tdd/db"],
  serverExternalPackages: ["@node-rs/argon2", "postgres", "bwip-js", "tesseract.js", "exceljs", "mammoth", "nodemailer"],
  // Server-Actions hinter dem Reverse-Proxy (tdd.schaer-systems.at) erlauben.
  experimental: {
    serverActions: {
      allowedOrigins: ["tdd.schaer-systems.at", "127.0.0.1:3080", "localhost:3080"],
    },
  },
};

export default nextConfig;
