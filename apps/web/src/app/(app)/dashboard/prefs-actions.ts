"use server";

import { revalidatePath } from "next/cache";
import { getCurrentUser } from "@/lib/auth";
import { getPrefs, savePrefs, sameWidget, type WidgetSpec } from "@/lib/dashboard-prefs";
import { isFavoritable } from "@/lib/nav";

export async function addFavorite(href: string): Promise<void> {
  const u = await getCurrentUser();
  if (!u || !isFavoritable(href)) return;
  const p = await getPrefs(u.id);
  if (!p.favorites.includes(href)) {
    p.favorites = [...p.favorites, href];
    await savePrefs(u.id, p);
  }
  revalidatePath("/dashboard");
}

export async function removeFavorite(href: string): Promise<void> {
  const u = await getCurrentUser();
  if (!u) return;
  const p = await getPrefs(u.id);
  p.favorites = p.favorites.filter((h) => h !== href);
  await savePrefs(u.id, p);
  revalidatePath("/dashboard");
}

export async function addWidget(spec: WidgetSpec): Promise<void> {
  const u = await getCurrentUser();
  if (!u) return;
  const p = await getPrefs(u.id);
  if (!p.widgets.some((w) => sameWidget(w, spec))) {
    p.widgets = [...p.widgets, spec];
    await savePrefs(u.id, p);
  }
  revalidatePath("/dashboard");
}

export async function removeWidget(spec: WidgetSpec): Promise<void> {
  const u = await getCurrentUser();
  if (!u) return;
  const p = await getPrefs(u.id);
  p.widgets = p.widgets.filter((w) => !sameWidget(w, spec));
  await savePrefs(u.id, p);
  revalidatePath("/dashboard");
}

export async function setNavCollapsed(collapsed: boolean): Promise<void> {
  const u = await getCurrentUser();
  if (!u) return;
  const p = await getPrefs(u.id);
  p.navCollapsed = collapsed;
  await savePrefs(u.id, p);
}
