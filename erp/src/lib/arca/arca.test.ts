import { describe, expect, it } from "vitest";

import { arcaDate, isValidCuit } from "./codes";
import { ArcaError, buildFecaeRequest, buildQrUrl, receiverFor, vatBreakdown } from "./invoice";
import { ArcaServiceError, fecaeEnvelope, parseCompConsultar, parseFecae, parseLoginCms, parseUltimoAutorizado, SoapFault } from "./soap";

const soap = (inner: string) =>
  `<?xml version="1.0" encoding="utf-8"?><soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/"><soap:Body>${inner}</soap:Body></soap:Envelope>`;

describe("receptor", () => {
  it("factura A exige RI con CUIT", () => {
    expect(receiverFor("FACTURA_A", { documentType: "CUIT", documentNumber: "30-71555555-5", taxCondition: "RESPONSABLE_INSCRIPTO" })).toEqual({
      docTipo: 80,
      docNro: "30715555555",
      condicionIvaReceptorId: 1,
    });
    expect(() => receiverFor("FACTURA_A", null)).toThrow(ArcaError);
  });
  it("factura B a consumidor final sin identificar o con DNI", () => {
    expect(receiverFor("FACTURA_B", null)).toEqual({ docTipo: 99, docNro: "0", condicionIvaReceptorId: 5 });
    expect(receiverFor("FACTURA_B", { documentType: "DNI", documentNumber: "30.123.456", taxCondition: "CONSUMIDOR_FINAL" })).toEqual({
      docTipo: 96,
      docNro: "30123456",
      condicionIvaReceptorId: 5,
    });
    expect(receiverFor("FACTURA_B", { documentType: "CUIT", documentNumber: "30-70000000-7", taxCondition: "EXENTO" }).condicionIvaReceptorId).toBe(4);
    expect(() => receiverFor("FACTURA_B", { documentType: "CUIT", documentNumber: "30715555555", taxCondition: "RESPONSABLE_INSCRIPTO" })).toThrow(/factura A/);
  });
});

describe("desglose y pedido de CAE", () => {
  const lines = [
    { total: 58080, vatRate: 21 },
    { total: 75020, vatRate: 21 },
  ];
  it("agrupa por alícuota con redondeo por línea", () => {
    expect(vatBreakdown(lines)).toEqual({ net: 110000, vat: 23100, total: 133100, byRate: [{ id: 5, rate: 21, base: 110000, amount: 23100 }] });
  });

  it("arma el pedido y valida contra el total de la venta", () => {
    const req = buildFecaeRequest({
      invoiceType: "FACTURA_A",
      pointOfSale: 1,
      number: 15,
      date: new Date("2026-10-13T20:00:00Z"),
      receiver: { docTipo: 80, docNro: "30715555555", condicionIvaReceptorId: 1 },
      lines,
      expectedTotal: 133100,
      issuerCuit: "30-71234567-8",
    });
    expect(req).toMatchObject({ CbteTipo: 1, CbteDesde: 15, CbteFch: "20261013", ImpNeto: 110000, ImpIVA: 23100, ImpTotal: 133100 });
    expect(() =>
      buildFecaeRequest({
        invoiceType: "FACTURA_A",
        pointOfSale: 1,
        number: 16,
        date: new Date(),
        receiver: { docTipo: 80, docNro: "30715555555", condicionIvaReceptorId: 1 },
        lines,
        expectedTotal: 133000,
        issuerCuit: "30712345678",
      }),
    ).toThrow(/no coincide/);
  });

  it("la nota de crédito asocia la factura original", () => {
    const base = { pointOfSale: 1, number: 3, date: new Date("2026-10-14T15:00:00Z"), receiver: { docTipo: 99, docNro: "0", condicionIvaReceptorId: 5 }, lines: [{ total: 29040, vatRate: 21 }], expectedTotal: 29040, issuerCuit: "30712345678" };
    expect(() => buildFecaeRequest({ ...base, invoiceType: "NOTA_CREDITO_B" })).toThrow(/asociar/);
    const req = buildFecaeRequest({ ...base, invoiceType: "NOTA_CREDITO_B", associated: { invoiceType: "FACTURA_B", pointOfSale: 1, number: 120, date: new Date("2026-10-13T15:00:00Z") } });
    expect(req.CbtesAsoc).toEqual([{ Tipo: 6, PtoVta: 1, Nro: 120, Cuit: "30712345678", CbteFch: "20261013" }]);
    const xml = fecaeEnvelope({ token: "t", sign: "s", cuit: "30712345678" }, req);
    expect(xml).toContain("<ar:CbteTipo>8</ar:CbteTipo>");
    expect(xml).toContain("<ar:CbtesAsoc><ar:CbteAsoc><ar:Tipo>6</ar:Tipo>");
    expect(xml).toContain("<ar:ImpTotal>29040.00</ar:ImpTotal>");
  });

  it("fecha en hora argentina", () => {
    expect(arcaDate(new Date("2026-10-14T02:00:00Z"))).toBe("20261013");
  });

  it("QR fiscal RG 4291", () => {
    const url = buildQrUrl({ date: new Date("2026-10-13T15:00:00Z"), issuerCuit: "30712345678", pointOfSale: 1, cbteTipo: 6, number: 120, total: 29040, docTipo: 99, docNro: "0", cae: "76543210987654" });
    const json = JSON.parse(Buffer.from(url.split("p=")[1], "base64").toString());
    expect(json).toMatchObject({ ver: 1, fecha: "2026-10-13", cuit: 30712345678, tipoCmp: 6, nroCmp: 120, importe: 29040, tipoCodAut: "E", codAut: 76543210987654 });
  });

  it("valida dígito verificador de CUIT", () => {
    expect(isValidCuit("20-12345678-6")).toBe(true);
    expect(isValidCuit("20-12345678-0")).toBe(false);
  });
});

