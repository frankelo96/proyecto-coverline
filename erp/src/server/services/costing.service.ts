/**
 * Servicio de escandallo: lee la ficha técnica de la base, calcula el costo
 * con el motor puro y persiste costo vigente + snapshot auditable.
 *
 * Recibe el cliente Prisma por parámetro (inyección de dependencias) para
 * poder usarse desde Server Actions, scripts (seed) y dentro de transacciones.
 */
import type { CostSnapshotReason } from "@/generated/prisma/enums";
import { Prisma, type PrismaClient } from "@/generated/prisma/client";
import {
  computeCostSheet,
  type CostBreakdown,
  type CostSheetInput,
} from "@/lib/costing/escandallo";
import type { SaveCostSheetInput } from "@/lib/validations/cost-sheet";

type Db = PrismaClient | Prisma.TransactionClient;

/** Variación mínima (en $) para registrar un snapshot automático. */
const COST_CHANGE_EPSILON = new Prisma.Decimal("0.0001");

export class CostingServiceError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CostingServiceError";
  }
}

const productSheetInclude = {
  bom: {
    include: { rawMaterial: true },
    orderBy: [{ sortOrder: "asc" }, { id: "asc" }],
  },
  services: {
    include: { serviceCost: true },
    orderBy: [{ sortOrder: "asc" }, { id: "asc" }],
  },
} satisfies Prisma.ProductInclude;

export type ProductWithSheet = Prisma.ProductGetPayload<{ include: typeof productSheetInclude }>;

export function toCostSheetInput(product: ProductWithSheet, opts?: { priceRoundingStep?: number }): CostSheetInput {
  return {
    materials: product.bom.map((line) => ({
      rawMaterialId: line.rawMaterialId,
      code: line.rawMaterial.code,
      name: line.rawMaterial.name,
      type: line.rawMaterial.type,
      uom: line.rawMaterial.uom,
      quantity: line.quantity,
      wastePct: line.wastePct,
      unitCost: line.rawMaterial.currentCost,
    })),
    services: product.services.map((line) => ({
      serviceCostId: line.serviceCostId,
      name: line.serviceCost.name,
      type: line.serviceCost.type,
      unitLabel: line.serviceCost.unitLabel,
      quantity: line.quantity,
      unitCost: line.serviceCost.unitCost,
    })),
    overheadPct: product.overheadPct,
    pricingMode: product.pricingMode,
    pricingPct: product.pricingPct,
    vatRate: product.vatRate,
    priceRoundingStep: opts?.priceRoundingStep ?? 0,
    listPrice: product.listPrice,
    baselineCost: product.currentCost,
  };
}

export async function getProductWithSheet(db: Db, productId: string): Promise<ProductWithSheet> {
  const product = await db.product.findUnique({ where: { id: productId }, include: productSheetInclude });
  if (!product) throw new CostingServiceError("Producto inexistente");
  return product;
}

export async function getProductCostSheet(db: Db, productId: string) {
  const product = await getProductWithSheet(db, productId);
  return { product, breakdown: computeCostSheet(toCostSheetInput(product)) };
}

export interface RecalculateResult {
  productId: string;
  sku: string;
  name: string;
  previousCost: number;
  newCost: number;
  changed: boolean;
  breakdown: CostBreakdown;
  /** El precio de lista vigente quedó por debajo del margen objetivo. */
  marginAlert: boolean;
}

/**
 * Recalcula el costo de un producto con precios de reposición vigentes,
 * actualiza Product.currentCost y registra un snapshot si hubo cambio
 * (o siempre, si `force`).
 */
