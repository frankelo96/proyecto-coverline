import "server-only";

import { Prisma } from "@/generated/prisma/client";
import type {
  ClientType,
  DocumentType,
  PricingMode,
  ProductCategory,
  ProductSourcing,
  RawMaterialType,
  TaxCondition,
  UnitOfMeasure,
  WorkshopType,
} from "@/generated/prisma/enums";
import { hasPermission, PERMISSIONS } from "@/lib/auth/permissions";
import { autoVariantSku, variantKey } from "@/lib/catalog/variants";
import { DEFAULT_POSITIONS, type EntityKey } from "@/lib/masters/definitions";
import { formatCuit, isValidCuit, type RefOptions, type Values } from "@/lib/masters/fields";
import { db } from "@/server/db";
import { updateRawMaterialCost } from "@/server/services/costing.service";
import { moveRawMaterial } from "@/server/services/materials.service";
import { BRANCH_ORDER, mainBranchId, setBranchStock } from "@/server/services/stock.service";

type Tx = Prisma.TransactionClient;

export class MasterError extends Error {
  constructor(
    message: string,
    public field?: string,
  ) {
    super(message);
    this.name = "MasterError";
  }
}

export interface ListRow {
  id: string;
  values: Values;
  active: boolean;
  /** Datos extra para mostrar (saldo, stock, variantes…) */
  extra?: Record<string, string | number | null>;
}

export interface Adapter {
  refs(): Promise<RefOptions>;
  list(q: string | null, includeInactive: boolean): Promise<ListRow[]>;
  get(id: string): Promise<Values | null>;
  /** Registro existente que coincide (para importar sin duplicar). */
  findExisting(tx: Tx | typeof db, values: Values): Promise<string | null>;
  /** Clave para detectar repetidos dentro del mismo archivo. */
  batchKey(values: Values): string | null;
  /** Normaliza y valida reglas de negocio. Lanza MasterError. */
  normalize(values: Values): Values;
  save(tx: Tx, id: string | null, values: Values, userId: string, opts?: { fromImport?: boolean; permissions?: string[] }): Promise<string>;
  setActive(id: string, active: boolean): Promise<void>;
  exportRows(): Promise<Values[]>;
  /** Columnas extra de la tabla del listado */
  extraColumns?: { key: string; label: string; numeric?: boolean; money?: boolean }[];
}

// ─── Helpers ──────────────────────────────────────────────────────────────

const str = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : null);
const num = (v: unknown, fallback = 0) => (typeof v === "number" && Number.isFinite(v) ? v : fallback);
const dec = (v: unknown, fallback = 0) => new Prisma.Decimal(num(v, fallback));
const decOrNull = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? new Prisma.Decimal(v) : null);
const n = (d: Prisma.Decimal | null | undefined) => (d ? d.toNumber() : null);
const digits = (s: string) => s.replace(/\D/g, "");

const textSearch = (q: string | null, fields: string[]) =>
  q ? { OR: fields.map((f) => ({ [f]: { contains: q, mode: "insensitive" as const } })) } : {};

/** Normaliza un CUIT opcional: valida dígito verificador y lo guarda con guiones. */
function normalizeCuit(raw: unknown, field: string): string | null {
  const s = str(raw);
  if (!s) return null;
  if (!isValidCuit(s)) throw new MasterError(`CUIT ${s} inválido (revisá el dígito verificador)`, field);
  return formatCuit(s);
}

async function audit(tx: Tx, userId: string, entity: string, entityId: string, action: string, data: Values) {
  await tx.auditLog.create({ data: { userId, entity, entityId, action, data: data as unknown as Prisma.InputJsonValue } });
}

/** Traduce violaciones de unicidad de Prisma a mensajes para el usuario. */
export function uniqueMessage(e: unknown, labels: Record<string, string>): string | null {
  if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
    const target = JSON.stringify(e.meta ?? {});
    const hit = Object.entries(labels).find(([k]) => target.includes(k));
    return hit ? `Ya existe otro registro con ese ${hit[1]}` : "Ya existe otro registro con esos datos";
  }
  return null;
}

// ─── Clientes ─────────────────────────────────────────────────────────────

