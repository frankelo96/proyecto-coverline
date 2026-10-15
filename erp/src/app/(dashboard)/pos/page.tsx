import { Store } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { requirePageUser } from "@/server/auth/session";
import { getPosHome } from "@/server/queries/treasury.queries";

export const metadata: Metadata = { title: "Punto de venta" };
export const dynamic = "force-dynamic";

export default async function PosHomePage() {
  const user = await requirePageUser(PERMISSIONS.posSell);
  const registers = await getPosHome(user.branchId);
  // Quien trabaja en un solo local entra directo a su caja.
  if (user.branchId && registers.length === 1) redirect(`/pos/${registers[0].id}`);
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1.5">
        <h1 className="text-3xl font-bold tracking-tight">Punto de venta</h1>
        <p className="text-sm text-muted-foreground">Elegí la caja del local donde estás vendiendo.</p>
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        {registers.map((r) => (
          <Link key={r.id} href={`/pos/${r.id}`} className="rounded-lg focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none">
            <Card className="h-full transition-colors hover:border-foreground/40">
              <CardHeader className="flex-row items-start justify-between gap-3">
                <div className="flex flex-col gap-1.5">
                  <CardTitle className="flex items-center gap-2">
                    <Store aria-hidden="true" className="size-4" /> {r.branchName ?? r.name}
                  </CardTitle>
                  <p className="text-sm text-muted-foreground">{r.name}</p>
                </div>
                <Badge variant={r.session ? "success" : "outline"}>{r.session ? "Turno abierto" : "Cerrada"}</Badge>
              </CardHeader>
              <CardContent className="text-sm text-muted-foreground">
                {r.session
                  ? `Abrió ${r.session.openedBy} a las ${new Date(r.session.openedAt).toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit" })} · ${r.session.sales} ventas`
                  : "Tocá para abrir el turno."}
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}
