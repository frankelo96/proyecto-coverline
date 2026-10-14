/**
 * Catálogo base de Coverline: prendas clásicas con ficha técnica estándar.
 *
 * Los consumos son valores de referencia de la industria para talle M (tela
 * de 1,50–1,60 m de ancho o tubular abierto a 1,80 m) y los modelos siguen las
 * características habituales del mercado (bolsillos, avíos, terminaciones).
 * Los precios de materiales y procesos son de referencia: se actualizan solos
 * al cargar compras y facturas de taller, o a mano desde Maestros.
 * Todo queda editable: el seed solo crea lo que no existe.
 */
import type { ProductCategory, RawMaterialType, ServiceType, UnitOfMeasure } from "../../src/generated/prisma/enums";

export interface CatalogMaterial {
  code: string;
  name: string;
  type: RawMaterialType;
  uom: UnitOfMeasure;
  cost: number;
  composition?: string;
  widthCm?: number;
  metersPerKg?: number;
  supplier: string;
}

export interface CatalogService {
  key: string;
  type: ServiceType;
  name: string;
  cost: number;
  unitLabel: string;
  workshop?: string;
}

export interface CatalogProduct {
  sku: string;
  name: string;
  category: ProductCategory;
  description: string;
  sizes: string[];
  colors: string[];
  /** Tela que se muestra como atributo de la variante */
  fabric: string;
  bom: { code: string; quantity: number; wastePct?: number }[];
  services: { key: string; quantity?: number }[];
  pricingPct?: number;
}

const TEXTIL = "30-71111111-1";
const AVIOS = "30-72222222-5";

export const CATALOG_MATERIALS: CatalogMaterial[] = [
  // Telas de punto
  { code: "TEL-PIQ-PEI", name: "Piqué peinado 24/1", type: "TELA", uom: "METRO", cost: 7500, composition: "100% algodón peinado", widthCm: 180, metersPerKg: 2.7, supplier: TEXTIL },
  { code: "TEL-JER-PEI", name: "Jersey peinado 24/1", type: "TELA", uom: "METRO", cost: 6200, composition: "100% algodón peinado", widthCm: 180, metersPerKg: 3.3, supplier: TEXTIL },
  { code: "TEL-FRI-DEP", name: "Friza deportiva", type: "TELA", uom: "METRO", cost: 6900, composition: "100% poliéster", widthCm: 180, metersPerKg: 2.1, supplier: TEXTIL },
  { code: "TEL-POL", name: "Polar 280 g", type: "TELA", uom: "METRO", cost: 5800, composition: "100% poliéster antipilling", widthCm: 160, metersPerKg: 2.2, supplier: TEXTIL },
  // Telas planas
  { code: "TEL-GAB", name: "Gabardina", type: "TELA", uom: "METRO", cost: 6800, composition: "65% poliéster 35% algodón, 240 g/m²", widthCm: 150, supplier: TEXTIL },
  { code: "TEL-GAB-ELA", name: "Gabardina elastizada", type: "TELA", uom: "METRO", cost: 7900, composition: "97% algodón 3% elastano", widthCm: 150, supplier: TEXTIL },
  { code: "TEL-RIP", name: "Tela antidesgarro (rip stop)", type: "TELA", uom: "METRO", cost: 8600, composition: "65% poliéster 35% algodón rip stop", widthCm: 150, supplier: TEXTIL },
  { code: "TEL-JEAN", name: "Jean 12 oz", type: "TELA", uom: "METRO", cost: 9500, composition: "100% algodón denim", widthCm: 150, supplier: TEXTIL },
  { code: "TEL-VEST", name: "Tela de vestir (poliviscosa)", type: "TELA", uom: "METRO", cost: 9800, composition: "65% poliéster 35% viscosa", widthCm: 150, supplier: TEXTIL },
  { code: "TEL-POP", name: "Popelina para camisa", type: "TELA", uom: "METRO", cost: 6200, composition: "65% poliéster 35% algodón", widthCm: 150, supplier: TEXTIL },
  { code: "TEL-ACR-ARC", name: "Acrocel Inta Arciel", type: "TELA", uom: "METRO", cost: 8900, composition: "65% poliéster 35% algodón (Arciel)", widthCm: 160, supplier: TEXTIL },
  { code: "TEL-MIC-SPX", name: "Microfibra con spandex", type: "TELA", uom: "METRO", cost: 7800, composition: "92% poliéster 8% spandex", widthCm: 150, supplier: TEXTIL },
  { code: "TEL-MIC-ELA", name: "Microfibra elastizada", type: "TELA", uom: "METRO", cost: 7200, composition: "95% poliéster 5% elastano", widthCm: 150, supplier: TEXTIL },
  { code: "TEL-BAND-EST", name: "Tela estampada para bandana", type: "TELA", uom: "METRO", cost: 5200, composition: "100% algodón estampado", widthCm: 150, supplier: TEXTIL },
  { code: "TEL-FOR", name: "Tela para bolsillería / forro", type: "TELA", uom: "METRO", cost: 3500, composition: "Tela bolsillo poliéster/algodón", widthCm: 150, supplier: TEXTIL },
  // Punto rectilíneo (cardigan y sweater)
  { code: "HIL-ACR", name: "Hilado acrílico para tejido de punto", type: "INSUMO", uom: "KILOGRAMO", cost: 18000, composition: "100% acrílico", supplier: TEXTIL },
  // Avíos
  { code: "INS-ENTRE", name: "Entretela termoadhesiva", type: "INSUMO", uom: "METRO", cost: 2500, widthCm: 90, supplier: AVIOS },
  { code: "AVI-CUE-TEJ", name: "Cuello tejido para chomba", type: "AVIO", uom: "UNIDAD", cost: 1200, supplier: AVIOS },
  { code: "AVI-PUN-TEJ", name: "Puños tejidos (par)", type: "AVIO", uom: "PAR", cost: 800, supplier: AVIOS },
  { code: "AVI-RIB-UNIV", name: "Juego cuello, puños y cintura tejidos (universitaria)", type: "AVIO", uom: "UNIDAD", cost: 2500, supplier: AVIOS },
  { code: "AVI-CIE-CAMP", name: "Cierre desmontable 60 cm", type: "AVIO", uom: "UNIDAD", cost: 1600, supplier: AVIOS },
  { code: "AVI-CIE-PANT", name: "Cierre metálico pantalón 18 cm", type: "AVIO", uom: "UNIDAD", cost: 450, supplier: AVIOS },
  { code: "AVI-CIE-INV", name: "Cierre invisible 20 cm", type: "AVIO", uom: "UNIDAD", cost: 400, supplier: AVIOS },
  { code: "AVI-CIE-DES", name: "Cierre desmontable pierna 25 cm", type: "AVIO", uom: "UNIDAD", cost: 700, supplier: AVIOS },
  { code: "AVI-BOT-PANT", name: "Botón metálico pantalón", type: "AVIO", uom: "UNIDAD", cost: 180, supplier: AVIOS },
  { code: "AVI-GANCHO", name: "Gancho y presilla pantalón de vestir", type: "AVIO", uom: "UNIDAD", cost: 120, supplier: AVIOS },
  { code: "AVI-BOT-CAM", name: "Botón camisa 11 mm", type: "AVIO", uom: "UNIDAD", cost: 35, supplier: AVIOS },
  { code: "AVI-BOT-CHEF", name: "Botón chef / chaquetilla", type: "AVIO", uom: "UNIDAD", cost: 120, supplier: AVIOS },
  { code: "AVI-BOT-CARD", name: "Botón cardigan", type: "AVIO", uom: "UNIDAD", cost: 90, supplier: AVIOS },
  { code: "AVI-BROCHE", name: "Broche a presión", type: "AVIO", uom: "UNIDAD", cost: 80, supplier: AVIOS },
  { code: "AVI-REM", name: "Remache metálico jean", type: "AVIO", uom: "UNIDAD", cost: 40, supplier: AVIOS },
  { code: "AVI-ELA-10", name: "Elástico 10 mm", type: "AVIO", uom: "METRO", cost: 150, supplier: AVIOS },
  { code: "AVI-COR", name: "Cordón plano", type: "AVIO", uom: "METRO", cost: 300, supplier: AVIOS },
  { code: "AVI-HEB", name: "Hebilla regulable para delantal", type: "AVIO", uom: "UNIDAD", cost: 150, supplier: AVIOS },
];

