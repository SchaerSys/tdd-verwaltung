/** Nach einem Deploy fehlen dem offenen Tab die alten JS-Bausteine – dann hilft nur neu laden. */
export function istVeralteterStand(e: { message?: string; name?: string }): boolean {
  const t = `${e.name ?? ""} ${e.message ?? ""}`;
  return /ChunkLoadError|Loading chunk|Loading CSS chunk|dynamically imported module|Failed to fetch|NetworkError|text\/html/i.test(t);
}
