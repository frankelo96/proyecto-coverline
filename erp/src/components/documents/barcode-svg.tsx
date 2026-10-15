import { ean13Bars, normalizeEan13 } from "@/lib/catalog/barcode";
import { cn } from "@/lib/utils";

/**
 * Código EAN-13 con los números debajo. Las barras se estiran a todo el ancho
 * disponible (cuanto más ancho, mejor lo lee el lector) manteniendo la proporción
 * entre barras. Si el código no es un EAN-13 válido se muestra solo el texto.
 */
export function BarcodeSvg({ code, className, digitsClassName }: { code: string; className?: string; digitsClassName?: string }) {
  const ean = normalizeEan13(code);
  if (!ean) return <span className="font-mono text-[8pt]">{code}</span>;
  // Margen silencioso que pide el estándar: 11 módulos a la izquierda y 7 a la derecha.
  const quietLeft = 11;
  const quietRight = 7;
  return (
    <div className={cn("flex h-full w-full flex-col", className)}>
      <svg viewBox={`0 0 ${quietLeft + 95 + quietRight} 10`} preserveAspectRatio="none" className="min-h-0 w-full flex-1" role="img" aria-label={`Código de barras ${ean}`}>
        {ean13Bars(ean).map((b) => (
          <rect key={b.x} x={b.x + quietLeft} y="0" width={b.width} height="10" fill="#000" shapeRendering="crispEdges" />
        ))}
      </svg>
      <span className={cn("text-center font-mono leading-none tracking-[0.2em]", digitsClassName ?? "text-[7pt]")}>{ean}</span>
    </div>
  );
}
