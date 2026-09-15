import Link from "next/link";
import { getCurrentUser } from "@/lib/auth";
import { ladePortalAntraege, portalKennzahlen, type PortalAntrag } from "@/lib/portal-daten";
import { AntragTabelle } from "@/components/portal/AntragTabelle";
import { fmtDate } from "@/lib/format";

/**
 * Startseite des Portals – je nach Organisation anders:
 *  Gemeinde:    Sozialamt-Sicht – Antraege der Buerger:innen, Aufgaben, Kennzahlen.
 *  Institution: Betreuungs-Sicht – Klient:innen nach Stand (in Versorgung / offen /
 *               faellig), Wohnort sichtbar, weil Klient:innen aus mehreren Gemeinden kommen.
 */
export default async function PortalStart() {
  const user = await getCurrentUser();
  const orgId = user?.organizationId ?? 0;
  const liste = orgId ? await ladePortalAntraege(orgId) : [];
  const k = portalKennzahlen(liste);
  const institution = user?.organizationType === "INSTITUTION";
  const klient = institution ? "Klient/in" : "Antragsteller/in";

  type Aufgabe = { text: string; href: string; n: number; ton: "warn" | "bad" | "tag-out" };
  const aufgaben = ([
    { text: "Neue Antworten von TDD", href: "/portal/antraege?filter=antworten", n: k.neueAntworten.length, ton: "warn" },
    { text: "Anträge ohne Bescheid", href: "/portal/antraege?filter=offen", n: k.offen.length, ton: "tag-out" },
    { text: "Offene Anträge ohne DSGVO-Einwilligung", href: "/portal/antraege?filter=einwilligung", n: k.ohneEinwilligung.length, ton: "bad" },
    { text: "Karte läuft ab / abgelaufen – Verlängerung nötig", href: "/portal/pruefung", n: k.faellig.length, ton: "warn" },
  ] satisfies Aufgabe[]).filter((a) => a.n > 0);

  return (
    <div>
      <div className="page-h">
        <div>
          <h1>{institution ? "Klient/innen" : "Anträge"}</h1>
          <div className="sub">{user?.organizationName} · {institution ? "Institution" : "Gemeinde"} · {liste.length} {liste.length === 1 ? "Antrag" : "Anträge"} gesamt</div>
        </div>
        <div className="flex gap-2">
          <Link href="/portal/statistik" className="btn ghost">Statistik</Link>
          <Link href="/portal/neu" className="btn primary">＋ Neuer Antrag</Link>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 mb-4">
        <Kachel label="Offen / in Prüfung" n={k.offen.length} href="/portal/antraege?filter=offen" />
        <Kachel label="Bei TDD in Übernahme" n={k.beiTdd.length} href="/portal/antraege?filter=tdd" />
        <Kachel label={institution ? "In Versorgung (Karte aktiv)" : "Versorgt (Karte aktiv)"} n={k.versorgt.length} href="/portal/antraege?filter=versorgt" ton="good" />
        <Kachel label="Verlängerung fällig" n={k.faellig.length} href="/portal/pruefung" ton={k.faellig.length ? "warn" : undefined} />
      </div>

      {aufgaben.length > 0 ? (
        <div className="panel mb-4">
          <div className="panel-h"><h3>Aufgaben</h3><span className="pill muted">{aufgaben.length}</span></div>
          <ul className="p-2 flex flex-col">
            {aufgaben.map((a) => (
              <li key={a.href + a.text}>
                <Link href={a.href} className="flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-[color:var(--surface-2)] no-underline text-[color:var(--text)] text-[.8125rem]">
                  <span className={`pill ${a.ton}`}>{a.n}</span><span>{a.text}</span><span className="ml-auto text-muted">→</span>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {institution ? <InstitutionStart liste={liste} klient={klient} /> : <GemeindeStart liste={liste} klient={klient} />}
    </div>
  );
}

function Kachel({ label, n, href, ton }: { label: string; n: number; href: string; ton?: "good" | "warn" }) {
  return (
    <Link href={href} className="panel p-4 no-underline text-[color:var(--text)] hover:border-[color:var(--accent)]" style={ton ? { borderColor: `var(--${ton})` } : undefined}>
      <div className="text-[1.6rem] font-bold mono" style={ton ? { color: `var(--${ton})` } : undefined}>{n}</div>
      <div className="text-[.75rem] text-muted">{label}</div>
    </Link>
  );
}

/** Gemeinde: zuletzt gestellte Antraege, Rest ueber die Liste. */
function GemeindeStart({ liste, klient }: { liste: PortalAntrag[]; klient: string }) {
  const neueste = liste.slice(0, 15);
  return (
    <div className="panel">
      <div className="panel-h"><h3>Zuletzt gestellte Anträge</h3><Link href="/portal/antraege" className="btn ghost sm" style={{ marginLeft: "auto" }}>Alle Anträge →</Link></div>
      <AntragTabelle liste={neueste} klientBegriff={klient} mitOrt={false} leer="Noch keine Anträge. Über „Neuer Antrag“ starten." />
    </div>
  );
}

/** Institution: Klient:innen nach Betreuungsstand gruppiert. */
function InstitutionStart({ liste, klient }: { liste: PortalAntrag[]; klient: string }) {
  const k = portalKennzahlen(liste);
  const gruppen: { titel: string; hinweis: string; eintraege: PortalAntrag[] }[] = [
    { titel: "Handlungsbedarf", hinweis: "Karte läuft ab oder ist abgelaufen – Verlängerungsantrag stellen.", eintraege: k.faellig },
    { titel: "Offen / in Prüfung", hinweis: "Antrag erfasst, Bescheid steht aus.", eintraege: k.offen },
    { titel: "Bei TDD", hinweis: "Positiv beschieden, Übernahme oder Kartenausstellung bei TDD läuft.", eintraege: k.beiTdd },
    { titel: "In Versorgung", hinweis: "Karte aktiv – die Person kann beziehen.", eintraege: k.versorgt.filter((a) => !k.faellig.includes(a)) },
  ];
  return (
    <div className="flex flex-col gap-4">
      {gruppen.map((g) => (
        <div className="panel" key={g.titel}>
          <div className="panel-h"><h3>{g.titel}</h3><span className="pill muted">{g.eintraege.length}</span><span className="text-xs text-muted" style={{ marginLeft: 8 }}>{g.hinweis}</span></div>
          {g.eintraege.length ? <AntragTabelle liste={g.eintraege} klientBegriff={klient} mitOrt leer="" /> : <div className="p-4 text-[.75rem] text-muted">Niemand in dieser Gruppe.</div>}
        </div>
      ))}
      <div className="panel">
        <div className="panel-h"><h3>Abgeschlossen</h3><span className="pill muted">{k.negativ.length} negativ</span><Link href="/portal/antraege" className="btn ghost sm" style={{ marginLeft: "auto" }}>Alle Anträge →</Link></div>
        <div className="p-4 text-[.75rem] text-muted">Negativ beschiedene und ältere Anträge finden Sie in der vollständigen Liste. Letzter Antrag: {liste[0] ? fmtDate(liste[0].createdAt) : "—"}.</div>
      </div>
    </div>
  );
}
