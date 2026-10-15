/**
 * Códigos de barras EAN-13 (el estándar de los lectores de comercio).
 * Código puro: valida, calcula el dígito verificador y arma las barras para
 * dibujarlas en SVG (etiquetas autoadhesivas y rollos térmicos).
 */

const L = ["0001101", "0011001", "0010011", "0111101", "0100011", "0110001", "0101111", "0111011", "0110111", "0001011"];
const G = ["0100111", "0110011", "0011011", "0100001", "0011101", "0111001", "0000101", "0010001", "0001001", "0010111"];
const R = ["1110010", "1100110", "1101100", "1000010", "1011100", "1001110", "1010000", "1000100", "1001000", "1110100"];
/** Paridad de los 6 dígitos de la izquierda según el primer dígito */
const PARITY = ["LLLLLL", "LLGLGG", "LLGGLG", "LLGGGL", "LGLLGG", "LGGLLG", "LGGGLL", "LGLGLG", "LGLGGL", "LGGLGL"];

/** Dígito verificador de los primeros 12 dígitos. */
export function ean13CheckDigit(first12: string): number {
  let sum = 0;
  for (let i = 0; i < 12; i++) sum += Number(first12[i]) * (i % 2 === 0 ? 1 : 3);
  return (10 - (sum % 10)) % 10;
}

/** Normaliza: UPC-A (12 dígitos) pasa a EAN-13 con un 0 adelante. Null si no es un EAN válido. */
export function normalizeEan13(raw: string): string | null {
  const code = raw.trim();
  const digits = /^\d{12}$/.test(code) ? `0${code}` : code;
  if (!/^\d{13}$/.test(digits)) return null;
  return ean13CheckDigit(digits.slice(0, 12)) === Number(digits[12]) ? digits : null;
}

export const isValidEan13 = (raw: string) => normalizeEan13(raw) !== null;

/** 95 módulos ("1" barra, "0" espacio) de un EAN-13 válido. */
export function ean13Modules(code: string): string {
  const ean = normalizeEan13(code);
  if (!ean) throw new Error(`"${code}" no es un EAN-13 válido`);
  const parity = PARITY[Number(ean[0])];
  let out = "101";
  for (let i = 1; i <= 6; i++) out += (parity[i - 1] === "L" ? L : G)[Number(ean[i])];
  out += "01010";
  for (let i = 7; i <= 12; i++) out += R[Number(ean[i])];
  return out + "101";
}

/** Barras como rectángulos SVG (en módulos); los de guarda son más largos, como en el estándar. */
export function ean13Bars(code: string): { x: number; width: number; guard: boolean }[] {
  const modules = ean13Modules(code);
  const guards = new Set([0, 1, 2, 45, 46, 47, 48, 49, 92, 93, 94]);
  const bars: { x: number; width: number; guard: boolean }[] = [];
  for (let i = 0; i < modules.length; i++) {
    if (modules[i] !== "1") continue;
    const last = bars[bars.length - 1];
    if (last && last.x + last.width === i && last.guard === guards.has(i)) last.width++;
    else bars.push({ x: i, width: 1, guard: guards.has(i) });
  }
  return bars;
}
