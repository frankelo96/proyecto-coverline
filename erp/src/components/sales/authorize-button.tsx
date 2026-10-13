"use client";

import { Loader2, RefreshCw } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

import { Button } from "@/components/ui/button";
import { StatusMessage } from "@/components/ui/status-message";
import { useServerAction } from "@/hooks/use-server-action";
import { authorizeSaleAction } from "@/server/actions/treasury.actions";

export function AuthorizeButton({ saleId, label = "Pedir CAE a ARCA", size = "default" }: { saleId: string; label?: string; size?: "default" | "sm" }) {
  const { pending, status, execute } = useServerAction();
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  return (
    <div className="flex flex-col gap-2">
      <Button type="button" size={size} variant="outline" disabled={pending} onClick={() =>
          execute(
            () => authorizeSaleAction({ saleId }),
            // En el listado de pendientes la fila desaparece al autorizarse: el aviso se muestra arriba.
            (_d, message) => {
              const next = new URLSearchParams(params);
              next.set("aviso", message);
              router.replace(`${pathname}?${next}`);
            },
          )
        } className="w-fit">
        {pending ? <Loader2 className="animate-spin" /> : <RefreshCw />} {label}
      </Button>
      <StatusMessage status={status} />
    </div>
  );
}
