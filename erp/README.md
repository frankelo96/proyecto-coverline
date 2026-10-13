# Coverline ERP

ERP, CRM, trazabilidad de producción y punto de venta para **Coverline Uniformes**.

Stack: Next.js 16 (App Router, Server Actions) · TypeScript estricto · Tailwind CSS v4 + componentes shadcn/ui · TanStack Table v8 · PostgreSQL + Prisma ORM 7 (driver adapter `pg`) · Zod 4 + React Hook Form · decimal.js para la aritmética de costos.

## Puesta en marcha

```bash
cd erp
cp .env.example .env            # completar DATABASE_URL
npm install
npm run db:generate             # genera el cliente Prisma en src/generated/prisma
npm run db:migrate              # aplica prisma/migrations
SEED_ADMIN_PASSWORD='...' npm run db:seed
npm run dev                     # http://localhost:3000
```

Producción: `npm run db:deploy && npm run build && npm start`.

| Script | Uso |
| --- | --- |
| `npm test` | Tests unitarios (Vitest): escandallo, producción, compras/pagos, POS, cajas, cheques, ticket, ARCA y permisos |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run lint` | ESLint (config Next) |
| `npm run db:studio` | Prisma Studio |

## Estructura

```
erp/
├── prisma/
│   ├── schema.prisma          # Modelo completo: CRM, abastecimiento, BOM, producción, POS, cajas, ctas. ctes.
│   ├── migrations/            # Migraciones SQL versionadas
│   └── seed.ts                # Datos base idempotentes (roles, cajas, telas, avíos, talleres, 2 fichas)
├── prisma.config.ts
└── src/
    ├── app/                   # Rutas (App Router)
    │   └── (dashboard)/produccion/fichas/          # Listado de fichas técnicas
    │       └── [productId]/                        # Editor + simulador de escandallo
    ├── components/
    │   ├── ui/                # Primitivas shadcn/ui (button, input, card, table, badge…)
    │   ├── layout/            # Header y navegación
    │   └── production/        # CostSheetEditor, CostSummaryPanel, ProductCostTable
    ├── lib/
    │   ├── costing/           # Motor de escandallo puro (+ tests)
    │   ├── validations/       # Esquemas Zod compartidos cliente/servidor
    │   ├── auth/              # Hash de contraseñas (scrypt)
    │   └── format.ts          # Formato es-AR (moneda, %, unidades)
    ├── server/
    │   ├── db.ts              # PrismaClient singleton (server-only)
    │   ├── services/          # Lógica de negocio transaccional (recibe el cliente por parámetro)
    │   ├── queries/           # Lecturas serializables para Server Components
    │   └── actions/           # Server Actions: validación Zod + transacción + revalidación
    └── generated/prisma/      # Cliente Prisma generado (no versionado)
