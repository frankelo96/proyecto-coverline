import { cn } from "@/lib/utils";
import { companyInfo } from "@/server/arca/config";

import { BrandLogo } from "./brand-logo";

export interface DocumentHeaderProps {
  /** "PRESUPUESTO", "REMITO", "ORDEN DE PAGO"… */
  title: string;
  number?: string | number | null;
  date: Date | string;
  dateLabel?: string;
  /** Letra del comprobante: X para documentos no fiscales; A/B/C para facturas */
  letter?: string | null;
  /** Leyenda bajo la letra (ej. "Cód. 06" o "No válido como factura") */
  letterNote?: string | null;
  /** Filas extra en la franja inferior (ej. vencimiento del presupuesto) */
  footer?: { label: string; value: string }[];
  /** Documentos internos: muestra solo logo, título y fecha (sin datos fiscales) */
  internal?: boolean;
  className?: string;
}

const fmtDate = (d: Date | string) => (typeof d === "string" ? new Date(d) : d).toLocaleDateString("es-AR");
export const docNumber = (n: number, digits = 8) => String(n).padStart(digits, "0");

/**
 * Encabezado común de todos los documentos impresos (presupuestos, remitos,
 * recibos, órdenes de pago, fichas técnicas, arqueos), con logo y datos fiscales.
 */
export function DocumentHeader({ title, number, date, dateLabel = "Fecha de emisión", letter, letterNote, footer, internal, className }: DocumentHeaderProps) {
  const c = companyInfo();
  return (
    <header className={cn("border border-black text-[12px] leading-snug text-black", className)}>
      <div className="relative grid grid-cols-2">
        <div className={cn("flex flex-col gap-2 p-4", !internal && "border-r border-black")}>
          <BrandLogo className="h-14 w-auto self-start" priority />
          {!internal && (
            <div className="flex flex-col">
              <p className="text-[13px] font-bold uppercase">{c.legalName}</p>
              <p>{c.address}</p>
              <p>Tel: {c.phone}</p>
              <p>{c.email}</p>
              <p>{c.web}</p>
            </div>
          )}
        </div>
        {letter && (
          <div className="absolute top-0 left-1/2 flex -translate-x-1/2 flex-col items-center border-x border-b border-black bg-white px-3 pt-0.5 pb-1">
            <span className="text-4xl leading-none font-bold">{letter}</span>
            {letterNote && <span className="max-w-16 text-center text-[8px] leading-tight uppercase">{letterNote}</span>}
          </div>
        )}
        <div className={cn("flex flex-col gap-3 p-4", letter && "pl-14")}>
          <p className="text-xl font-bold uppercase">
            {title}
            {number !== null && number !== undefined && <span className="ml-2 font-mono">{number}</span>}
          </p>
          <p className="text-[13px]">
            <strong>{dateLabel}:</strong> <strong>{fmtDate(date)}</strong>
          </p>
          {!internal && (
            <dl className="grid grid-cols-[auto_1fr] gap-x-2">
              <dt className="font-bold">CUIT:</dt>
              <dd>{c.cuit}</dd>
              <dt className="font-bold">Ingresos Brutos:</dt>
              <dd>{c.iibb}</dd>
              <dt className="font-bold">Inicio de Actividades:</dt>
              <dd>{c.startDate}</dd>
              <dt className="font-bold">Condición IVA:</dt>
              <dd>{c.taxCondition}</dd>
            </dl>
          )}
        </div>
      </div>
      {footer && footer.length > 0 && (
        <div className="grid grid-cols-2 border-t border-black">
          <div />
          <div className="flex flex-col gap-0.5 px-4 py-2 text-[13px]">
            {footer.map((f) => (
              <p key={f.label}>
                <strong>{f.label}:</strong> {f.value}
              </p>
            ))}
          </div>
        </div>
      )}
    </header>
  );
}
