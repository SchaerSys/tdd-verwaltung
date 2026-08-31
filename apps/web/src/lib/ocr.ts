import { createWorker } from "tesseract.js";

/**
 * On-Premise-OCR (tesseract.js, WASM) für deutsche Formulare/Ausweise.
 * Das Bild verlässt den Server nicht – nur das Sprachmodell wird (einmalig,
 * gecached) geladen. OCR ist rein assistierend (Vorbefüllung, Mensch bestätigt).
 */
export async function runOcr(image: Buffer): Promise<{ text: string; confidence: number }> {
  const langPath = process.env.TESS_LANG_PATH; // optional: lokaler tessdata-Ordner
  const worker = await createWorker("deu", 1, langPath ? { langPath, cachePath: "/tmp" } : { cachePath: "/tmp" });
  try {
    const { data } = await worker.recognize(image);
    return { text: data.text, confidence: data.confidence };
  } finally {
    await worker.terminate();
  }
}

/** Liest den Text aus einer Word-Datei (.docx) – kein OCR nötig, Text ist exakt. */
export async function extractDocxText(buffer: Buffer): Promise<string> {
  const mammoth = (await import("mammoth")).default;
  const { value } = await mammoth.extractRawText({ buffer });
  return value;
}

export interface ExtractedFields {
  firstName?: string;
  lastName?: string;
  address?: string;
  postalCode?: string;
  city?: string;
  phone?: string;
  householdSize?: number;
  childrenCount?: number;
  birthDate?: string;
}

function cleanVal(v: string): string {
  return v.replace(/[.…:]+$/g, "").replace(/\s{2,}/g, " ").trim();
}

/** Extrahiert Personendaten heuristisch aus dem OCR-Text. */
export function extractFields(text: string): ExtractedFields {
  const out: ExtractedFields = {};
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);

  for (const line of lines) {
    // Wert = Text nach dem ersten Doppelpunkt
    const colon = line.indexOf(":");
    const label = colon >= 0 ? line.slice(0, colon) : line;
    const value = colon >= 0 ? cleanVal(line.slice(colon + 1)) : "";

    // Name
    if (/vorname|nachname|^name\b/i.test(label) && value && !out.lastName) {
      const parts = value.split(/\s+/).filter(Boolean);
      if (parts.length >= 2) { out.lastName = parts[parts.length - 1]; out.firstName = parts.slice(0, -1).join(" "); }
      else out.lastName = value;
    }
    // Adresse
    if (/adresse|stra(ss|ß)e|anschrift/i.test(label) && value && !out.address) out.address = value;
    // Telefon
    if (/telefon|tel\.?|handy|mobil/i.test(label) && value && !out.phone) {
      const m = value.match(/[+\d][\d\s/()-]{5,}/);
      if (m) out.phone = m[0].trim();
    }
    // PLZ, Ort
    if (/plz|ort/i.test(label) && value) {
      const m = value.match(/(\d{4})\s+(.+)/);
      if (m) { out.postalCode = m[1]; out.city = cleanVal(m[2]!); }
    }
    // Anzahl Erwachsene / Kinder
    const num = value.match(/\d+/);
    if (/erwachsene/i.test(label) && num) out.householdSize = (out.householdSize ?? 0) + parseInt(num[0], 10);
    if (/kinder/i.test(label) && num) out.childrenCount = (out.childrenCount ?? 0) + parseInt(num[0], 10);
  }

  // Geburtsdatum irgendwo im Text (falls Ausweis/ZMR statt Formular)
  const bd = text.match(/(\d{1,2})[.\/](\d{1,2})[.\/](\d{4})/);
  if (bd) out.birthDate = `${bd[3]}-${bd[2]!.padStart(2, "0")}-${bd[1]!.padStart(2, "0")}`;

  // Haushaltsgröße = Erwachsene + Kinder (falls beide erkannt)
  if (out.householdSize != null && out.childrenCount != null) out.householdSize += out.childrenCount;

  return out;
}