const clients: Adapter = {
  async refs() {
    return {};
  },
  async list(q, includeInactive) {
    const qDigits = q ? digits(q) : "";
    const rows = await db.client.findMany({
      where: {
        ...(includeInactive ? {} : { active: true }),
        ...(q
          ? {
              OR: [
                { businessName: { contains: q, mode: "insensitive" } },
                { fantasyName: { contains: q, mode: "insensitive" } },
                { email: { contains: q, mode: "insensitive" } },
                { city: { contains: q, mode: "insensitive" } },
                { tags: { has: q.toLowerCase() } },
                ...(qDigits.length >= 4 ? [{ documentNumber: { contains: qDigits } }, { phone: { contains: qDigits } }] : []),
              ],
            }
          : {}),
      },
      orderBy: { businessName: "asc" },
      take: 500,
      include: { receivables: { where: { status: { in: ["PENDIENTE", "PARCIAL"] } }, select: { balance: true } } },
    });
    return rows.map((c) => ({
      id: c.id,
      active: c.active,
      values: clientValues(c),
      extra: { balance: c.receivables.reduce((a, r) => a + r.balance.toNumber(), 0) },
    }));
  },
  extraColumns: [{ key: "balance", label: "Saldo cta. cte.", money: true }],
  async get(id) {
    const c = await db.client.findUnique({ where: { id } });
    return c ? clientValues(c) : null;
  },
  batchKey(v) {
    const doc = str(v.documentNumber);
    return doc ? `doc:${digits(doc)}` : `name:${String(v.businessName).toLowerCase()}`;
  },
  async findExisting(tx, v) {
    const doc = str(v.documentNumber);
    if (doc) {
      const d = digits(doc);
      const found = await tx.client.findFirst({ where: { documentNumber: { in: [doc, d, formatCuit(d)] } }, select: { id: true } });
      return found?.id ?? null;
    }
    const found = await tx.client.findFirst({ where: { businessName: { equals: String(v.businessName), mode: "insensitive" } }, select: { id: true } });
    return found?.id ?? null;
  },
  normalize(v) {
    const out = { ...v };
    const doc = str(v.documentNumber);
    if (doc) {
      const d = digits(doc);
      // Un número de 11 dígitos cargado como DNI es un CUIT.
      if (d.length === 11 && (v.documentType === "DNI" || !v.documentType)) out.documentType = "CUIT";
      if (out.documentType === "CUIT" || out.documentType === "CUIL") {
        if (!isValidCuit(d)) throw new MasterError(`${out.documentType} ${doc} inválido (revisá el dígito verificador)`, "documentNumber");
        out.documentNumber = formatCuit(d);
      } else if (out.documentType === "DNI") {
        if (d.length < 7 || d.length > 8) throw new MasterError(`DNI ${doc} inválido (7 u 8 dígitos)`, "documentNumber");
        out.documentNumber = d;
      }
    }
    if (out.taxCondition === "RESPONSABLE_INSCRIPTO" && out.documentType !== "CUIT") {
      throw new MasterError("Un responsable inscripto necesita CUIT (para emitir Factura A)", "documentNumber");
    }
    return out;
  },
  async save(tx, id, v, userId) {
    const data = {
      businessName: String(v.businessName),
      fantasyName: str(v.fantasyName),
      type: v.type as ClientType,
      documentType: (v.documentType ?? "DNI") as DocumentType,
      documentNumber: str(v.documentNumber),
      taxCondition: (v.taxCondition ?? "CONSUMIDOR_FINAL") as TaxCondition,
      email: str(v.email),
      phone: str(v.phone),
      whatsapp: str(v.whatsapp),
      address: str(v.address),
      city: str(v.city),
      province: str(v.province),
      postalCode: str(v.postalCode),
      creditLimit: dec(v.creditLimit),
      paymentTermDays: num(v.paymentTermDays),
      tags: (v.tags as string[]) ?? [],
      purchaseMonths: (v.purchaseMonths as number[]) ?? [],
      notes: str(v.notes),
      active: v.active !== false,
    };
    const saved = id ? await tx.client.update({ where: { id }, data }) : await tx.client.create({ data });
    await audit(tx, userId, "Client", saved.id, id ? "UPDATE" : "CREATE", v);
    return saved.id;
  },
  async setActive(id, active) {
    await db.client.update({ where: { id }, data: { active } });
  },
  async exportRows() {
    const rows = await db.client.findMany({ orderBy: { businessName: "asc" } });
    return rows.map(clientValues);
  },
};

function clientValues(c: Prisma.ClientGetPayload<object>): Values {
  return {
    businessName: c.businessName,
    fantasyName: c.fantasyName,
    type: c.type,
    documentType: c.documentType,
    documentNumber: c.documentNumber,
    taxCondition: c.taxCondition,
    email: c.email,
    phone: c.phone,
    whatsapp: c.whatsapp,
    address: c.address,
    city: c.city,
    province: c.province,
    postalCode: c.postalCode,
    creditLimit: c.creditLimit.toNumber(),
    paymentTermDays: c.paymentTermDays,
    tags: c.tags,
    purchaseMonths: c.purchaseMonths,
    notes: c.notes,
    active: c.active,
  };
}

