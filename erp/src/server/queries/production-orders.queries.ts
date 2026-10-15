import "server-only";

import type {
  ProductionOrderStatus,
  ProductionStage,
  ServiceType,
  WorkshopRemitType,
  WorkshopType,
} from "@/generated/prisma/enums";
import { isExternalStage, stageBalance, STAGE_WORKSHOP_TYPES } from "@/lib/production/workflow";
import { db } from "@/server/db";

/** Órdenes completadas que siguen visibles en el tablero. */
const COMPLETED_VISIBLE_DAYS = 30;

export interface OrderCard {
  id: string;
  number: number;
  productName: string;
  productSku: string;
  clientName: string | null;
  status: ProductionOrderStatus;
  stage: ProductionStage;
  quantityPlanned: number;
  quantityInProcess: number;
  quantityFinished: number;
  atWorkshops: number;
  unsent: number;
  workshopNames: string[];
  dueDate: string | null;
  overdue: boolean;
  requiresPersonalization: boolean;
}

export async function listOrdersForBoard(): Promise<OrderCard[]> {
  const since = new Date(Date.now() - COMPLETED_VISIBLE_DAYS * 86_400_000);
  const orders = await db.productionOrder.findMany({
    where: {
      OR: [{ status: { in: ["BORRADOR", "EN_PROCESO"] } }, { status: "COMPLETADA", completedAt: { gte: since } }],
    },
    orderBy: [{ dueDate: { sort: "asc", nulls: "last" } }, { number: "asc" }],
    include: {
      product: { select: { name: true, sku: true } },
      client: { select: { businessName: true, fantasyName: true } },
      remits: { select: { type: true, stage: true, workshopId: true, pieces: true, wasteQty: true, workshop: { select: { name: true } } } },
    },
  });
  const now = new Date();
  return orders.map((o) => {
    const external = isExternalStage(o.currentStage) && o.status === "EN_PROCESO";
    const balance = external ? stageBalance(o, o.currentStage) : null;
    const names = new Map(o.remits.map((r) => [r.workshopId, r.workshop.name]));
    return {
      id: o.id,
      number: o.number,
      productName: o.product.name,
      productSku: o.product.sku,
      clientName: o.client ? (o.client.fantasyName ?? o.client.businessName) : null,
      status: o.status,
      stage: o.currentStage,
      quantityPlanned: o.quantityPlanned,
      quantityInProcess: o.quantityInProcess,
      quantityFinished: o.quantityFinished,
      atWorkshops: balance?.atWorkshops ?? 0,
      unsent: balance?.unsent ?? 0,
      workshopNames: balance ? [...balance.byWorkshop.keys()].map((id) => names.get(id) ?? "") : [],
      dueDate: o.dueDate?.toISOString() ?? null,
      overdue: o.status !== "COMPLETADA" && o.dueDate !== null && o.dueDate < now,
      requiresPersonalization: o.requiresPersonalization,
    };
  });
}

export interface NewOrderFormData {
  products: {
    id: string;
    sku: string;
    name: string;
    hasBom: boolean;
    hasPersonalization: boolean;
    variants: { id: string; size: string; color: string | null; fabric: string | null }[];
  }[];
  clients: { id: string; name: string }[];
}

const PERSONALIZATION: ServiceType[] = ["BORDADO", "ESTAMPADO", "SUBLIMACION"];

export { compareSizes } from "@/lib/catalog/variants";
import { compareSizes } from "@/lib/catalog/variants";

