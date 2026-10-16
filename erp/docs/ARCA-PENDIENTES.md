# Facturación electrónica ARCA: qué tenemos y qué falta

Lista viva: se actualiza a medida que llegan documentos y datos.

## Datos confirmados (con documento)

| Dato | Valor | Fuente |
| --- | --- | --- |
| Razón social | UNIFORMES DE LA RECTA S.R.L. | Constancia de inscripción ARCA |
| CUIT | 30-71194129-7 | Constancia de inscripción ARCA |
| Condición de IVA | Responsable Inscripto (IVA alta 12/2011) | Constancia de inscripción ARCA |
| Domicilio fiscal | Pasaje Emilio Huespe 75, Piso 1 Dpto. A, Barrio Centro, 5000 Córdoba | Constancia de inscripción ARCA |
| Actividad principal | 464150 Venta al por mayor de uniformes y ropa de trabajo | Constancia de inscripción ARCA |
| Actividades secundarias | 477120 Venta al por menor de uniformes escolares y guardapolvos; 469090 Venta al por mayor de mercancías n.c.p. | Constancia de inscripción ARCA |
| Ingresos Brutos | Córdoba, Régimen Local mensual, N° 280552097, inscripción 01/12/2011, activo | Constancia de IIBB Córdoba |
| CBU (para FCE) | 2850322430094172941581, cta. cte. 3-322-0941729415-8, Banco Macro, suc. 322 Recta Martinoli | Constancia de CBU firmada (14/08/2025) |
| Domicilio social / local | Recta Martinoli 7707, Local 6, Argüello, Córdoba | Contrato social (2011) |
| Socios | Claudio Hugo Cassutti y Paola Andrea Ganame (gerente designada en 2011) | Contrato social y expediente de inscripción |
| Cierre de ejercicio | 31 de diciembre | Contrato social |

Ya cargados en el sistema como datos del emisor (`src/server/arca/config.ts`; se pueden sobrescribir con `COMPANY_*` en Render).

## Pendiente

### Lo tramita la empresa en ARCA (con la clave fiscal nivel 3 de la SRL)
- [ ] **Certificado de homologación** (servicio "WSASS – Autogestión Certificados Homologación"), autorizado para `wsfe`.
- [ ] **Certificado de producción** (servicio "Administración de Certificados Digitales") y la relación con "Facturación Electrónica" en el "Administrador de Relaciones de Clave Fiscal".
- [ ] **Punto(s) de venta nuevo(s)** tipo "RECE para aplicativo y web services" ("Administración de puntos de venta y domicilios"). Uno por local si facturan por separado.
- [ ] Verificar que el local **Recta Martinoli 7707, Local 6** figure como domicilio comercial en ARCA (la constancia solo muestra el fiscal). Al crear el punto de venta se le asocia un domicilio.

### Datos que faltan
- [ ] **Números de punto de venta** creados y a qué local corresponde cada uno.
- [ ] **Fecha de inicio de actividades** que figura en las facturas actuales. El sistema usa 12/12/2011; las constancias solo dicen 12/2011 (IVA) y 01/12/2011 (IIBB). Confirmar con una factura emitida.
- [ ] **Certificado MiPyME** vigente (y su categoría), necesario para emitir FCE.
- [ ] Si la FCE se usa con la opción **SCA** (Sistema de Circulación Abierta) o **ADC** (Agente de Depósito Colectivo). Si no saben, se usa SCA.
- [ ] Teléfono, email y web para las facturas. Hoy: 3515512455, admin@uniformescoverline.com, www.uniformescoverline.com.
- [ ] Una **factura A y una B ya emitidas** (PDF), para copiar el formato y las leyendas que usan hoy.
- [ ] Si están inscriptos en algún **régimen de percepción** (IIBB Córdoba u otro) que deba figurar en la factura. La constancia de IIBB no lo indica.

### Variables secretas en Render (no se pasan por el chat)
- [ ] `ARCA_MODE` = `homologacion` (después `produccion`)
- [ ] `ARCA_CUIT` = 30711941297
- [ ] `ARCA_CERT` = contenido completo del `.crt`
- [ ] `ARCA_KEY` = contenido completo del `.key`

### Desarrollo (lo hago yo cuando esté el certificado de homologación)
- [ ] Reintento del CAE cuando ARCA no responde.
- [ ] Fecha del comprobante asociado en las notas de crédito.
- [ ] Factura de Crédito Electrónica MiPyME (CBU, opción de transferencia, vencimiento).
- [ ] Pruebas en homologación: factura A, factura B, nota de crédito A y B, FCE.
- [ ] Pasaje a producción.

## Para publicar en dominio propio

- [ ] **Dominio o subdominio** del sistema (por ejemplo `sistema.uniformescoverline.com`) y acceso al panel DNS donde está registrado `uniformescoverline.com`, para crear el registro CNAME que pide Render.
- [ ] **Base de datos paga en Render** (la gratuita vence a los 30 días). Se arranca vacía: datos reales recién con la estructura publicada.
- [ ] Usuario administrador definitivo y un usuario por persona, con su rol y su local.

## Campañas y avisos a clientes (WhatsApp y email)

- [ ] **Número de WhatsApp** por local (Recta Martinoli 351 551-2455, Villa Allende 351 803-2157) o uno central para todo.
- [ ] **Email remitente** por local o uno central (por ejemplo ventas@uniformescoverline.com).
- Hoy el envío es asistido: el sistema arma el mensaje y abre WhatsApp o el correo del dispositivo.
- Para que salga solo desde el sistema hace falta **WhatsApp Business API** (cuenta de Meta Business verificada, número dedicado que no se use en la app común y plantillas aprobadas) y un **proveedor de email** (Brevo, Resend, Amazon SES) con los registros SPF y DKIM en el DNS del dominio.
