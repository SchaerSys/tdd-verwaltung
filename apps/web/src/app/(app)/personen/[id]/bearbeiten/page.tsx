import Link from "next/link";
import { redirect, notFound } from "next/navigation";
import { and, asc, eq } from "drizzle-orm";
import { persons, personLocationAssignments, locations, lookupLists, lookupValues } from "@tdd/db";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { hasPermission } from "@/lib/rbac";
import { updatePerson, uploadPersonPhoto } from "./actions";

async function valuesFor(code: string) {
  const list = await db().select().from(lookupLists).where(eq(lookupLists.code, code)).limit(1);
  if (!list[0]) return [];
  return db().select({ id: lookupValues.id, label: lookupValues.label }).from(lookupValues)
    .where(and(eq(lookupValues.listId, list[0].id), eq(lookupValues.isActive, true))).orderBy(asc(lookupValues.sort));
}

export default async function EditPersonPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user || !hasPermission(user.role, "person:write")) redirect("/dashboard");
  const { id } = await params;

  const rows = await db().select().from(persons).where(eq(persons.id, id)).limit(1);
  const p = rows[0];
  if (!p) notFound();

  const [languages, origins, locs, assignment] = await Promise.all([
    valuesFor("language"), valuesFor("origin"),
    db().select({ id: locations.id, name: locations.name, groupCount: locations.groupCount }).from(locations).where(eq(locations.isActive, true)).orderBy(asc(locations.type), asc(locations.name)),
    db().select({ locationId: personLocationAssignments.locationId }).from(personLocationAssignments)
      .where(and(eq(personLocationAssignments.personId, id), eq(personLocationAssignments.isActive, true))).limit(1),
  ]);
  const curLoc = assignment[0]?.locationId ?? "";
  const curGroupCount = locs.find((l) => l.id === curLoc)?.groupCount ?? 8;

  return (
    <div>
      <div className="page-h">
        <div><h1>Person bearbeiten</h1><div className="sub">{p.firstName} {p.lastName}</div></div>
        <Link href={`/personen/${id}`} className="btn ghost">← Zurück</Link>
      </div>

      <form action={updatePerson} className="panel">
        <input type="hidden" name="personId" value={id} />
        <div className="panel-h"><h3>Stammdaten</h3></div>
        <div className="p-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="field"><label className="lbl">Nachname *</label><input name="lastName" className="inp" required defaultValue={p.lastName} /></div>
            <div className="field"><label className="lbl">Vorname *</label><input name="firstName" className="inp" required defaultValue={p.firstName} /></div>
            <div className="field"><label className="lbl">Geburtsdatum</label><input name="birthDate" type="date" className="inp mono" defaultValue={p.birthDate ?? ""} /></div>
            <div className="field"><label className="lbl">Telefon</label><input name="phone" className="inp mono" defaultValue={p.phone ?? ""} /></div>
            <div className="field sm:col-span-2"><label className="lbl">Adresse</label><input name="address" className="inp" defaultValue={p.address ?? ""} /></div>
            <div className="field"><label className="lbl">PLZ</label><input name="postalCode" className="inp mono" defaultValue={p.postalCode ?? ""} /></div>
            <div className="field"><label className="lbl">Ort</label><input name="city" className="inp" defaultValue={p.city ?? ""} /></div>
            <div className="field"><label className="lbl">E-Mail</label><input name="email" type="email" className="inp" defaultValue={p.email ?? ""} /></div>
            <div className="field"><label className="lbl">Bezugsort</label>
              <select name="locationId" className="inp" defaultValue={curLoc}>
                <option value="">— kein Standort —</option>
                {locs.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
              </select></div>
            <div className="field"><label className="lbl">Gruppe</label>
              <select name="gruppe" className="inp" defaultValue={p.gruppe ?? ""}>
                <option value="">—</option>
                {Array.from({ length: curGroupCount }, (_, i) => i + 1).map((g) => <option key={g} value={g}>Gruppe {g}</option>)}
              </select></div>
            <div className="field"><label className="lbl">Nummer</label><input name="nummer" className="inp mono" inputMode="numeric" defaultValue={p.ausgabeNumber ?? ""} /></div>
            <div className="field"><label className="lbl">Erwachsene</label><input name="adults" className="inp mono" inputMode="numeric" defaultValue={p.householdSize != null ? Math.max(0, p.householdSize - (p.childrenCount ?? 0)) : ""} /></div>
            <div className="field"><label className="lbl">Kinder</label><input name="childrenCount" className="inp mono" inputMode="numeric" defaultValue={p.childrenCount ?? ""} /></div>
            <div className="field"><label className="lbl">Sprache</label>
              <select name="languageId" className="inp" defaultValue={p.languageId ?? ""}><option value="">—</option>
                {languages.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}</select></div>
            <div className="field"><label className="lbl">Herkunft</label>
              <select name="originId" className="inp" defaultValue={p.originId ?? ""}><option value="">—</option>
                {origins.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}</select></div>
            <div className="field sm:col-span-2"><label className="lbl">Notiz</label><input name="note" className="inp" defaultValue={p.note ?? ""} /></div>
            <div className="field sm:col-span-2">
              <label className="flex items-center gap-2 text-[.9rem]">
                <input type="checkbox" name="consent" value="1" defaultChecked={!!p.consentAt} />
                DSGVO-Einwilligung liegt vor{p.consentAt ? ` (seit ${new Date(p.consentAt).toLocaleDateString("de-AT")})` : ""}
              </label>
            </div>
          </div>
          <div className="flex gap-2 justify-end mt-4">
            <Link href={`/personen/${id}`} className="btn ghost">Abbrechen</Link>
            <button type="submit" className="btn primary">Speichern</button>
          </div>
        </div>
      </form>

      <form action={uploadPersonPhoto} encType="multipart/form-data" className="panel mt-4">
        <input type="hidden" name="personId" value={id} />
        <div className="panel-h"><h3>Erkennungsfoto</h3><span className="sub">für die Ausgabe am Tresen</span></div>
        <div className="p-4 flex items-center gap-4 flex-wrap">
          <div className="photo-thumb">
            {p.photoRef
              ? <img src={`/foto/${id}`} alt="Aktuelles Foto" />
              : <span className="muted">kein Foto</span>}
          </div>
          <div className="field flex-1 min-w-0">
            <label className="lbl">Neues Foto (JPG, PNG oder WebP, max. 8 MB)</label>
            <input type="file" name="photo" accept="image/jpeg,image/png,image/webp" className="inp" required />
            <div className="sub mt-1">Wird beim Hochladen ersetzt. Sichtbar für Kasse/Ausgabe, nicht Teil der Dokumente.</div>
          </div>
          <button type="submit" className="btn primary">Foto speichern</button>
        </div>
      </form>
    </div>
  );
}
