/**
 * Seed idempotente: roles, usuario admin, cajas, proveedores, talleres,
 * materias primas, tarifario de procesos y dos fichas técnicas completas
 * (Chomba piqué bordada y Ambo médico). Los precios son de referencia y se
 * reemplazan con los de reposición reales desde la app.
 *
 * Uso: npm run db:seed   (requiere DATABASE_URL y SEED_ADMIN_PASSWORD opcional)
 */
import "dotenv/config";

import { PrismaPg } from "@prisma/adapter-pg";

import { Prisma, PrismaClient } from "../src/generated/prisma/client";
import type {
  ProductCategory,
  ProductSourcing,
  RawMaterialType,
  TaxCondition,
  ServiceType,
  UnitOfMeasure,
  WorkshopType,
} from "../src/generated/prisma/enums";
import { hashPassword } from "../src/lib/auth/password";
import { recalculateProductCost } from "../src/server/services/costing.service";

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }) });
const D = (v: number | string) => new Prisma.Decimal(v);

const ROLES = [
  { name: "ADMIN", description: "Acceso total", permissions: ["*"] },
  {
    name: "PRODUCCION",
    description: "Fichas técnicas, órdenes y talleres",
    permissions: ["production:*", "purchases:read"],
  },
  {
    name: "VENDEDOR",
    description: "POS, clientes y presupuestos",
    permissions: ["pos:sell", "pos:discount", "crm:read", "crm:write", "cash:session", "production:read"],
  },
  { name: "ADMINISTRACION", description: "Compras, cuentas corrientes y reportes", permissions: ["purchases:*", "accounts:*", "reports:*", "cash:*"] },
];

const SUPPLIERS = [
  { cuit: "30-71111111-1", businessName: "Textil del Oeste S.A.", paymentTermDays: 60 },
  { cuit: "30-72222222-2", businessName: "Avíos Once S.R.L.", paymentTermDays: 30 },
  { cuit: "30-73333333-3", businessName: "Calzados Industriales S.R.L.", paymentTermDays: 45 },
];

const MATERIALS: {
  code: string;
  name: string;
  type: RawMaterialType;
  uom: UnitOfMeasure;
  cost: number;
  composition?: string;
  widthCm?: number;
  metersPerKg?: number;
  supplier: string;
}[] = [
  { code: "TEL-PIQ-24", name: "Piqué 24/1", type: "TELA", uom: "METRO", cost: 6800, composition: "50% algodón 50% poliéster", widthCm: 180, metersPerKg: 2.6, supplier: "30-71111111-1" },
  { code: "TEL-JER-24", name: "Jersey algodón 24/1", type: "TELA", uom: "METRO", cost: 5600, composition: "100% algodón", widthCm: 180, metersPerKg: 3.1, supplier: "30-71111111-1" },
  { code: "TEL-ACR", name: "Acrocel", type: "TELA", uom: "METRO", cost: 5900, composition: "65% poliéster 35% algodón", widthCm: 160, supplier: "30-71111111-1" },
  { code: "TEL-FRI", name: "Frisa invisible", type: "TELA", uom: "METRO", cost: 8200, composition: "70% algodón 30% poliéster", widthCm: 180, metersPerKg: 1.9, supplier: "30-71111111-1" },
  { code: "TEL-REEB", name: "Reeb 1x1", type: "TELA", uom: "METRO", cost: 5200, composition: "95% algodón 5% elastano", widthCm: 100, supplier: "30-71111111-1" },
  { code: "AVI-BOT-4A", name: "Botón 4 agujeros 15 mm", type: "AVIO", uom: "UNIDAD", cost: 45, supplier: "30-72222222-2" },
  { code: "AVI-ELA-30", name: "Elástico 30 mm", type: "AVIO", uom: "METRO", cost: 400, supplier: "30-72222222-2" },
  { code: "AVI-CIE-18", name: "Cierre nylon 18 cm", type: "AVIO", uom: "UNIDAD", cost: 380, supplier: "30-72222222-2" },
  { code: "AVI-ABR", name: "Abrojo 25 mm", type: "AVIO", uom: "METRO", cost: 520, supplier: "30-72222222-2" },
  { code: "AVI-ETQ", name: "Etiqueta tejida + talle", type: "AVIO", uom: "UNIDAD", cost: 90, supplier: "30-72222222-2" },
  { code: "INS-HIL-POL", name: "Hilo poliéster 5000 m", type: "INSUMO", uom: "CONO", cost: 3200, supplier: "30-72222222-2" },
  { code: "EMP-BOL-PP", name: "Bolsa PP con solapa", type: "EMPAQUE", uom: "UNIDAD", cost: 60, supplier: "30-72222222-2" },
];

