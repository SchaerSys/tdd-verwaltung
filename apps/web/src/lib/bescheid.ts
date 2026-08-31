import { PDFDocument, StandardFonts, rgb } from "pdf-lib";

export interface BescheidData {
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

  line("Tischlein deck dich", 18, bold);
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
  line("Sie sind berechtigt, eine TDD-Berechtigungskarte zu erhalten.");
  line("Bitte bringen Sie diesen Bescheid (im Original oder ausgedruckt)");
  line("zur zuständigen TDD-Ausgabestelle mit. Dort erhalten Sie Ihre Karte.");
  y -= 20;
  line("Mit freundlichen Grüßen", 11, font, rgb(0.4, 0.42, 0.45));
  line("Tischlein deck dich Vorarlberg", 11, font, rgb(0.4, 0.42, 0.45));

  const bytes = await pdf.save();
  return Buffer.from(bytes);
}