// ─── Productos (+ variantes al importar) ──────────────────────────────────

function productValues(p: Prisma.ProductGetPayload<object>): Values {
  return {
    sku: p.sku,
    name: p.name,
    category: p.category,
    sourcing: p.sourcing,
    description: p.description,
    listPrice: p.listPrice.toNumber(),
    vatRate: String(p.vatRate.toNumber()),
    pricingMode: p.pricingMode,
    pricingPct: p.pricingPct.toNumber(),
    overheadPct: p.overheadPct.toNumber(),
    active: p.active,
  };
}

const products: Adapter = {
  async refs() {
    return {};
  },
  async list(q, includeInactive) {
    const rows = await db.product.findMany({
      where: {
        ...(includeInactive ? {} : { active: true }),
        ...(q ? { OR: [{ sku: { contains: q, mode: "insensitive" } }, { name: { contains: q, mode: "insensitive" } }, { variants: { some: { barcode: q } } }] } : {}),
      },
      orderBy: { name: "asc" },
      include: { variants: { where: { active: true }, select: { stockQty: true } } },
    });
    return rows.map((p) => ({
      id: p.id,
      active: p.active,
      values: productValues(p),
      extra: {
        variants: p.variants.length,
        stock: p.variants.reduce((a, v) => a + v.stockQty.toNumber(), 0),
        cost: p.currentCost.toNumber(),
      },
    }));
  },
  extraColumns: [
    { key: "cost", label: "Costo", money: true },
    { key: "variants", label: "Talles", numeric: true },
    { key: "stock", label: "Stock", numeric: true },
  ],
  async get(id) {
    const p = await db.product.findUnique({ where: { id } });
    return p ? productValues(p) : null;
  },
  batchKey(v) {
    return `sku:${String(v.sku)}|${str(v.variantSku) ?? variantKey({ size: str(v.size) ?? "", color: str(v.color), fabric: str(v.fabric) })}`;
  },
  async findExisting(tx, v) {
    const p = await tx.product.findUnique({ where: { sku: String(v.sku) }, select: { id: true } });
    return p?.id ?? null;
  },
  normalize(v) {
    if ((str(v.color) || str(v.fabric) || str(v.variantSku) || str(v.barcode) || v.stockQty !== null) && !str(v.size)) {
      // Sin talle no hay variante: para "talle único" usar U.
      if (v.stockQty !== null && v.stockQty !== undefined) throw new MasterError("Para cargar stock indicá el talle (usá U para talle único)", "size");
    }
    return v;
  },
  async save(tx, id, v, userId, opts) {
    const data = {
      sku: String(v.sku),
      name: String(v.name),
      category: v.category as ProductCategory,
      sourcing: (v.sourcing ?? "FABRICADO") as ProductSourcing,
      description: str(v.description),
      listPrice: dec(v.listPrice),
      vatRate: new Prisma.Decimal(Number(v.vatRate ?? 21)),
      pricingMode: (v.pricingMode ?? "MARKUP") as PricingMode,
      pricingPct: dec(v.pricingPct, 100),
      overheadPct: dec(v.overheadPct),
      active: v.active !== false,
    };
    const saved = id ? await tx.product.update({ where: { id }, data }) : await tx.product.create({ data });

    const size = str(v.size);
    if (opts?.fromImport && size) {
      const color = str(v.color);
      const fabric = str(v.fabric);
      const sku = str(v.variantSku) ?? autoVariantSku(saved.sku, { size, color, fabric });
      const existing =
        (str(v.variantSku) && (await tx.productVariant.findUnique({ where: { sku } }))) ||
        (await tx.productVariant.findFirst({ where: { productId: saved.id, size, color, fabric } }));
      const variantData = {
        size,
        color,
        fabric,
        barcode: str(v.barcode) ?? undefined,
        ...(typeof v.priceAdjustmentPct === "number" ? { priceAdjustmentPct: new Prisma.Decimal(v.priceAdjustmentPct) } : {}),
        active: true,
      };
      let variantId: string;
      if (existing) {
        if (existing.productId !== saved.id) throw new MasterError(`El SKU de variante ${sku} pertenece a otro producto`, "variantSku");
        variantId = (await tx.productVariant.update({ where: { id: existing.id }, data: { ...variantData, sku }, select: { id: true } })).id;
      } else {
        variantId = (await tx.productVariant.create({ data: { ...variantData, sku, productId: saved.id }, select: { id: true } })).id;
      }
      // El stock de la planilla es el del local principal (los demás se cargan en la ficha o por transferencia).
      if (typeof v.stockQty === "number") await setBranchStock(tx, variantId, await mainBranchId(tx), v.stockQty);
    }
    await audit(tx, userId, "Product", saved.id, id ? "UPDATE" : "CREATE", v);
    return saved.id;
  },
  async setActive(id, active) {
    await db.product.update({ where: { id }, data: { active } });
  },
  async exportRows() {
    const main = await mainBranchId(db as unknown as Prisma.TransactionClient);
    const rows = await db.product.findMany({
      orderBy: { sku: "asc" },
      include: { variants: { orderBy: { sku: "asc" }, include: { branchStocks: { where: { branchId: main } } } } },
    });
    return rows.flatMap((p) => {
      const base = productValues(p);
      if (p.variants.length === 0) return [base];
      return p.variants.map((x) => ({
        ...base,
        size: x.size,
        color: x.color,
        fabric: x.fabric,
        variantSku: x.sku,
        barcode: x.barcode,
        stockQty: x.branchStocks[0]?.quantity.toNumber() ?? 0,
        priceAdjustmentPct: x.priceAdjustmentPct.toNumber(),
      }));
    });
  },
};

