export interface VerlaufEintrag { id: string; seite: string; autor: string; text: string; am: string }

/**
 * Nachrichtenverlauf zu einem Antrag, gleich auf beiden Seiten (Portal und TDD-Buero).
 * `eigeneSeite` bestimmt nur die Ausrichtung – rechts die eigenen, links die anderen.
 */
export function Verlauf({ nachrichten, eigeneSeite, action, antragId, hinweis, deaktiviert }: {
  nachrichten: VerlaufEintrag[];
  eigeneSeite: "ORG" | "TDD";
  action: (fd: FormData) => Promise<void>;
  antragId: string;
  hinweis: string;
  deaktiviert?: string;
}) {
  return (
    <div className="p-4 flex flex-col gap-3">
      {nachrichten.length === 0 ? <div className="text-[.75rem] text-muted">Noch keine Nachrichten.</div> : (
        <ul className="flex flex-col gap-2">
          {nachrichten.map((n) => {
            const eigen = n.seite === eigeneSeite;
            return (
              <li key={n.id} className="flex" style={{ justifyContent: eigen ? "flex-end" : "flex-start" }}>
                <div className="rounded-xl px-3 py-2 text-[.8125rem]" style={{
                  maxWidth: "80%", background: eigen ? "var(--accent-bg, var(--surface-2))" : "var(--surface-2)",
                  border: "1px solid var(--border)", borderTopRightRadius: eigen ? 4 : undefined, borderTopLeftRadius: eigen ? undefined : 4,
                }}>
                  <div className="text-[.68rem] text-muted mb-1">{n.seite === "TDD" ? "TDD" : "Organisation"}{n.autor ? ` · ${n.autor}` : ""} · {n.am}</div>
                  <div style={{ whiteSpace: "pre-wrap" }}>{n.text}</div>
                </div>
              </li>
            );
          })}
        </ul>
      )}
      {deaktiviert ? <div className="text-[.75rem] text-muted">{deaktiviert}</div> : (
        <form action={action} className="flex flex-col gap-2 border-t border-[color:var(--border)] pt-3">
          <input type="hidden" name="antragId" value={antragId} />
          <textarea name="text" className="inp" rows={3} maxLength={4000} required placeholder={eigeneSeite === "ORG" ? "Rückfrage an TDD …" : "Antwort an die Organisation …"} />
          <div className="flex items-center gap-3">
            <button className="btn primary sm" type="submit">Senden</button>
            <span className="text-[.72rem] text-muted">{hinweis}</span>
          </div>
        </form>
      )}
    </div>
  );
}
