/**
 * Kölner Phonetik – phonetischer Schlüssel für deutsche Namen.
 *
 * Besser als Soundex für Deutsch: fängt gleich klingende Schreibweisen
 * (Maier/Mayer/Meier → "67", Müller/Mueller → "657").
 *
 * Ablauf: 1) Buchstaben kontextabhängig codieren, 2) aufeinanderfolgende
 * gleiche Ziffern zusammenfassen, 3) alle "0" außer einer führenden entfernen.
 */

function prepare(input: string): string {
  return input
    .toUpperCase()
    .replace(/[ÄÖÜ]/g, (m) => (m === "Ä" ? "A" : m === "Ö" ? "O" : "U"))
    .replace(/ß/g, "S")
    .replace(/[^A-Z]/g, "");
}

const IN = (c: string | undefined, set: string): boolean => c !== undefined && set.includes(c);

/** Berechnet den Kölner-Phonetik-Code (Ziffernstring) für ein einzelnes Wort. */
export function koelnerWord(word: string): string {
  const s = prepare(word);
  if (s.length === 0) return "";
  const codes: number[] = [];

  for (let i = 0; i < s.length; i++) {
    const c = s[i]!;
    const prev = i > 0 ? s[i - 1] : undefined;
    const next = i < s.length - 1 ? s[i + 1] : undefined;
    let code: number | null = null;

    switch (c) {
      case "A": case "E": case "I": case "J": case "O": case "U": case "Y":
        code = 0; break;
      case "H":
        code = null; break;
      case "B":
        code = 1; break;
      case "P":
        code = next === "H" ? 3 : 1; break;
      case "D": case "T":
        code = IN(next, "CSZ") ? 8 : 2; break;
      case "F": case "V": case "W":
        code = 3; break;
      case "G": case "K": case "Q":
        code = 4; break;
      case "C":
        if (prev === undefined) {
          code = IN(next, "AHKLOQRUX") ? 4 : 8;
        } else if (IN(prev, "SZ")) {
          code = 8;
        } else {
          code = IN(next, "AHKOQUX") ? 4 : 8;
        }
        break;
      case "X":
        if (IN(prev, "CKQ")) {
          code = 8;
        } else {
          codes.push(4, 8);
          continue;
        }
        break;
      case "L":
        code = 5; break;
      case "M": case "N":
        code = 6; break;
      case "R":
        code = 7; break;
      case "S": case "Z":
        code = 8; break;
    }

    if (code !== null) codes.push(code);
  }

  // 2) aufeinanderfolgende Duplikate zusammenfassen
  const collapsed: number[] = [];
  for (const d of codes) {
    if (collapsed.length === 0 || collapsed[collapsed.length - 1] !== d) collapsed.push(d);
  }

  // 3) alle "0" außer einer führenden entfernen
  const result = collapsed.filter((d, idx) => d !== 0 || idx === 0);
  return result.join("");
}

/** Kölner Phonetik über einen ggf. mehrteiligen Namen (je Wort). */
export function koelnerPhonetik(name: string | null | undefined): string {
  if (!name) return "";
  return name
    .split(/\s+/)
    .map(koelnerWord)
    .filter((s) => s.length > 0)
    .join(" ");
}