const PLANTA = "Planta Coverline";
const TALLER = "Taller Confecciones Morón";

export const CATALOG_SERVICES: CatalogService[] = [
  { key: "corte-buzo", type: "CORTE", name: "Corte buzo / campera", cost: 500, unitLabel: "prenda", workshop: PLANTA },
  { key: "corte-pantalon", type: "CORTE", name: "Corte pantalón / bermuda", cost: 450, unitLabel: "prenda", workshop: PLANTA },
  { key: "corte-camisa", type: "CORTE", name: "Corte camisa / chaquetilla", cost: 450, unitLabel: "prenda", workshop: PLANTA },
  { key: "corte-chico", type: "CORTE", name: "Corte cofia / delantal", cost: 150, unitLabel: "prenda", workshop: PLANTA },
  { key: "conf-remera", type: "CONFECCION", name: "Fasón remera", cost: 1300, unitLabel: "prenda", workshop: TALLER },
  { key: "conf-buzo", type: "CONFECCION", name: "Fasón buzo cuello base", cost: 2500, unitLabel: "prenda", workshop: TALLER },
  { key: "conf-buzo-canguro", type: "CONFECCION", name: "Fasón buzo canguro con capucha", cost: 3000, unitLabel: "prenda", workshop: TALLER },
  { key: "conf-buzo-cierre", type: "CONFECCION", name: "Fasón buzo medio cierre", cost: 3000, unitLabel: "prenda", workshop: TALLER },
  { key: "conf-campera", type: "CONFECCION", name: "Fasón campera con cierre", cost: 4200, unitLabel: "prenda", workshop: TALLER },
  { key: "conf-campera-univ", type: "CONFECCION", name: "Fasón campera universitaria", cost: 4800, unitLabel: "prenda", workshop: TALLER },
  { key: "tejido-punto", type: "OTRO", name: "Tejido rectilíneo y armado (cardigan / sweater)", cost: 8500, unitLabel: "prenda" },
  { key: "conf-pantalon", type: "CONFECCION", name: "Fasón pantalón recto / chino", cost: 3000, unitLabel: "prenda", workshop: TALLER },
  { key: "conf-cargo", type: "CONFECCION", name: "Fasón pantalón cargo 6 bolsillos", cost: 3800, unitLabel: "prenda", workshop: TALLER },
  { key: "conf-cargo-desm", type: "CONFECCION", name: "Fasón pantalón cargo desmontable", cost: 4500, unitLabel: "prenda", workshop: TALLER },
  { key: "conf-bermuda", type: "CONFECCION", name: "Fasón bermuda", cost: 2300, unitLabel: "prenda", workshop: TALLER },
  { key: "conf-pantalon-vestir", type: "CONFECCION", name: "Fasón pantalón de vestir", cost: 4200, unitLabel: "prenda", workshop: TALLER },
  { key: "conf-camisa", type: "CONFECCION", name: "Fasón camisa", cost: 3200, unitLabel: "prenda", workshop: TALLER },
  { key: "conf-ambo-celina", type: "CONFECCION", name: "Fasón ambo con recortes (Celina)", cost: 6200, unitLabel: "conjunto", workshop: TALLER },
  { key: "conf-guardapolvo", type: "CONFECCION", name: "Fasón guardapolvo", cost: 4200, unitLabel: "prenda", workshop: TALLER },
  { key: "conf-chaquetilla", type: "CONFECCION", name: "Fasón chaquetilla", cost: 3500, unitLabel: "prenda", workshop: TALLER },
  { key: "conf-saco-chef", type: "CONFECCION", name: "Fasón saco de chef doble botonadura", cost: 4800, unitLabel: "prenda", workshop: TALLER },
  { key: "conf-cofia", type: "CONFECCION", name: "Fasón cofia", cost: 600, unitLabel: "prenda", workshop: TALLER },
  { key: "conf-delantal-cintura", type: "CONFECCION", name: "Fasón delantal de cintura", cost: 900, unitLabel: "prenda", workshop: TALLER },
  { key: "conf-delantal-pechera", type: "CONFECCION", name: "Fasón delantal con pechera", cost: 1400, unitLabel: "prenda", workshop: TALLER },
  { key: "conf-nautico", type: "CONFECCION", name: "Fasón pantalón náutico", cost: 2000, unitLabel: "prenda", workshop: TALLER },
];

