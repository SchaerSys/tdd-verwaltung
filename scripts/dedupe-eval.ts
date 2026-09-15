/**
 * Misst die Dubletten-Engine gegen manuell markierte Paare.
 *
 * CSV-Format (Semikolon, mit Kopfzeile):
 *   vorname_a;nachname_a;gebdat_a;adresse_a;plz_a;vorname_b;nachname_b;gebdat_b;adresse_b;plz_b;dublette
 * Spalte `dublette`: 1 = ist dieselbe Person, 0 = ist es nicht, leer = noch nicht markiert (wird uebersprungen).
 *
 * Aufruf (auf dem Server, im Node-Container): scripts/dedupe-eval.sh /opt/tdd/dedupe-pairs.csv
 * Die Datei enthaelt Personendaten und bleibt auf dem Server.
 */
import { readFileSync } from "node:fs";
import { scoreCandidate, type PersonKey } from "../packages/core/src/index";

const file = process.argv[2];
if (!file) {
  console.error("Aufruf: dedupe-eval <pairs.csv>");
  process.exit(1);
}

const zeilen = readFileSync(file, "utf8").split(/\r?\n/).filter((l) => l.trim() !== "").slice(1);
const alle = zeilen.map((line) => {
  const c = line.split(";").map((x) => x.trim());
  const a: PersonKey = { firstName: c[0] ?? "", lastName: c[1] ?? "", birthDate: c[2] || null, address: c[3] || null, postalCode: c[4] || null };
  const b: PersonKey = { firstName: c[5] ?? "", lastName: c[6] ?? "", birthDate: c[7] || null, address: c[8] || null, postalCode: c[9] || null };
  const mark = (c[10] ?? "").trim();
  return { a, b, markiert: mark === "0" || mark === "1", isDup: mark === "1", score: scoreCandidate(a, b).score };
});
const cases = alle.filter((c) => c.markiert);

console.log(`Paare in Datei: ${alle.length}, davon markiert: ${cases.length} (${cases.filter((c) => c.isDup).length} echte Dubletten)\n`);
if (cases.length === 0) {
  console.log("Noch nichts markiert – Spalte `dublette` mit 0 oder 1 fuellen.");
  process.exit(0);
}

console.log("Schwelle | Precision | Recall  | F1    | FP | FN");
console.log("---------|-----------|---------|-------|----|----");
// Schwellen exakt runden: 0.5 + 7*0.05 ergibt in Gleitkomma 0.8500000000000001,
// und ein Paar mit genau 0.850 fiele faelschlich darunter.
for (let i = 0; i <= 9; i++) {
  const t = Math.round((0.5 + i * 0.05) * 100) / 100;
  const tp = cases.filter((c) => c.score >= t && c.isDup).length;
  const fp = cases.filter((c) => c.score >= t && !c.isDup).length;
  const fn = cases.filter((c) => c.score < t && c.isDup).length;
  const precision = tp + fp === 0 ? 1 : tp / (tp + fp);
  const recall = tp + fn === 0 ? 1 : tp / (tp + fn);
  const f1 = precision + recall === 0 ? 0 : (2 * precision * recall) / (precision + recall);
  const p = (v: number) => (v * 100).toFixed(1).padStart(5) + " %";
  console.log(`   ${t.toFixed(2)} | ${p(precision)}   | ${p(recall)} | ${f1.toFixed(3)} | ${String(fp).padStart(2)} | ${String(fn).padStart(2)}`);
}

// Fehlklassifikationen an der aktuellen HIGH-Schwelle
console.log("\nFalsch-Positive bei 0.85 (System sagt Dublette, Mensch sagt nein):");
for (const c of cases.filter((c) => c.score >= 0.85 && !c.isDup))
  console.log(`  ${c.score.toFixed(2)}  ${c.a.firstName} ${c.a.lastName} ≠ ${c.b.firstName} ${c.b.lastName}`);
console.log("\nUebersehene Dubletten bei 0.85 (Mensch sagt ja, System unter Schwelle):");
for (const c of cases.filter((c) => c.score < 0.85 && c.isDup))
  console.log(`  ${c.score.toFixed(2)}  ${c.a.firstName} ${c.a.lastName} = ${c.b.firstName} ${c.b.lastName}`);
