import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import fontkit from "@pdf-lib/fontkit";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { sprachCode, t2, pdfFaehig } from "@/lib/klientensprache";

export interface BescheidData {
  /** Name des Mandanten (Unternehmen) als Absender (055). */
  absender?: string;
  /** Sprache der Person (Auswahlliste) – zweiter Absatz in dieser Sprache (8). */
  sprache?: string | null;
  name: string;
  birthDate?: string | null;
  address?: string | null;
  organization: string;
  date: string;
  positive: boolean;
}

/** Erzeugt das Bescheid-PDF (positiv) zum Vorzeigen an der Ausgabestelle. */
export async function generateBescheidPdf(d: BescheidData): Promise<Buffer> {
  const pdf = await PDFDocument.create();
  const page = pdf.addPage([595, 842]); // A4
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  let y = 780;
  const line = (t: string, size = 11, f = font, color = rgb(0.1, 0.11, 0.12)) => {
    page.drawText(t, { x: 60, y, size, font: f, color });
    y -= size + 8;
  };

  line(d.absender ?? "Tischlein deck dich", 18, bold);
  line("Bescheid zur Berechtigungskarte", 13, bold, rgb(0.18, 0.29, 0.6));
  y -= 8;
  line(`Ausstellende Stelle: ${d.organization}`);
  line(`Datum: ${d.date}`);
  y -= 12;
  line("Ihr Antrag wurde POSITIV beschieden.", 13, bold, rgb(0.08, 0.56, 0.36));
  y -= 6;
  line(`Antragsteller/in: ${d.name}`);
  if (d.birthDate) line(`Geburtsdatum: ${d.birthDate}`);
  if (d.address) line(`Adresse: ${d.address}`);
  y -= 12;
  line("Sie sind berechtigt, eine Berechtigungskarte zu erhalten.");
  line("Bitte bringen Sie diesen Bescheid (im Original oder ausgedruckt)");
  line("zur zuständigen Ausgabestelle mit. Dort erhalten Sie Ihre Karte.");
  y -= 20;
  line("Mit freundlichen Grüßen", 11, font, rgb(0.4, 0.42, 0.45));
  line(d.absender ?? "Tischlein deck dich Vorarlberg", 11, font, rgb(0.4, 0.42, 0.45));

  // Zweitsprache (8): Tuerkisch/Englisch/Ukrainisch mit eingebetteter DejaVu-Schrift; Arabisch nur im HTML-Druck
  const sc = sprachCode(d.sprache);
  if (sc !== "de" && pdfFaehig(sc)) {
    pdf.registerFontkit(fontkit);
    // Schrift liegt in public/ (wird ins Standalone-Image kopiert); lokal cwd = apps/web, im Container cwd = /app
    const kandidaten = [join(process.cwd(), "public/fonts/DejaVuSans.ttf"), join(process.cwd(), "apps/web/public/fonts/DejaVuSans.ttf")];
    let schrift: Buffer | null = null;
    for (const k of kandidaten) { try { schrift = await readFile(k); break; } catch { /* naechster */ } }
    if (!schrift) return Buffer.from(await pdf.save()); // ohne Schrift: nur deutscher Teil
    const dv = await pdf.embedFont(schrift, { subset: true });
    y -= 16;
    page.drawLine({ start: { x: 60, y: y + 6 }, end: { x: 535, y: y + 6 }, thickness: 0.5, color: rgb(0.8, 0.8, 0.8) });
    const z = (k: string) => t2(sc, k) ?? "";
    line(z("bescheid"), 12, dv, rgb(0.18, 0.29, 0.6));
    line(z("positiv"), 11, dv);
    line(z("berechtigt"), 10, dv);
    for (const teil of umbrechen(z("vorzeigen"), 90)) line(teil, 10, dv);
    y -= 6;
    line(z("gruss"), 10, dv, rgb(0.4, 0.42, 0.45));
  }

  const bytes = await pdf.save();
  return Buffer.from(bytes);
}

/** Einfacher Zeilenumbruch nach Zeichenzahl (Wortgrenzen). */
function umbrechen(text: string, max: number): string[] {
  const out: string[] = []; let z = "";
  for (const w of text.split(" ")) { if ((z + " " + w).trim().length > max) { out.push(z.trim()); z = w; } else z = (z + " " + w).trim(); }
  if (z) out.push(z);
  return out;
}
