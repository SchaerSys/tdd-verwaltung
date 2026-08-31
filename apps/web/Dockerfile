# ── Build-Stage ───────────────────────────────────────────────────────────
FROM node:22-slim AS builder
WORKDIR /app

# Monorepo-Manifeste zuerst (bessere Layer-Caches)
COPY package.json package-lock.json ./
COPY packages/core/package.json packages/core/
COPY packages/db/package.json packages/db/
COPY apps/web/package.json apps/web/
RUN npm ci

# Quellcode
COPY . .
RUN npm run build -w @tdd/web

# ── Runtime-Stage (Next.js standalone) ────────────────────────────────────
FROM node:22-slim AS runner
WORKDIR /app
ENV NODE_ENV=production
COPY --from=builder /app/apps/web/.next/standalone ./
COPY --from=builder /app/apps/web/.next/static ./apps/web/.next/static
COPY --from=builder /app/apps/web/public ./apps/web/public
# tesseract.js: WASM-Core + Worker-Skripte werden vom Standalone-Tracing nicht
# vollständig mitkopiert – daher explizit nachziehen (OCR läuft on-prem).
COPY --from=builder /app/node_modules/tesseract.js ./node_modules/tesseract.js
COPY --from=builder /app/node_modules/tesseract.js-core ./node_modules/tesseract.js-core
EXPOSE 3000
CMD ["node", "apps/web/server.js"]