export async function recalculateProductCost(
  db: Db,
  productId: string,
  reason: CostSnapshotReason,
  opts: { userId?: string | null; force?: boolean; priceRoundingStep?: number } = {},
): Promise<RecalculateResult> {
  const product = await getProductWithSheet(db, productId);
  const breakdown = computeCostSheet(toCostSheetInput(product, { priceRoundingStep: opts.priceRoundingStep }));
  const newCost = new Prisma.Decimal(breakdown.totalCost);
  const changed = newCost.minus(product.currentCost).abs().gte(COST_CHANGE_EPSILON);

  if (changed || opts.force) {
    await db.product.update({
      where: { id: product.id },
      data: { currentCost: newCost, costUpdatedAt: new Date() },
    });
    await db.productCostSnapshot.create({
      data: {
        productId: product.id,
        reason,
        materialsCost: breakdown.materialsCost,
        servicesCost: breakdown.servicesCost,
        overheadCost: breakdown.overheadCost,
        totalCost: breakdown.totalCost,
        suggestedPrice: breakdown.suggestedNetPrice,
        breakdown: breakdown as unknown as Prisma.InputJsonValue,
        userId: opts.userId ?? null,
      },
    });
  }

  const listPrice = product.listPrice.toNumber();
  const marginAlert = listPrice > 0 && breakdown.suggestedNetPrice > listPrice;

  return {
    productId: product.id,
    sku: product.sku,
    name: product.name,
    previousCost: product.currentCost.toNumber(),
    newCost: breakdown.totalCost,
    changed,
    breakdown,
    marginAlert,
  };
}

/** Recalcula en cascada todos los productos activos que usan una materia prima. */
export async function recalculateProductsUsingMaterial(
  db: Db,
  rawMaterialId: string,
  userId?: string | null,
): Promise<RecalculateResult[]> {
  const lines = await db.productBOM.findMany({
    where: { rawMaterialId, product: { active: true } },
    select: { productId: true },
  });
  const results: RecalculateResult[] = [];
  for (const { productId } of lines) {
    results.push(await recalculateProductCost(db, productId, "CAMBIO_PRECIO_MATERIAL", { userId }));
  }
  return results;
}

/** Recalcula en cascada todos los productos activos que usan una tarifa de taller/proceso. */
export async function recalculateProductsUsingService(
  db: Db,
  serviceCostId: string,
  userId?: string | null,
): Promise<RecalculateResult[]> {
  const lines = await db.productServiceCost.findMany({
    where: { serviceCostId, product: { active: true } },
    select: { productId: true },
  });
  const results: RecalculateResult[] = [];
  for (const { productId } of lines) {
    results.push(await recalculateProductCost(db, productId, "CAMBIO_TARIFA_SERVICIO", { userId }));
  }
  return results;
}

/**
 * Actualiza el precio de reposición de una tela/avío, guarda historial y
 * recalcula en cascada. Debe ejecutarse dentro de una transacción.
 */
export async function updateRawMaterialCost(
  tx: Prisma.TransactionClient,
  params: { rawMaterialId: string; newCost: number; userId?: string | null; source?: string; purchaseId?: string | null },
) {
  const material = await tx.rawMaterial.findUnique({ where: { id: params.rawMaterialId } });
  if (!material) throw new CostingServiceError("Materia prima inexistente");
  const newCost = new Prisma.Decimal(params.newCost);
  if (newCost.equals(material.currentCost)) return { material, affected: [] as RecalculateResult[] };

  await tx.rawMaterialPriceHistory.create({
    data: {
      rawMaterialId: material.id,
      previousCost: material.currentCost,
      newCost,
      source: params.source ?? "MANUAL",
      purchaseId: params.purchaseId ?? null,
      userId: params.userId ?? null,
    },
  });
  const updated = await tx.rawMaterial.update({ where: { id: material.id }, data: { currentCost: newCost } });
  const affected = await recalculateProductsUsingMaterial(tx, material.id, params.userId);
  return { material: updated, affected };
}

