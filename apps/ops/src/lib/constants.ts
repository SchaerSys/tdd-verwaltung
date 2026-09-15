// Edge-sichere Konstanten (kein node:crypto) – auch aus der Middleware nutzbar.
export const SESSION_COOKIE = "tdd_ops_session";
export const SESSION_MAX_AGE = 60 * 60 * 4; // 4 Stunden – Wartung, keine Dauersitzung
export const PRE_AUTH_COOKIE = "tdd_ops_preauth";
export const PRE_AUTH_MAX_AGE = 5 * 60;
export const MIN_PASSWORD_LENGTH = 12;
