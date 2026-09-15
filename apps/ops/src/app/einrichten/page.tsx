import { notFound } from "next/navigation";
import { einrichtungOffen } from "./actions";
import { SetupForm } from "./SetupForm";

export const dynamic = "force-dynamic";

/** Nur erreichbar, solange noch kein Wartungskonto existiert. */
export default async function EinrichtenSeite() {
  if (!(await einrichtungOffen())) notFound();
  return (
    <main className="min-h-screen flex flex-col items-center justify-center p-6 gap-2">
      <SetupForm />
    </main>
  );
}
