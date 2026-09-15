/**
 * Vollstaendigkeits-Checkliste fuer einen Antrag. Gleiche Regeln im Formular (live)
 * und auf der Antragsseite (vor dem Bescheid). Pflicht blockiert den positiven
 * Bescheid, Empfehlung nur ein Hinweis.
 */
export interface CheckEingabe {
  firstName: string; lastName: string; email: string; birthDate: string; address: string;
  postalCode: string; city: string; phone: string; consent: boolean;
  intendedLocationId: string | number | null;
  einnahmenErfasst: boolean;
  dokumente?: string[]; // docTypes, nur auf der Antragsseite bekannt
}

export interface CheckPunkt { key: string; label: string; ok: boolean; pflicht: boolean; hinweis?: string }

export function antragCheck(e: CheckEingabe): CheckPunkt[] {
  const docs = e.dokumente;
  const punkte: CheckPunkt[] = [
    { key: "name", label: "Vor- und Nachname", ok: !!e.firstName.trim() && !!e.lastName.trim(), pflicht: true },
    { key: "email", label: "E-Mail-Adresse (Bescheid-Versand)", ok: /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e.email.trim()), pflicht: true },
    { key: "consent", label: "DSGVO-Einwilligung liegt vor", ok: e.consent, pflicht: true, hinweis: "Ohne Einwilligung darf der Antrag nicht an TDD übergeben werden." },
    { key: "birth", label: "Geburtsdatum", ok: /^\d{4}-\d{2}-\d{2}$/.test(e.birthDate), pflicht: false, hinweis: "Wichtig für die Dublettenprüfung bei TDD – ohne Geburtsdatum kann eine Person nicht sicher erkannt werden." },
    { key: "adresse", label: "Adresse mit PLZ und Ort", ok: !!e.address.trim() && !!e.postalCode.trim() && !!e.city.trim(), pflicht: false },
    { key: "phone", label: "Telefonnummer", ok: !!e.phone.trim(), pflicht: false, hinweis: "Für Rückfragen der Ausgabestelle." },
    { key: "standort", label: "Bezugsort (Standort) gewählt", ok: !!e.intendedLocationId && String(e.intendedLocationId) !== "", pflicht: false, hinweis: "Ohne Standort kann TDD keine Karte ausstellen; die Zuordnung erfolgt dann bei TDD." },
    { key: "einnahmen", label: "Einnahmen erfasst", ok: e.einnahmenErfasst, pflicht: false, hinweis: "Ohne Einnahmen ist die Anspruchsprüfung nicht aussagekräftig." },
  ];
  if (docs) {
    punkte.push({ key: "doc_ausweis", label: "Ausweis hochgeladen", ok: docs.includes("AUSWEIS"), pflicht: false });
    punkte.push({ key: "doc_einkommen", label: "Einkommensnachweis (Kontoauszug) hochgeladen", ok: docs.includes("KONTOAUSZUG"), pflicht: false });
  }
  return punkte;
}

export function checkZusammenfassung(p: CheckPunkt[]): { pflichtFehlt: CheckPunkt[]; empfohlenFehlt: CheckPunkt[]; vollstaendig: boolean } {
  const pflichtFehlt = p.filter((x) => x.pflicht && !x.ok);
  const empfohlenFehlt = p.filter((x) => !x.pflicht && !x.ok);
  return { pflichtFehlt, empfohlenFehlt, vollstaendig: pflichtFehlt.length === 0 && empfohlenFehlt.length === 0 };
}
