#!/bin/sh
# TDD-Verwaltung: Host-Agent der Wartungsplattform.
# Die Wartungsplattform laeuft im Container ohne Docker-Rechte. Was sie am Host
# ausloesen darf, legt sie als Datei in /opt/tdd/ops ab; dieser Agent (Cron, jede
# Minute, root) fuehrt genau diese zwei Dinge aus und schreibt das Ergebnis daneben:
#   backup.request  -> /opt/tdd/backup.sh           -> backup.result
#   restart.request -> docker compose restart web   -> restart.result
#   restoretest.request -> /opt/tdd/restore-probe.sh  -> restoretest.result
# Der Wartungsmodus (wartung.flag) braucht keinen Agenten: Caddy prueft die Datei selbst.
# Cron (root):  * * * * * /opt/tdd/ops-agent.sh
set -u
DIR=/opt/tdd/ops
cd /opt/tdd || exit 1

if [ -f "$DIR/backup.request" ]; then
  wer=$(cat "$DIR/backup.request"); rm -f "$DIR/backup.request"
  {
    echo "$(date -Is) angefordert von: $wer"
    if /opt/tdd/backup.sh >> /opt/tdd/backup.log 2>&1; then echo "OK – siehe Backup-Log"; else echo "FEHLER – siehe Backup-Log"; fi
    tail -n 1 /opt/tdd/backup.log
  } > "$DIR/backup.result" 2>&1
fi

if [ -f "$DIR/restart.request" ]; then
  wer=$(cat "$DIR/restart.request"); rm -f "$DIR/restart.request"
  {
    echo "$(date -Is) angefordert von: $wer"
    if docker compose --env-file .env -f docker-compose.server.yml restart web >/dev/null 2>&1; then echo "Fach-App neu gestartet."; else echo "FEHLER beim Neustart."; fi
  } > "$DIR/restart.result" 2>&1
fi

if [ -f "$DIR/restoretest.request" ]; then
  wer=$(cat "$DIR/restoretest.request"); rm -f "$DIR/restoretest.request"
  {
    echo "$(date -Is) angefordert von: $wer"
    /opt/tdd/restore-probe.sh 2>&1
  } > "$DIR/restoretest.result" 2>&1
fi
