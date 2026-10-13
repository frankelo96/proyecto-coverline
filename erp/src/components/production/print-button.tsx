"use client";

import { Printer } from "lucide-react";

import { Button } from "@/components/ui/button";

export function PrintButton() {
  return (
    <Button type="button" onClick={() => window.print()} className="print:hidden">
      <Printer /> Imprimir
    </Button>
  );
}
