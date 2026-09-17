"use server";

import { revalidatePath } from "next/cache";
import { requireSuper } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { anfrageStellen, wartungsmodusSetzen } from "@/lib/host";

/** Backup jetzt: Anfrage-Datei, der Host-Agent (Cron, jede Minute) fuehrt backup.sh aus. */
export async function backupJetzt(): Promise<void> {
  const ops = await requireSuper();
  await anfrageStellen("backup", ops.email);
  await audit({ akteur: ops.email, action: "backup.request", entityType: "system" });
  revalidatePath("/wartung");
}

/** Fach-App neu starten (Container), z. B. nach Aenderung der Umgebungsvariablen. */
export async function neustartFachApp(): Promise<void> {
  const ops = await requireSuper();
  await anfrageStellen("restart", ops.email);
  await audit({ akteur: ops.email, action: "restart.request", entityType: "system" });
  revalidatePath("/wartung");
}

export async function wartungsmodus(fd: FormData): Promise<void> {
  const ops = await requireSuper();
  const an = String(fd.get("an")) === "1";
  await wartungsmodusSetzen(an, ops.email);
  await audit({ akteur: ops.email, action: an ? "maintenance.on" : "maintenance.off", entityType: "system" });
  revalidatePath("/wartung");
  revalidatePath("/", "layout");
}