/** Actualiza la tarifa de un taller/proceso y recalcula en cascada. */
export async function updateServiceTariff(
  tx: Prisma.TransactionClient,
  params: { serviceCostId: string; newCost: number; userId?: string | null },
) {
  const service = await tx.serviceCost.findUnique({ where: { id: params.serviceCostId } });
  if (!service) throw new CostingServiceError("Proceso inexistente");
  const newCost = new Prisma.Decimal(params.newCost);
  if (newCost.equals(service.unitCost)) return { service, affected: [] as RecalculateResult[] };

  const updated = await tx.serviceCost.update({
    where: { id: service.id },
    data: { unitCost: newCost, validFrom: new Date() },
  });
  const affected = await recalculateProductsUsingService(tx, service.id, params.userId);
  return { service: updated, affected };
}

/**
 * Reemplaza la ficha técnica completa de un producto (BOM + procesos +
 * parámetros de pricing) y recalcula. Debe ejecutarse dentro de una transacción.
 */
export async function saveProductCostSheet(
  tx: Prisma.TransactionClient,
  input: SaveCostSheetInput,
  userId?: string | null,
): Promise<RecalculateResult> {
  const product = await tx.product.findUnique({ where: { id: input.productId }, select: { id: true } });
  if (!product) throw new CostingServiceError("Producto inexistente");

  const materialIds = [...new Set(input.materials.map((m) => m.rawMaterialId))];
  const serviceIds = [...new Set(input.services.map((s) => s.serviceCostId))];
  if (materialIds.length !== input.materials.length) throw new CostingServiceError("Hay materias primas repetidas");
  if (serviceIds.length !== input.services.length) throw new CostingServiceError("Hay procesos repetidos");

  const [materialCount, serviceCount] = await Promise.all([
    tx.rawMaterial.count({ where: { id: { in: materialIds }, active: true } }),
    tx.serviceCost.count({ where: { id: { in: serviceIds }, active: true } }),
  ]);
  if (materialCount !== materialIds.length) throw new CostingServiceError("Alguna materia prima no existe o está inactiva");
  if (serviceCount !== serviceIds.length) throw new CostingServiceError("Algún proceso no existe o está inactivo");

  await tx.productBOM.deleteMany({ where: { productId: product.id } });
  await tx.productServiceCost.deleteMany({ where: { productId: product.id } });

  if (input.materials.length > 0) {
    await tx.productBOM.createMany({
      data: input.materials.map((m, i) => ({
        productId: product.id,
        rawMaterialId: m.rawMaterialId,
        quantity: new Prisma.Decimal(m.quantity),
        wastePct: new Prisma.Decimal(m.wastePct),
        notes: m.notes,
        sortOrder: i,
      })),
    });
  }
  if (input.services.length > 0) {
    await tx.productServiceCost.createMany({
      data: input.services.map((s, i) => ({
        productId: product.id,
        serviceCostId: s.serviceCostId,
        quantity: new Prisma.Decimal(s.quantity),
        notes: s.notes,
        sortOrder: i,
      })),
    });
  }

  await tx.product.update({
    where: { id: product.id },
    data: {
      overheadPct: new Prisma.Decimal(input.overheadPct),
      pricingMode: input.pricingMode,
      pricingPct: new Prisma.Decimal(input.pricingPct),
      vatRate: new Prisma.Decimal(input.vatRate),
    },
  });

  const result = await recalculateProductCost(tx, product.id, "CAMBIO_FICHA_TECNICA", {
    userId,
    force: true,
    priceRoundingStep: input.priceRoundingStep,
  });

  if (input.applySuggestedPrice) {
    await tx.product.update({
      where: { id: product.id },
      data: { listPrice: new Prisma.Decimal(result.breakdown.suggestedNetPrice) },
    });
    await tx.auditLog.create({
      data: {
        userId: userId ?? null,
        entity: "Product",
        entityId: product.id,
        action: "LIST_PRICE_UPDATE",
        reason: "Precio sugerido por escandallo",
        data: { listPrice: result.breakdown.suggestedNetPrice, cost: result.newCost },
      },
    });
    result.marginAlert = false;
  }

  return result;
}
