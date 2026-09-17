#!/usr/bin/env bash
# TDD-Verwaltung: Ausrollen auf den Server, mit Qualitaetsnetz statt fremder CI.
#
# Ablauf (bricht beim ersten roten Schritt ab, die Produktion bleibt unberuehrt):
#   1. Quellstand aus Git packen und in /opt/tdd/stage entpacken (nicht in /opt/tdd)
#   2. Integrationstests gegen eine Wegwerf-Postgres    (scripts/verify-integration.sh)
#   3. Kandidaten-Image bauen – darin laufen Typecheck und Unit-Tests (Dockerfile)
#   4. Erst jetzt: Code nach /opt/tdd uebernehmen, neue Migrationen einspielen,
#      Image als "latest" markieren, Container tauschen
#   5. Nachweis: Login-Seite antwortet, Job-Autorisierung greift
#
# Aufruf:  scripts/deploy.sh [git-ref]        (Standard: HEAD)
# Voraussetzung: SSH-Schluessel fuer root@49.13.128.107, sauberer Arbeitsbaum.
set -euo pipefail

REF="${1:-HEAD}"
SERVER="${TDD_SERVER:-root@49.13.128.107}"
HIER=$(cd "$(dirname "$0")/.." && pwd)
cd "$HIER"

if [ -n "$(git status --porcelain --untracked-files=no)" ]; then
  echo "Arbeitsbaum hat uncommittete Aenderungen. Erst committen, dann ausrollen."; exit 1
fi
STAND=$(git rev-parse --short "$REF")
echo "Stand $STAND ($(git log -1 --format=%s "$REF"))"

TAR=$(mktemp -t tdd-deploy-XXXXXX.tar.gz)
git archive --format=tar.gz -o "$TAR" "$REF" \
  apps/web apps/ops packages/core packages/db scripts docker package.json package-lock.json tsconfig.base.json \
  eslint.config.mjs .prettierrc.json
scp -o BatchMode=yes -q "$TAR" "$SERVER:/opt/tdd/deploy-$STAND.tar.gz"
rm -f "$TAR"

ssh -o BatchMode=yes "$SERVER" STAND="$STAND" 'bash -s' <<'REMOTE'
set -euo pipefail
cd /opt/tdd

