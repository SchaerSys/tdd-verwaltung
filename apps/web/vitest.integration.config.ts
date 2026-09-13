import { defineConfig } from "vitest/config";
import path from "node:path";
import { fileURLToPath } from "node:url";

const dir = path.dirname(fileURLToPath(import.meta.url));

// Integrationstests gegen eine echte, leere Postgres 16.
// Verbindung ueber TEST_PG_HOST (Standard 127.0.0.1:5432) und TEST_PG_DB (tdd_test).
export default defineConfig({
  test: {
    include: ["test/integration/**/*.test.ts"],
    environment: "node",
    hookTimeout: 120_000, // Migrationen brauchen beim ersten Lauf etwas
    fileParallelism: false, // eine gemeinsame Test-DB
  },
  resolve: { alias: { "@": path.resolve(dir, "src") } },
});