const WORKSHOPS: { cuit: string | null; name: string; types: WorkshopType[]; isInternal: boolean; taxCondition: TaxCondition; paymentTermDays: number }[] = [
  { cuit: null, name: "Planta Coverline", types: ["PLANCHADO"], isInternal: true, taxCondition: "RESPONSABLE_INSCRIPTO", paymentTermDays: 0 },
  { cuit: "20-30333333-3", name: "Taller Confecciones Morón", types: ["CONFECCION"], isInternal: false, taxCondition: "RESPONSABLE_INSCRIPTO", paymentTermDays: 15 },
  { cuit: "27-30444444-4", name: "Bordados Ituzaingó", types: ["BORDADO"], isInternal: false, taxCondition: "MONOTRIBUTO", paymentTermDays: 15 },
  { cuit: "20-30555555-5", name: "Estampería Haedo", types: ["ESTAMPADO", "SUBLIMACION"], isInternal: false, taxCondition: "MONOTRIBUTO", paymentTermDays: 30 },
];

const SERVICES: { key: string; type: ServiceType; name: string; cost: number; unitLabel: string; workshop?: string }[] = [
  { key: "corte-remera", type: "CORTE", name: "Corte remera / chomba", cost: 350, unitLabel: "prenda", workshop: "Planta Coverline" },
  { key: "corte-ambo", type: "CORTE", name: "Corte ambo (2 piezas)", cost: 600, unitLabel: "conjunto", workshop: "Planta Coverline" },
  { key: "conf-chomba", type: "CONFECCION", name: "Fasón chomba con pechera y ojal", cost: 2200, unitLabel: "prenda", workshop: "Taller Confecciones Morón" },
  { key: "conf-ambo", type: "CONFECCION", name: "Fasón ambo chaqueta + pantalón", cost: 5500, unitLabel: "conjunto", workshop: "Taller Confecciones Morón" },
  { key: "bord-logo", type: "BORDADO", name: "Bordado logo pecho hasta 8.000 puntadas", cost: 900, unitLabel: "prenda", workshop: "Bordados Ituzaingó" },
  { key: "bord-nombre", type: "BORDADO", name: "Bordado nombre personalizado", cost: 1100, unitLabel: "prenda", workshop: "Bordados Ituzaingó" },
  { key: "est-1color", type: "ESTAMPADO", name: "Estampa serigrafía 1 color", cost: 650, unitLabel: "prenda", workshop: "Estampería Haedo" },
  { key: "planchado", type: "PLANCHADO", name: "Planchado, doblado y embolsado", cost: 280, unitLabel: "prenda", workshop: "Planta Coverline" },
  { key: "flete-taller", type: "FLETE", name: "Flete ida y vuelta a taller (prorrateo)", cost: 150, unitLabel: "prenda" },
];

