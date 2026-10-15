/**
 * Períodos de finanzas en hora argentina (UTC−3, sin horario de verano). Código puro.
 */

const TZ_OFFSET = "-03:00";
const pad = (n: number) => String(n).padStart(2, "0");

/** "2026-10" → límites del mes [desde, hasta) en hora argentina. */
export function monthBounds(period: string): { from: Date; to: Date } {
  const m = /^(\d{4})-(\d{2})$/.exec(period);
  if (!m) throw new Error(`Período inválido: ${period}`);
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const ny = mo === 12 ? y + 1 : y;
  const nm = mo === 12 ? 1 : mo + 1;
  return { from: new Date(`${y}-${pad(mo)}-01T00:00:00${TZ_OFFSET}`), to: new Date(`${ny}-${pad(nm)}-01T00:00:00${TZ_OFFSET}`) };
}

/** Mes anterior / siguiente de "AAAA-MM". */
export function shiftMonth(period: string, delta: number): string {
  const [y, m] = period.split("-").map(Number);
  const idx = y * 12 + (m - 1) + delta;
  return `${Math.floor(idx / 12)}-${pad((idx % 12) + 1)}`;
}

export interface WeekBucket {
  index: number;
  from: Date;
  to: Date;
  label: string;
}

/**
 * Semanas desde hoy (la primera arranca hoy a las 00:00 hora argentina). Lo vencido
 * antes de hoy se imputa a la primera semana.
 */
export function weekBuckets(todayIso: string, weeks: number): WeekBucket[] {
  const start = new Date(`${todayIso}T00:00:00${TZ_OFFSET}`);
  const fmt = new Intl.DateTimeFormat("es-AR", { day: "2-digit", month: "2-digit", timeZone: "America/Argentina/Buenos_Aires" });
  return Array.from({ length: weeks }, (_, i) => {
    const from = new Date(start.getTime() + i * 7 * 86_400_000);
    const to = new Date(from.getTime() + 7 * 86_400_000);
    return { index: i, from, to, label: `${fmt.format(from)} al ${fmt.format(new Date(to.getTime() - 86_400_000))}` };
  });
}

/** Semana en la que cae una fecha (lo vencido va a la primera; lo posterior al horizonte, null). */
export function bucketOf(buckets: WeekBucket[], date: Date): number | null {
  if (buckets.length === 0) return null;
  if (date < buckets[0].to) return 0;
  const b = buckets.find((x) => date >= x.from && date < x.to);
  return b ? b.index : null;
}

/** Semanas promedio por mes, para prorratear gastos fijos mensuales. */
export const WEEKS_PER_MONTH = 52 / 12;