// ─── Materias primas ──────────────────────────────────────────────────────

function materialValues(m: Prisma.RawMaterialGetPayload<object>): Values {
  return {
    code: m.code,
    name: m.name,
    type: m.type,
    uom: m.uom,
    composition: m.composition,
    color: m.color,
    widthCm: n(m.widthCm),
    metersPerKg: n(m.metersPerKg),
    currentCost: m.currentCost.toNumber(),
    stockQty: m.stockQty.toNumber(),
    minStock: m.minStock.toNumber(),
    supplierId: m.supplierId,
    active: m.active,
  };
}

const supplierRefs = async () => ({
  suppliers: (await db.supplier.findMany({ orderBy: { businessName: "asc" }, select: { id: true, businessName: true, cuit: true } })).map((s) => ({
    value: s.id,
    label: s.businessName,
    keys: s.cuit ? [s.cuit, digits(s.cuit)] : [],
  })),
});

const materials: Adapter = {
  refs: supplierRefs,
  async list(q, includeInactive) {
    const rows = await db.rawMaterial.findMany({
      where: { ...(includeInactive ? {} : { active: true }), ...textSearch(q, ["code", "name", "composition", "color"]) },
      orderBy: [{ type: "asc" }, { name: "asc" }],
      include: { supplier: { select: { businessName: true } } },
    });
    return rows.map((m) => ({
      id: m.id,
      active: m.active,
      values: materialValues(m),
      extra: { supplier: m.supplier?.businessName ?? null, low: m.minStock.gt(0) && m.stockQty.lt(m.minStock) ? "Bajo mínimo" : null },
    }));
  },
  extraColumns: [{ key: "supplier", label: "Proveedor" }],
  async get(id) {
    const m = await db.rawMaterial.findUnique({ where: { id } });
    return m ? materialValues(m) : null;
  },
  batchKey: (v) => `code:${String(v.code)}`,
  async findExisting(tx, v) {
    const m = await tx.rawMaterial.findUnique({ where: { code: String(v.code) }, select: { id: true } });
    return m?.id ?? null;
  },
  normalize: (v) => v,
  async save(tx, id, v, userId, opts) {
    const data = {
      code: String(v.code),
      name: String(v.name),
      type: v.type as RawMaterialType,
      uom: v.uom as UnitOfMeasure,
      composition: str(v.composition),
      color: str(v.color),
      widthCm: decOrNull(v.widthCm),
      metersPerKg: decOrNull(v.metersPerKg),
      minStock: dec(v.minStock),
      supplierId: str(v.supplierId),
      active: v.active !== false,
    };
    const canCost = !opts?.permissions || hasPermission(opts.permissions, PERMISSIONS.productionCostWrite);
    if (!id) {
      const created = await tx.rawMaterial.create({ data: { ...data, currentCost: dec(v.currentCost) } });
      await moveRawMaterial(tx, { rawMaterialId: created.id, delta: dec(v.stockQty), reason: opts?.fromImport ? "IMPORTACION" : "AJUSTE", notes: "Stock inicial", userId });
      await audit(tx, userId, "RawMaterial", created.id, "CREATE", v);
      return created.id;
    }
    const before = await tx.rawMaterial.findUniqueOrThrow({ where: { id } });
    if (before.uom !== data.uom) {
      const usedInSheets = await tx.productBOM.count({ where: { rawMaterialId: id } });
      if (!before.stockQty.isZero() || usedInSheets > 0) {
        throw new MasterError("No se puede cambiar la unidad de medida de un material con stock o usado en fichas (se mezclarían metros y kilos). Creá un material nuevo.", "uom");
      }
    }
    if (!canCost && !before.currentCost.equals(dec(v.currentCost))) {
      throw new MasterError("Cambiar el costo de reposición requiere el permiso de costos", "currentCost");
    }
    await tx.rawMaterial.update({ where: { id }, data });
    // El stock no se pisa desde el formulario (borraría compras y consumos del mientras tanto):
    // solo una importación lo fija como inventario contado, y queda el movimiento.
    if (opts?.fromImport && typeof v.stockQty === "number") {
      const delta = dec(v.stockQty).minus(before.stockQty);
      await moveRawMaterial(tx, { rawMaterialId: id, delta, reason: "IMPORTACION", notes: "Inventario importado", userId });
    }
    // El costo pasa por el servicio de costos: historial + recálculo de fichas.
    await updateRawMaterialCost(tx, { rawMaterialId: id, newCost: num(v.currentCost), userId, source: opts?.fromImport ? "IMPORTACION" : "MANUAL" });
    await audit(tx, userId, "RawMaterial", id, "UPDATE", v);
    return id;
  },
  async setActive(id, active) {
    await db.rawMaterial.update({ where: { id }, data: { active } });
  },
  async exportRows() {
    return (await db.rawMaterial.findMany({ orderBy: { code: "asc" } })).map(materialValues);
  },
};

