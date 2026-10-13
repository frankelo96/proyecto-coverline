import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = { title: "Sin acceso" };

export default function NoAccessPage() {
  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col items-start justify-center gap-3 px-4">
      <h1 className="text-2xl font-bold">No tenés acceso a esta sección</h1>
      <p className="text-muted-foreground">Tu rol no incluye este permiso. Pedile a un administrador que lo habilite.</p>
      <Link href="/" className="text-sm font-medium underline underline-offset-4">
        Volver al inicio
      </Link>
    </main>
  );
}
