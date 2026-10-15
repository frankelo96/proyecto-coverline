/** Zona horaria de la empresa: todas las fechas "de calendario" se calculan en hora argentina. */
export const APP_TIME_ZONE = "America/Argentina/Buenos_Aires";

const isoFormatter = new Intl.DateTimeFormat("en-CA", { timeZone: APP_TIME_ZONE, year: "numeric", month: "2-digit", day: "2-digit" });

/** Fecha AAAA-MM-DD en hora argentina (para nombres de archivo, "hoy", valores por defecto). */
export function isoLocalDate(d: Date = new Date()) {
  return isoFormatter.format(d);
}

/** Hoy + n días, en AAAA-MM-DD (hora argentina). */
export function isoLocalDateIn(days: number, from: Date = new Date()) {
  return isoLocalDate(new Date(from.getTime() + days * 86_400_000));
}