// ─── Proveedores ──────────────────────────────────────────────────────────

function supplierValues(s: Prisma.SupplierGetPayload<object>): Values {
  return {
    businessName: s.businessName,
    cuit: s.cuit,
    taxCondition: s.taxCondition,
    email: s.email,
    phone: s.phone,
    address: s.address,
    paymentTermDays: s.paymentTermDays,
    notes: s.notes,
    active: s.active,
  };
}

const suppliers: Adapter = {
  async refs() {
    return {};
  },
  async list(q, includeInactive) {
    const rows = await db.supplier.findMany({
      where: { ...(includeInactive ? {} : { active: true }), ...textSearch(q, ["businessName", "cuit", "email"]) },
      orderBy: { businessName: "asc" },
      include: { payables: { where: { status: { in: ["PENDIENTE", "PARCIAL"] } }, select: { balance: true } } },
    });
    return rows.map((s) => ({
      id: s.id,
      active: s.active,
      values: supplierValues(s),
      extra: { balance: s.payables.reduce((a, p) => a + p.balance.toNumber(), 0) },
    }));
  },
  extraColumns: [{ key: "balance", label: "Saldo a pagar", money: true }],
  async get(id) {
    const s = await db.supplier.findUnique({ where: { id } });
    return s ? supplierValues(s) : null;
  },
  batchKey: (v) => (str(v.cuit) ? `cuit:${digits(String(v.cuit))}` : `name:${String(v.businessName).toLowerCase()}`),
  async findExisting(tx, v) {
    const cuit = str(v.cuit);
    const found = cuit
      ? await tx.supplier.findFirst({ where: { cuit: { in: [cuit, formatCuit(cuit)] } }, select: { id: true } })
      : await tx.supplier.findFirst({ where: { businessName: { equals: String(v.businessName), mode: "insensitive" } }, select: { id: true } });
    return found?.id ?? null;
  },
  normalize: (v) => ({ ...v, cuit: normalizeCuit(v.cuit, "cuit") }),
  async save(tx, id, v, userId) {
    const data = {
      businessName: String(v.businessName),
      cuit: str(v.cuit),
      taxCondition: (v.taxCondition ?? "RESPONSABLE_INSCRIPTO") as TaxCondition,
      email: str(v.email),
      phone: str(v.phone),
      address: str(v.address),
      paymentTermDays: num(v.paymentTermDays, 30),
      notes: str(v.notes),
      active: v.active !== false,
    };
    const saved = id ? await tx.supplier.update({ where: { id }, data }) : await tx.supplier.create({ data });
    await audit(tx, userId, "Supplier", saved.id, id ? "UPDATE" : "CREATE", v);
    return saved.id;
  },
  async setActive(id, active) {
    await db.supplier.update({ where: { id }, data: { active } });
  },
  async exportRows() {
    return (await db.supplier.findMany({ orderBy: { businessName: "asc" } })).map(supplierValues);
  },
};

// ─── Talleres ─────────────────────────────────────────────────────────────

