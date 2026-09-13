// Edge-sichere Konstanten (kein node:crypto) – auch aus der Middleware nutzbar.
export const SESSION_COOKIE = "tdd_session";
export const SESSION_MAX_AGE = 60 * 60 * 8; // 8 Stunden

/** Mindestlänge für Passwörter – gilt für Registrierung, Reset und Selbst-Service. */
export const MIN_PASSWORD_LENGTH = 10;
