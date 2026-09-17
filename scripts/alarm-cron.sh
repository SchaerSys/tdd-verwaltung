#!/bin/sh
# Tafelwerk: Betreiber-Alarme der Super-Admin-Plattform (Health, Backup, Platte, Zertifikat,
# Serverfehler je Mandant, naechtliche Jobs). Mail nur bei Zustandswechsel + Erinnerung alle 24 h.
# Cron (root):  */15 * * * * /opt/tdd/alarm-cron.sh
TOKEN=$(grep -E '^JOB_TOKEN=' /opt/tdd/.env | cut -d= -f2-)
curl -sS -m 55 -H "Authorization: Bearer $TOKEN" "http://127.0.0.1:3081/api/alarme" > /opt/tdd/ops/alarme.result 2>&1
