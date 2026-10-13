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
| `npm test` | Tests unitarios (Vitest) del motor de escandallo |
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

## Pendiente para los próximos módulos

Autenticación y sesiones (el modelo `User`/`Role` ya existe; las Server Actions aún no registran el usuario), POS y cajas, CRM, compras y cuentas corrientes, facturación ARCA y reportes.
