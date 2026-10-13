/**
 * Mensajes SOAP de WSAA y WSFEv1: armado y lectura de respuestas — puro.
 */
import { XMLParser } from "fast-xml-parser";

import type { FecaeRequest } from "./invoice";

const WSFE_NS = "http://ar.gov.afip.dif.FEV1/";

const esc = (s: string | number) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

const parser = new XMLParser({ ignoreAttributes: true, removeNSPrefix: true, parseTagValue: false, trimValues: true });

function body(xml: string): Record<string, unknown> {
  const doc = parser.parse(xml) as { Envelope?: { Body?: Record<string, unknown> } };
  const b = doc.Envelope?.Body;
  if (!b) throw new Error("Respuesta SOAP sin Body");
  if (b.Fault) {
    const f = b.Fault as { faultstring?: string; faultcode?: string };
    throw new SoapFault(f.faultstring ?? "Error SOAP", f.faultcode ?? "");
  }
  return b;
}

export class SoapFault extends Error {
  constructor(
    message: string,
    public code: string,
  ) {
    super(message);
    this.name = "SoapFault";
  }
}

const arr = <T>(v: T | T[] | undefined | null): T[] => (v === undefined || v === null || v === "" ? [] : Array.isArray(v) ? v : [v]);

// --- WSAA ------------------------------------------------------------------------

/** Ticket de requerimiento de acceso (TRA) para un servicio. */
export function buildTra(service: string, now = new Date()) {
  const gen = new Date(now.getTime() - 5 * 60_000);
  const exp = new Date(now.getTime() + 10 * 60_000);
  return `<?xml version="1.0" encoding="UTF-8"?><loginTicketRequest version="1.0"><header><uniqueId>${Math.floor(now.getTime() / 1000)}</uniqueId><generationTime>${gen.toISOString()}</generationTime><expirationTime>${exp.toISOString()}</expirationTime></header><service>${esc(service)}</service></loginTicketRequest>`;
}

export function loginCmsEnvelope(cmsBase64: string) {
  return `<?xml version="1.0" encoding="UTF-8"?><soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:wsaa="http://wsaa.view.sua.dvadac.desein.afip.gov"><soapenv:Header/><soapenv:Body><wsaa:loginCms><wsaa:in0>${cmsBase64}</wsaa:in0></wsaa:loginCms></soapenv:Body></soapenv:Envelope>`;
}

export function parseLoginCms(xml: string): { token: string; sign: string; expiresAt: Date } {
  const b = body(xml);
  const ret = (b.loginCmsResponse as { loginCmsReturn?: string } | undefined)?.loginCmsReturn;
  if (!ret) throw new Error("WSAA: respuesta sin loginCmsReturn");
  const inner = parser.parse(ret) as { loginTicketResponse?: { header?: { expirationTime?: string }; credentials?: { token?: string; sign?: string } } };
  const t = inner.loginTicketResponse;
  if (!t?.credentials?.token || !t.credentials.sign || !t.header?.expirationTime) throw new Error("WSAA: ticket incompleto");
  return { token: t.credentials.token, sign: t.credentials.sign, expiresAt: new Date(t.header.expirationTime) };
}

// --- WSFEv1 --------------------------------------------------------------------------

export interface Auth {
  token: string;
  sign: string;
  cuit: string;
}

const authXml = (a: Auth) => `<ar:Auth><ar:Token>${esc(a.token)}</ar:Token><ar:Sign>${esc(a.sign)}</ar:Sign><ar:Cuit>${esc(a.cuit)}</ar:Cuit></ar:Auth>`;

const envelope = (inner: string) =>
  `<?xml version="1.0" encoding="UTF-8"?><soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:ar="${WSFE_NS}"><soapenv:Header/><soapenv:Body>${inner}</soapenv:Body></soapenv:Envelope>`;

export const soapAction = (method: string) => `${WSFE_NS}${method}`;

export function ultimoAutorizadoEnvelope(auth: Auth, ptoVta: number, cbteTipo: number) {
  return envelope(`<ar:FECompUltimoAutorizado>${authXml(auth)}<ar:PtoVta>${ptoVta}</ar:PtoVta><ar:CbteTipo>${cbteTipo}</ar:CbteTipo></ar:FECompUltimoAutorizado>`);
}

export function compConsultarEnvelope(auth: Auth, ptoVta: number, cbteTipo: number, number: number) {
  return envelope(
    `<ar:FECompConsultar>${authXml(auth)}<ar:FeCompConsReq><ar:CbteTipo>${cbteTipo}</ar:CbteTipo><ar:CbteNro>${number}</ar:CbteNro><ar:PtoVta>${ptoVta}</ar:PtoVta></ar:FeCompConsReq></ar:FECompConsultar>`,
  );
}

const money = (n: number) => n.toFixed(2);

