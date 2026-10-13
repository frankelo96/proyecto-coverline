import Link from "next/link";

export default function ProductNotFound() {
  return (
    <div className="flex flex-col items-start gap-3 py-16">
      <h1 className="text-2xl font-bold">Prenda no encontrada</h1>
      <p className="text-muted-foreground">La ficha técnica que buscás no existe o fue dada de baja.</p>
      <Link href="/produccion/fichas" className="text-sm font-medium underline underline-offset-4">
        Volver a fichas técnicas
      </Link>
    </div>
  );
}