const PRODUCTS: {
  sku: string;
  name: string;
  category: ProductCategory;
  sourcing?: ProductSourcing;
  baseCost?: number;
  pricingPct: number;
  overheadPct: number;
  listPrice: number;
  sizes: string[];
  color: string;
  bom: { code: string; quantity: number; wastePct: number }[];
  services: { key: string; quantity: number }[];
}[] = [
  {
    sku: "CH-PIQ-001",
    name: "Chomba piqué bordada",
    category: "TRABAJO",
    pricingPct: 100,
    overheadPct: 8,
    listPrice: 24000,
    sizes: ["S", "M", "L", "XL", "XXL"],
    color: "Azul marino",
    bom: [
      { code: "TEL-PIQ-24", quantity: 1.2, wastePct: 5 },
      { code: "TEL-REEB", quantity: 0.1, wastePct: 5 },
      { code: "AVI-BOT-4A", quantity: 3, wastePct: 0 },
      { code: "AVI-ETQ", quantity: 1, wastePct: 0 },
      { code: "INS-HIL-POL", quantity: 0.02, wastePct: 0 },
      { code: "EMP-BOL-PP", quantity: 1, wastePct: 0 },
    ],
    services: [
      { key: "corte-remera", quantity: 1 },
      { key: "conf-chomba", quantity: 1 },
      { key: "bord-logo", quantity: 1 },
      { key: "planchado", quantity: 1 },
      { key: "flete-taller", quantity: 1 },
    ],
  },
  {
    sku: "AM-ACR-010",
    name: "Ambo médico acrocel",
    category: "MEDICA",
    pricingPct: 90,
    overheadPct: 8,
    listPrice: 52000,
    sizes: ["XS", "S", "M", "L", "XL", "XXL"],
    color: "Celeste",
    bom: [
      { code: "TEL-ACR", quantity: 2.6, wastePct: 6 },
      { code: "AVI-ELA-30", quantity: 0.8, wastePct: 0 },
      { code: "AVI-ETQ", quantity: 2, wastePct: 0 },
      { code: "INS-HIL-POL", quantity: 0.04, wastePct: 0 },
      { code: "EMP-BOL-PP", quantity: 1, wastePct: 0 },
    ],
    services: [
      { key: "corte-ambo", quantity: 1 },
      { key: "conf-ambo", quantity: 1 },
      { key: "bord-nombre", quantity: 1 },
      { key: "planchado", quantity: 1 },
      { key: "flete-taller", quantity: 2 },
    ],
  },
  {
    sku: "ZS-ACE-100",
    name: "Zapato de seguridad puntera de acero",
    category: "ACCESORIO",
    sourcing: "REVENTA",
    baseCost: 38000,
    pricingPct: 60,
    overheadPct: 0,
    listPrice: 62000,
    sizes: ["38", "39", "40", "41", "42", "43", "44", "45"],
    color: "Negro",
    bom: [],
    services: [],
  },
];

