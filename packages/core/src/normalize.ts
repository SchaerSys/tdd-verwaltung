/**
 * Deutsche Normalisierung für die Dublettensuche.
 *
 * Ziel: „Müller" und „Mueller" (und „MÜLLER ") sollen denselben normalisierten
 * Schlüssel ergeben. Der normalisierte Wert wird als Schattenfeld gespeichert und
 * für die Trigramm-Ähnlichkeit (pg_trgm) verwendet.
 */

/** Faltet deutsche Umlaute/ß und entfernt sonstige Diakritika. */
export function foldGerman(input: string): string {
  return input
    .replace(/[äÄ]/g, "ae")
    .replace(/[öÖ]/g, "oe")
    .replace(/[üÜ]/g, "ue")
    .replace(/ß/g, "ss")
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, ""); // restliche kombinierende Akzente entfernen
}

/** Normalisiert einen Namen/Ort: klein, gefaltet, ohne Satzzeichen, ein Leerzeichen. */
export function normalizeName(input: string | null | undefined): string {
  if (!input) return "";
  return foldGerman(input.toLowerCase())
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

/**
 * Normalisiert eine Adresse zusätzlich mit Abkürzungs-Vereinheitlichung
 * (str./strasse → strasse), damit „Bahnhofstr. 12" ≈ „Bahnhofstrasse 12".
 */
export function normalizeAddress(input: string | null | undefined): string {
  if (!input) return "";
  return normalizeName(input)
    .replace(/str\b/g, "strasse") // Suffix „...str" und „str." → „strasse"
    .replace(/\bpl\b/g, "platz");
}
