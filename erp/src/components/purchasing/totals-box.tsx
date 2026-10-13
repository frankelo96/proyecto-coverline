import type { PurchaseTotals } from "@/lib/purchasing/math";
import { formatMoney } from "@/lib/format";

function Row({ label, value, strong }: { label: string; value: number; strong?: boolean }) {
  return (
    <div className={strong ? "flex justify-between gap-4 border-t pt-2 text-base font-semibold" : "flex justify-between gap-4 text-sm"}>
      <dt className={strong ? undefined : "text-muted-foreground"}>{label}</dt>
      <dd className="font-mono tabular-nums">{formatMoney(value)}</dd>
    </div>
  );
}

export function TotalsBox({ totals }: { totals: Pick<PurchaseTotals, "subtotal" | "vat21" | "vat105" | "vat27" | "perceptionIva" | "perceptionIibb" | "otherTaxes" | "total"> }) {
  return (
    <dl className="flex flex-col gap-1.5">
      <Row label="Neto" value={totals.subtotal} />
      {totals.vat21 > 0 && <Row label="IVA 21%" value={totals.vat21} />}
      {totals.vat105 > 0 && <Row label="IVA 10,5%" value={totals.vat105} />}
      {totals.vat27 > 0 && <Row label="IVA 27%" value={totals.vat27} />}
      {totals.perceptionIva > 0 && <Row label="Percepción IVA" value={totals.perceptionIva} />}
      {totals.perceptionIibb > 0 && <Row label="Percepción IIBB" value={totals.perceptionIibb} />}
      {totals.otherTaxes > 0 && <Row label="Otros impuestos" value={totals.otherTaxes} />}
      <Row label="Total" value={totals.total} strong />
    </dl>
  );
}