export async function getNewOrderFormData(): Promise<NewOrderFormData> {
  const [products, clients] = await Promise.all([
    db.product.findMany({
      where: { active: true },
      orderBy: { name: "asc" },
      include: {
        variants: { where: { active: true }, select: { id: true, size: true, color: true, fabric: true } },
        services: { select: { serviceCost: { select: { type: true } } } },
        _count: { select: { bom: true } },
      },
    }),
    db.client.findMany({ where: { active: true }, orderBy: { businessName: "asc" }, select: { id: true, businessName: true, fantasyName: true } }),
  ]);
  return {
    products: products.map((p) => ({
      id: p.id,
      sku: p.sku,
      name: p.name,
      hasBom: p._count.bom > 0,
      hasPersonalization: p.services.some((s) => PERSONALIZATION.includes(s.serviceCost.type)),
      variants: [...p.variants].sort((a, b) => (a.color ?? "").localeCompare(b.color ?? "", "es") || (a.fabric ?? "").localeCompare(b.fabric ?? "", "es") || compareSizes(a.size, b.size)),
    })),
    clients: clients.map((c) => ({ id: c.id, name: c.fantasyName ? `${c.fantasyName} (${c.businessName})` : c.businessName })),
  };
}

export interface WorkshopOption {
  id: string;
  name: string;
  types: WorkshopType[];
  /** Piezas de esta orden en su poder (etapa actual). */
  holding: number;
  /** Tarifa sugerida de fasón por prenda según ficha técnica / tarifario. */
  suggestedRate: number;
}

export interface OrderDetail {
  id: string;
  number: number;
  status: ProductionOrderStatus;
  stage: ProductionStage;
  requiresPersonalization: boolean;
  product: { id: string; sku: string; name: string };
  client: { name: string } | null;
  quantityPlanned: number;
  quantityInProcess: number;
  quantityFinished: number;
  estimatedUnitCost: number;
  actualCost: number;
  dueDate: string | null;
  notes: string | null;
  createdAt: string;
  startedAt: string | null;
  completedAt: string | null;
  createdBy: string | null;
  items: { variantId: string; size: string; color: string | null; fabric: string | null; quantity: number; quantityFinished: number }[];
  /** Materiales descontados para la orden (para cargar la tela real al cerrar el corte) */
  consumedMaterials: { rawMaterialId: string; code: string; name: string; type: string; uom: string; consumed: number }[];
  balance: { sent: number; received: number; waste: number; atWorkshops: number; unsent: number } | null;
  workshops: WorkshopOption[];
  logs: {
    id: string;
    from: ProductionStage | null;
    to: ProductionStage;
    quantityIn: number;
    quantityOut: number;
    wasteQty: number;
    notes: string | null;
    userName: string | null;
    createdAt: string;
  }[];
  remits: {
    id: string;
    number: number;
    type: WorkshopRemitType;
    stage: ProductionStage;
    workshopName: string;
    pieces: number;
    wasteQty: number;
    laborUnitCost: number;
    laborTotal: number;
    date: string;
  }[];
}

