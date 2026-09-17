#!/bin/sh
# TDD-Verwaltung: naechtliche Jobs. Ersetzt cleanup-cron.sh.
# Der Token geht im Authorization-Header mit, nicht mehr in der URL – Tokens in
# URLs landen in Zugriffslogs. Cron (root), jeweils eine Zeile:
#   17 3 * * * /opt/tdd/jobs-cron.sh cleanup
#   45 3 * * * /opt/tdd/jobs-cron.sh retention
# Der Job "expiry" verschickt Mails an Klientinnen und Klienten und wird erst nach
# ausdruecklicher Freigabe in den Cron aufgenommen.
JOB="${1:?Job angeben: cleanup | retention | expiry | monatsbericht}"
TOKEN=$(grep -E '^JOB_TOKEN=' /opt/tdd/.env | cut -d= -f2-)
LOG=/opt/tdd/jobs.log
printf '%s %s ' "$(date -Is)" "$JOB" >> "$LOG"
curl -sS -H "Authorization: Bearer $TOKEN" "http://127.0.0.1:3080/api/jobs/$JOB" >> "$LOG" 2>&1
echo >> "$LOG"