```

## Módulo A — Ficha técnica y escandallo

- **Ficha técnica (`ProductBOM`)**: consumo neto por prenda de cada materia prima + % de merma de corte. El consumo bruto es `neto × (1 + merma)`.
- **Procesos (`ServiceCost` + `ProductServiceCost`)**: tarifario de corte, fasón de talleres, bordado/estampado/sublimación, planchado, empaque y fletes, con cantidad por prenda.
- **Costo** = materiales + procesos + gastos generales (% sobre costo directo).
- **Precio sugerido** por *markup* sobre costo o *margen* sobre precio, IVA configurable y redondeo comercial hacia arriba.
- **Recálculo dinámico**: `updateRawMaterialCost` / `updateServiceTariff` guardan historial y recalculan en cascada todas las prendas afectadas, dejando un `ProductCostSnapshot` auditable con el desglose línea por línea.
- **Simulador**: el editor recalcula en vivo con el mismo motor que el servidor. Se pueden sobrescribir costos unitarios o aplicar una variación % a todas las telas sin persistirlos; al guardar, el servidor siempre usa los precios de reposición vigentes.
- **Alertas**: aumento contra el costo vigente de la ficha y precio de lista por debajo del sugerido o del costo.

## Login y permisos

- Sesiones en base (`Session`): la cookie `cl_session` (httpOnly, SameSite=Lax, Secure en producción) guarda un token aleatorio y la base solo su SHA-256. Duración: 7 días.
- Contraseñas con scrypt. 5 intentos fallidos bloquean la cuenta 15 minutos.
- `src/proxy.ts` hace el chequeo rápido de cookie; la validación real está en `requirePageUser` / `requireActionUser` (`src/server/auth/session.ts`).
- Permisos por rol con comodines (`*`, `production:*`). Ver `src/lib/auth/permissions.ts`.
- Usuario inicial del seed: `admin@coverline.local` con la clave de `SEED_ADMIN_PASSWORD` (cambiala en producción).

## Módulo A — Órdenes de producción y talleres

Etapas: **Corte interno → Taller de confección → Personalización (opcional) → Calidad y planchado → Listo / stock**.

- **Alta** con curva de talles, cliente opcional, fecha comprometida y si pasa por personalización.
- **Lanzar a corte**: descuenta del stock el consumo bruto de la ficha técnica y lo suma al costo real; avisa faltantes.
- **Cerrar corte**: piezas efectivamente cortadas; la diferencia es merma de corte.
- **Remitos a talleres** (`WorkshopRemit`): envíos y recepciones parciales a uno o varios talleres. Se controla lo enviado contra lo recibido + merma; no se puede recibir más de lo que tiene cada taller. Cada recepción genera la deuda de fasón (`AccountPayable`, 30 días) con la tarifa sugerida por la ficha técnica. La etapa avanza sola cuando vuelve todo.
- **Calidad**: prendas aprobadas por talle ingresan al stock de cada variante; el resto queda como merma.
- **Trazabilidad**: cada cambio de etapa queda en `ProductionStageLog` con usuario, piezas que entran/salen y merma. Las cancelaciones exigen motivo y quedan en `AuditLog`.
- **Talleres**: piezas en poder de cada taller (con antigüedad) y fasón a pagar / vencido.
- **Remito imprimible** A4 en `/produccion/remitos/[id]`.
- Las operaciones bloquean la fila de la orden (`SELECT … FOR UPDATE`) para evitar dobles registros simultáneos.

## Módulo D — Compras y cuentas a pagar

Las compras se separan en dos tipos de comprobante (`Purchase.kind`):

**Mercadería** (`/compras/mercaderia/nueva`), con ítems clasificados en:
- **Materia prima** (telas): se pueden comprar por metro o por kg; la cantidad y el costo se convierten a la unidad de stock con el rendimiento m/kg de la tela.
- **Avíos, insumos y empaque**.
- **Producto terminado**: si el producto es de reventa (`Product.sourcing = REVENTA`), actualiza su costo con el último precio de compra.

Al registrar: sube el stock, guarda el costo anterior y el nuevo en cada ítem, actualiza el costo de reposición (con historial) y recalcula en cascada las fichas técnicas. El formulario anticipa la variación de costo, cuántas fichas se recalculan y advierte variaciones de ±30% o más; el resultado lista las fichas cuyo precio de lista quedó por debajo del sugerido.

**Servicios de taller** (`/compras/talleres/nueva`): factura de un taller de confección o personalización cargada sobre las recepciones con remito todavía no facturadas. La factura reemplaza la deuda provisoria de cada recepción (los pagos ya hechos se reimputan a la factura, sin duplicar deuda) y, si el precio facturado difiere del pactado, ajusta el costo real de la orden de producción.

Ambos tipos guardan los datos del Libro IVA Compras: tipo de comprobante (A/B/C), punto de venta y número, neto, IVA por alícuota (21 / 10,5 / 27), percepciones de IVA e IIBB y otros impuestos. Solo la factura A discrimina IVA. Se bloquea la carga duplicada del mismo comprobante. La anulación revierte stock o recepciones y exige motivo (queda auditada); no se permite si tiene pagos.

**Cuentas a pagar** (`/compras/cuentas`): saldos de proveedores y talleres con antigüedad (a vencer, 1-30, 31-60, 61-90, +90 días), extracto con saldo corrido y **órdenes de pago** que imputan un importe a varios comprobantes (del vencimiento más viejo al más nuevo), registran el egreso en la caja o cuenta elegida y se imprimen para firmar.

## Módulo C — POS, cajas, tesorería y cheques

**Sucursales y cajas**
- Locales **Recta Martinolli** y **Villa Allende**, cada uno con su **caja diaria** que trabaja por turnos.
- **Caja negra** (resguardo, sin turnos): recibe los retiros de efectivo de las cajas diarias y desde ahí salen los pagos en efectivo.
- **Banco** y **Mercado Pago** como cuentas; cada una declara qué medios de cobro se le acreditan por defecto (`CashRegister.defaultForMethods`).
- Regla dura: ninguna caja que trabaja por turnos acepta movimientos sin turno abierto, y ninguna caja física puede quedar con saldo negativo. Lo que está en el cajón del local nunca se mezcla con tesorería.

**Turnos** (`/pos/[caja]`)
- Apertura con el efectivo contado; si no coincide con el cierre anterior, se registra la diferencia y se avisa.
- Durante el turno: retiros a caja negra e ingresos/egresos menores con concepto. El POS nunca muestra el saldo del cajón.
- **Cierre ciego**: se declara lo contado sin ver lo esperado; el sobrante o faltante queda como ajuste auditado. Se elige el fondo que queda para el día siguiente y el resto se retira a caja negra en el mismo paso.
- Arqueo imprimible con esperado vs. contado, cobros por medio y movimientos del cajón.

**Venta**
- Búsqueda por prenda, talle o SKU con Enter para agregar.
- Venta fraccionada e ítems libres (medidas especiales, arreglos).
- Precios calculados por el servidor (lista neta + IVA + ajuste de talle).
- Descuentos por línea o generales, con permiso y motivo obligatorio (auditados).
- Comprobante: ticket, factura B o factura A (solo a responsables inscriptos con CUIT); numeración por punto de venta del local.
- Medios de cobro: efectivo con vuelto, débito, crédito con cuotas, Mercado Pago, MODO, transferencia, cheque, eCheq y cuenta corriente (con control del límite de crédito).
- Destino de cada cobro: el efectivo va al cajón; tarjetas, QR y transferencias a su cuenta; los cheques a cartera; la cuenta corriente genera deuda del cliente.
- Ticket térmico **58 mm (32 columnas) / 80 mm (48 columnas)** en pantalla y en texto plano ASCII para enviar a impresoras ESC/POS (`/api/tickets/[id]?ancho=58|80`).

**Cheques y eCheqs** (`/tesoreria/cheques`)
- **De terceros**: se reciben en ventas y cobranzas y quedan en cartera. Desde ahí se depositan, se cobran en efectivo o se **endosan a proveedores y talleres** en la orden de pago. Si se rechazan, se reabre la deuda del cliente y, si estaban endosados, también la del proveedor.
- **Propios / eCheqs**: se emiten en la orden de pago contra una cuenta bancaria y recién descuentan del banco al marcarlos debitados.
- Se valida el ciclo de vida, el plazo de pago diferido (máx. 360 días) y que no se cobren ni depositen antes de su fecha.

**Órdenes de pago con varios instrumentos**: efectivo de caja negra, transferencia, endoso de cheques de terceros y cheque propio o eCheq, combinados en una misma orden.

**Cobranzas de cuenta corriente** (`/tesoreria/cobranzas`): saldos por antigüedad, extracto y recibo imprimible con imputación automática del vencimiento más viejo al más nuevo.

## Facturación electrónica ARCA (WSFEv1)

- **Configuración** (`.env`): `ARCA_MODE` (`deshabilitado` | `homologacion` | `produccion`), `ARCA_CUIT`, `ARCA_CERT` y `ARCA_KEY` (ruta o PEM del certificado emitido por ARCA para el CUIT), y los datos del emisor que se imprimen (`COMPANY_*`). Con `deshabilitado` las facturas quedan *pendientes de CAE*.
- **WSAA**: el ticket de acceso se firma en CMS/PKCS#7 (SHA-256) con el certificado y se guarda en la base (`ArcaToken`) mientras esté vigente (~12 h), para no pedir uno por factura.
- **Autorización**: la venta se confirma primero (stock, caja, cuenta corriente) y después se pide el CAE: último autorizado + 1. Las facturas A/B y notas de crédito A/B toman el número de ARCA; los tickets internos tienen numeración propia.
- **Receptor y montos**: factura A solo a responsables inscriptos con CUIT; B a consumidor final (con o sin documento), exento o monotributo, con la condición frente al IVA del receptor (RG 5616). Neto e IVA por alícuota con el mismo redondeo que el POS; se valida que coincidan con el total antes de enviar.
- **Robustez**: bloqueo optimista contra pedidos simultáneos del mismo comprobante. Si ARCA autoriza pero la respuesta se pierde (corte de red), el reintento consulta el comprobante (`FECompConsultar`) y **recupera el CAE sin consumir otro número**. Errores de red → queda pendiente; rechazos → se guardan los códigos y mensajes de ARCA.
- **Comprobantes pendientes** en `/ventas?filtro=pendientes`, con botón para reintentar.
- **Ticket fiscal**: CUIT, condición IVA, IIBB e inicio de actividades del emisor, desglose de IVA en comprobantes A, CAE con vencimiento y **QR fiscal (RG 4291)**.
- Probado con tests sobre los mensajes SOAP y de punta a punta contra un servidor simulado local. **No se probó contra los servidores reales de ARCA** (sin acceso de red desde el entorno de desarrollo): hacer la primera prueba en homologación.

## Devoluciones y notas de crédito

- Desde el detalle de la venta (`/ventas/[id]`): se eligen cantidades por artículo (hasta lo vendido menos lo ya devuelto), si vuelve al stock o es fallado, y el motivo (obligatorio y auditado).
- Factura A/B → **nota de crédito A/B electrónica** asociada a la factura (la factura debe tener CAE). Ticket interno → devolución interna.
- El importe es proporcional a lo cobrado (respeta descuentos); si se devuelve todo lo que queda de una línea, se toma exactamente su saldo.
- Reintegro: efectivo del cajón del turno abierto, transferencia o Mercado Pago desde su cuenta, o **descuento de la deuda en cuenta corriente** de esa venta.
- El arqueo descuenta las devoluciones y el extracto del cliente las muestra como crédito.

## Pendiente para los próximos módulos

CRM y presupuestos, cambios con vale/saldo a favor del cliente, liquidación de tarjetas (comisiones y acreditación diferida), Libro IVA y reportes. Alta/edición de usuarios, talleres y materias primas desde la app.
