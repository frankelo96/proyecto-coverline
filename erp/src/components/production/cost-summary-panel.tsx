import { AlertTriangle, CheckCircle2, TrendingUp } from "lucide-react";

import type { CostBreakdown, CostGroup } from "@/lib/costing/escandallo";
import { formatMoney, formatPct } from "@/lib/format";
import { cn } from "@/lib/utils";

const GROUP_COLOR: Record<CostGroup, string> = {
  TELAS: "bg-chart-1",
  AVIOS: "bg-chart-2",
  CORTE: "bg-chart-3",
  CONFECCION: "bg-chart-4",
  PERSONALIZACION: "bg-chart-5",
  PLANCHADO_EMPAQUE: "bg-chart-6",
  LOGISTICA: "bg-chart-7",
  OTROS: "bg-chart-8",
};

function Row({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-4 text-sm">
      <dt className="text-ink-muted">{label}</dt>
      <dd className={cn("font-mono tabular-nums", strong ? "font-semibold text-ink-foreground" : "text-ink-foreground")}>{value}</dd>
    </div>
  );
}

export function CostSummaryPanel({ breakdown }: { breakdown: CostBreakdown }) {
  const { listPriceCheck: list, baselineCheck: base } = breakdown;
  return (
    <div className="flex flex-col gap-4">
      <section aria-label="Resultado del escandallo" className="flex flex-col gap-3 rounded-lg bg-ink p-5 text-ink-foreground">
        <dl className="flex flex-col gap-2">
          <Row label="Materiales" value={formatMoney(breakdown.materialsCost)} />
          <Row label="Procesos y talleres" value={formatMoney(breakdown.servicesCost)} />
          <Row label={`Gastos generales (${formatPct(breakdown.overheadPct)})`} value={formatMoney(breakdown.overheadCost)} />
          <div className="my-1 border-t border-white/15" />
          <Row label="Costo total por prenda" value={formatMoney(breakdown.totalCost)} strong />
          <Row
            label={breakdown.pricingMode === "MARKUP" ? `Precio neto (markup ${formatPct(breakdown.pricingPct)})` : `Precio neto (margen ${formatPct(breakdown.pricingPct)})`}
            value={formatMoney(breakdown.suggestedNetPrice)}
          />
          <Row label={`IVA ${formatPct(breakdown.vatRate)}`} value={formatMoney(breakdown.suggestedVat)} />
        </dl>
        <div className="flex items-baseline justify-between gap-4 border-t border-white/15 pt-3">
          <span className="text-sm font-semibold">Precio final sugerido</span>
          <output className="font-mono text-3xl font-semibold tabular-nums text-accent" aria-live="polite">
            {formatMoney(breakdown.suggestedFinalPrice)}
          </output>
        </div>
        <p className="text-sm text-ink-muted">
          Margen bruto {formatPct(breakdown.effectiveMarginPct)} · Markup efectivo {formatPct(breakdown.effectiveMarkupPct)}
        </p>
      </section>

      {base?.increased && (
        <div role="alert" className="flex gap-3 rounded-lg border border-accent bg-accent/10 p-4 text-sm">
          <TrendingUp aria-hidden="true" className="mt-0.5 size-5 shrink-0 text-accent-strong" />
          <p>
            El costo sube <strong>{formatMoney(base.delta)}</strong> ({formatPct(base.deltaPct)}) respecto de la ficha vigente (
            {formatMoney(base.baselineCost)}).
          </p>
        </div>
      )}

      {list && (
        <div
          className={cn(
            "flex gap-3 rounded-lg border p-4 text-sm",
            list.belowCost || list.gapToSuggested > 0 ? "border-destructive/40 bg-destructive/5" : "border-success/40 bg-success/5",
          )}
        >
          {list.belowCost || list.gapToSuggested > 0 ? (
            <AlertTriangle aria-hidden="true" className="mt-0.5 size-5 shrink-0 text-destructive" />
          ) : (
            <CheckCircle2 aria-hidden="true" className="mt-0.5 size-5 shrink-0 text-success" />
          )}
          <div className="flex flex-col gap-1">
            <p>
              Precio de lista vigente <strong className="font-mono">{formatMoney(list.listPrice)}</strong> neto: margen real{" "}
              <strong>{formatPct(list.marginPct)}</strong>.
            </p>
            {list.belowCost ? (
              <p className="font-semibold text-destructive">El precio de lista está por debajo del costo.</p>
            ) : list.gapToSuggested > 0 ? (
              <p>Faltan {formatMoney(list.gapToSuggested)} para llegar al precio sugerido.</p>
            ) : (
              <p>El precio de lista cubre el objetivo de rentabilidad.</p>
            )}
          </div>
        </div>
      )}

      <section aria-labelledby="composition-title" className="flex flex-col gap-3 rounded-lg border bg-card p-5">
        <h3 id="composition-title" className="text-sm font-semibold">
          Composición del costo
        </h3>
        {breakdown.groups.length === 0 ? (
          <p className="text-sm text-muted-foreground">Agregá materiales o procesos para ver la composición.</p>
        ) : (
          <>
            <div className="flex h-3 overflow-hidden rounded-full bg-muted" aria-hidden="true">
              {breakdown.groups.map((g) => (
                <div key={g.group} className={GROUP_COLOR[g.group]} style={{ width: `${g.sharePct}%` }} />
              ))}
            </div>
            <ul className="flex flex-col gap-2 text-sm">
              {breakdown.groups.map((g) => (
                <li key={g.group} className="flex items-center justify-between gap-3">
                  <span className="flex items-center gap-2">
                    <span aria-hidden="true" className={cn("size-2.5 rounded-sm", GROUP_COLOR[g.group])} />
                    {g.label}
                  </span>
                  <span className="font-mono tabular-nums text-muted-foreground">
                    {formatMoney(g.amount)} · {formatPct(g.sharePct)}
                  </span>
                </li>
              ))}
            </ul>
          </>
        )}
      </section>
    </div>
  );
}
