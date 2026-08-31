/**
 * EAN-13-Kartennummern mit Präfix 2.
 *
 * Die führende Ziffer 2 ist im GS1-Standard für innerbetrieblichen Eigengebrauch
 * reserviert und kollidiert daher nie mit echter Handelsware (wichtig für die
 * spätere Ländle-Kassa in den Läden).
 *
 * Aufbau (13 Stellen): 2 | Standort-Kennung (3) | laufende Nummer (8) | Prüfziffer (1)
 */

const PREFIX = "2";
const LOCATION_LEN = 3;
const SEQUENCE_LEN = 8;

/** Berechnet die EAN-13-Prüfziffer für die ersten 12 Stellen. */
export function ean13CheckDigit(twelveDigits: string): number {
  if (!/^\d{12}$/.test(twelveDigits)) {
    throw new Error("ean13CheckDigit erwartet genau 12 Ziffern");
  }
  let sum = 0;
  for (let i = 0; i < 12; i++) {
    const digit = twelveDigits.charCodeAt(i) - 48;
    sum += i % 2 === 0 ? digit : digit * 3;
  }
  return (10 - (sum % 10)) % 10;
}

/** Prüft, ob ein 13-stelliger Code eine gültige EAN-13 ist (inkl. Prüfziffer). */
export function isValidEan13(code: string): boolean {
  if (!/^\d{13}$/.test(code)) return false;
  return ean13CheckDigit(code.slice(0, 12)) === code.charCodeAt(12) - 48;
}

/**
 * Baut eine vollständige EAN-13-Kartennummer aus Standort-Kennung und laufender Nummer.
 * @param locationCode 1–3-stellige Standort-Kennung (wird links mit 0 aufgefüllt)
 * @param sequence     laufende Nummer (wird links mit 0 aufgefüllt)
 */
export function buildCardNumber(locationCode: number, sequence: number): string {
  if (locationCode < 0 || locationCode >= 10 ** LOCATION_LEN) {
    throw new Error(`Standort-Kennung muss 0..${10 ** LOCATION_LEN - 1} sein`);
  }
  if (sequence < 0 || sequence >= 10 ** SEQUENCE_LEN) {
    throw new Error(`Laufende Nummer muss 0..${10 ** SEQUENCE_LEN - 1} sein`);
  }
  const body =
    PREFIX +
    String(locationCode).padStart(LOCATION_LEN, "0") +
    String(sequence).padStart(SEQUENCE_LEN, "0");
  return body + String(ean13CheckDigit(body));
}

/** Formatiert eine EAN-13 leserlich gruppiert: „2 041 002511 4". */
export function formatCardNumber(code: string): string {
  if (!/^\d{13}$/.test(code)) return code;
  return `${code[0]} ${code.slice(1, 4)} ${code.slice(4, 12)} ${code[12]}`;
}