function workshopValues(w: Prisma.WorkshopGetPayload<object>): Values {
  return {
    name: w.name,
    types: w.types,
    isInternal: w.isInternal,
    cuit: w.cuit,
    taxCondition: w.taxCondition,
    paymentTermDays: w.paymentTermDays,
    contact: w.contact,
    phone: w.phone,
    address: w.address,
    notes: w.notes,
    active: w.active,
  };
}

const workshops: Adapter = {
  async refs() {
    return {};
  },
  async list(q, includeInactive) {
    const rows = await db.workshop.findMany({
      where: { ...(includeInactive ? {} : { active: true }), ...textSearch(q, ["name", "cuit", "contact"]) },
      orderBy: { name: "asc" },
    });
    return rows.map((w) => ({ id: w.id, active: w.active, values: workshopValues(w) }));
  },
  async get(id) {
    const w = await db.workshop.findUnique({ where: { id } });
    return w ? workshopValues(w) : null;
  },
  batchKey: (v) => (str(v.cuit) ? `cuit:${digits(String(v.cuit))}` : `name:${String(v.name).toLowerCase()}`),
  async findExisting(tx, v) {
    const cuit = str(v.cuit);
    const found = cuit
      ? await tx.workshop.findFirst({ where: { cuit: { in: [cuit, formatCuit(cuit)] } }, select: { id: true } })
      : await tx.workshop.findFirst({ where: { name: { equals: String(v.name), mode: "insensitive" } }, select: { id: true } });
    return found?.id ?? null;
  },
  normalize: (v) => ({ ...v, cuit: normalizeCuit(v.cuit, "cuit") }),
  async save(tx, id, v, userId) {
    const data = {
      name: String(v.name),
      types: (v.types as WorkshopType[]) ?? [],
      isInternal: v.isInternal === true,
      cuit: str(v.cuit),
      taxCondition: (v.taxCondition ?? "MONOTRIBUTO") as TaxCondition,
      paymentTermDays: num(v.paymentTermDays, 30),
      contact: str(v.contact),
      phone: str(v.phone),
      address: str(v.address),
      notes: str(v.notes),
      active: v.active !== false,
    };
    const saved = id ? await tx.workshop.update({ where: { id }, data }) : await tx.workshop.create({ data });
    await audit(tx, userId, "Workshop", saved.id, id ? "UPDATE" : "CREATE", v);
    return saved.id;
  },
  async setActive(id, active) {
    await db.workshop.update({ where: { id }, data: { active } });
  },
  async exportRows() {
    return (await db.workshop.findMany({ orderBy: { name: "asc" } })).map(workshopValues);
  },
};

// ─── Personal propio ──────────────────────────────────────────────────────

const employeeValues = (e: Prisma.EmployeeGetPayload<object>): Values => ({
  name: e.name,
  cuil: e.cuil,
  phone: e.phone,
  email: e.email,
  position: e.position,
  branchId: e.branchId,
  startDate: e.startDate ? e.startDate.toISOString().slice(0, 10) : null,
  baseSalary: e.baseSalary.toNumber(),
  bankAccount: e.bankAccount,
  notes: e.notes,
  active: e.active,
});

const employees: Adapter = {
  async refs() {
    const [branches, used] = await Promise.all([
      db.branch.findMany({ where: { active: true }, orderBy: BRANCH_ORDER, select: { id: true, name: true } }),
      db.employee.findMany({ distinct: ["position"], select: { position: true } }),
    ]);
    const positions = [...new Set([...DEFAULT_POSITIONS, ...used.map((u) => u.position)])].sort((a, b) => a.localeCompare(b, "es"));
    return {
      branches: branches.map((b) => ({ value: b.id, label: b.name, keys: [b.name] })),
      positions: positions.map((p) => ({ value: p, label: p })),
    };
  },
  async list(q, includeInactive) {
    const rows = await db.employee.findMany({
      where: { ...(includeInactive ? {} : { active: true }), ...textSearch(q, ["name", "cuil", "position", "phone"]) },
      orderBy: { name: "asc" },
    });
    return rows.map((e) => ({ id: e.id, active: e.active, values: employeeValues(e) }));
  },
  async get(id) {
    const e = await db.employee.findUnique({ where: { id } });
    return e ? employeeValues(e) : null;
  },
  batchKey: (v) => (str(v.cuil) ? `cuil:${digits(String(v.cuil))}` : `name:${String(v.name).toLowerCase()}`),
  async findExisting(tx, v) {
    const cuil = str(v.cuil);
    const found = cuil
      ? await tx.employee.findFirst({ where: { cuil: { in: [cuil, formatCuit(cuil)] } }, select: { id: true } })
      : await tx.employee.findFirst({ where: { name: { equals: String(v.name), mode: "insensitive" } }, select: { id: true } });
    return found?.id ?? null;
  },
  normalize: (v) => ({ ...v, cuil: normalizeCuit(v.cuil, "cuil"), position: String(v.position ?? "").trim() }),
  async save(tx, id, v, userId) {
    const data = {
      name: String(v.name),
      cuil: str(v.cuil),
      phone: str(v.phone),
      email: str(v.email),
      position: String(v.position),
      branchId: str(v.branchId),
      startDate: str(v.startDate) ? new Date(`${v.startDate}T12:00:00`) : null,
      baseSalary: dec(v.baseSalary),
      bankAccount: str(v.bankAccount),
      notes: str(v.notes),
      active: v.active !== false,
    };
    const saved = id ? await tx.employee.update({ where: { id }, data }) : await tx.employee.create({ data });
    await audit(tx, userId, "Employee", saved.id, id ? "UPDATE" : "CREATE", v);
    return saved.id;
  },
  async setActive(id, active) {
    await db.employee.update({ where: { id }, data: { active } });
  },
  async exportRows() {
    return (await db.employee.findMany({ orderBy: { name: "asc" } })).map(employeeValues);
  },
};

