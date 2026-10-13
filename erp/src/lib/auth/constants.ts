/** Compartido entre proxy.ts (edge) y el servidor: no importar nada de Node acá. */
export const SESSION_COOKIE = "cl_session";
export const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;
export const MAX_FAILED_LOGINS = 5;
export const LOCKOUT_MS = 15 * 60 * 1000;