describe("respuestas SOAP", () => {
  it("lee el ticket de acceso de WSAA", () => {
    const ticket = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><loginTicketResponse version="1.0"><header><expirationTime>2026-10-14T08:00:00.000-03:00</expirationTime></header><credentials><token>TOKEN123</token><sign>SIGN456</sign></credentials></loginTicketResponse>`;
    const xml = soap(`<loginCmsResponse xmlns="http://wsaa.view.sua.dvadac.desein.afip.gov"><loginCmsReturn>${ticket.replace(/</g, "&lt;").replace(/>/g, "&gt;")}</loginCmsReturn></loginCmsResponse>`);
    expect(parseLoginCms(xml)).toEqual({ token: "TOKEN123", sign: "SIGN456", expiresAt: new Date("2026-10-14T11:00:00.000Z") });
  });

  it("lee el último autorizado y los errores", () => {
    expect(parseUltimoAutorizado(soap(`<FECompUltimoAutorizadoResponse xmlns="http://ar.gov.afip.dif.FEV1/"><FECompUltimoAutorizadoResult><PtoVta>1</PtoVta><CbteTipo>6</CbteTipo><CbteNro>119</CbteNro></FECompUltimoAutorizadoResult></FECompUltimoAutorizadoResponse>`))).toBe(119);
    expect(() =>
      parseUltimoAutorizado(soap(`<FECompUltimoAutorizadoResponse><FECompUltimoAutorizadoResult><Errors><Err><Code>600</Code><Msg>ValidacionDeToken: No validaron las fechas del token</Msg></Err></Errors></FECompUltimoAutorizadoResult></FECompUltimoAutorizadoResponse>`)),
    ).toThrow(ArcaServiceError);
  });

  it("lee un CAE aprobado con observaciones", () => {
    const r = parseFecae(
      soap(
        `<FECAESolicitarResponse><FECAESolicitarResult><FeCabResp><Resultado>A</Resultado></FeCabResp><FeDetResp><FECAEDetResponse><Concepto>1</Concepto><DocTipo>99</DocTipo><CbteDesde>120</CbteDesde><CbteHasta>120</CbteHasta><Resultado>A</Resultado><Observaciones><Obs><Code>10217</Code><Msg>Observacion de prueba</Msg></Obs></Observaciones><CAE>76543210987654</CAE><CAEFchVto>20261023</CAEFchVto></FECAEDetResponse></FeDetResp></FECAESolicitarResult></FECAESolicitarResponse>`,
      ),
    );
    expect(r).toEqual({ approved: true, cae: "76543210987654", caeDueDate: "20261023", number: 120, observations: [{ code: "10217", message: "Observacion de prueba" }], errors: [] });
  });

  it("lee un rechazo", () => {
    const r = parseFecae(
      soap(
        `<FECAESolicitarResponse><FECAESolicitarResult><FeCabResp><Resultado>R</Resultado></FeCabResp><FeDetResp><FECAEDetResponse><CbteDesde>120</CbteDesde><Resultado>R</Resultado><Observaciones><Obs><Code>10016</Code><Msg>El numero de comprobante no es el proximo a autorizar</Msg></Obs></Observaciones></FECAEDetResponse></FeDetResp></FECAESolicitarResult></FECAESolicitarResponse>`,
      ),
    );
    expect(r.approved).toBe(false);
    expect(r.cae).toBeNull();
    expect(r.observations[0].code).toBe("10016");
  });

  it("recupera un comprobante ya autorizado", () => {
    expect(
      parseCompConsultar(soap(`<FECompConsultarResponse><FECompConsultarResult><ResultGet><DocNro>0</DocNro><ImpTotal>29040</ImpTotal><Resultado>A</Resultado><CodAutorizacion>765</CodAutorizacion><FchVto>20261023</FchVto></ResultGet></FECompConsultarResult></FECompConsultarResponse>`)),
    ).toEqual({ found: true, cae: "765", caeDueDate: "20261023", total: 29040, docNro: "0" });
  });

  it("convierte SOAP Fault en error", () => {
    expect(() => parseFecae(soap(`<soap:Fault><faultcode>soap:Server</faultcode><faultstring>Servicio no disponible</faultstring></soap:Fault>`))).toThrow(SoapFault);
  });
});
