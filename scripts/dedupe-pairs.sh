#!/usr/bin/env bash
# Erzeugt /opt/tdd/dedupe-pairs.csv mit Kandidatenpaaren aus dem Echtbestand.
# Nur lesend. Die Datei bleibt auf dem Server (Personendaten).
# Danach: Spalte `dublette` von Hand mit 0/1 fuellen, dann scripts/dedupe-eval.sh.
set -euo pipefail
HIER=$(cd "$(dirname "$0")" && pwd)
docker cp "$HIER/dedupe-pairs.sql" tdd-postgres:/tmp/dedupe-pairs.sql
docker exec tdd-postgres psql -U tdd_owner -d tdd -q -f /tmp/dedupe-pairs.sql
docker cp tdd-postgres:/tmp/dedupe-pairs.csv /opt/tdd/dedupe-pairs.csv
docker exec tdd-postgres rm -f /tmp/dedupe-pairs.sql /tmp/dedupe-pairs.csv
chmod 600 /opt/tdd/dedupe-pairs.csv
echo "Kandidatenpaare: $(($(wc -l < /opt/tdd/dedupe-pairs.csv) - 1)) in /opt/tdd/dedupe-pairs.csv (nur root lesbar)"
