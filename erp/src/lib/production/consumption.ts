/**
 * Consumo de materiales de una orden de producción según la ficha técnica,
 * teniendo en cuenta el talle, el color y la tela de cada variante. Código puro.
 */

export interface BomLine {
  rawMaterialId: string;
  /** Consumo neto por prenda del talle de referencia */
  quantity: number;
  wastePct: number;
}

export interface MaterialAlternative {
  /** Aplica a variantes de este color (vacío = cualquier color) */
  color: string | null;
  /** Aplica a variantes de esta tela (vacío = cualquier tela) */
  fabric: string | null;
  rawMaterialId: string;
}

export interface MaterialRule {
  sizeQuantities?: Record<string, number> | null;
  alternatives?: MaterialAlternative[] | null;
}

export interface OrderLine {
  size: string;
  color: string | null;
  fabric: string | null;
  quantity: number;
}

const norm = (s: string | null | undefined) => (s ?? "").trim().toLowerCase();

/** Material que corresponde a la variante: la alternativa más específica que coincide, o el de referencia. */
export function materialFor(line: BomLine, rule: MaterialRule | undefined, v: { color: string | null; fabric: string | null }): string {
  const matches = (rule?.alternatives ?? []).filter(
    (a) => (!norm(a.color) || norm(a.color) === norm(v.color)) && (!norm(a.fabric) || norm(a.fabric) === norm(v.fabric)),
  );
  // Primero la que fija color y tela, después la que fija uno solo.
  matches.sort((a, b) => Number(!!norm(b.color)) + Number(!!norm(b.fabric)) - (Number(!!norm(a.color)) + Number(!!norm(a.fabric))));
  return matches[0]?.rawMaterialId ?? line.rawMaterialId;
}

/** Consumo neto por prenda para un talle (el de la regla si existe, si no el de la ficha). */
export function quantityForSize(line: BomLine, rule: MaterialRule | undefined, size: string): number {
  const bySize = rule?.sizeQuantities ?? {};
  const key = Object.keys(bySize).find((k) => norm(k) === norm(size));
  const q = key !== undefined ? Number(bySize[key]) : line.quantity;
  return Number.isFinite(q) && q >= 0 ? q : line.quantity;
}

/**
 * Consumo bruto (con merma) por material para toda la orden.
 * Devuelve un mapa materialId → cantidad, redondeada a 4 decimales.
 */
export function orderConsumption(bom: BomLine[], rules: Map<string, MaterialRule>, items: OrderLine[]): Map<string, number> {
  const out = new Map<string, number>();
  for (const line of bom) {
    const rule = rules.get(line.rawMaterialId);
    for (const it of items) {
      if (it.quantity <= 0) continue;
      const materialId = materialFor(line, rule, it);
      const gross = quantityForSize(line, rule, it.size) * (1 + line.wastePct / 100) * it.quantity;
      out.set(materialId, (out.get(materialId) ?? 0) + gross);
    }
  }
  for (const [k, v] of out) out.set(k, Math.round(v * 10_000) / 10_000);
  return out;
}

/** "S=1.1, XL=1.6" ⇄ { S: 1.1, XL: 1.6 } (para cargar el consumo por talle en una línea de texto). */
export function parseSizeQuantities(text: string): Record<string, number> | string {
  const out: Record<string, number> = {};
  // Separadores: ";", salto de línea o una coma seguida de otro "TALLE=" (la coma decimal no corta).
  for (const part of text.split(/[;\n]|,(?=\s*[\p{L}\d]+\s*[=:])/u)) {
    const p = part.trim();
    if (!p) continue;
    const m = p.match(/^([^=:]+)[=:]\s*([\d.,]+)$/);
    if (!m) return `No se entiende "${p}": usá TALLE=CONSUMO, por ejemplo XL=1,6`;
    const q = Number(m[2].replace(",", "."));
    if (!Number.isFinite(q) || q < 0) return `Consumo inválido en "${p}"`;
    out[m[1].trim().toUpperCase()] = q;
  }
  return out;
}

export const formatSizeQuantities = (q: Record<string, number> | null | undefined) =>
  Object.entries(q ?? {})
    .map(([k, v]) => `${k}=${String(v).replace(".", ",")}`)
    .join(", ");
