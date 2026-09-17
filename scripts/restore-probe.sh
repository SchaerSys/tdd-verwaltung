#!/bin/sh
# Tafelwerk: Rueckspielprobe auf dem Server (Dump → Wegwerf-Datenbank → Zaehlung → weg).
# Prueft die Dump/Restore-Mechanik und die Konsistenz des Schemas mit dem Bestand. Die
# verschluesselten Archive auf der Storage Box prueft weiterhin scripts/restore-test.sh
# vom Betreiber-PC (der private age-Schluessel liegt nicht auf dem Server).
set -u
cd /opt/tdd || exit 1
START=$(date +%s)
docker exec tdd-postgres sh -c 'pg_dump -U tdd_owner -d tdd -Fc -f /tmp/probe.dump' || { echo "FEHLER: pg_dump"; exit 1; }
docker exec tdd-postgres psql -U tdd_owner -d postgres -Atqc "DROP DATABASE IF EXISTS tdd_probe" >/dev/null
docker exec tdd-postgres psql -U tdd_owner -d postgres -Atqc "CREATE DATABASE tdd_probe OWNER tdd_owner" >/dev/null || { echo "FEHLER: createdb"; exit 1; }
if ! docker exec tdd-postgres pg_restore -U tdd_owner -d tdd_probe --no-owner --exit-on-error /tmp/probe.dump >/tmp/probe.err 2>&1; then
  echo "FEHLER: pg_restore"; head -5 /tmp/probe.err; docker exec tdd-postgres psql -U tdd_owner -d postgres -Atqc "DROP DATABASE IF EXISTS tdd_probe" >/dev/null; exit 1
fi
Q="SELECT (SELECT count(*) FROM tenants)||' Mandanten, '||(SELECT count(*) FROM persons)||' Personen, '||(SELECT count(*) FROM cards)||' Karten, '||(SELECT count(*) FROM distributions)||' Ausgaben, '||(SELECT count(*) FROM staff)||' Personal, '||(SELECT count(*) FROM users)||' Benutzer'"
PROD=$(docker exec tdd-postgres psql -U tdd_owner -d tdd -Atc "$Q")
PROBE=$(docker exec tdd-postgres psql -U tdd_owner -d tdd_probe -Atc "$Q")
docker exec tdd-postgres psql -U tdd_owner -d postgres -Atqc "DROP DATABASE IF EXISTS tdd_probe" >/dev/null
docker exec tdd-postgres rm -f /tmp/probe.dump
GROESSE=$(docker exec tdd-postgres sh -c 'ls -l /tmp/probe.dump 2>/dev/null | awk "{print \$5}"')
if [ "$PROD" = "$PROBE" ]; then echo "OK ($(( $(date +%s) - START )) s): $PROBE"; else echo "ABWEICHUNG: Produktion $PROD | Probe $PROBE"; exit 1; fi
