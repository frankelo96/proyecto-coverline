import Link from "next/link";

export default function OrderNotFound() {
  return (
    <div className="flex flex-col items-start gap-3 py-16">
      <h1 className="text-2xl font-bold">Orden no encontrada</h1>
      <p className="text-muted-foreground">La orden de producción que buscás no existe.</p>
      <Link href="/produccion/ordenes" className="text-sm font-medium underline underline-offset-4">
        Volver al tablero
      </Link>
    </div>
  );
}
