# Aufwandserfassung – Schär Systems e.U.

> Diese Datei wird automatisch während der Coding-Sessions gepflegt.
> Stundenansatz: 75 € · MwSt. 20 %

| Datum | Aufgabe | Kategorie | Projekt/Mandant | Stunden |
|-------|---------|-----------|-----------------|---------|
<!-- EINTRÄGE AB HIER – nicht die Kopfzeile löschen -->
| 13.09.2026 | Standortbestimmung: Produktionsdaten ausgewertet (5.487 Personen migriert, Tresen nicht in Betrieb, Standortwiderspruch), Begründungen und Sprintplan geprüft, drei Serverstellen verifiziert, bestehendes Backup analysiert | Konzept | TDD Verwaltung | 1,5 |
| 13.09.2026 | S1-1 Backup: bestehendes Klartext-Backup auf age-Verschlüsselung umgestellt (Schlüsselpaar im RAM erzeugt, privat nur lokal), Rückspiel-Test-Skript mit Wegwerf-Postgres und Schlüssel über SSH-Stdin, Rückspiel durchgeführt und gegen Produktion verifiziert, Cron scharf | Backend | TDD Verwaltung | 1,8 |
| 13.09.2026 | S1-2 Löschfristen: Job-Token in den Header (zeitkonstanter Vergleich), Purge-Bibliothek löscht jetzt auch die Scan-Dateien, DSGVO-Löschjob für Scans (90 Tage) und archivierte Personen (3 Jahre), Erstlauf gegen Produktion geprüft (trifft nichts), Cron-Skript | Backend | TDD Verwaltung | 1,2 |
| 13.09.2026 | S1-3 Login-Härtung: Migration 025 (locked_until), Zähler für Fehlversuche, Sperre 15 Min nach 5 Versuchen, Audit login.failed/login.locked, generische Fehlermeldung bleibt, Passwort-Reset hebt Sperre auf | Backend | TDD Verwaltung | 0,6 |
