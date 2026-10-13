import { PERMISSIONS } from "@/lib/auth/permissions";
import { TAX_CONDITION_LABELS } from "@/lib/purchasing/labels";

import type { FieldDef } from "./fields";
import {
  CATEGORY_LABELS,
  CLIENT_TYPE_LABELS,
  DOCUMENT_TYPE_LABELS,
  PRICING_MODE_LABELS,
  SOURCING_LABELS,
  toOptions,
  UOM_LABELS,
  WORKSHOP_TYPE_LABELS,
} from "./labels";

export const ENTITY_KEYS = ["clientes", "productos", "materiales", "proveedores", "talleres"] as const;
export type EntityKey = (typeof ENTITY_KEYS)[number];

export interface EntityDef {
  key: EntityKey;
  title: string;
  singular: string;
  /** "nuevo cliente" / "nueva materia prima" */
  newLabel: string;
  basePath: string;
  fields: readonly FieldDef[];
  /** Columnas de la tabla del listado */
  listColumns: readonly string[];
  readPermission: string;
  writePermission: string;
  /** Cómo se reconoce un registro existente al importar */
  matchHelp: string;
}

const TAX_OPTIONS = toOptions(TAX_CONDITION_LABELS).map((o) =>
  o.value === "RESPONSABLE_INSCRIPTO" ? { ...o, label: "Responsable inscripto", keys: ["RI", "Resp. inscripto", "Responsable Inscripto"] } : o,
);
const VAT_OPTIONS = [
  { value: "21", label: "21%" },
  { value: "10.5", label: "10,5%", keys: ["10,5", "10.5"] },
  { value: "27", label: "27%" },
  { value: "0", label: "Exento (0%)", keys: ["0", "0%", "exento"] },
];
const active: FieldDef = { key: "active", label: "Activo", type: "bool", defaultValue: true, aliases: ["activa", "estado", "habilitado"] };

const CLIENT_FIELDS: FieldDef[] = [
  { key: "businessName", label: "Razón social / nombre", type: "text", required: true, max: 160, aliases: ["razon social", "nombre", "cliente", "apellido y nombre"], section: "Datos principales", wide: true },
  { key: "fantasyName", label: "Nombre de fantasía", type: "text", max: 160, aliases: ["fantasia"], section: "Datos principales" },
  { key: "type", label: "Tipo de cliente", type: "select", required: true, options: toOptions(CLIENT_TYPE_LABELS), defaultValue: "PARTICULAR", aliases: ["tipo", "rubro", "segmento"], section: "Datos principales" },
  { key: "documentType", label: "Tipo de documento", type: "select", options: toOptions(DOCUMENT_TYPE_LABELS), defaultValue: "DNI", aliases: ["tipo doc"], section: "Datos fiscales" },
  { key: "documentNumber", label: "N° de documento", type: "text", max: 20, aliases: ["cuit", "dni", "documento", "nro documento", "cuit/dni"], section: "Datos fiscales", help: "CUIT con o sin guiones; se valida el dígito verificador." },
  { key: "taxCondition", label: "Condición frente al IVA", type: "select", options: TAX_OPTIONS, defaultValue: "CONSUMIDOR_FINAL", aliases: ["condicion iva", "iva"], section: "Datos fiscales" },
  { key: "email", label: "Email", type: "email", aliases: ["correo", "mail", "e-mail"], section: "Contacto" },
  { key: "phone", label: "Teléfono", type: "phone", max: 40, aliases: ["tel", "telefono"], section: "Contacto" },
  { key: "whatsapp", label: "WhatsApp", type: "phone", max: 40, aliases: ["celular", "movil", "cel"], section: "Contacto" },
  { key: "address", label: "Dirección", type: "text", max: 200, aliases: ["domicilio", "calle"], section: "Contacto", wide: true },
  { key: "city", label: "Localidad", type: "text", max: 80, aliases: ["ciudad"], section: "Contacto" },
  { key: "province", label: "Provincia", type: "text", max: 80, section: "Contacto" },
  { key: "postalCode", label: "Código postal", type: "text", max: 12, aliases: ["cp"], section: "Contacto" },
  { key: "creditLimit", label: "Límite de crédito", type: "number", minValue: 0, defaultValue: 0, aliases: ["limite", "credito"], section: "Comercial", help: "Para ventas en cuenta corriente. 0 = sin crédito." },
  { key: "paymentTermDays", label: "Plazo de pago (días)", type: "int", minValue: 0, maxValue: 365, defaultValue: 0, aliases: ["plazo", "dias"], section: "Comercial" },
  { key: "tags", label: "Etiquetas", type: "tags", aliases: ["tags", "segmentos"], section: "Comercial", help: "Separadas por coma. Sirven para armar campañas (ej. colegio, reposicion-anual)." },
  { key: "purchaseMonths", label: "Meses de compra", type: "months", aliases: ["meses", "temporada"], section: "Comercial", help: "Meses en que suele comprar (ej. febrero, marzo)." },
  { key: "notes", label: "Observaciones", type: "textarea", max: 2000, aliases: ["notas", "comentarios"], section: "Comercial", wide: true },
  { ...active, section: "Comercial" },
];