export async function getOrderDetail(orderId: string): Promise<OrderDetail | null> {
  const o = await db.productionOrder.findUnique({
    where: { id: orderId },
    include: {
      product: {
        select: {
          id: true,
          sku: true,
          name: true,
          services: { select: { quantity: true, serviceCost: { select: { workshopId: true, unitCost: true, type: true } } } },
        },
      },
      client: { select: { businessName: true, fantasyName: true } },
      createdBy: { select: { name: true } },
      items: { include: { variant: { select: { size: true, color: true, fabric: true } } } },
      stageLogs: { orderBy: { createdAt: "asc" }, include: { user: { select: { name: true } } } },
      remits: { orderBy: { number: "asc" }, include: { workshop: { select: { name: true } } } },
    },
  });
  if (!o) return null;

  const external = isExternalStage(o.currentStage) && o.status === "EN_PROCESO";
  const balance = external ? stageBalance(o, o.currentStage) : null;

  let workshops: WorkshopOption[] = [];
  if (external) {
    const types = STAGE_WORKSHOP_TYPES[o.currentStage]!;
    const [candidates, tariffs] = await Promise.all([
      db.workshop.findMany({ where: { active: true, types: { hasSome: types } }, orderBy: { name: "asc" } }),
      db.serviceCost.findMany({
        where: { active: true, workshopId: { not: null }, type: { in: types as ServiceType[] } },
        select: { workshopId: true, unitCost: true },
      }),
    ]);
    workshops = candidates.map((w) => {
      // 1) proceso de la ficha técnica hecho por este taller; 2) tarifa del taller para el rubro.
      const fromBom = o.product.services.find((s) => s.serviceCost.workshopId === w.id && (types as string[]).includes(s.serviceCost.type));
      const fromTariff = tariffs.find((t) => t.workshopId === w.id);
      const rate = fromBom
        ? fromBom.serviceCost.unitCost.toNumber() * fromBom.quantity.toNumber()
        : (fromTariff?.unitCost.toNumber() ?? 0);
      return { id: w.id, name: w.name, types: w.types, holding: balance?.byWorkshop.get(w.id) ?? 0, suggestedRate: rate };
    });
  }

  const consumedRows = await db.rawMaterialMovement.groupBy({ by: ["rawMaterialId"], where: { refType: "OP", refId: o.id }, _sum: { delta: true } });
  const consumedMats = consumedRows.length
    ? await db.rawMaterial.findMany({ where: { id: { in: consumedRows.map((r) => r.rawMaterialId) } }, select: { id: true, code: true, name: true, type: true, uom: true } })
    : [];
  const consumedMaterials = consumedRows
    .map((r) => {
      const m = consumedMats.find((x) => x.id === r.rawMaterialId);
      return m ? { rawMaterialId: m.id, code: m.code, name: m.name, type: m.type, uom: m.uom, consumed: -(r._sum.delta?.toNumber() ?? 0) } : null;
    })
    .filter((x): x is NonNullable<typeof x> => x !== null && x.consumed > 0)
    .sort((a, b) => Number(b.type === "TELA") - Number(a.type === "TELA") || a.name.localeCompare(b.name, "es"));
  return {
    consumedMaterials,
    id: o.id,
    number: o.number,
    status: o.status,
    stage: o.currentStage,
    requiresPersonalization: o.requiresPersonalization,
    product: { id: o.product.id, sku: o.product.sku, name: o.product.name },
    client: o.client ? { name: o.client.fantasyName ?? o.client.businessName } : null,
    quantityPlanned: o.quantityPlanned,
    quantityInProcess: o.quantityInProcess,
    quantityFinished: o.quantityFinished,
    estimatedUnitCost: o.estimatedUnitCost.toNumber(),
    actualCost: o.actualCost.toNumber(),
    dueDate: o.dueDate?.toISOString() ?? null,
    notes: o.notes,
    createdAt: o.createdAt.toISOString(),
    startedAt: o.startedAt?.toISOString() ?? null,
    completedAt: o.completedAt?.toISOString() ?? null,
    createdBy: o.createdBy?.name ?? null,
    items: o.items
      .map((i) => ({ variantId: i.variantId, size: i.variant.size, color: i.variant.color, fabric: i.variant.fabric, quantity: i.quantity, quantityFinished: i.quantityFinished }))
      .sort((a, b) => compareSizes(a.size, b.size)),
    balance: balance && { sent: balance.sent, received: balance.received, waste: balance.waste, atWorkshops: balance.atWorkshops, unsent: balance.unsent },
    workshops,
    logs: o.stageLogs.map((l) => ({
      id: l.id,
      from: l.fromStage,
      to: l.toStage,
      quantityIn: l.quantityIn,
      quantityOut: l.quantityOut,
      wasteQty: l.wasteQty,
      notes: l.notes,
      userName: l.user?.name ?? null,
      createdAt: l.createdAt.toISOString(),
    })),
    remits: o.remits.map((r) => ({
      id: r.id,
      number: r.number,
      type: r.type,
      stage: r.stage,
      workshopName: r.workshop.name,
      pieces: r.pieces,
      wasteQty: r.wasteQty,
      laborUnitCost: r.laborUnitCost.toNumber(),
      laborTotal: r.laborTotal.toNumber(),
      date: r.date.toISOString(),
    })),
  };
}

