import { readFile, writeFile, unlink, stat, statfs } from "node:fs/promises";
import { join } from "node:path";

/**
 * Bruecke zum Host ohne Docker-Rechte im Container: Die Wartungsplattform legt
 * Anfrage-Dateien in OPS_DIR (/opt/tdd/ops) ab, ein Cron-Agent auf dem Host
 * (scripts/ops-agent.sh, jede Minute) fuehrt sie aus und schreibt das Ergebnis.
 * Der Wartungsmodus ist nur eine Datei, die Caddy per file-Matcher prueft.
 */
const OPS_DIR = () => process.env.OPS_DIR ?? "/ops";
const HOST_DIR = () => process.env.HOST_DIR ?? "/host"; // /opt/tdd, nur lesend

export type Anfrage = "backup" | "restart";

export async function anfrageStellen(art: Anfrage, akteur: string): Promise<void> {
  await writeFile(join(OPS_DIR(), `${art}.request`), `${new Date().toISOString()} ${akteur}\n`, { flag: "w" });
}

export async function anfrageOffen(art: Anfrage): Promise<boolean> {
  return stat(join(OPS_DIR(), `${art}.request`)).then(() => true, () => false);
}

export async function letztesErgebnis(art: Anfrage): Promise<string | null> {
  return readFile(join(OPS_DIR(), `${art}.result`), "utf8").catch(() => null);
}

export async function wartungsmodus(): Promise<boolean> {
  return stat(join(OPS_DIR(), "wartung.flag")).then(() => true, () => false);
}

export async function wartungsmodusSetzen(an: boolean, akteur: string): Promise<void> {
  const p = join(OPS_DIR(), "wartung.flag");
  if (an) await writeFile(p, `${new Date().toISOString()} ${akteur}\n`);
  else await unlink(p).catch(() => undefined);
}

/** Letzte Zeilen einer Host-Datei (Backup-Log, Migrationsbuch). */
export async function hostDatei(name: string, zeilen = 20): Promise<string[]> {
  const t = await readFile(join(HOST_DIR(), name), "utf8").catch(() => "");
  const alle = t.split("\n").filter(Boolean);
  return alle.slice(-zeilen);
}

export interface Platte { freiGb: number; gesamtGb: number; belegtProzent: number }

export async function platte(pfad = HOST_DIR()): Promise<Platte | null> {
  try {
    const s = await statfs(pfad);
    const gesamt = Number(s.blocks) * Number(s.bsize);
    const frei = Number(s.bavail) * Number(s.bsize);
    const gb = (b: number) => Math.round((b / 1024 ** 3) * 10) / 10;
    return { freiGb: gb(frei), gesamtGb: gb(gesamt), belegtProzent: gesamt ? Math.round(((gesamt - frei) / gesamt) * 100) : 0 };
  } catch {
    return null;
  }
}