const PRODUCT_FIELDS: FieldDef[] = [
  { key: "sku", label: "SKU", type: "text", required: true, max: 40, upper: true, aliases: ["codigo", "codigo producto", "sku producto", "articulo"], section: "Producto" },
  { key: "name", label: "Nombre", type: "text", required: true, max: 160, aliases: ["descripcion corta", "producto"], section: "Producto", wide: true },
  { key: "category", label: "Categoría", type: "select", required: true, options: toOptions(CATEGORY_LABELS), defaultValue: "TRABAJO", aliases: ["rubro", "linea"], section: "Producto" },
  { key: "sourcing", label: "Origen", type: "select", options: toOptions(SOURCING_LABELS), defaultValue: "FABRICADO", aliases: ["fabricado/reventa"], section: "Producto", help: "Fabricación propia: el costo sale de la ficha técnica. Reventa: del último precio de compra." },
  { key: "description", label: "Descripción", type: "textarea", max: 2000, section: "Producto", wide: true },
  { key: "listPrice", label: "Precio de lista (sin IVA)", type: "number", minValue: 0, defaultValue: 0, aliases: ["precio", "precio neto", "precio lista"], section: "Precio" },
  { key: "vatRate", label: "Alícuota IVA", type: "select", options: VAT_OPTIONS, defaultValue: "21", aliases: ["iva", "alicuota"], section: "Precio" },
  { key: "pricingMode", label: "Criterio de precio sugerido", type: "select", options: toOptions(PRICING_MODE_LABELS), defaultValue: "MARKUP", section: "Precio" },
  { key: "pricingPct", label: "Recargo / margen %", type: "number", minValue: 0, maxValue: 1000, defaultValue: 100, aliases: ["markup", "margen"], section: "Precio" },
  { key: "overheadPct", label: "Gastos generales %", type: "number", minValue: 0, maxValue: 300, defaultValue: 0, section: "Precio" },
  { ...active, section: "Precio" },
  // Variante (una fila por talle/color en la planilla)
  { key: "size", label: "Talle", type: "text", max: 20, upper: true, aliases: ["talla"], importOnly: true },
  { key: "color", label: "Color", type: "text", max: 40, importOnly: true },
  { key: "variantSku", label: "SKU variante", type: "text", max: 60, upper: true, aliases: ["sku talle"], importOnly: true },
  { key: "barcode", label: "Código de barras", type: "text", max: 40, aliases: ["ean", "codigo barras"], importOnly: true },
  { key: "stockQty", label: "Stock", type: "number", aliases: ["existencia", "cantidad"], importOnly: true },
  { key: "priceAdjustmentPct", label: "Ajuste talle %", type: "number", minValue: -50, maxValue: 200, aliases: ["recargo talle"], importOnly: true },
];

