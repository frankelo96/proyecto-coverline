/**
 * Ticket en texto plano para impresoras térmicas (ESC/POS en modo texto).
 * 58 mm ≈ 32 columnas, 80 mm ≈ 48 columnas (fuente A).
 */
export const TICKET_COLUMNS = { 58: 32, 80: 48 } as const;
export type TicketWidth = keyof typeof TICKET_COLUMNS;

export interface TicketData {
  businessName: string;
  branchName: string;
  branchAddress: string | null;
  voucherLabel: string;
  number: number;
  date: Date;
  cashier: string;
  clientName: string | null;
  items: { description: string; quantity: number; unitPrice: number; discountPct: number; total: number }[];
  discountTotal: number;
  showVat: boolean;
  subtotal: number;
  taxTotal: number;
  total: number;
  payments: { label: string; amount: number }[];
  change: number;
  footer: string;
}

const money = (n: number) => n.toLocaleString("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const qty = (n: number) => n.toLocaleString("es-AR", { maximumFractionDigits: 3 });

/** Quita acentos y caracteres fuera de ASCII imprimible (muchas térmicas no tienen code page latina). */
export function asciiSafe(s: string) {
  return s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\x20-\x7E\n]/g, "?");
}

function center(text: string, cols: number) {
  const t = text.slice(0, cols);
  const pad = Math.floor((cols - t.length) / 2);
  return " ".repeat(pad) + t;
}

function leftRight(left: string, right: string, cols: number) {
  const space = cols - right.length - 1;
  const l = left.length > space ? left.slice(0, space) : left;
  return l + " ".repeat(cols - l.length - right.length) + right;
}

function wrap(text: string, cols: number): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let cur = "";
  for (const w of words) {
    if (!cur) cur = w.slice(0, cols);
    else if (cur.length + 1 + w.length <= cols) cur += ` ${w}`;
    else {
      lines.push(cur);
      cur = w.slice(0, cols);
    }
  }
  if (cur) lines.push(cur);
  return lines;
}

export function renderTicketText(t: TicketData, width: TicketWidth): string {
  const cols = TICKET_COLUMNS[width];
  const rule = "-".repeat(cols);
  const out: string[] = [];
  out.push(center(t.businessName.toUpperCase(), cols));
  out.push(center(t.branchName, cols));
  if (t.branchAddress) for (const l of wrap(t.branchAddress, cols)) out.push(center(l, cols));
  out.push(rule);
  out.push(leftRight(t.voucherLabel, `N ${String(t.number).padStart(8, "0")}`, cols));
  out.push(leftRight(t.date.toLocaleDateString("es-AR"), t.date.toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit", hourCycle: "h23" }), cols));
  out.push(`Cajero: ${t.cashier}`.slice(0, cols));
  if (t.clientName) out.push(...wrap(`Cliente: ${t.clientName}`, cols));
  out.push(rule);
  for (const it of t.items) {
    out.push(...wrap(it.description, cols));
    const detail = `${qty(it.quantity)} x ${money(it.unitPrice)}${it.discountPct > 0 ? ` -${qty(it.discountPct)}%` : ""}`;
    out.push(leftRight(`  ${detail}`, money(it.total), cols));
  }
  out.push(rule);
  if (t.discountTotal > 0) out.push(leftRight("Descuentos", `-${money(t.discountTotal)}`, cols));
  if (t.showVat) {
    out.push(leftRight("Subtotal neto", money(t.subtotal), cols));
    out.push(leftRight("IVA", money(t.taxTotal), cols));
  }
  out.push(leftRight("TOTAL $", money(t.total), cols));
  out.push(rule);
  for (const p of t.payments) out.push(leftRight(p.label, money(p.amount), cols));
  if (t.change > 0) out.push(leftRight("Su vuelto", money(t.change), cols));
  out.push("");
  for (const l of wrap(t.footer, cols)) out.push(center(l, cols));
  return asciiSafe(out.join("\n"));
}
