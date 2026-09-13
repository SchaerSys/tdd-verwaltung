import { defineConfig } from "vitest/config";
import path from "node:path";
import { fileURLToPath } from "node:url";

const dir = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  test: {
    include: ["test/**/*.test.ts"],
    // Integrationstests brauchen eine echte Postgres und laufen ueber
    // vitest.integration.config.ts – hier bewusst ausgenommen.
    exclude: ["test/integration/**", "**/node_modules/**"],
    environment: "node",
  },
  resolve: {
    alias: { "@": path.resolve(dir, "src") },
  },
});