const MATERIAL_FIELDS: FieldDef[] = [
  { key: "code", label: "Código", type: "text", required: true, max: 40, upper: true, aliases: ["cod", "sku"], section: "Material" },
  { key: "name", label: "Nombre", type: "text", required: true, max: 160, aliases: ["descripcion", "material"], section: "Material", wide: true },
  { key: "type", label: "Tipo", type: "select", required: true, options: toOptions({ TELA: "Tela", AVIO: "Avío", EMPAQUE: "Empaque", INSUMO: "Insumo" }), defaultValue: "TELA", section: "Material" },
  { key: "uom", label: "Unidad de medida", type: "select", required: true, options: toOptions(UOM_LABELS).map((o) => ({ ...o, keys: [o.value.slice(0, 2), o.value === "METRO" ? "m" : o.value === "KILOGRAMO" ? "kg" : o.value === "UNIDAD" ? "u" : o.value] })), defaultValue: "METRO", aliases: ["unidad", "um"], section: "Material" },
  { key: "composition", label: "Composición", type: "text", max: 200, section: "Material" },
  { key: "color", label: "Color", type: "text", max: 60, section: "Material" },
  { key: "widthCm", label: "Ancho (cm)", type: "number", minValue: 0, maxValue: 1000, aliases: ["ancho"], section: "Material" },
  { key: "metersPerKg", label: "Rendimiento (m/kg)", type: "number", minValue: 0, aliases: ["rendimiento"], section: "Material" },
  { key: "currentCost", label: "Costo de reposición", type: "number", required: true, minValue: 0, aliases: ["costo", "precio"], section: "Costo y stock", help: "Al cambiarlo se guarda en el historial y se recalculan las fichas que lo usan." },
  { key: "stockQty", label: "Stock", type: "number", defaultValue: 0, aliases: ["existencia"], section: "Costo y stock", help: "Puede quedar negativo si producción consumió antes de cargar la compra." },
  { key: "minStock", label: "Stock mínimo", type: "number", minValue: 0, defaultValue: 0, section: "Costo y stock" },
  { key: "supplierId", label: "Proveedor habitual", type: "ref", ref: "suppliers", aliases: ["proveedor", "cuit proveedor"], section: "Costo y stock" },
  { ...active, section: "Costo y stock" },
];

const SUPPLIER_FIELDS: FieldDef[] = [
  { key: "businessName", label: "Razón social", type: "text", required: true, max: 160, aliases: ["proveedor", "nombre"], wide: true },
  { key: "cuit", label: "CUIT", type: "text", max: 20, aliases: ["documento"] },
  { key: "taxCondition", label: "Condición frente al IVA", type: "select", options: TAX_OPTIONS, defaultValue: "RESPONSABLE_INSCRIPTO", aliases: ["condicion iva", "iva"] },
  { key: "email", label: "Email", type: "email", aliases: ["correo", "mail"] },
  { key: "phone", label: "Teléfono", type: "phone", max: 40, aliases: ["tel"] },
  { key: "address", label: "Dirección", type: "text", max: 200, aliases: ["domicilio"], wide: true },
  { key: "paymentTermDays", label: "Plazo de pago (días)", type: "int", minValue: 0, maxValue: 365, defaultValue: 30, aliases: ["plazo"] },
  { key: "notes", label: "Observaciones", type: "textarea", max: 2000, aliases: ["notas"], wide: true },
  active,
];

