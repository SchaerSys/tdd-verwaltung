#!/usr/bin/env bash
# TDD-Verwaltung: Rueckspiel-Test des juengsten Backups.
#
# Laeuft von Darios Rechner aus (Git Bash oder Linux). Laedt den Server-Teil in den
# Arbeitsspeicher des Servers, startet dort eine Wegwerf-Postgres, spielt das juengste
# verschluesselte Backup ein, zaehlt gegen die Produktion und raeumt alles weg.
#
# Der private age-Schluessel wird ueber die SSH-Verbindung gestreamt und liegt auf dem
# Server nur in /dev/shm, fuer die Dauer des Tests. Er beruehrt dort nie die Platte.
#
# Aufruf:   scripts/restore-test.sh [pfad-zum-privaten-schluessel]
# Standard: ~/.tdd-backup/tdd-backup.key
#
# Alle drei Monate ausfuehren. Ein Backup, das nie zurueckgespielt wurde, ist keins.
set -euo pipefail

KEY="${1:-$HOME/.tdd-backup/tdd-backup.key}"
SERVER="${TDD_SERVER:-root@49.13.128.107}"
HIER=$(cd "$(dirname "$0")" && pwd)

[ -s "$KEY" ] || { echo "Privater Schluessel nicht gefunden: $KEY"; exit 1; }
grep -q AGE-SECRET-KEY "$KEY" || { echo "Datei enthaelt keinen age-Schluessel: $KEY"; exit 1; }

echo "Rueckspiel-Test auf $SERVER ..."
REMOTE=$(ssh -o BatchMode=yes "$SERVER" 'mktemp -p /dev/shm restore-XXXXXX.sh')
scp -o BatchMode=yes -q "$HIER/restore-test.remote.sh" "$SERVER:$REMOTE"
ssh -o BatchMode=yes "$SERVER" "sed -i 's/\r\$//' $REMOTE; bash $REMOTE; rm -f $REMOTE" < "$KEY"
