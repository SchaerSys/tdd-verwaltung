"use server";

import { redirect } from "next/navigation";
import { login, completeSecondFactor } from "@/lib/auth";

export interface LoginState { error?: string }

export async function loginAction(_prev: LoginState, formData: FormData): Promise<LoginState> {
  const r = await login(String(formData.get("email") ?? ""), String(formData.get("password") ?? ""));
  if (!r.ok) return { error: "E-Mail oder Passwort ist falsch." };
  redirect(r.needsSecondFactor ? "/login/2fa" : "/");
}

export async function secondFactorAction(_prev: LoginState, formData: FormData): Promise<LoginState> {
  const ok = await completeSecondFactor(String(formData.get("code") ?? ""));
  if (!ok) return { error: "Der Code ist ungültig oder abgelaufen." };
  redirect("/");
}