echo "── 1/5 Entpacken nach stage ──"
# Archive abgebrochener Laeufe wegraeumen, nur das aktuelle behalten.
find . -maxdepth 1 -name 'deploy-*.tar.gz' ! -name "deploy-$STAND.tar.gz" -delete
rm -rf stage && mkdir stage
tar xzf "deploy-$STAND.tar.gz" -C stage 2>/dev/null
sed -i 's/\r$//' stage/scripts/*.sh && chmod +x stage/scripts/*.sh

echo "── 2/5 Integrationstests ──"
bash stage/scripts/verify-integration.sh /opt/tdd/stage 2>&1 | grep -E "✓|×|FAIL|passed|failed|Integrationstests" || { echo "Integrationstests ROT – Abbruch"; exit 1; }

echo "── 3/5 Kandidaten-Image bauen (Typecheck + Unit-Tests darin) ──"
docker build -q -f stage/apps/web/Dockerfile -t tdd-web:candidate stage/ >/dev/null \
  || { echo "Image-Build ROT (Typecheck, Tests oder Build) – Abbruch"; exit 1; }
docker build -q -f stage/apps/ops/Dockerfile -t tdd-ops:candidate stage/ >/dev/null \
  || { echo "Image-Build Wartungsplattform ROT – Abbruch"; exit 1; }

echo "── 4/5 Uebernehmen, migrieren, tauschen ──"
rsync -a --delete --exclude=.env --exclude=Caddyfile \
  --exclude=backup-stage --exclude='*.log' --exclude=stage --exclude='deploy*.tar.gz' \
  --exclude=age-recipient.txt --exclude='*.bak' --exclude='*.alt*' \
  stage/apps/ apps/ && rsync -a --delete stage/packages/ packages/ && rsync -a stage/scripts/ scripts/
cp stage/package.json stage/package-lock.json stage/tsconfig.base.json .
# Die Compose-Datei ist seit Sprint 4 versioniert; Aenderungen greifen beim up -d unten.
cp stage/docker/docker-compose.server.yml docker-compose.server.yml

# Nur Migrationen einspielen, die noch nicht liefen (Buchfuehrung in /opt/tdd/migrations.done).
touch migrations.done
for f in packages/db/sql/*.sql; do
  n=$(basename "$f")
  grep -qx "$n" migrations.done && continue
  echo "   Migration $n"
  # Owner-Sitzung im Kontext des Bestandsmandanten: Seeds/Nachtraege erben tenant_id (053)
  { echo "SET app.current_tenant_id = '${DEFAULT_TENANT_ID:-e3b29c11-0000-4000-a000-000000000000}';"; cat "$f"; }     | docker exec -i tdd-postgres psql -U tdd_owner -d tdd -v ON_ERROR_STOP=1 -q
  echo "$n" >> migrations.done
done

docker tag tdd-web:candidate tdd-web:latest
docker tag tdd-ops:candidate tdd-ops:latest
# Wartungsplattform: Anfrage-Verzeichnis fuer den Host-Agenten + Hinweisseite fuer Caddy.
mkdir -p ops && cp stage/docker/ops/wartung.html ops/wartung.html
docker compose --env-file .env -f docker-compose.server.yml up -d --no-build web ops >/dev/null 2>&1
# Routing-Dienst nur, wenn die Kartendaten schon aufbereitet sind (scripts/osrm-setup.sh).
[ -f osrm/vorarlberg-latest.osrm.cells ] && docker compose --env-file .env -f docker-compose.server.yml up -d osrm >/dev/null 2>&1 || true
cp scripts/jobs-cron.sh jobs-cron.sh 2>/dev/null; cp scripts/backup.sh backup.sh 2>/dev/null; cp scripts/ops-agent.sh ops-agent.sh 2>/dev/null; cp scripts/osrm-setup.sh osrm-setup.sh 2>/dev/null; chmod +x *.sh

echo "── 5/5 Nachweis ──"
for i in $(seq 1 40); do
  c=$(curl -s -o /dev/null -w "%{http_code}" --max-time 3 http://127.0.0.1:3080/login 2>/dev/null); [ "$c" = "200" ] && break; sleep 2
done
[ "$c" = "200" ] || { echo "Login-Seite antwortet nicht ($c)"; exit 1; }
for i in $(seq 1 30); do
  o=$(curl -s -o /dev/null -w "%{http_code}" --max-time 3 http://127.0.0.1:3081/api/health 2>/dev/null); [ "$o" = "200" ] && break; sleep 2
done
[ "$o" = "200" ] || { echo "Wartungsplattform antwortet nicht ($o)"; exit 1; }
j=$(curl -s -o /dev/null -w "%{http_code}" http://127.0.0.1:3080/api/jobs/retention)
[ "$j" = "403" ] || { echo "Job ohne Token muesste 403 sein, ist $j"; exit 1; }
rm -f "deploy-$STAND.tar.gz"
# Aufraeumen: alte Images, Build-Cache (> 24 h), namenlose Volumes der Wegwerf-Postgres – sonst
# frisst der Docker-Cache die Platte (am 17.09. lagen 45 GB Build-Cache herum).
docker image prune -f >/dev/null 2>&1 || true
docker builder prune -f --filter "until=24h" >/dev/null 2>&1 || true
docker volume prune -f >/dev/null 2>&1 || true
rm -f deploy*.tar.gz mt-stage.tgz
echo "Ausgerollt: $STAND  (Login 200, Job ohne Token 403, Wartung 200)  Platte: $(df -h / | awk 'NR==2{print $5" belegt"}')"
REMOTE
