import "server-only";

import { request, Agent } from "node:https";

import forge from "node-forge";

import {
  buildTra,
  compConsultarEnvelope,
  fecaeEnvelope,
  loginCmsEnvelope,
  parseCompConsultar,
  parseFecae,
  parseLoginCms,
  parseUltimoAutorizado,
  soapAction,
  SoapFault,
  ultimoAutorizadoEnvelope,
  type Auth,
} from "@/lib/arca/soap";
import type { FecaeRequest } from "@/lib/arca/invoice";
import { db } from "@/server/db";

import { arcaConfig } from "./config";

/**
 * Los servidores de ARCA negocian parámetros DH que OpenSSL 3 rechaza por
 * defecto ("dh key too small"); se baja el nivel de seguridad solo para ellos.
 */
const agent = new Agent({ ciphers: "DEFAULT@SECLEVEL=1", keepAlive: true });
const TIMEOUT_MS = 30_000;

function post(url: string, xml: string, action: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const req = request(
      url,
      {
        method: "POST",
        agent,
        timeout: TIMEOUT_MS,
        headers: { "Content-Type": "text/xml; charset=utf-8", SOAPAction: `"${action}"`, "Content-Length": Buffer.byteLength(xml) },
      },
      (res) => {
        const chunks: Buffer[] = [];
        res.on("data", (c: Buffer) => chunks.push(c));
        res.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
      },
    );
    req.on("timeout", () => req.destroy(new Error(`ARCA no respondió en ${TIMEOUT_MS / 1000} s`)));
    req.on("error", reject);
    req.end(xml);
  });
}

/** Firma el TRA en CMS (PKCS#7 con contenido) con el certificado de la empresa. */
function signTra(tra: string, certPem: string, keyPem: string) {
  const cert = forge.pki.certificateFromPem(certPem);
  const key = forge.pki.privateKeyFromPem(keyPem);
  const p7 = forge.pkcs7.createSignedData();
  p7.content = forge.util.createBuffer(tra, "utf8");
  p7.addCertificate(cert);
  p7.addSigner({
    key,
    certificate: cert,
    digestAlgorithm: forge.pki.oids.sha256,
    authenticatedAttributes: [
      { type: forge.pki.oids.contentType, value: forge.pki.oids.data },
      { type: forge.pki.oids.messageDigest },
      { type: forge.pki.oids.signingTime, value: new Date().toISOString() },
    ],
  });
  p7.sign();
  return forge.util.encode64(forge.asn1.toDer(p7.toAsn1()).getBytes());
}

const SERVICE = "wsfe";

/** Ticket de acceso: se reutiliza el guardado mientras falten más de 10 minutos para que venza. */
async function auth(): Promise<Auth> {
  const cfg = arcaConfig();
  const cached = await db.arcaToken.findUnique({ where: { service: `${cfg.mode}:${SERVICE}` } });
  if (cached && cached.expiresAt.getTime() - Date.now() > 10 * 60_000) return { token: cached.token, sign: cached.sign, cuit: cfg.cuit };
  const cms = signTra(buildTra(SERVICE), cfg.cert, cfg.key);
  let ticket;
  try {
    ticket = parseLoginCms(await post(cfg.wsaa, loginCmsEnvelope(cms), ""));
  } catch (e) {
    if (e instanceof SoapFault && /alreadyAuthenticated|ya posee un TA valido/i.test(`${e.code} ${e.message}`)) {
      throw new Error("ARCA indica que ya hay un ticket de acceso vigente que no está guardado; reintentá en unos minutos");
    }
    throw e;
  }
  await db.arcaToken.upsert({
    where: { service: `${cfg.mode}:${SERVICE}` },
    update: { token: ticket.token, sign: ticket.sign, expiresAt: ticket.expiresAt },
    create: { service: `${cfg.mode}:${SERVICE}`, token: ticket.token, sign: ticket.sign, expiresAt: ticket.expiresAt },
  });
  return { token: ticket.token, sign: ticket.sign, cuit: cfg.cuit };
}

export async function lastAuthorized(pointOfSale: number, cbteTipo: number) {
  const cfg = arcaConfig();
  return parseUltimoAutorizado(await post(cfg.wsfe, ultimoAutorizadoEnvelope(await auth(), pointOfSale, cbteTipo), soapAction("FECompUltimoAutorizado")));
}

export async function requestCae(req: FecaeRequest) {
  const cfg = arcaConfig();
  return parseFecae(await post(cfg.wsfe, fecaeEnvelope(await auth(), req), soapAction("FECAESolicitar")));
}

export async function consultVoucher(pointOfSale: number, cbteTipo: number, number: number) {
  const cfg = arcaConfig();
  return parseCompConsultar(await post(cfg.wsfe, compConsultarEnvelope(await auth(), pointOfSale, cbteTipo, number), soapAction("FECompConsultar")));
}