// ─── Curvas de talles y colores habituales ────────────────────────────────

const ADULTO = ["S", "M", "L", "XL", "XXL"];
const ESCOLAR = ["4", "6", "8", "10", "12", "14", "16", ...ADULTO];
const ESCOLAR_PUNTO = ["4", "6", "8", "10", "12", "14", "16", "S", "M", "L", "XL"];
const SANITARIO = ["XS", "S", "M", "L", "XL", "XXL", "XXXL"];
const PANTALON = ["38", "40", "42", "44", "46", "48", "50", "52", "54"];
const PANTALON_DAMA = ["36", "38", "40", "42", "44", "46", "48", "50"];
const BERMUDA = ["38", "40", "42", "44", "46", "48", "50", "52"];
const CAMISA_HOMBRE = ["38", "40", "42", "44", "46", "48", "50"];
const UNICO = ["U"];

const C_ESCOLAR_PUNTO = ["Blanco", "Azul marino", "Gris melange"];
const C_BUZO = ["Azul marino", "Gris melange", "Negro", "Bordó"];
const C_POLAR = ["Azul marino", "Negro", "Gris"];
const C_SWEATER = ["Azul marino", "Gris", "Bordó", "Verde inglés"];
const C_TRABAJO = ["Azul marino", "Negro", "Beige", "Gris topo"];
const C_CARGO = ["Azul marino", "Negro", "Verde militar", "Beige"];
const C_RIP = ["Azul marino", "Negro", "Gris"];
const C_VESTIR = ["Negro", "Azul marino", "Gris oscuro"];
const C_CAMISA = ["Blanco", "Celeste", "Azul"];
const C_SANITARIO = ["Azul francia", "Celeste", "Verde quirófano", "Bordó", "Negro", "Blanco"];
const C_CHEF = ["Blanco", "Negro"];
const C_DELANTAL = ["Negro", "Azul marino", "Bordó", "Verde inglés"];

/** Insumos comunes de cada prenda: etiqueta, hilo y bolsa. */
const basics = (thread = 0.03, labels = 1) => [
  { code: "AVI-ETQ", quantity: labels },
  { code: "INS-HIL-POL", quantity: thread },
  { code: "EMP-BOL-PP", quantity: 1 },
];
const finish = [{ key: "planchado" }, { key: "flete-taller" }];