// ─── Saldos iniciales de cuentas corrientes (solo importación) ────────────

const isoDay = (d: Date) => d.toISOString().slice(0, 10);
const atNoon = (iso: string) => new Date(`${iso}T12:00:00`);
const addDaysIso = (iso: string, days: number) => isoDay(new Date(atNoon(iso).getTime() + days * 86_400_000));

const openingReceivables: Adapter = {
  async refs() {
    const clients = await db.client.findMany({ orderBy: { businessName: "asc" }, select: { id: true, businessName: true, fantasyName: true, documentNumber: true } });
    return {
      clients: clients.map((c) => ({
        value: c.id,
        label: c.businessName,
        keys: [...(c.documentNumber ? [c.documentNumber, digits(c.documentNumber)] : []), ...(c.fantasyName ? [c.fantasyName] : [])],
      })),
    };
  },
  async list() {
    return [];
  },
  async get(id) {
    const r = await db.accountReceivable.findUnique({ where: { id } });
    return r ? { clientId: r.clientId, description: r.description, issueDate: isoDay(r.issueDate), dueDate: isoDay(r.dueDate), amount: r.amount.toNumber() } : null;
  },
  batchKey: (v) => `${v.clientId}|${String(v.description).toLowerCase()}`,
  async findExisting(tx, v) {
    const r = await tx.accountReceivable.findFirst({ where: { clientId: String(v.clientId), description: String(v.description), saleId: null, chequeId: null }, select: { id: true } });
    return r?.id ?? null;
  },
  normalize: (v) => v,
  async save(tx, id, v, userId) {
    const client = await tx.client.findUniqueOrThrow({ where: { id: String(v.clientId) }, select: { paymentTermDays: true } });
    const issue = String(v.issueDate);
    const due = str(v.dueDate) ?? addDaysIso(issue, client.paymentTermDays);
    if (due < issue) throw new MasterError("El vencimiento no puede ser anterior a la fecha", "dueDate");
    const amount = dec(v.amount);
    if (id) {
      const current = await tx.accountReceivable.findUniqueOrThrow({ where: { id } });
      // Si ya tuvo cobros no se toca el importe (quedaría inconsistente con lo cobrado).
      const untouched = current.balance.equals(current.amount) && current.status === "PENDIENTE";
      await tx.accountReceivable.update({
        where: { id },
        data: { issueDate: atNoon(issue), dueDate: atNoon(due), ...(untouched ? { amount, balance: amount } : {}) },
      });
    } else {
      const created = await tx.accountReceivable.create({
        data: { clientId: String(v.clientId), description: String(v.description), issueDate: atNoon(issue), dueDate: atNoon(due), amount, balance: amount },
      });
      id = created.id;
    }
    await audit(tx, userId, "AccountReceivable", id, "OPENING_BALANCE", v);
    return id;
  },
  async setActive() {},
  async exportRows() {
    const rows = await db.accountReceivable.findMany({ where: { status: { in: ["PENDIENTE", "PARCIAL"] } }, orderBy: [{ clientId: "asc" }, { dueDate: "asc" }] });
    return rows.map((r) => ({ clientId: r.clientId, description: r.description, issueDate: isoDay(r.issueDate), dueDate: isoDay(r.dueDate), amount: r.balance.toNumber() }));
  },
};