async function main() {
  // --- Roles y admin ---------------------------------------------------------
  for (const role of ROLES) {
    await prisma.role.upsert({ where: { name: role.name }, update: { description: role.description, permissions: role.permissions }, create: role });
  }
  const adminRole = await prisma.role.findUniqueOrThrow({ where: { name: "ADMIN" } });
  const adminEmail = process.env.SEED_ADMIN_EMAIL ?? "admin@coverline.local";
  const existingAdmin = await prisma.user.findUnique({ where: { email: adminEmail } });
  if (!existingAdmin) {
    const password = process.env.SEED_ADMIN_PASSWORD ?? "cambiar-esta-clave";
    await prisma.user.create({
      data: { email: adminEmail, name: "Administrador", passwordHash: await hashPassword(password), roleId: adminRole.id },
    });
  }

  // --- Cajas y cuentas -------------------------------------------------------
  const registers = [
    { name: "Caja Diaria Mostrador", kind: "CAJA_DIARIA" as const, requiresSession: true },
    { name: "Caja Administrativa", kind: "CAJA_ADMINISTRATIVA" as const, requiresSession: true },
    { name: "Mercado Pago", kind: "BILLETERA_VIRTUAL" as const, requiresSession: false },
    { name: "Banco Cuenta Corriente", kind: "BANCO" as const, requiresSession: false },
  ];
  for (const r of registers) {
    await prisma.cashRegister.upsert({ where: { name: r.name }, update: {}, create: r });
  }

  // --- Proveedores y materias primas ----------------------------------------
  const supplierIds = new Map<string, string>();
  for (const s of SUPPLIERS) {
    const sup = await prisma.supplier.upsert({ where: { cuit: s.cuit }, update: {}, create: s });
    supplierIds.set(s.cuit, sup.id);
  }
  const materialIds = new Map<string, string>();
  for (const m of MATERIALS) {
    const data = {
      name: m.name,
      type: m.type,
      uom: m.uom,
      composition: m.composition ?? null,
      widthCm: m.widthCm !== undefined ? D(m.widthCm) : null,
      metersPerKg: m.metersPerKg !== undefined ? D(m.metersPerKg) : null,
      supplierId: supplierIds.get(m.supplier) ?? null,
    };
    const rm = await prisma.rawMaterial.upsert({
      where: { code: m.code },
      update: data,
      create: { ...data, code: m.code, currentCost: D(m.cost), stockQty: D(m.type === "TELA" ? 400 : m.type === "INSUMO" ? 20 : 3000) },
    });
    materialIds.set(m.code, rm.id);
  }

  // --- Talleres y tarifario ---------------------------------------------------
  const workshopIds = new Map<string, string>();
  for (const w of WORKSHOPS) {
    const existing = await prisma.workshop.findFirst({ where: { name: w.name } });
    const ws = existing
      ? await prisma.workshop.update({ where: { id: existing.id }, data: { taxCondition: w.taxCondition, paymentTermDays: w.paymentTermDays } })
      : await prisma.workshop.create({ data: w });
    workshopIds.set(w.name, ws.id);
  }
  const serviceIds = new Map<string, string>();
  for (const s of SERVICES) {
    const existing = await prisma.serviceCost.findFirst({ where: { name: s.name, type: s.type } });
    const sc =
      existing ??
      (await prisma.serviceCost.create({
        data: {
          type: s.type,
          name: s.name,
          unitCost: D(s.cost),
          unitLabel: s.unitLabel,
          workshopId: s.workshop ? workshopIds.get(s.workshop) ?? null : null,
        },
      }));
    serviceIds.set(s.key, sc.id);
  }

  // --- Cliente de ejemplo --------------------------------------------------------
  await prisma.client.upsert({
    where: { documentType_documentNumber: { documentType: "CUIT", documentNumber: "30-70000000-7" } },
    update: {},
    create: {
      type: "ESCUELA",
      businessName: "Instituto San Martín (ejemplo)",
      documentType: "CUIT",
      documentNumber: "30-70000000-7",
      taxCondition: "EXENTO",
      tags: ["colegio", "reposicion-anual"],
      purchaseMonths: [11, 12, 2],
    },
  });

  // --- Productos, variantes y fichas técnicas --------------------------------
  for (const p of PRODUCTS) {
    const product = await prisma.product.upsert({
      where: { sku: p.sku },
      update: {},
      create: {
        sku: p.sku,
        name: p.name,
        category: p.category,
        sourcing: p.sourcing ?? "FABRICADO",
        currentCost: D(p.baseCost ?? 0),
        costUpdatedAt: p.baseCost ? new Date() : null,
        pricingMode: "MARKUP",
        pricingPct: D(p.pricingPct),
        overheadPct: D(p.overheadPct),
        listPrice: D(p.listPrice),
      },
    });

    for (const size of p.sizes) {
      await prisma.productVariant.upsert({
        where: { sku: `${p.sku}-${size}` },
        update: {},
        create: { productId: product.id, sku: `${p.sku}-${size}`, size, color: p.color },
      });
    }

    if (p.sourcing === "REVENTA") {
      console.log(`  ${p.sku.padEnd(12)} reventa, costo ${p.baseCost}`);
      continue;
    }
    const hasSheet = (await prisma.productBOM.count({ where: { productId: product.id } })) > 0;
    if (!hasSheet) {
      await prisma.productBOM.createMany({
        data: p.bom.map((b, i) => ({
          productId: product.id,
          rawMaterialId: materialIds.get(b.code)!,
          quantity: D(b.quantity),
          wastePct: D(b.wastePct),
          sortOrder: i,
        })),
      });
      await prisma.productServiceCost.createMany({
        data: p.services.map((s, i) => ({
          productId: product.id,
          serviceCostId: serviceIds.get(s.key)!,
          quantity: D(s.quantity),
          sortOrder: i,
        })),
      });
    }

    const result = await recalculateProductCost(prisma, product.id, "MANUAL", { force: !hasSheet });
    console.log(`  ${p.sku.padEnd(12)} costo ${result.newCost.toFixed(2).padStart(10)}  sugerido neto ${result.breakdown.suggestedNetPrice.toFixed(2)}`);
  }
}

main()
  .then(() => console.log("Seed completo."))
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
