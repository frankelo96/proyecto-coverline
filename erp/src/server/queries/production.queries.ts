import "server-only";

import type {
  PricingMode,
  ProductCategory,
  RawMaterialType,
  ServiceType,
  UnitOfMeasure,
} from "@/generated/prisma/enums";
import type { CostSheetFormValues } from "@/lib/validations/cost-sheet";
import { db } from "@/server/db";
import { getProductWithSheet } from "@/server/services/costing.service";

export interface ProductCostRow {
  id: string;
  sku: string;
  name: string;
  category: ProductCategory;
  currentCost: number;
  listPrice: number;
  marginPct: number | null;
  costUpdatedAt: string | null;
  bomLines: number;
}

export async function listProductsWithCost(): Promise<ProductCostRow[]> {
  const products = await db.product.findMany({
    where: { active: true },
    orderBy: [{ category: "asc" }, { name: "asc" }],
    select: {
      id: true,
      sku: true,
      name: true,
      category: true,
      currentCost: true,
      listPrice: true,
      costUpdatedAt: true,
      _count: { select: { bom: true } },
    },
  });
  return products.map((p) => {
    const cost = p.currentCost.toNumber();
    const price = p.listPrice.toNumber();
    return {
      id: p.id,
      sku: p.sku,
      name: p.name,
      category: p.category,
      currentCost: cost,
      listPrice: price,
      marginPct: price > 0 ? ((price - cost) / price) * 100 : null,
      costUpdatedAt: p.costUpdatedAt?.toISOString() ?? null,
      bomLines: p._count.bom,
    };
  });
}

export interface MaterialOption {
  id: string;
  code: string;
  name: string;
  type: RawMaterialType;
  uom: UnitOfMeasure;
  currentCost: number;
}

export interface ServiceOption {
  id: string;
  name: string;
  type: ServiceType;
  unitLabel: string;
  unitCost: number;
  workshopName: string | null;
}

export interface CostSheetEditorData {
  product: {
    id: string;
    sku: string;
    name: string;
    category: ProductCategory;
    listPrice: number;
    currentCost: number;
    pricingMode: PricingMode;
  };
  initialValues: CostSheetFormValues;
  materials: MaterialOption[];
  services: ServiceOption[];
}

/** Datos serializables (sin Decimal) para hidratar el editor cliente. */
export async function getCostSheetEditorData(productId: string): Promise<CostSheetEditorData> {
  const [product, materials, services] = await Promise.all([
    getProductWithSheet(db, productId),
    db.rawMaterial.findMany({ where: { active: true }, orderBy: [{ type: "asc" }, { name: "asc" }] }),
    db.serviceCost.findMany({
      where: { active: true },
      include: { workshop: { select: { name: true } } },
      orderBy: [{ type: "asc" }, { name: "asc" }],
    }),
  ]);

  return {
    product: {
      id: product.id,
      sku: product.sku,
      name: product.name,
      category: product.category,
      listPrice: product.listPrice.toNumber(),
      currentCost: product.currentCost.toNumber(),
      pricingMode: product.pricingMode,
    },
    initialValues: {
      materials: product.bom.map((l) => ({
        rawMaterialId: l.rawMaterialId,
        code: l.rawMaterial.code,
        name: l.rawMaterial.name,
        type: l.rawMaterial.type,
        uom: l.rawMaterial.uom,
        quantity: l.quantity.toNumber(),
        wastePct: l.wastePct.toNumber(),
        unitCost: l.rawMaterial.currentCost.toNumber(),
        notes: l.notes,
      })),
      services: product.services.map((l) => ({
        serviceCostId: l.serviceCostId,
        name: l.serviceCost.name,
        type: l.serviceCost.type,
        unitLabel: l.serviceCost.unitLabel,
        quantity: l.quantity.toNumber(),
        unitCost: l.serviceCost.unitCost.toNumber(),
        notes: l.notes,
      })),
      overheadPct: product.overheadPct.toNumber(),
      pricingMode: product.pricingMode,
      pricingPct: product.pricingPct.toNumber(),
      vatRate: product.vatRate.toNumber(),
      priceRoundingStep: 0,
      fabricShockPct: 0,
    },
    materials: materials.map((m) => ({
      id: m.id,
      code: m.code,
      name: m.name,
      type: m.type,
      uom: m.uom,
      currentCost: m.currentCost.toNumber(),
    })),
    services: services.map((s) => ({
      id: s.id,
      name: s.name,
      type: s.type,
      unitLabel: s.unitLabel,
      unitCost: s.unitCost.toNumber(),
      workshopName: s.workshop?.name ?? null,
    })),
  };
}
