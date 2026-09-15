#!/usr/bin/env bash
# TDD-Verwaltung: Routing-Dienst (OSRM) mit dem OpenStreetMap-Auszug Vorarlberg aufbauen.
#
# Laeuft auf dem Server (root). Laedt den Auszug von Geofabrik (Deutschland), bereitet
# ihn mit den OSRM-Werkzeugen auf (MLD) und startet den Container aus docker-compose.
# Kein Fremddienst im Betrieb: alle Routenberechnungen laufen danach lokal.
# Wiederholen (z. B. monatlich per Cron), um neue Strassen mitzunehmen:
#   0 4 1 * * /opt/tdd/osrm-setup.sh >> /opt/tdd/osrm.log 2>&1
set -euo pipefail
cd /opt/tdd
mkdir -p osrm
IMG=ghcr.io/project-osrm/osrm-backend:latest
PBF=vorarlberg-latest.osm.pbf

echo "[osrm $(date -Is)] lade Auszug"
curl -sSfL -o "osrm/$PBF.neu" "https://download.geofabrik.de/europe/austria/vorarlberg-latest.osm.pbf"
mv "osrm/$PBF.neu" "osrm/$PBF"

echo "[osrm $(date -Is)] extract/partition/customize"
docker run --rm -t -v /opt/tdd/osrm:/data "$IMG" osrm-extract   -p /opt/car.lua /data/$PBF >/dev/null
docker run --rm -t -v /opt/tdd/osrm:/data "$IMG" osrm-partition /data/vorarlberg-latest.osrm >/dev/null
docker run --rm -t -v /opt/tdd/osrm:/data "$IMG" osrm-customize /data/vorarlberg-latest.osrm >/dev/null

echo "[osrm $(date -Is)] Dienst (neu) starten"
docker compose --env-file .env -f docker-compose.server.yml up -d --force-recreate osrm >/dev/null 2>&1
for i in $(seq 1 30); do
  docker compose --env-file .env -f docker-compose.server.yml exec -T osrm sh -c "wget -qO- 'http://127.0.0.1:5000/nearest/v1/driving/9.75,47.35'" >/dev/null 2>&1 && { echo "[osrm $(date -Is)] OK"; exit 0; }
  sleep 2
done
echo "[osrm $(date -Is)] Dienst antwortet nicht"; exit 1
