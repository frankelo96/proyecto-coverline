import type { ActionStatus } from "@/hooks/use-server-action";
import { cn } from "@/lib/utils";

export function StatusMessage({ status, className }: { status: ActionStatus; className?: string }) {
  return (
    <div role="status" aria-live="polite" className={cn("empty:hidden", className)}>
      {status && (
        <p
          className={
            status.kind === "success"
              ? "rounded-md border border-success/40 bg-success/5 px-4 py-3 text-sm text-success"
              : "rounded-md border border-destructive/40 bg-destructive/5 px-4 py-3 text-sm text-destructive"
          }
        >
          {status.text}
        </p>
      )}
    </div>
  );
}