/** Proveedores y talleres comparten la lista: el valor lleva prefijo S: (proveedor) o W: (taller). */
const splitCreditor = (v: unknown) => {
  const [kind, id] = String(v).split(":");
  return kind === "W" ? { supplierId: null, workshopId: id } : { supplierId: id, workshopId: null };
};

const openingPayables: Adapter = {
  async refs() {
    const [suppliers, workshops] = await Promise.all([
      db.supplier.findMany({ orderBy: { businessName: "asc" }, select: { id: true, businessName: true, cuit: true } }),
      db.workshop.findMany({ where: { isInternal: false }, orderBy: { name: "asc" }, select: { id: true, name: true, cuit: true } }),
    ]);
    return {
      creditors: [
        ...suppliers.map((x) => ({ value: `S:${x.id}`, label: x.businessName, keys: x.cuit ? [x.cuit, digits(x.cuit)] : [] })),
        ...workshops.map((x) => ({ value: `W:${x.id}`, label: x.name, keys: x.cuit ? [x.cuit, digits(x.cuit)] : [] })),
      ],
    };
  },
  async list() {
    return [];
  },
  async get(id) {
    const p = await db.accountPayable.findUnique({ where: { id } });
    if (!p) return null;
    return {
      creditorId: p.workshopId ? `W:${p.workshopId}` : `S:${p.supplierId}`,
      description: p.description,
      issueDate: isoDay(p.issueDate),
      dueDate: isoDay(p.dueDate),
      amount: p.amount.toNumber(),
    };
  },
  batchKey: (v) => `${v.creditorId}|${String(v.description).toLowerCase()}`,
  async findExisting(tx, v) {
    const p = await tx.accountPayable.findFirst({
      where: { ...splitCreditor(v.creditorId), description: String(v.description), purchaseId: null, workshopRemitId: null },
      select: { id: true },
    });
    return p?.id ?? null;
  },
  normalize: (v) => v,
  async save(tx, id, v, userId) {
    const who = splitCreditor(v.creditorId);
    const term = who.workshopId
      ? (await tx.workshop.findUniqueOrThrow({ where: { id: who.workshopId }, select: { paymentTermDays: true } })).paymentTermDays
      : (await tx.supplier.findUniqueOrThrow({ where: { id: who.supplierId! }, select: { paymentTermDays: true } })).paymentTermDays;
    const issue = String(v.issueDate);
    const due = str(v.dueDate) ?? addDaysIso(issue, term);
    if (due < issue) throw new MasterError("El vencimiento no puede ser anterior a la fecha", "dueDate");
    const amount = dec(v.amount);
    if (id) {
      const current = await tx.accountPayable.findUniqueOrThrow({ where: { id } });
      const untouched = current.balance.equals(current.amount) && current.status === "PENDIENTE";
      await tx.accountPayable.update({
        where: { id },
        data: { issueDate: atNoon(issue), dueDate: atNoon(due), ...(untouched ? { amount, balance: amount } : {}) },
      });
    } else {
      const created = await tx.accountPayable.create({
        data: { ...who, description: String(v.description), issueDate: atNoon(issue), dueDate: atNoon(due), amount, balance: amount },
      });
      id = created.id;
    }
    await audit(tx, userId, "AccountPayable", id, "OPENING_BALANCE", v);
    return id;
  },
  async setActive() {},
  async exportRows() {
    const rows = await db.accountPayable.findMany({ where: { status: { in: ["PENDIENTE", "PARCIAL"] } }, orderBy: [{ dueDate: "asc" }] });
    return rows.map((p) => ({
      creditorId: p.workshopId ? `W:${p.workshopId}` : `S:${p.supplierId}`,
      description: p.description,
      issueDate: isoDay(p.issueDate),
      dueDate: isoDay(p.dueDate),
      amount: p.balance.toNumber(),
    }));
  },
};

export const ADAPTERS: Record<EntityKey, Adapter> = {
  clientes: clients,
  productos: products,
  materiales: materials,
  proveedores: suppliers,
  talleres: workshops,
  personal: employees,
  "saldos-clientes": openingReceivables,
  "saldos-proveedores": openingPayables,
};

export const UNIQUE_LABELS: Record<EntityKey, Record<string, string>> = {
  clientes: { documentNumber: "N° de documento" },
  productos: { sku: "SKU", barcode: "código de barras" },
  materiales: { code: "código" },
  proveedores: { cuit: "CUIT" },
  talleres: { cuit: "CUIT" },
  personal: { cuil: "CUIL" },
  "saldos-clientes": {},
  "saldos-proveedores": {},
};
