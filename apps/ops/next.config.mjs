import path from "node:path";
import { fileURLToPath } from "node:url";

const dir = path.dirname(fileURLToPath(import.meta.url));
const APP_VERSION = new Date().toISOString().slice(0, 16).replace("T", " ") + " UTC";

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  output: "standalone",
  env: { NEXT_PUBLIC_APP_VERSION: APP_VERSION },
  outputFileTracingRoot: path.join(dir, "../../"),
  transpilePackages: ["@tdd/core", "@tdd/db"],
  serverExternalPackages: ["@node-rs/argon2", "postgres", "nodemailer"],
  experimental: {
    serverActions: {
      allowedOrigins: ["tdd-ops.schaer-systems.at", "127.0.0.1:3081", "localhost:3081"],
    },
  },
};

export default nextConfig;
