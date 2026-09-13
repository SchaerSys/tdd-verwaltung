#!/usr/bin/env bash
# TDD-Verwaltung: taegliches Backup, verschluesselt, auf die Hetzner Storage Box.
#
# Sichert Datenbank, Uploads (Fotos/Scans) und Konfiguration. Alles wird mit age
# gegen den oeffentlichen Schluessel in /opt/tdd/age-recipient.txt verschluesselt.
# Der private Schluessel liegt NICHT auf diesem Server – ein kompromittierter Server
# kann Backups schreiben, aber keins davon lesen.
#
# Restore: scripts/restore-test.sh (braucht den privaten Schluessel).
# Cron (root):  0 3 * * * /opt/tdd/backup.sh >> /opt/tdd/backup.log 2>&1
set -euo pipefail

SB_HOST=u625300.your-storagebox.de; SB_USER=u625300; SB_PORT=23
SB_KEY=/root/.ssh/storagebox_ed25519; SB_REMOTE=tdd-backups
STAGE=/opt/tdd/backup-stage; RETENTION_DAYS=30; TS=$(date +%Y%m%d_%H%M%S)
RECIPIENT_FILE=/opt/tdd/age-recipient.txt
SSHC="ssh -p $SB_PORT -i $SB_KEY -o StrictHostKeyChecking=accept-new -o BatchMode=yes"

[ -s "$RECIPIENT_FILE" ] || { echo "[backup] FEHLER: $RECIPIENT_FILE fehlt – kein Backup ohne Verschluesselung"; exit 1; }
RECIPIENT=$(cat "$RECIPIENT_FILE")
command -v age >/dev/null || { echo "[backup] FEHLER: age nicht installiert"; exit 1; }

mkdir -p "$STAGE/db" "$STAGE/uploads" "$STAGE/config"

# 1) Datenbank: Custom-Format (erlaubt selektives Restore), direkt in age gepipt.
docker exec tdd-postgres pg_dump -U tdd_owner -d tdd -Fc \
  | age -r "$RECIPIENT" -o "$STAGE/db/tdd_${TS}.dump.age"

# 2) Uploads (Scans/Fotos) aus dem Docker-Volume.
docker run --rm -v tdd_tdd-uploads:/data:ro alpine tar czf - -C /data . 2>/dev/null \
  | age -r "$RECIPIENT" -o "$STAGE/uploads/uploads_${TS}.tar.gz.age"

# 3) Konfiguration (enthaelt Geheimnisse – deshalb ebenfalls verschluesselt, als ein Archiv).
tar czf - -C /opt/tdd docker-compose.server.yml Caddyfile .env 2>/dev/null \
  | age -r "$RECIPIENT" -o "$STAGE/config/config_${TS}.tar.gz.age"

# 4) Plausibilitaet: ein leerer Dump ist ein fehlgeschlagenes Backup.
DB_BYTES=$(stat -c %s "$STAGE/db/tdd_${TS}.dump.age")
[ "$DB_BYTES" -gt 10000 ] || { echo "[backup] FEHLER: Datenbank-Dump verdaechtig klein ($DB_BYTES B)"; exit 1; }

# 5) Lokale Aufbewahrung.
find "$STAGE/db" "$STAGE/uploads" "$STAGE/config" -type f -mtime +$RETENTION_DAYS -delete || true
find "$STAGE/config" -mindepth 1 -type d -empty -delete 2>/dev/null || true

# 6) Auf die Storage Box spiegeln.
$SSHC "$SB_USER@$SB_HOST" "mkdir -p $SB_REMOTE" 2>/dev/null || true
rsync -az --delete -e "$SSHC" "$STAGE/" "$SB_USER@$SB_HOST:$SB_REMOTE/"

echo "[backup $(date +%F_%T)] OK  db=$(numfmt --to=iec "$DB_BYTES")  uploads=$(du -h "$STAGE/uploads/uploads_${TS}.tar.gz.age" | cut -f1)"
