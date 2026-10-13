import { CheckCircle2 } from "lucide-react";

/** Aviso de éxito que viaja por la URL (?aviso=…) para sobrevivir al refresco de la página. */
export function FlashNotice({ message }: { message?: string }) {
  if (!message) return null;
  return (
    <p role="status" className="flex items-start gap-2 rounded-md border border-success/40 bg-success/5 px-4 py-3 text-sm text-success">
      <CheckCircle2 aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
      {message.slice(0, 300)}
    </p>
  );
}
