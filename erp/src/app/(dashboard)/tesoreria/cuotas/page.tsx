import type { Metadata } from "next";

import { InstallmentPlansEditor } from "@/components/treasury/installment-plans";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { hasPermission, PERMISSIONS } from "@/lib/auth/permissions";
import { requirePageUser } from "@/server/auth/session";
import { getInstallmentPlans } from "@/server/services/settings.service";

export const metadata: Metadata = { title: "Cuotas" };
export const dynamic = "force-dynamic";

export default async function InstallmentsPage() {
  const user = await requirePageUser(PERMISSIONS.cashRead);
  const plans = await getInstallmentPlans();
  return (
    <Card className="max-w-2xl">
      <CardHeader>
        <CardTitle>Planes de cuotas</CardTitle>
        <CardDescription>
          Los que se ofrecen en el POS al cobrar con tarjeta o Mercado Pago. El recargo se agrega como una línea «Recargo financiación» y queda en la factura. Las comisiones que retiene
          Mercado Pago o la tarjeta se registran al conciliar la cuenta.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <InstallmentPlansEditor initial={plans} canEdit={hasPermission(user.permissions, PERMISSIONS.cashManage)} />
      </CardContent>
    </Card>
  );
}
