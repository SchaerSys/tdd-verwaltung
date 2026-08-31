"use client";

import { useActionState, useEffect, useState } from "react";
import Link from "next/link";
import { registerSachbearbeiter, listOrganizations, type FormState } from "../login/actions";

type Access = "GEMEINDE" | "INSTITUTION";
interface Org { id: number; name: string }

export function RegisterForm() {
  const [access, setAccess] = useState<Access | null>(null);
  const [org, setOrg] = useState<Org | null>(null);
  const [orgs, setOrgs] = useState<Org[]>([]);
  const [q, setQ] = useState("");
  const [state, action, pending] = useActionState<FormState, FormData>(registerSachbearbeiter, {});

  useEffect(() => { if (access) { setOrg(null); listOrganizations(access).then(setOrgs); } }, [access]);
  const filtered = orgs.filter((o) => o.name.toLowerCase().includes(q.toLowerCase()));

  if (state.done) {
    return (
      <div className="w-full max-w-sm bg-surface border border-border rounded-card p-6 shadow-sm flex flex-col gap-3">
        <div className="text-lg font-semibold">Fast fertig</div>
        <div className="text-sm text-[color:var(--good)] bg-[color:var(--good-bg)] border border-[color:var(--good)] rounded px-3 py-2">{state.info}</div>
        <Link href="/login" className="text-xs text-accent hover:underline">← Zum Login</Link>
      </div>
    );
  }

  return (
    <div className="w-full max-w-sm bg-surface border border-border rounded-card p-6 shadow-sm flex flex-col gap-4">
      <div><div className="text-lg font-semibold">Registrieren</div><div className="text-sm text-muted">Als Sachbearbeiter/in einer Gemeinde oder Institution.</div></div>

      {!access ? (
        <div className="flex flex-col gap-2">
          <div className="text-xs text-muted font-semibold">Art der Stelle</div>
          <button className="btn" onClick={() => setAccess("GEMEINDE")}>🏛 Gemeinde</button>
          <button className="btn" onClick={() => setAccess("INSTITUTION")}>🤝 Institution</button>
        </div>
      ) : !org ? (
        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <div className="text-xs text-muted font-semibold">{access === "GEMEINDE" ? "Gemeinde wählen" : "Institution wählen"}</div>
            <button className="text-xs text-accent hover:underline" onClick={() => { setAccess(null); setQ(""); }}>← zurück</button>
          </div>
          <input autoFocus className="inp" placeholder="🔍 Suchen…" value={q} onChange={(e) => setQ(e.target.value)} />
          <div className="max-h-52 overflow-auto border border-border rounded-[var(--r-sm)]">
            {filtered.map((o) => (
              <button key={o.id} className="w-full text-left px-3 py-2 text-sm hover:bg-surface-2 border-b border-border last:border-0" onClick={() => setOrg(o)}>{o.name}</button>
            ))}
            {filtered.length === 0 ? <div className="px-3 py-3 text-sm text-muted">Kein Treffer.</div> : null}
          </div>
        </div>
      ) : (
        <form action={action} className="flex flex-col gap-3">
          <div className="flex items-center justify-between text-sm">
            <span className="rolepill">{org.name}</span>
            <button type="button" className="text-xs text-accent hover:underline" onClick={() => { setAccess(null); setOrg(null); setQ(""); }}>ändern</button>
          </div>
          <input type="hidden" name="orgId" value={org.id} />
          {state.error ? <div className="text-sm text-bad bg-[color:var(--bad)]/10 border border-bad rounded px-3 py-2">{state.error}</div> : null}
          <label className="flex flex-col gap-1 text-xs text-muted font-semibold">Name
            <input name="displayName" required className="inp" /></label>
          <label className="flex flex-col gap-1 text-xs text-muted font-semibold">E-Mail
            <input name="email" type="email" required autoComplete="username" className="inp" /></label>
          <label className="flex flex-col gap-1 text-xs text-muted font-semibold">Passwort (mind. 8 Zeichen)
            <input name="password" type="password" required minLength={8} autoComplete="new-password" className="inp" /></label>
          <button type="submit" className="btn primary" disabled={pending}>{pending ? "Registriere…" : "Registrieren"}</button>
        </form>
      )}
      <Link href="/login" className="text-xs text-accent hover:underline">← Zum Login</Link>
    </div>
  );
}
