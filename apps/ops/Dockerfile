# ── Build-Stage ───────────────────────────────────────────────────────────
FROM node:22-slim AS builder
WORKDIR /app

COPY package.json package-lock.json ./
COPY packages/core/package.json packages/core/
COPY packages/db/package.json packages/db/
COPY apps/web/package.json apps/web/
COPY apps/ops/package.json apps/ops/
RUN npm ci

COPY . .

# Qualitaetsnetz fuer die Wartungsplattform (Lint des Monorepos laeuft im web-Image).
RUN npm run typecheck -w @tdd/ops && npm run test -w @tdd/ops && npm run test -w @tdd/core

RUN npm run build -w @tdd/ops

# ── Runtime-Stage (Next.js standalone) ────────────────────────────────────
FROM node:22-slim AS runner
WORKDIR /app
ENV NODE_ENV=production
COPY --from=builder /app/apps/ops/.next/standalone ./
COPY --from=builder /app/apps/ops/.next/static ./apps/ops/.next/static
COPY --from=builder /app/apps/ops/public ./apps/ops/public
COPY --from=builder /app/apps/ops/scripts ./apps/ops/scripts
EXPOSE 3000
CMD ["node", "apps/ops/server.js"]
