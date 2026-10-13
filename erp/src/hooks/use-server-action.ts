"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import type { ActionResult } from "@/lib/action-result";

export type ActionStatus = { kind: "success" | "error"; text: string } | null;

/**
 * Ejecuta una Server Action que devuelve ActionResult, maneja el estado de
 * carga, el mensaje para el usuario y refresca los Server Components.
 */
export function useServerAction() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [status, setStatus] = useState<ActionStatus>(null);

  function execute<T>(action: () => Promise<ActionResult<T>>, onSuccess?: (data: T, message: string) => void) {
    setStatus(null);
    startTransition(async () => {
      const result = await action();
      if (result.ok) {
        setStatus({ kind: "success", text: result.message ?? "Listo" });
        onSuccess?.(result.data, result.message ?? "Listo");
        router.refresh();
      } else {
        setStatus({ kind: "error", text: result.error });
      }
    });
  }

  return { pending, status, setStatus, execute };
}
