import "server-only";

import { readFileSync } from "node:fs";

export type ArcaMode = "deshabilitado" | "homologacion" | "produccion";

const ENDPOINTS = {
  homologacion: { wsaa: "https://wsaahomo.afip.gov.ar/ws/services/LoginCms", wsfe: "https://wswhomo.afip.gov.ar/wsfev1/service.asmx" },
  produccion: { wsaa: "https://wsaa.afip.gov.ar/ws/services/LoginCms", wsfe: "https://servicios1.afip.gov.ar/wsfev1/service.asmx" },
} as const;

/** Acepta el PEM directo en la variable o una ruta a archivo. */
function pem(value: string | undefined, name: string) {
  if (!value) throw new Error(`Falta ${name}`);
  if (value.includes("-----BEGIN")) return value.replace(/\\n/g, "\n");
  return readFileSync(value, "utf8");
}

export function arcaMode(): ArcaMode {
  const m = (process.env.ARCA_MODE ?? "deshabilitado").toLowerCase();
  return m === "homologacion" || m === "produccion" ? m : "deshabilitado";
}

export const arcaEnabled = () => arcaMode() !== "deshabilitado";

export function arcaConfig() {
  const mode = arcaMode();
  if (mode === "deshabilitado") throw new Error("La facturación electrónica ARCA no está configurada (ARCA_MODE)");
  const cuit = process.env.ARCA_CUIT;
  if (!cuit) throw new Error("Falta ARCA_CUIT");
  return {
    mode,
    cuit: cuit.replace(/\D/g, ""),
    cert: pem(process.env.ARCA_CERT, "ARCA_CERT"),
    key: pem(process.env.ARCA_KEY, "ARCA_KEY"),
    // Sobrescribibles (proxy corporativo o entorno de pruebas).
    wsaa: process.env.ARCA_WSAA_URL || ENDPOINTS[mode].wsaa,
    wsfe: process.env.ARCA_WSFE_URL || ENDPOINTS[mode].wsfe,
  };
}

/** Datos del emisor que se imprimen en los comprobantes. */
export function companyInfo() {
  return {
    legalName: process.env.COMPANY_LEGAL_NAME ?? "Coverline Uniformes",
    cuit: process.env.ARCA_CUIT ?? null,
    taxCondition: "IVA Responsable Inscripto",
    iibb: process.env.COMPANY_IIBB ?? null,
    startDate: process.env.COMPANY_START_DATE ?? null,
    address: process.env.COMPANY_ADDRESS ?? null,
  };
}
