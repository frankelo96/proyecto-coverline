/**
 * Formatos de etiquetas autoadhesivas: hojas A4 precortadas (impresora común)
 * y rollos para impresora térmica (Zebra, Xprinter, etc.). Medidas en mm.
 */
export interface LabelFormat {
  key: string;
  label: string;
  /** Hoja A4 con varias etiquetas o rollo (una etiqueta por "página") */
  kind: "a4" | "rollo";
  width: number;
  height: number;
  cols: number;
  rows: number;
  /** Separación entre etiquetas */
  gapX: number;
  gapY: number;
  /** Margen de la hoja hasta la primera etiqueta */
  marginTop: number;
  marginLeft: number;
}

export const LABEL_FORMATS: LabelFormat[] = [
  { key: "a4-24", label: "Hoja A4 · 24 etiquetas de 70 × 37 mm (3 × 8)", kind: "a4", width: 70, height: 37, cols: 3, rows: 8, gapX: 0, gapY: 0, marginTop: 0.5, marginLeft: 0 },
  { key: "a4-21", label: "Hoja A4 · 21 etiquetas de 70 × 42,4 mm (3 × 7)", kind: "a4", width: 70, height: 42.4, cols: 3, rows: 7, gapX: 0, gapY: 0, marginTop: 0, marginLeft: 0 },
  { key: "a4-65", label: "Hoja A4 · 65 etiquetas de 38 × 21 mm (5 × 13)", kind: "a4", width: 38.1, height: 21.2, cols: 5, rows: 13, gapX: 2.5, gapY: 0, marginTop: 10.7, marginLeft: 4.75 },
  { key: "rollo-50x25", label: "Rollo térmico · 50 × 25 mm", kind: "rollo", width: 50, height: 25, cols: 1, rows: 1, gapX: 0, gapY: 0, marginTop: 0, marginLeft: 0 },
  { key: "rollo-60x40", label: "Rollo térmico · 60 × 40 mm", kind: "rollo", width: 60, height: 40, cols: 1, rows: 1, gapX: 0, gapY: 0, marginTop: 0, marginLeft: 0 },
];

export const labelFormat = (key: string | null | undefined) => LABEL_FORMATS.find((f) => f.key === key) ?? LABEL_FORMATS[0];

/** "id:3,id2:1" ⇄ [{variantId, qty}] (para el enlace de impresión). Cantidades 1–999. */
export function encodeLabelItems(items: { variantId: string; qty: number }[]) {
  return items
    .filter((i) => i.qty > 0)
    .map((i) => `${i.variantId}:${Math.min(999, Math.floor(i.qty))}`)
    .join(",");
}

export function decodeLabelItems(raw: string | null | undefined) {
  if (!raw) return [];
  return raw
    .split(",")
    .map((part) => {
      const [variantId, q] = part.split(":");
      const qty = Math.min(999, Math.max(0, Math.floor(Number(q))));
      return variantId && /^[a-z0-9]+$/i.test(variantId) && qty > 0 ? { variantId, qty } : null;
    })
    .filter((x): x is { variantId: string; qty: number } => x !== null);
}

/** Reparte las etiquetas en hojas, salteando las posiciones ya usadas de la primera hoja. */
export function paginateLabels<T>(labels: T[], perPage: number, skip = 0): (T | null)[][] {
  const slots: (T | null)[] = [...Array<null>(Math.max(0, Math.min(skip, perPage - 1))).fill(null), ...labels];
  const pages: (T | null)[][] = [];
  for (let i = 0; i < slots.length; i += perPage) pages.push(slots.slice(i, i + perPage));
  return pages;
}