const WORKSHOP_FIELDS: FieldDef[] = [
  { key: "name", label: "Nombre", type: "text", required: true, max: 160, aliases: ["taller"], wide: true },
  { key: "types", label: "Servicios", type: "multiselect", required: true, options: toOptions(WORKSHOP_TYPE_LABELS), aliases: ["tipo", "procesos"] },
  { key: "isInternal", label: "Taller propio (interno)", type: "bool", defaultValue: false, aliases: ["interno", "propio"] },
  { key: "cuit", label: "CUIT", type: "text", max: 20 },
  { key: "taxCondition", label: "Condición frente al IVA", type: "select", options: TAX_OPTIONS, defaultValue: "MONOTRIBUTO", aliases: ["condicion iva", "iva"] },
  { key: "paymentTermDays", label: "Plazo de pago (días)", type: "int", minValue: 0, maxValue: 365, defaultValue: 30, aliases: ["plazo"] },
  { key: "contact", label: "Contacto", type: "text", max: 120, aliases: ["responsable"] },
  { key: "phone", label: "Teléfono", type: "phone", max: 40, aliases: ["tel", "celular"] },
  { key: "address", label: "Dirección", type: "text", max: 200, aliases: ["domicilio"], wide: true },
  { key: "notes", label: "Observaciones", type: "textarea", max: 2000, aliases: ["notas"], wide: true },
  active,
];

export const ENTITIES: Record<EntityKey, EntityDef> = {
  clientes: {
    key: "clientes",
    title: "Clientes",
    singular: "cliente",
    newLabel: "Nuevo cliente",
    basePath: "/crm/clientes",
    fields: CLIENT_FIELDS,
    listColumns: ["businessName", "type", "documentNumber", "taxCondition", "phone", "city"],
    readPermission: PERMISSIONS.crmRead,
    writePermission: PERMISSIONS.crmWrite,
    matchHelp: "Se reconoce un cliente existente por su N° de documento (CUIT/DNI) o, si no tiene, por la razón social exacta.",
  },
  productos: {
    key: "productos",
    title: "Productos",
    singular: "producto",
    newLabel: "Nuevo producto",
    basePath: "/maestros/productos",
    fields: PRODUCT_FIELDS,
    listColumns: ["sku", "name", "category", "sourcing", "listPrice"],
    readPermission: PERMISSIONS.mastersRead,
    writePermission: PERMISSIONS.mastersWrite,
    matchHelp:
      "Una fila por talle/color: las filas con el mismo SKU se agrupan en un producto. Se reconoce por SKU; la variante, por SKU variante o por talle + color. El stock importado reemplaza al actual.",
  },
  materiales: {
    key: "materiales",
    title: "Materias primas y avíos",
    singular: "material",
    newLabel: "Nuevo material",
    basePath: "/maestros/materiales",
    fields: MATERIAL_FIELDS,
    listColumns: ["code", "name", "type", "uom", "currentCost", "stockQty"],
    readPermission: PERMISSIONS.mastersRead,
    writePermission: PERMISSIONS.mastersWrite,
    matchHelp: "Se reconoce por código. Un cambio de costo queda en el historial y recalcula las fichas técnicas.",
  },
  proveedores: {
    key: "proveedores",
    title: "Proveedores",
    singular: "proveedor",
    newLabel: "Nuevo proveedor",
    basePath: "/maestros/proveedores",
    fields: SUPPLIER_FIELDS,
    listColumns: ["businessName", "cuit", "taxCondition", "phone", "paymentTermDays"],
    readPermission: PERMISSIONS.mastersRead,
    writePermission: PERMISSIONS.mastersWrite,
    matchHelp: "Se reconoce por CUIT o, si no tiene, por la razón social exacta.",
  },
  talleres: {
    key: "talleres",
    title: "Talleres",
    singular: "taller",
    newLabel: "Nuevo taller",
    basePath: "/maestros/talleres",
    fields: WORKSHOP_FIELDS,
    listColumns: ["name", "types", "taxCondition", "contact", "phone"],
    readPermission: PERMISSIONS.mastersRead,
    writePermission: PERMISSIONS.mastersWrite,
    matchHelp: "Se reconoce por CUIT o, si no tiene, por el nombre exacto.",
  },
};

export const isEntityKey = (k: string): k is EntityKey => (ENTITY_KEYS as readonly string[]).includes(k);

/** Campos que se muestran en el formulario de alta/edición. */
export const formFields = (def: EntityDef) => def.fields.filter((f) => !f.importOnly);