export interface WorkshopSummary {
  id: string;
  name: string;
  types: WorkshopType[];
  isInternal: boolean;
  phone: string | null;
  piecesHeld: number;
  orders: { id: string; number: number; productName: string; pieces: number; since: string }[];
  payableBalance: number;
  overdueBalance: number;
}

/** Stock en poder de terceros y deuda de fasón por taller. */
export async function listWorkshopsSummary(): Promise<WorkshopSummary[]> {
  const [workshops, openOrders, payables] = await Promise.all([
    db.workshop.findMany({ where: { active: true }, orderBy: { name: "asc" } }),
    db.productionOrder.findMany({
      where: { status: "EN_PROCESO", currentStage: { in: ["EN_TALLER_CONFECCION", "EN_PERSONALIZACION"] } },
      include: {
        product: { select: { name: true } },
        remits: { select: { type: true, stage: true, workshopId: true, pieces: true, wasteQty: true, date: true } },
      },
    }),
    db.accountPayable.groupBy({
      by: ["workshopId"],
      where: { workshopId: { not: null }, status: { in: ["PENDIENTE", "PARCIAL"] } },
      _sum: { balance: true },
    }),
  ]);
  const overdue = await db.accountPayable.groupBy({
    by: ["workshopId"],
    where: { workshopId: { not: null }, status: { in: ["PENDIENTE", "PARCIAL"] }, dueDate: { lt: new Date() } },
    _sum: { balance: true },
  });

  return workshops.map((w) => {
    const orders = openOrders.flatMap((o) => {
      const held = stageBalance(o, o.currentStage).byWorkshop.get(w.id) ?? 0;
      if (held <= 0) return [];
      const firstSend = o.remits
        .filter((r) => r.workshopId === w.id && r.stage === o.currentStage && r.type === "ENVIO")
        .reduce((min, r) => (r.date < min ? r.date : min), new Date());
      return [{ id: o.id, number: o.number, productName: o.product.name, pieces: held, since: firstSend.toISOString() }];
    });
    return {
      id: w.id,
      name: w.name,
      types: w.types,
      isInternal: w.isInternal,
      phone: w.phone,
      piecesHeld: orders.reduce((a, o) => a + o.pieces, 0),
      orders,
      payableBalance: payables.find((p) => p.workshopId === w.id)?._sum.balance?.toNumber() ?? 0,
      overdueBalance: overdue.find((p) => p.workshopId === w.id)?._sum.balance?.toNumber() ?? 0,
    };
  });
}

export async function getRemitForPrint(remitId: string) {
  const r = await db.workshopRemit.findUnique({
    where: { id: remitId },
    include: {
      workshop: true,
      createdBy: { select: { name: true } },
      productionOrder: {
        include: {
          product: { select: { sku: true, name: true } },
          client: { select: { businessName: true } },
          items: { include: { variant: { select: { size: true, color: true, fabric: true } } } },
        },
      },
    },
  });
  if (!r) return null;
  return {
    number: r.number,
    type: r.type,
    stage: r.stage,
    date: r.date.toISOString(),
    pieces: r.pieces,
    wasteQty: r.wasteQty,
    laborUnitCost: r.laborUnitCost.toNumber(),
    laborTotal: r.laborTotal.toNumber(),
    notes: r.notes,
    createdBy: r.createdBy?.name ?? null,
    workshop: { name: r.workshop.name, cuit: r.workshop.cuit, address: r.workshop.address, phone: r.workshop.phone },
    order: {
      id: r.productionOrder.id,
      number: r.productionOrder.number,
      productSku: r.productionOrder.product.sku,
      productName: r.productionOrder.product.name,
      clientName: r.productionOrder.client?.businessName ?? null,
      curve: r.productionOrder.items
        .map((i) => ({ size: i.variant.size, color: i.variant.color, fabric: i.variant.fabric, quantity: i.quantity }))
        .sort((a, b) => compareSizes(a.size, b.size)),
    },
  };
}
