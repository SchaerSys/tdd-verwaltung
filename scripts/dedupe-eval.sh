#!/usr/bin/env bash
# Fuehrt scripts/dedupe-eval.ts im Node-Container gegen eine markierte Paar-Datei aus.
# Aufruf auf dem Server: scripts/dedupe-eval.sh [/opt/tdd/dedupe-pairs.csv] [quellverzeichnis]
set -euo pipefail
CSV="${1:-/opt/tdd/dedupe-pairs.csv}"
SRC="${2:-/opt/tdd}"
[ -f "$CSV" ] || { echo "Datei fehlt: $CSV (erst scripts/dedupe-pairs.sh)"; exit 1; }
docker run --rm \
  -v "$SRC/packages":/work/packages:ro -v "$SRC/scripts":/work/scripts:ro \
  -v "$SRC/package.json":/work/package.json:ro -v "$SRC/package-lock.json":/work/package-lock.json:ro \
  -v "$SRC/tsconfig.base.json":/work/tsconfig.base.json:ro \
  -v "$CSV":/data/pairs.csv:ro -v tdd-verify-npm:/root/.npm \
  -w /work node:22-slim bash -c '
    set -e
    npm ci --no-audit --no-fund --loglevel=error --ignore-scripts >/dev/null 2>&1 || true
    npx --yes tsx scripts/dedupe-eval.ts /data/pairs.csv
  '
