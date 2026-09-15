#!/usr/bin/env bash
# TDD-Verwaltung: Routing-Dienst (OSRM) mit einem OpenStreetMap-Auszug fuer Vorarlberg aufbauen.
#
# Laeuft auf dem Server (root). Geofabrik (Deutschland) bietet keinen eigenen Vorarlberg-
# Auszug, deshalb: Oesterreich laden (~700 MB), mit osmium auf das Rechteck Vorarlberg
# (plus Rand: Liechtenstein, St. Galler Rheintal, Allgaeu, Arlberg) zuschneiden (~40 MB),
# dann mit den OSRM-Werkzeugen aufbereiten (MLD) und den Container starten.
# Kein Fremddienst im Betrieb: alle Routenberechnungen laufen danach lokal.
# Voraussetzung: apt install osmium-tool. Monatlich wiederholen, um neue Strassen mitzunehmen:
#   0 4 1 * * /opt/tdd/osrm-setup.sh >> /opt/tdd/osrm.log 2>&1
set -euo pipefail
cd /opt/tdd
mkdir -p osrm
IMG=ghcr.io/project-osrm/osrm-backend:latest
BBOX="9.35,46.80,10.35,47.65"   # lng_min,lat_min,lng_max,lat_max

echo "[osrm $(date -Is)] lade Oesterreich-Auszug"
curl -sSfL -o osrm/austria.osm.pbf.neu "https://download.geofabrik.de/europe/austria-latest.osm.pbf"
mv osrm/austria.osm.pbf.neu osrm/austria.osm.pbf

echo "[osrm $(date -Is)] schneide Vorarlberg zu"
osmium extract --overwrite -b "$BBOX" -o osrm/vorarlberg-latest.osm.pbf osrm/austria.osm.pbf
rm -f osrm/austria.osm.pbf
ls -la osrm/vorarlberg-latest.osm.pbf

echo "[osrm $(date -Is)] extract/partition/customize"
docker run --rm -v /opt/tdd/osrm:/data "$IMG" osrm-extract   -p /opt/car.lua /data/vorarlberg-latest.osm.pbf >/dev/null
docker run --rm -v /opt/tdd/osrm:/data "$IMG" osrm-partition /data/vorarlberg-latest.osrm >/dev/null
docker run --rm -v /opt/tdd/osrm:/data "$IMG" osrm-customize /data/vorarlberg-latest.osrm >/dev/null

echo "[osrm $(date -Is)] Dienst (neu) starten"
docker compose --env-file .env -f docker-compose.server.yml up -d --force-recreate osrm >/dev/null 2>&1
for i in $(seq 1 30); do
  docker run --rm --network tdd_tdd-net curlimages/curl:latest -sf "http://osrm:5000/nearest/v1/driving/9.75,47.35" >/dev/null 2>&1 && { echo "[osrm $(date -Is)] OK"; exit 0; }
  sleep 2
done
echo "[osrm $(date -Is)] Dienst antwortet nicht"; exit 1