export const CATALOG_PRODUCTS: CatalogProduct[] = [
  // ── Escolar / institucional (punto) ──
  {
    sku: "CHO-PIQ-001", name: "Chomba de piqué peinado", category: "ESCOLAR", fabric: "Piqué peinado 24/1", sizes: ESCOLAR, colors: C_ESCOLAR_PUNTO,
    description: "Chomba manga corta, cuello y puños tejidos, pechera con 3 botones y aberturas laterales. Lista para bordar escudo o logo.",
    bom: [{ code: "TEL-PIQ-PEI", quantity: 1.1, wastePct: 5 }, { code: "AVI-CUE-TEJ", quantity: 1 }, { code: "AVI-PUN-TEJ", quantity: 1 }, { code: "AVI-BOT-4A", quantity: 3 }, ...basics(0.02)],
    services: [{ key: "corte-remera" }, { key: "conf-chomba" }, ...finish],
  },
  {
    sku: "REM-JER-001", name: "Remera de jersey peinado 24/1", category: "ESCOLAR", fabric: "Jersey peinado 24/1", sizes: ESCOLAR, colors: [...C_ESCOLAR_PUNTO, "Negro"],
    description: "Remera manga corta cuello redondo con ribb, costuras reforzadas en hombros. Apta estampa o bordado.",
    bom: [{ code: "TEL-JER-PEI", quantity: 0.9, wastePct: 5 }, { code: "TEL-REEB", quantity: 0.05, wastePct: 5 }, ...basics(0.015)],
    services: [{ key: "corte-remera" }, { key: "conf-remera" }, ...finish],
  },
  {
    sku: "BUZ-FRI-001", name: "Buzo cuello base de friza invisible", category: "ESCOLAR", fabric: "Frisa invisible", sizes: ESCOLAR, colors: C_BUZO,
    description: "Buzo cuello redondo (base) con puños y cintura en ribb 1x1.",
    bom: [{ code: "TEL-FRI", quantity: 1.3, wastePct: 6 }, { code: "TEL-REEB", quantity: 0.3, wastePct: 5 }, ...basics()],
    services: [{ key: "corte-buzo" }, { key: "conf-buzo" }, ...finish],
  },
  {
    sku: "BUZ-CAN-001", name: "Buzo canguro de friza invisible", category: "ESCOLAR", fabric: "Frisa invisible", sizes: ESCOLAR, colors: C_BUZO,
    description: "Buzo con capucha forrada y cordón, bolsillo canguro, puños y cintura en ribb.",
    bom: [{ code: "TEL-FRI", quantity: 1.6, wastePct: 6 }, { code: "TEL-REEB", quantity: 0.25, wastePct: 5 }, { code: "AVI-COR", quantity: 1.3 }, ...basics(0.035)],
    services: [{ key: "corte-buzo" }, { key: "conf-buzo-canguro" }, ...finish],
  },
  {
    sku: "BUZ-MCP-001", name: "Buzo medio cierre de polar", category: "ESCOLAR", fabric: "Polar 280 g", sizes: ESCOLAR, colors: C_POLAR,
    description: "Buzo de polar antipilling con medio cierre al cuello, cuello alto, puños con vivo y cintura con elástico.",
    bom: [{ code: "TEL-POL", quantity: 1.3, wastePct: 6 }, { code: "AVI-CIE-18", quantity: 1 }, { code: "AVI-ELA-30", quantity: 0.2 }, ...basics()],
    services: [{ key: "corte-buzo" }, { key: "conf-buzo-cierre" }, ...finish],
  },
  {
    sku: "BUZ-MCF-001", name: "Buzo medio cierre de friza invisible", category: "ESCOLAR", fabric: "Frisa invisible", sizes: ESCOLAR, colors: C_BUZO,
    description: "Buzo con medio cierre al cuello, cuello alto, puños y cintura en ribb.",
    bom: [{ code: "TEL-FRI", quantity: 1.35, wastePct: 6 }, { code: "TEL-REEB", quantity: 0.3, wastePct: 5 }, { code: "AVI-CIE-18", quantity: 1 }, ...basics()],
    services: [{ key: "corte-buzo" }, { key: "conf-buzo-cierre" }, ...finish],
  },
  {
    sku: "BUZ-MCD-001", name: "Buzo medio cierre de friza deportiva", category: "ESCOLAR", fabric: "Friza deportiva", sizes: ESCOLAR, colors: C_BUZO,
    description: "Buzo deportivo con medio cierre, cuello alto, puños y cintura en ribb.",
    bom: [{ code: "TEL-FRI-DEP", quantity: 1.35, wastePct: 6 }, { code: "TEL-REEB", quantity: 0.3, wastePct: 5 }, { code: "AVI-CIE-18", quantity: 1 }, ...basics()],
    services: [{ key: "corte-buzo" }, { key: "conf-buzo-cierre" }, ...finish],
  },
  {
    sku: "CAM-POL-001", name: "Campera de polar", category: "ESCOLAR", fabric: "Polar 280 g", sizes: ESCOLAR, colors: C_POLAR,
    description: "Campera de polar antipilling con cierre desmontable, cuello alto y 2 bolsillos laterales con cierre.",
    bom: [{ code: "TEL-POL", quantity: 1.6, wastePct: 6 }, { code: "AVI-CIE-CAMP", quantity: 1 }, { code: "AVI-CIE-18", quantity: 2 }, { code: "AVI-ELA-30", quantity: 0.3 }, ...basics(0.035)],
    services: [{ key: "corte-buzo" }, { key: "conf-campera" }, ...finish],
  },
  {
    sku: "CAM-CAN-001", name: "Campera canguro de friza invisible", category: "ESCOLAR", fabric: "Frisa invisible", sizes: ESCOLAR, colors: C_BUZO,
    description: "Campera con capucha y cordón, cierre desmontable, bolsillos canguro, puños y cintura en ribb.",
    bom: [{ code: "TEL-FRI", quantity: 1.8, wastePct: 6 }, { code: "TEL-REEB", quantity: 0.25, wastePct: 5 }, { code: "AVI-CIE-CAMP", quantity: 1 }, { code: "AVI-COR", quantity: 1.3 }, ...basics(0.04)],
    services: [{ key: "corte-buzo" }, { key: "conf-campera" }, ...finish],
  },
  {
    sku: "CAM-UNI-FRI", name: "Campera universitaria de friza invisible", category: "ESCOLAR", fabric: "Frisa invisible", sizes: ESCOLAR, colors: C_BUZO,
    description: "Campera estilo universitaria (college) con cuello, puños y cintura tejidos rayados, cierre a broches y 2 bolsillos de vivo.",
    bom: [{ code: "TEL-FRI", quantity: 1.6, wastePct: 6 }, { code: "AVI-RIB-UNIV", quantity: 1 }, { code: "AVI-BROCHE", quantity: 6 }, ...basics(0.04)],
    services: [{ key: "corte-buzo" }, { key: "conf-campera-univ" }, ...finish],
  },
  {
    sku: "CAM-UNI-DEP", name: "Campera universitaria de friza deportiva", category: "ESCOLAR", fabric: "Friza deportiva", sizes: ESCOLAR, colors: C_BUZO,
    description: "Campera estilo universitaria con cuello, puños y cintura tejidos rayados, cierre a broches y 2 bolsillos de vivo.",
    bom: [{ code: "TEL-FRI-DEP", quantity: 1.6, wastePct: 6 }, { code: "AVI-RIB-UNIV", quantity: 1 }, { code: "AVI-BROCHE", quantity: 6 }, ...basics(0.04)],
    services: [{ key: "corte-buzo" }, { key: "conf-campera-univ" }, ...finish],
  },
  {
    sku: "CAR-CIE-001", name: "Cardigan con cierre", category: "ESCOLAR", fabric: "Tejido de punto acrílico", sizes: ESCOLAR_PUNTO, colors: C_SWEATER,
    description: "Cardigan de punto acrílico antipilling con cierre al frente, puños y cintura elastizados.",
    bom: [{ code: "HIL-ACR", quantity: 0.45, wastePct: 4 }, { code: "AVI-CIE-CAMP", quantity: 1 }, ...basics(0.01)],
    services: [{ key: "tejido-punto" }, ...finish],
  },
  {
    sku: "CAR-BOT-001", name: "Cardigan con botones", category: "ESCOLAR", fabric: "Tejido de punto acrílico", sizes: ESCOLAR_PUNTO, colors: C_SWEATER,
    description: "Cardigan de punto acrílico antipilling, escote en V con 6 botones, puños y cintura elastizados.",
    bom: [{ code: "HIL-ACR", quantity: 0.45, wastePct: 4 }, { code: "AVI-BOT-CARD", quantity: 6 }, ...basics(0.01)],
    services: [{ key: "tejido-punto" }, ...finish],
  },
  {
    sku: "SWE-CUV-001", name: "Sweater cuello en V", category: "ESCOLAR", fabric: "Tejido de punto acrílico", sizes: ESCOLAR_PUNTO, colors: C_SWEATER,
    description: "Sweater de punto acrílico antipilling escote en V, puños y cintura elastizados.",
    bom: [{ code: "HIL-ACR", quantity: 0.42, wastePct: 4 }, ...basics(0.01)],
    services: [{ key: "tejido-punto" }, ...finish],
  },
  {
    sku: "SWE-CUR-001", name: "Sweater cuello redondo", category: "ESCOLAR", fabric: "Tejido de punto acrílico", sizes: ESCOLAR_PUNTO, colors: C_SWEATER,
    description: "Sweater de punto acrílico antipilling cuello redondo, puños y cintura elastizados.",
    bom: [{ code: "HIL-ACR", quantity: 0.42, wastePct: 4 }, ...basics(0.01)],
    services: [{ key: "tejido-punto" }, ...finish],
  },
  // ── Trabajo: pantalones, bermudas, camisas ──
  {
    sku: "PAN-CHI-001", name: "Pantalón corte chino de gabardina elastizada", category: "TRABAJO", fabric: "Gabardina elastizada", sizes: PANTALON, colors: C_TRABAJO,
    description: "Pantalón corte chino con bolsillos delanteros sesgados, 2 traseros con ojal y botón, bragueta con cierre y botón metálico, presillas para cinturón.",
    bom: [{ code: "TEL-GAB-ELA", quantity: 1.3, wastePct: 8 }, { code: "TEL-FOR", quantity: 0.25 }, { code: "INS-ENTRE", quantity: 0.1 }, { code: "AVI-CIE-PANT", quantity: 1 }, { code: "AVI-BOT-PANT", quantity: 1 }, ...basics(0.04)],
    services: [{ key: "corte-pantalon" }, { key: "conf-pantalon" }, ...finish],
  },
  {
    sku: "PAN-REC-001", name: "Pantalón recto de gabardina elastizada", category: "TRABAJO", fabric: "Gabardina elastizada", sizes: PANTALON, colors: C_TRABAJO,
    description: "Pantalón corte recto con bolsillos delanteros tipo jean, 2 traseros, bragueta con cierre y botón metálico.",
    bom: [{ code: "TEL-GAB-ELA", quantity: 1.25, wastePct: 8 }, { code: "TEL-FOR", quantity: 0.25 }, { code: "INS-ENTRE", quantity: 0.1 }, { code: "AVI-CIE-PANT", quantity: 1 }, { code: "AVI-BOT-PANT", quantity: 1 }, ...basics(0.04)],
    services: [{ key: "corte-pantalon" }, { key: "conf-pantalon" }, ...finish],
  },
  {
    sku: "PAN-CAR-GAB", name: "Pantalón tipo cargo de gabardina elastizada", category: "TRABAJO", fabric: "Gabardina elastizada", sizes: PANTALON, colors: C_CARGO,
    description: "Pantalón cargo 6 bolsillos: 2 delanteros, 2 laterales con fuelle y tapa con abrojo, 2 traseros. Cintura con elástico lateral y costuras reforzadas.",
    bom: [{ code: "TEL-GAB-ELA", quantity: 1.6, wastePct: 8 }, { code: "TEL-FOR", quantity: 0.25 }, { code: "INS-ENTRE", quantity: 0.1 }, { code: "AVI-CIE-PANT", quantity: 1 }, { code: "AVI-BOT-PANT", quantity: 1 }, { code: "AVI-ABR", quantity: 0.2 }, { code: "AVI-ELA-30", quantity: 0.3 }, ...basics(0.05)],
    services: [{ key: "corte-pantalon" }, { key: "conf-cargo" }, ...finish],
  },
  {
    sku: "PAN-CAR-RIP", name: "Pantalón tipo cargo tela antidesgarro", category: "TRABAJO", fabric: "Tela antidesgarro (rip stop)", sizes: PANTALON, colors: C_RIP,
    description: "Pantalón cargo 6 bolsillos en rip stop: 2 delanteros, 2 laterales con fuelle y tapa con abrojo, 2 traseros. Refuerzo en entrepierna.",
    bom: [{ code: "TEL-RIP", quantity: 1.6, wastePct: 8 }, { code: "TEL-FOR", quantity: 0.25 }, { code: "INS-ENTRE", quantity: 0.1 }, { code: "AVI-CIE-PANT", quantity: 1 }, { code: "AVI-BOT-PANT", quantity: 1 }, { code: "AVI-ABR", quantity: 0.2 }, { code: "AVI-ELA-30", quantity: 0.3 }, ...basics(0.05)],
    services: [{ key: "corte-pantalon" }, { key: "conf-cargo" }, ...finish],
  },
  {
    sku: "PAN-CAR-DES", name: "Pantalón tipo cargo desmontable tela antidesgarro", category: "TRABAJO", fabric: "Tela antidesgarro (rip stop)", sizes: PANTALON, colors: C_RIP,
    description: "Pantalón cargo convertible en bermuda con cierres desmontables en las piernas, 6 bolsillos con fuelle y abrojo.",
    bom: [{ code: "TEL-RIP", quantity: 1.65, wastePct: 8 }, { code: "TEL-FOR", quantity: 0.25 }, { code: "INS-ENTRE", quantity: 0.1 }, { code: "AVI-CIE-PANT", quantity: 1 }, { code: "AVI-CIE-DES", quantity: 2 }, { code: "AVI-BOT-PANT", quantity: 1 }, { code: "AVI-ABR", quantity: 0.2 }, { code: "AVI-ELA-30", quantity: 0.3 }, ...basics(0.06)],
    services: [{ key: "corte-pantalon" }, { key: "conf-cargo-desm" }, ...finish],
  },
  {
    sku: "BER-REC-001", name: "Bermuda recta de gabardina", category: "TRABAJO", fabric: "Gabardina", sizes: BERMUDA, colors: C_TRABAJO,
    description: "Bermuda recta con bolsillos delanteros sesgados, 2 traseros, bragueta con cierre y botón.",
    bom: [{ code: "TEL-GAB", quantity: 0.8, wastePct: 8 }, { code: "TEL-FOR", quantity: 0.2 }, { code: "INS-ENTRE", quantity: 0.1 }, { code: "AVI-CIE-PANT", quantity: 1 }, { code: "AVI-BOT-PANT", quantity: 1 }, ...basics()],
    services: [{ key: "corte-pantalon" }, { key: "conf-bermuda" }, ...finish],
  },
  {
    sku: "BER-CAR-001", name: "Bermuda tipo cargo de gabardina", category: "TRABAJO", fabric: "Gabardina", sizes: BERMUDA, colors: C_CARGO,
    description: "Bermuda cargo 6 bolsillos con fuelle y tapa con abrojo, cintura con elástico lateral.",
    bom: [{ code: "TEL-GAB", quantity: 0.95, wastePct: 8 }, { code: "TEL-FOR", quantity: 0.2 }, { code: "INS-ENTRE", quantity: 0.1 }, { code: "AVI-CIE-PANT", quantity: 1 }, { code: "AVI-BOT-PANT", quantity: 1 }, { code: "AVI-ABR", quantity: 0.15 }, { code: "AVI-ELA-30", quantity: 0.3 }, ...basics(0.035)],
    services: [{ key: "corte-pantalon" }, { key: "conf-bermuda" }, ...finish],
  },
  {
    sku: "BER-JEA-001", name: "Bermuda de jean", category: "TRABAJO", fabric: "Jean 12 oz", sizes: BERMUDA, colors: ["Azul índigo", "Negro"],
    description: "Bermuda de jean 5 bolsillos con remaches, bragueta con cierre metálico y botón.",
    bom: [{ code: "TEL-JEAN", quantity: 0.85, wastePct: 8 }, { code: "TEL-FOR", quantity: 0.2 }, { code: "AVI-CIE-PANT", quantity: 1 }, { code: "AVI-BOT-PANT", quantity: 1 }, { code: "AVI-REM", quantity: 6 }, ...basics(0.04)],
    services: [{ key: "corte-pantalon" }, { key: "conf-bermuda" }, ...finish],
  },
  {
    sku: "PAN-VES-HOM", name: "Pantalón de vestir de hombre", category: "TRABAJO", fabric: "Tela de vestir (poliviscosa)", sizes: PANTALON, colors: C_VESTIR,
    description: "Pantalón de vestir con pinzas o recto, bolsillos sesgados, 2 traseros con ojal, cintura con gancho y forro de pretina.",
    bom: [{ code: "TEL-VEST", quantity: 1.3, wastePct: 8 }, { code: "TEL-FOR", quantity: 0.3 }, { code: "INS-ENTRE", quantity: 0.15 }, { code: "AVI-CIE-PANT", quantity: 1 }, { code: "AVI-GANCHO", quantity: 1 }, { code: "AVI-BOT-CAM", quantity: 2 }, ...basics(0.04)],
    services: [{ key: "corte-pantalon" }, { key: "conf-pantalon-vestir" }, ...finish],
  },
  {
    sku: "PAN-VES-MUJ", name: "Pantalón de vestir de mujer", category: "TRABAJO", fabric: "Tela de vestir (poliviscosa)", sizes: PANTALON_DAMA, colors: C_VESTIR,
    description: "Pantalón de vestir de dama, tiro medio, cierre invisible lateral o delantero, pinzas en espalda.",
    bom: [{ code: "TEL-VEST", quantity: 1.15, wastePct: 8 }, { code: "TEL-FOR", quantity: 0.25 }, { code: "INS-ENTRE", quantity: 0.1 }, { code: "AVI-CIE-INV", quantity: 1 }, { code: "AVI-GANCHO", quantity: 1 }, ...basics(0.035)],
    services: [{ key: "corte-pantalon" }, { key: "conf-pantalon-vestir" }, ...finish],
  },
  {
    sku: "CMS-DAM-001", name: "Camisa entallada de dama", category: "TRABAJO", fabric: "Popelina para camisa", sizes: ADULTO, colors: C_CAMISA,
    description: "Camisa de dama entallada con pinzas, cuello camisero, manga larga con puño y botones.",
    bom: [{ code: "TEL-POP", quantity: 1.4, wastePct: 7 }, { code: "INS-ENTRE", quantity: 0.2 }, { code: "AVI-BOT-CAM", quantity: 9 }, ...basics()],
    services: [{ key: "corte-camisa" }, { key: "conf-camisa" }, ...finish],
  },
  {
    sku: "CMS-HML-001", name: "Camisa clásica de hombre manga larga", category: "TRABAJO", fabric: "Popelina para camisa", sizes: CAMISA_HOMBRE, colors: C_CAMISA,
    description: "Camisa clásica de hombre, cuello con pie, bolsillo en pecho, manga larga con puño y botones.",
    bom: [{ code: "TEL-POP", quantity: 1.6, wastePct: 7 }, { code: "INS-ENTRE", quantity: 0.25 }, { code: "AVI-BOT-CAM", quantity: 12 }, ...basics()],
    services: [{ key: "corte-camisa" }, { key: "conf-camisa" }, ...finish],
  },
  {
    sku: "CMS-HMC-001", name: "Camisa clásica de hombre manga corta", category: "TRABAJO", fabric: "Popelina para camisa", sizes: CAMISA_HOMBRE, colors: C_CAMISA,
    description: "Camisa clásica de hombre, cuello con pie, bolsillo en pecho, manga corta.",
    bom: [{ code: "TEL-POP", quantity: 1.3, wastePct: 7 }, { code: "INS-ENTRE", quantity: 0.2 }, { code: "AVI-BOT-CAM", quantity: 8 }, ...basics(0.025)],
    services: [{ key: "corte-camisa" }, { key: "conf-camisa" }, ...finish],
  },
  // ── Sanitario ──
  {
    sku: "AMB-ARC-001", name: "Ambo clásico de acrocel de Inta Arciel", category: "MEDICA", fabric: "Acrocel Inta Arciel", sizes: SANITARIO, colors: C_SANITARIO,
    description: "Ambo unisex: chaqueta escote en V con 3 bolsillos (2 inferiores y 1 superior) y pantalón con cintura elástica y cordón.",
    bom: [{ code: "TEL-ACR-ARC", quantity: 2.5, wastePct: 6 }, { code: "AVI-ELA-30", quantity: 0.8 }, ...basics(0.04, 2)],
    services: [{ key: "corte-ambo" }, { key: "conf-ambo" }, { key: "planchado" }, { key: "flete-taller", quantity: 2 }],
  },
  {
    sku: "AMB-ECO-001", name: "Ambo clásico de acrocel económico", category: "MEDICA", fabric: "Acrocel", sizes: SANITARIO, colors: C_SANITARIO,
    description: "Ambo unisex: chaqueta escote en V con 3 bolsillos y pantalón con cintura elástica.",
    bom: [{ code: "TEL-ACR", quantity: 2.5, wastePct: 6 }, { code: "AVI-ELA-30", quantity: 0.8 }, ...basics(0.04, 2)],
    services: [{ key: "corte-ambo" }, { key: "conf-ambo" }, { key: "planchado" }, { key: "flete-taller", quantity: 2 }],
  },
  {
    sku: "AMB-CEL-001", name: "Ambo Celina de microfibra con spandex", category: "MEDICA", fabric: "Microfibra con spandex", sizes: SANITARIO, colors: C_SANITARIO,
    description: "Ambo de dama modelo Celina: chaqueta entallada con recortes y vivos, escote cruzado, bolsillos; pantalón elastizado con cintura elástica.",
    bom: [{ code: "TEL-MIC-SPX", quantity: 2.4, wastePct: 7 }, { code: "AVI-ELA-30", quantity: 0.8 }, ...basics(0.045, 2)],
    services: [{ key: "corte-ambo" }, { key: "conf-ambo-celina" }, { key: "planchado" }, { key: "flete-taller", quantity: 2 }],
  },
  {
    sku: "AMB-MIC-001", name: "Ambo liso de microfibra elastizada", category: "MEDICA", fabric: "Microfibra elastizada", sizes: SANITARIO, colors: C_SANITARIO,
    description: "Ambo liso unisex en microfibra elastizada: chaqueta escote en V con bolsillos y pantalón con cintura elástica y cordón.",
    bom: [{ code: "TEL-MIC-ELA", quantity: 2.4, wastePct: 6 }, { code: "AVI-ELA-30", quantity: 0.8 }, ...basics(0.04, 2)],
    services: [{ key: "corte-ambo" }, { key: "conf-ambo" }, { key: "planchado" }, { key: "flete-taller", quantity: 2 }],
  },
  {
    sku: "GUA-ARC-001", name: "Guardapolvo de acrocel de Inta Arciel", category: "MEDICA", fabric: "Acrocel Inta Arciel", sizes: SANITARIO, colors: ["Blanco"],
    description: "Guardapolvo manga larga, cuello solapa, 5 botones, 3 bolsillos (2 inferiores y 1 en pecho), martingala en espalda.",
    bom: [{ code: "TEL-ACR-ARC", quantity: 2.2, wastePct: 6 }, { code: "INS-ENTRE", quantity: 0.2 }, { code: "AVI-BOT-4A", quantity: 6 }, ...basics(0.04)],
    services: [{ key: "corte-camisa" }, { key: "conf-guardapolvo" }, ...finish],
  },
  {
    sku: "NAU-ECO-001", name: "Pantalón náutico de acrocel económico", category: "MEDICA", fabric: "Acrocel", sizes: SANITARIO, colors: C_SANITARIO,
    description: "Pantalón náutico unisex con cintura elástica y cordón, 2 bolsillos laterales.",
    bom: [{ code: "TEL-ACR", quantity: 1.15, wastePct: 6 }, { code: "AVI-ELA-30", quantity: 0.8 }, { code: "AVI-COR", quantity: 1.2 }, ...basics(0.02)],
    services: [{ key: "corte-pantalon" }, { key: "conf-nautico" }, ...finish],
  },
  {
    sku: "NAU-ARC-001", name: "Pantalón náutico de acrocel de Inta Arciel", category: "MEDICA", fabric: "Acrocel Inta Arciel", sizes: SANITARIO, colors: C_SANITARIO,
    description: "Pantalón náutico unisex con cintura elástica y cordón, 2 bolsillos laterales.",
    bom: [{ code: "TEL-ACR-ARC", quantity: 1.15, wastePct: 6 }, { code: "AVI-ELA-30", quantity: 0.8 }, { code: "AVI-COR", quantity: 1.2 }, ...basics(0.02)],
    services: [{ key: "corte-pantalon" }, { key: "conf-nautico" }, ...finish],
  },
  {
    sku: "NAU-MIC-001", name: "Pantalón náutico de microfibra elastizada", category: "MEDICA", fabric: "Microfibra elastizada", sizes: SANITARIO, colors: C_SANITARIO,
    description: "Pantalón náutico elastizado con cintura elástica y cordón, 2 bolsillos laterales.",
    bom: [{ code: "TEL-MIC-ELA", quantity: 1.15, wastePct: 6 }, { code: "AVI-ELA-30", quantity: 0.8 }, { code: "AVI-COR", quantity: 1.2 }, ...basics(0.02)],
    services: [{ key: "corte-pantalon" }, { key: "conf-nautico" }, ...finish],
  },
  // ── Gastronomía ──
  {
    sku: "CHQ-MAO-HOM", name: "Chaquetilla cuello mao de hombre", category: "GASTRONOMICA", fabric: "Gabardina", sizes: SANITARIO, colors: C_CHEF,
    description: "Chaquetilla de hombre cuello mao, abotonadura simple al frente, manga larga, bolsillo en pecho.",
    bom: [{ code: "TEL-GAB", quantity: 1.5, wastePct: 7 }, { code: "INS-ENTRE", quantity: 0.15 }, { code: "AVI-BOT-CHEF", quantity: 6 }, ...basics()],
    services: [{ key: "corte-camisa" }, { key: "conf-chaquetilla" }, ...finish],
  },
  {
    sku: "CHQ-MAO-MUJ", name: "Chaquetilla cuello mao de mujer", category: "GASTRONOMICA", fabric: "Gabardina", sizes: SANITARIO, colors: C_CHEF,
    description: "Chaquetilla de dama cuello mao, abotonadura simple, manga 3/4 o larga, bolsillo en pecho.",
    bom: [{ code: "TEL-GAB", quantity: 1.35, wastePct: 7 }, { code: "INS-ENTRE", quantity: 0.15 }, { code: "AVI-BOT-CHEF", quantity: 6 }, ...basics()],
    services: [{ key: "corte-camisa" }, { key: "conf-chaquetilla" }, ...finish],
  },
  {
    sku: "CHQ-ENT-DAM", name: "Chaquetilla entallada de dama", category: "GASTRONOMICA", fabric: "Gabardina", sizes: SANITARIO, colors: C_CHEF,
    description: "Chaquetilla de dama entallada con pinzas de busto y cintura, cuello mao y abotonadura al frente.",
    bom: [{ code: "TEL-GAB", quantity: 1.4, wastePct: 7 }, { code: "INS-ENTRE", quantity: 0.15 }, { code: "AVI-BOT-CHEF", quantity: 7 }, ...basics()],
    services: [{ key: "corte-camisa" }, { key: "conf-chaquetilla" }, ...finish],
  },
  {
    sku: "SCH-GAB-001", name: "Saco de cheff de gabardina", category: "GASTRONOMICA", fabric: "Gabardina", sizes: SANITARIO, colors: C_CHEF,
    description: "Saco de chef cuello mao, doble botonadura de 10 botones, manga larga y bolsillo para termómetro en la manga.",
    bom: [{ code: "TEL-GAB", quantity: 1.8, wastePct: 7 }, { code: "INS-ENTRE", quantity: 0.2 }, { code: "AVI-BOT-CHEF", quantity: 10 }, ...basics(0.04)],
    services: [{ key: "corte-camisa" }, { key: "conf-saco-chef" }, ...finish],
  },
  {
    sku: "SCH-ARC-001", name: "Saco de cheff de acrocel de Inta Arciel", category: "GASTRONOMICA", fabric: "Acrocel Inta Arciel", sizes: SANITARIO, colors: C_CHEF,
    description: "Saco de chef cuello mao, doble botonadura de 10 botones, manga larga y bolsillo para termómetro en la manga.",
    bom: [{ code: "TEL-ACR-ARC", quantity: 1.8, wastePct: 7 }, { code: "INS-ENTRE", quantity: 0.2 }, { code: "AVI-BOT-CHEF", quantity: 10 }, ...basics(0.04)],
    services: [{ key: "corte-camisa" }, { key: "conf-saco-chef" }, ...finish],
  },
  {
    sku: "COF-ARC-001", name: "Cofia de acrocel de Inta Arciel", category: "GASTRONOMICA", fabric: "Acrocel Inta Arciel", sizes: UNICO, colors: ["Blanco", "Azul francia", "Celeste", "Verde quirófano"],
    description: "Cofia con elástico posterior, talle único.",
    bom: [{ code: "TEL-ACR-ARC", quantity: 0.25, wastePct: 5 }, { code: "AVI-ELA-10", quantity: 0.3 }, ...basics(0.005)],
    services: [{ key: "corte-chico" }, { key: "conf-cofia" }],
  },
  {
    sku: "COF-BAN-LIS", name: "Cofia bandana lisa", category: "GASTRONOMICA", fabric: "Gabardina", sizes: UNICO, colors: ["Negro", "Blanco", "Bordó", "Azul marino"],
    description: "Cofia tipo bandana con tiras para atar, talle único.",
    bom: [{ code: "TEL-GAB", quantity: 0.3, wastePct: 5 }, ...basics(0.005)],
    services: [{ key: "corte-chico" }, { key: "conf-cofia" }],
  },
  {
    sku: "COF-ELA-001", name: "Cofia con elástico", category: "GASTRONOMICA", fabric: "Gabardina", sizes: UNICO, colors: ["Blanco", "Negro"],
    description: "Cofia tipo gorro con elástico perimetral, talle único.",
    bom: [{ code: "TEL-GAB", quantity: 0.25, wastePct: 5 }, { code: "AVI-ELA-10", quantity: 0.6 }, ...basics(0.005)],
    services: [{ key: "corte-chico" }, { key: "conf-cofia" }],
  },
  {
    sku: "COF-BAN-EST", name: "Cofia tipo bandana estampada", category: "GASTRONOMICA", fabric: "Tela estampada para bandana", sizes: UNICO, colors: ["Surtido"],
    description: "Cofia tipo bandana en tela estampada con tiras para atar, talle único.",
    bom: [{ code: "TEL-BAND-EST", quantity: 0.3, wastePct: 5 }, ...basics(0.005)],
    services: [{ key: "corte-chico" }, { key: "conf-cofia" }],
  },
  {
    sku: "DEL-CIN-GAB", name: "Delantal cintura de gabardina", category: "GASTRONOMICA", fabric: "Gabardina", sizes: UNICO, colors: C_DELANTAL,
    description: "Delantal de cintura con tiras para atar y bolsillo frontal dividido, talle único.",
    bom: [{ code: "TEL-GAB", quantity: 0.6, wastePct: 5 }, ...basics(0.01)],
    services: [{ key: "corte-chico" }, { key: "conf-delantal-cintura" }, ...finish],
  },
  {
    sku: "DEL-CIN-ARC", name: "Delantal cintura de acrocel de Inta Arciel", category: "GASTRONOMICA", fabric: "Acrocel Inta Arciel", sizes: UNICO, colors: C_DELANTAL,
    description: "Delantal de cintura con tiras para atar y bolsillo frontal dividido, talle único.",
    bom: [{ code: "TEL-ACR-ARC", quantity: 0.6, wastePct: 5 }, ...basics(0.01)],
    services: [{ key: "corte-chico" }, { key: "conf-delantal-cintura" }, ...finish],
  },
  {
    sku: "DEL-PEC-GAB", name: "Delantal pechera de gabardina", category: "GASTRONOMICA", fabric: "Gabardina", sizes: UNICO, colors: C_DELANTAL,
    description: "Delantal con pechera, tira al cuello con hebilla regulable, tiras de cintura y bolsillo frontal.",
    bom: [{ code: "TEL-GAB", quantity: 1.0, wastePct: 5 }, { code: "AVI-HEB", quantity: 1 }, ...basics(0.015)],
    services: [{ key: "corte-chico" }, { key: "conf-delantal-pechera" }, ...finish],
  },
  {
    sku: "DEL-PEC-RIP", name: "Delantal pechera de tela antidesgarro", category: "GASTRONOMICA", fabric: "Tela antidesgarro (rip stop)", sizes: UNICO, colors: ["Negro", "Gris", "Azul marino"],
    description: "Delantal con pechera en rip stop, tira al cuello con hebilla regulable, tiras de cintura y bolsillo frontal.",
    bom: [{ code: "TEL-RIP", quantity: 1.0, wastePct: 5 }, { code: "AVI-HEB", quantity: 1 }, ...basics(0.015)],
    services: [{ key: "corte-chico" }, { key: "conf-delantal-pechera" }, ...finish],
  },
];

/**
 * Ajuste de precio por talle sobre el precio de lista (calculado para talle M):
 * talles de niño más chicos consumen menos tela; los extra grandes, más.
 */
export function sizeAdjustment(size: string): number {
  if (["4", "6", "8"].includes(size)) return -20;
  if (["10", "12", "14", "16"].includes(size)) return -10;
  if (["XXL", "XXXL", "52", "54"].includes(size)) return 10;
  return 0;
}