export function fecaeEnvelope(auth: Auth, r: FecaeRequest) {
  const iva = r.Iva.map((i) => `<ar:AlicIva><ar:Id>${i.Id}</ar:Id><ar:BaseImp>${money(i.BaseImp)}</ar:BaseImp><ar:Importe>${money(i.Importe)}</ar:Importe></ar:AlicIva>`).join("");
  const asoc = r.CbtesAsoc
    ? `<ar:CbtesAsoc>${r.CbtesAsoc.map((c) => `<ar:CbteAsoc><ar:Tipo>${c.Tipo}</ar:Tipo><ar:PtoVta>${c.PtoVta}</ar:PtoVta><ar:Nro>${c.Nro}</ar:Nro><ar:Cuit>${esc(c.Cuit)}</ar:Cuit><ar:CbteFch>${c.CbteFch}</ar:CbteFch></ar:CbteAsoc>`).join("")}</ar:CbtesAsoc>`
    : "";
  const det =
    `<ar:FECAEDetRequest><ar:Concepto>${r.Concepto}</ar:Concepto><ar:DocTipo>${r.DocTipo}</ar:DocTipo><ar:DocNro>${esc(r.DocNro)}</ar:DocNro>` +
    `<ar:CbteDesde>${r.CbteDesde}</ar:CbteDesde><ar:CbteHasta>${r.CbteHasta}</ar:CbteHasta><ar:CbteFch>${r.CbteFch}</ar:CbteFch>` +
    `<ar:ImpTotal>${money(r.ImpTotal)}</ar:ImpTotal><ar:ImpTotConc>${money(r.ImpTotConc)}</ar:ImpTotConc><ar:ImpNeto>${money(r.ImpNeto)}</ar:ImpNeto>` +
    `<ar:ImpOpEx>${money(r.ImpOpEx)}</ar:ImpOpEx><ar:ImpTrib>${money(r.ImpTrib)}</ar:ImpTrib><ar:ImpIVA>${money(r.ImpIVA)}</ar:ImpIVA>` +
    `<ar:MonId>${r.MonId}</ar:MonId><ar:MonCotiz>${r.MonCotiz}</ar:MonCotiz><ar:CondicionIVAReceptorId>${r.CondicionIVAReceptorId}</ar:CondicionIVAReceptorId>` +
    `${asoc}<ar:Iva>${iva}</ar:Iva></ar:FECAEDetRequest>`;
  return envelope(
    `<ar:FECAESolicitar>${authXml(auth)}<ar:FeCAEReq><ar:FeCabReq><ar:CantReg>1</ar:CantReg><ar:PtoVta>${r.PtoVta}</ar:PtoVta><ar:CbteTipo>${r.CbteTipo}</ar:CbteTipo></ar:FeCabReq><ar:FeDetReq>${det}</ar:FeDetReq></ar:FeCAEReq></ar:FECAESolicitar>`,
  );
}

export interface ArcaMessage {
  code: string;
  message: string;
}

const messages = (node: unknown, key: "Err" | "Obs" | "Evt"): ArcaMessage[] =>
  arr((node as Record<string, unknown> | undefined)?.[key] as { Code?: string; Msg?: string } | { Code?: string; Msg?: string }[]).map((m) => ({
    code: String(m.Code ?? ""),
    message: String(m.Msg ?? ""),
  }));

export function parseUltimoAutorizado(xml: string): number {
  const r = (body(xml).FECompUltimoAutorizadoResponse as { FECompUltimoAutorizadoResult?: Record<string, unknown> })?.FECompUltimoAutorizadoResult;
  if (!r) throw new Error("WSFE: respuesta vacía");
  const errors = messages(r.Errors, "Err");
  if (errors.length) throw new ArcaServiceError(errors);
  return Number(r.CbteNro ?? 0);
}

export class ArcaServiceError extends Error {
  constructor(public errors: ArcaMessage[]) {
    super(errors.map((e) => `${e.code}: ${e.message}`).join(" · "));
    this.name = "ArcaServiceError";
  }
}

export interface CaeResult {
  approved: boolean;
  cae: string | null;
  caeDueDate: string | null;
  number: number;
  observations: ArcaMessage[];
  errors: ArcaMessage[];
}

export function parseFecae(xml: string): CaeResult {
  const r = (body(xml).FECAESolicitarResponse as { FECAESolicitarResult?: Record<string, unknown> })?.FECAESolicitarResult;
  if (!r) throw new Error("WSFE: respuesta vacía");
  const det = arr((r.FeDetResp as { FECAEDetResponse?: unknown } | undefined)?.FECAEDetResponse)[0] as Record<string, unknown> | undefined;
  const errors = messages(r.Errors, "Err");
  const observations = det ? messages(det.Observaciones, "Obs") : [];
  const approved = det?.Resultado === "A";
  return {
    approved,
    cae: approved && det?.CAE ? String(det.CAE) : null,
    caeDueDate: approved && det?.CAEFchVto ? String(det.CAEFchVto) : null,
    number: Number(det?.CbteDesde ?? 0),
    observations,
    errors,
  };
}

export interface ConsultResult {
  found: boolean;
  cae: string | null;
  caeDueDate: string | null;
  total: number;
  docNro: string;
}

export function parseCompConsultar(xml: string): ConsultResult {
  const r = (body(xml).FECompConsultarResponse as { FECompConsultarResult?: Record<string, unknown> })?.FECompConsultarResult;
  const g = r?.ResultGet as Record<string, unknown> | undefined;
  if (!g || !g.CodAutorizacion) return { found: false, cae: null, caeDueDate: null, total: 0, docNro: "" };
  return {
    found: g.Resultado === "A",
    cae: String(g.CodAutorizacion),
    caeDueDate: g.FchVto ? String(g.FchVto) : null,
    total: Number(g.ImpTotal ?? 0),
    docNro: String(g.DocNro ?? ""),
  };
}
