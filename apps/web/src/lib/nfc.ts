/**
 * Kennung einer NFC-Karte in eine feste Schreibweise bringen.
 * Web NFC liefert "04:a3:2b:1c:5d:6e:80", ein USB-Leser "04A32B1C5D6E80", ein Mensch
 * irgendetwas dazwischen. Gespeichert und verglichen wird immer: Grossbuchstaben,
 * nur Hex-Zeichen, ohne Trenner. Leer bleibt leer (null).
 */
export function normalizeNfcId(roh: string | null | undefined): string | null {
  if (!roh) return null;
  const v = roh.toUpperCase().replace(/[^0-9A-F]/g, "");
  return v.length >= 4 ? v : null;
}
