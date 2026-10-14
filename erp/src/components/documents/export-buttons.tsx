import { Download, FileSpreadsheet } from "lucide-react";

import { Button } from "@/components/ui/button";

/** Botones "Excel" y "CSV" para un informe de /api/reportes. */
export function ExportButtons({ report, params, label = "Excel" }: { report: string; params?: Record<string, string>; label?: string }) {
  const qs = new URLSearchParams(params ?? {});
  const base = `/api/reportes/${report}`;
  const csv = new URLSearchParams(qs);
  csv.set("formato", "csv");
  return (
    <div className="flex flex-wrap gap-2 print:hidden">
      <Button asChild variant="outline" size="sm">
        <a href={`${base}${qs.size ? `?${qs}` : ""}`}>
          <FileSpreadsheet /> {label}
        </a>
      </Button>
      <Button asChild variant="outline" size="sm">
        <a href={`${base}?${csv}`}>
          <Download /> CSV
        </a>
      </Button>
    </div>
  );
}
