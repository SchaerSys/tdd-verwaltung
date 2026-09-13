#!/usr/bin/env bash
# TDD-Verwaltung: Integrationstests gegen eine echte, leere Postgres 16.
#
# Laeuft auf dem Server (dort ist Docker) und ersetzt die CI eines Fremdanbieters:
# eine Wegwerf-Postgres und ein Node-Container mit dem Quellcode, beide in einem
# eigenen Docker-Netz, nach dem Lauf restlos entfernt. Beruehrt die Produktion nicht.
#
# Aufruf:  scripts/verify-integration.sh [quellverzeichnis]   (Standard: /opt/tdd/stage)
# Rueckgabe 0 = alle Integrationstests gruen.
set -euo pipefail

SRC="${1:-/opt/tdd/stage}"
NET=tdd-verify-net
DB=tdd-verify-db
RUNNER=tdd-verify-runner

[ -f "$SRC/package.json" ] || { echo "Kein Quellcode unter $SRC"; exit 1; }

cleanup() {
  docker rm -f "$RUNNER" "$DB" >/dev/null 2>&1 || true
  docker network rm "$NET" >/dev/null 2>&1 || true
}
trap cleanup EXIT
cleanup

docker network create "$NET" >/dev/null
docker run -d --name "$DB" --network "$NET" \
  -e POSTGRES_USER=tdd_owner -e POSTGRES_PASSWORD=test -e POSTGRES_DB=tdd_test \
  postgres:16-alpine >/dev/null

# Nicht auf pg_isready warten – das antwortet schon waehrend der Initialisierung.
for i in $(seq 1 60); do
  docker exec "$DB" psql -U tdd_owner -d tdd_test -Atc "SELECT 1" >/dev/null 2>&1 && break
  sleep 1
done

# Abhaengigkeiten werden in einem benannten Volume zwischengespeichert, damit nicht
# jeder Lauf alles neu laedt. Der Quellcode wird nur gelesen.
docker run --rm --name "$RUNNER" --network "$NET" \
  -v "$SRC":/src:ro \
  -v tdd-verify-npm:/root/.npm \
  -e TEST_PG_HOST="$DB:5432" -e TEST_PG_DB=tdd_test \
  -w /work node:22-slim bash -c '
    set -e
    cp -r /src/. /work/
    npm ci --no-audit --no-fund --loglevel=error
    npm run test:integration -w @tdd/web
  '
echo "Integrationstests gruen."
