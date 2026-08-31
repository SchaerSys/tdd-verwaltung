"use client";

import { useActionState, useEffect, useState } from "react";
import Link from "next/link";
import { loginAction, listOrganizations, type LoginState } from "./actions";

type Access = "TDD" | "GEMEINDE" | "INSTITUTION";
interface Org { id: number; name: string }

export function LoginForm({ notice }: { notice?: string }) {
  const [access, setAccess] = useState<Access | null>(null);
  const [org, setOrg] = useState<Org | null>(null);
  const [orgs, setOrgs] = useState<Org[]>([]);
  const [q, setQ] = useState("");
  const [state, action, pending] = useActionState<LoginState, FormData>(loginAction, {});

  // Organisationsliste laden, sobald ein Typ gewählt ist
  useEffect(() => {
    if (!access) return;
    if (access === "TDD") {
      listOrganizations("TDD").then((l) => { setOrgs(l); if (l[0]) setOrg(l[0]); });
    } else {
      setOrg(null);
      listOrganizations(access).then(setOrgs);
    }
  }, [access]);

  const filtered = orgs.filter((o) => o.name.toLowerCase().includes(q.toLowerCase()));
  const showLoginForm = access === "TDD" || org !== null;

  return (
    <div className="w-full max-w-sm bg-surface border border-border rounded-card p-6 shadow-sm flex flex-col gap-4">
      <div>
        <div className="text-lg font-semibold">TDD-Verwaltung</div>
        <div className="text-sm text-muted">Anmeldung</div>
      </div>

      {notice ? <div className="text-sm text-[color:var(--good)] bg-[color:var(--good-bg)] border border-[color:var(--good)] rounded px-3 py-2">{notice}</div> : null}

      {/* Schritt 1: Zugang wählen */}
      {!access ? (
        <div className="flex flex-col gap-2">
          <div className="text-xs text-muted font-semibold">Zugang wählen</div>
          <button className="btn" onClick={() => setAccess("TDD")}>🏢 Tischlein deck dich</button>
          <button className="btn" onClick={() => setAccess("GEMEINDE")}>🏛 Gemeinde</button>
          <button className="btn" onClick={() => setAccess("INSTITUTION")}>🤝 Institution</button>
        </div>
      ) : null}

      {/* Schritt 2: Organisation suchen/wählen (Gemeinde/Institution) */}
      {access && access !== "TDD" && !org ? (
        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <div className="text-xs text-muted font-semibold">{access === "GEMEINDE" ? "Gemeinde wählen" : "Institution wählen"}</div>
            <button className="text-xs text-accent hover:underline" onClick={() => { setAccess(null); setQ(""); }}>← zurück</button>
          </div>
          <input autoFocus className="inp" placeholder="🔍 Suchen…" value={q} onChange={(e) => setQ(e.target.value)} />
          <div className="max-h-56 overflow-auto border border-border rounded-[var(--r-sm)]">
            {filtered.map((o) => (
              <button key={o.id} className="w-full text-left px-3 py-2 text-sm hover:bg-surface-2 border-b border-border last:border-0" onClick={() => setOrg(o)}>
                {o.name}
              </button>
            ))}
            {filtered.length === 0 ? <div className="px-3 py-3 text-sm text-muted">Kein Treffer.</div> : null}
          </div>
        </div>
      ) : null}

      {/* Schritt 3: Login */}
      {showLoginForm ? (
        <form action={action} className="flex flex-col gap-4">
          <div className="flex items-center justify-between text-sm">
            <span className="rolepill">{access === "TDD" ? "Tischlein deck dich" : org?.name}</span>
            <button type="button" className="text-xs text-accent hover:underline" onClick={() => { setAccess(null); setOrg(null); setQ(""); }}>ändern</button>
          </div>
          <input type="hidden" name="orgId" value={access === "TDD" ? (org?.id ?? "") : (org?.id ?? "")} />

          {state.error ? (
            <div className="text-sm text-bad bg-[color:var(--bad)]/10 border border-bad rounded px-3 py-2">{state.error}</div>
          ) : null}

          <label className="flex flex-col gap-1 text-xs text-muted font-semibold">E-Mail
            <input name="email" type="email" required autoComplete="username" className="inp" />
          </label>
          <label className="flex flex-col gap-1 text-xs text-muted font-semibold">Passwort
            <input name="password" type="password" required autoComplete="current-password" className="inp" />
          </label>
          <button type="submit" className="btn primary" disabled={pending}>{pending ? "Anmelden…" : "Anmelden"}</button>
        </form>
      ) : null}

      <div className="flex justify-between text-xs pt-3 border-t border-border mt-1">
        <Link href="/passwort-vergessen" className="text-accent hover:underline">Passwort vergessen?</Link>
        <Link href="/registrieren" className="text-accent hover:underline">Registrieren</Link>
      </div>
    </div>
  );
}
