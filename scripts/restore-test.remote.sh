#!/usr/bin/env bash
# Server-Teil des Rueckspiel-Tests. Wird von scripts/restore-test.sh hochgeladen
# und mit dem privaten age-Schluessel auf stdin ausgefuehrt. Nicht direkt aufrufen.
set -euo pipefail
STAGE=/opt/tdd/backup-stage
NAME=tdd-restore-test
D=$(mktemp -d -p /dev/shm)
cleanup() {
  docker rm -f "$NAME" >/dev/null 2>&1 || true
  [ -f "$D/key" ] && shred -u "$D/key" 2>/dev/null || true
  rm -rf "$D" 2>/dev/null || true
}
trap cleanup EXIT

# Schluessel aus stdin nur in den RAM.
cat > "$D/key"
grep -q AGE-SECRET-KEY "$D/key" || { echo "Kein age-Schluessel auf stdin"; exit 1; }

DUMP=$(ls -t "$STAGE"/db/*.dump.age 2>/dev/null | head -1)
[ -n "$DUMP" ] || { echo "Kein verschluesseltes Backup unter $STAGE/db"; exit 1; }
echo "Backup:   $(basename "$DUMP")  ($(du -h "$DUMP" | cut -f1))"

docker run -d --name "$NAME" -e POSTGRES_PASSWORD=restore -e POSTGRES_USER=tdd_owner \
  -e POSTGRES_DB=tdd postgres:16-alpine >/dev/null
# pg_isready antwortet schon waehrend der Initialisierung – erst wenn die Datenbank
# tatsaechlich erreichbar ist, ist der Container wirklich bereit.
for i in $(seq 1 60); do
  docker exec "$NAME" psql -U tdd_owner -d tdd -Atc "SELECT 1" >/dev/null 2>&1 && break
  sleep 1
done

# Rollen, die der Dump in Grants referenziert, muessen existieren.
docker exec "$NAME" psql -U tdd_owner -d tdd -q -c \
  "CREATE ROLE tdd_app LOGIN PASSWORD 'x'; CREATE ROLE tdd_ops LOGIN PASSWORD 'x';" >/dev/null

age -d -i "$D/key" "$DUMP" \
  | docker exec -i "$NAME" pg_restore -U tdd_owner -d tdd --no-owner --exit-on-error
shred -u "$D/key"

ZAEHLEN="SELECT '  personen=' || (SELECT count(*) FROM persons WHERE deleted_at IS NULL)
      || '  karten='   || (SELECT count(*) FROM cards WHERE deleted_at IS NULL)
      || '  ausgaben=' || (SELECT count(*) FROM distributions)
      || '  benutzer=' || (SELECT count(*) FROM users)
      || '  standorte='|| (SELECT count(*) FROM locations)"
echo "Wiederhergestellt:"; docker exec "$NAME"       psql -U tdd_owner -d tdd -Atc "$ZAEHLEN"
echo "Produktion:";        docker exec tdd-postgres  psql -U tdd_owner -d tdd -Atc "$ZAEHLEN"
echo "Rueckspiel erfolgreich. Wegwerf-Datenbank und Schluessel werden entfernt."
