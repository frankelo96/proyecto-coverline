/**
 * Variantes de producto: un producto (ej. "Remera algodón La Salle") tiene
 * combinaciones de talle × color × tela, cada una con su SKU, código de
 * barras y stock. Código puro y testeado.
 */

export interface VariantAttrs {
  size: string;
  color?: string | null;
  fabric?: string | null;
}

/** Orden de talles para mostrar la curva de forma natural (letras, números y el resto alfabético). */
const SIZE_ORDER = ["XXS", "XS", "S", "M", "L", "XL", "XXL", "XXXL", "4XL", "5XL"];
export const compareSizes = (a: string, b: string) => {
  const ia = SIZE_ORDER.indexOf(a.toUpperCase());
  const ib = SIZE_ORDER.indexOf(b.toUpperCase());
  if (ia !== -1 && ib !== -1) return ia - ib;
  const na = Number(a);
  const nb = Number(b);
  if (!Number.isNaN(na) && !Number.isNaN(nb)) return na - nb;
  if (!Number.isNaN(na)) return -1;
  if (!Number.isNaN(nb)) return 1;
  return a.localeCompare(b, "es");
};

/** "Blanco · Algodón peinado" (vacío si no tiene color ni tela). */
export const variantAttrs = (v: Omit<VariantAttrs, "size">) => [v.color, v.fabric].filter(Boolean).join(" · ");

/** "Remera La Salle T.M Blanco · Algodón" — descripción en tickets, facturas y remitos. */
export const variantLabel = (productName: string, v: VariantAttrs) => {
  const attrs = variantAttrs(v);
  return `${productName} T.${v.size}${attrs ? ` ${attrs}` : ""}`;
};

const code = (s: string | null | undefined) =>
  s
    ? s
        .normalize("NFD")
        .replace(/[̀-ͯ]/g, "")
        .replace(/[^A-Za-z0-9]/g, "")
        .slice(0, 4)
        .toUpperCase()
    : null;

/** SKU automático: REM-LS-001-M-BLAN-ALGO */
export const autoVariantSku = (productSku: string, v: VariantAttrs) =>
  [productSku, v.size.toUpperCase(), code(v.color), code(v.fabric)].filter(Boolean).join("-");

/** Clave para detectar combinaciones repetidas (sin distinguir mayúsculas/acentos). */
export const variantKey = (v: VariantAttrs) =>
  [v.size, v.color ?? "", v.fabric ?? ""].map((x) => x.normalize("NFD").replace(/[̀-ͯ]/g, "").trim().toLowerCase()).join("|");

/** Lista escrita por el usuario ("S, M; L") → valores únicos. La "/" no separa: hay telas como "Jersey 24/1". */
export const splitValues = (raw: string, upper = false) => {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const part of raw.split(/[,;\n]+/)) {
    const v = upper ? part.trim().toUpperCase() : part.trim();
    if (v && !seen.has(v.toLowerCase())) {
      seen.add(v.toLowerCase());
      out.push(v);
    }
  }
  return out;
};

/** Todas las combinaciones talle × color × tela (color y tela opcionales). */
export function combineVariants(sizes: string[], colors: string[], fabrics: string[]): VariantAttrs[] {
  const cs = colors.length ? colors : [null];
  const fs = fabrics.length ? fabrics : [null];
  const out: VariantAttrs[] = [];
  for (const color of cs) for (const fabric of fs) for (const size of sizes) out.push({ size, color, fabric });
  return out;
}

/** Opciones disponibles para elegir en el POS a partir de las variantes. */
export function variantOptions<T extends VariantAttrs>(variants: T[]) {
  const uniq = (xs: (string | null | undefined)[]) => [...new Set(xs.filter((x): x is string => !!x))];
  return {
    colors: uniq(variants.map((v) => v.color)).sort((a, b) => a.localeCompare(b, "es")),
    fabrics: uniq(variants.map((v) => v.fabric)).sort((a, b) => a.localeCompare(b, "es")),
    sizes: uniq(variants.map((v) => v.size)).sort(compareSizes),
  };
}
