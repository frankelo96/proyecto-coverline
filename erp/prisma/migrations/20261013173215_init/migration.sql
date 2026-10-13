-- CreateEnum
CREATE TYPE "ClientType" AS ENUM ('PARTICULAR', 'ESCUELA', 'EMPRESA', 'CLINICA', 'GASTRONOMICO', 'OTRO');

-- CreateEnum
CREATE TYPE "TaxCondition" AS ENUM ('RESPONSABLE_INSCRIPTO', 'MONOTRIBUTO', 'EXENTO', 'CONSUMIDOR_FINAL');

-- CreateEnum
CREATE TYPE "DocumentType" AS ENUM ('CUIT', 'CUIL', 'DNI', 'PASAPORTE');

-- CreateEnum
CREATE TYPE "LeadStatus" AS ENUM ('NUEVO', 'CONTACTADO', 'PRESUPUESTADO', 'NEGOCIACION', 'GANADO', 'PERDIDO');

-- CreateEnum
CREATE TYPE "QuoteStatus" AS ENUM ('BORRADOR', 'ENVIADO', 'ACEPTADO', 'RECHAZADO', 'VENCIDO');

-- CreateEnum
CREATE TYPE "RawMaterialType" AS ENUM ('TELA', 'AVIO', 'EMPAQUE', 'INSUMO');

-- CreateEnum
CREATE TYPE "UnitOfMeasure" AS ENUM ('METRO', 'KILOGRAMO', 'UNIDAD', 'PAR', 'CONO', 'ROLLO');

-- CreateEnum
CREATE TYPE "ProductCategory" AS ENUM ('TRABAJO', 'ESCOLAR', 'MEDICA', 'GASTRONOMICA', 'ACCESORIO');

-- CreateEnum
CREATE TYPE "PricingMode" AS ENUM ('MARKUP', 'MARGIN');

-- CreateEnum
CREATE TYPE "ServiceType" AS ENUM ('CORTE', 'CONFECCION', 'BORDADO', 'ESTAMPADO', 'SUBLIMACION', 'PLANCHADO', 'EMPAQUE', 'FLETE', 'OTRO');

-- CreateEnum
CREATE TYPE "WorkshopType" AS ENUM ('CONFECCION', 'BORDADO', 'ESTAMPADO', 'SUBLIMACION', 'PLANCHADO');

-- CreateEnum
CREATE TYPE "ProductionStage" AS ENUM ('CORTE_INTERNO', 'EN_TALLER_CONFECCION', 'EN_PERSONALIZACION', 'CONTROL_CALIDAD_PLANCHADO', 'LISTO_ENTREGA');

-- CreateEnum
CREATE TYPE "ProductionOrderStatus" AS ENUM ('BORRADOR', 'EN_PROCESO', 'COMPLETADA', 'CANCELADA');

-- CreateEnum
CREATE TYPE "WorkshopRemitType" AS ENUM ('ENVIO', 'RECEPCION');

-- CreateEnum
CREATE TYPE "SaleChannel" AS ENUM ('MOSTRADOR', 'WHATSAPP', 'WEB', 'MAYORISTA');

-- CreateEnum
CREATE TYPE "SaleStatus" AS ENUM ('PRESUPUESTO', 'PENDIENTE', 'CONFIRMADA', 'ENTREGADA', 'ANULADA');

-- CreateEnum
CREATE TYPE "DeliveryMethod" AS ENUM ('RETIRO_SUCURSAL', 'ENVIO');

-- CreateEnum
CREATE TYPE "InvoiceType" AS ENUM ('FACTURA_A', 'FACTURA_B', 'FACTURA_C', 'NOTA_CREDITO_A', 'NOTA_CREDITO_B', 'NOTA_CREDITO_C', 'TICKET_INTERNO');

-- CreateEnum
CREATE TYPE "PaymentMethod" AS ENUM ('EFECTIVO', 'TARJETA_DEBITO', 'TARJETA_CREDITO', 'MERCADO_PAGO', 'MODO', 'TRANSFERENCIA', 'CUENTA_CORRIENTE');

-- CreateEnum
CREATE TYPE "CashRegisterKind" AS ENUM ('CAJA_DIARIA', 'CAJA_ADMINISTRATIVA', 'BILLETERA_VIRTUAL', 'BANCO');

-- CreateEnum
CREATE TYPE "CashSessionStatus" AS ENUM ('ABIERTA', 'CERRADA');

-- CreateEnum
CREATE TYPE "CashMovementType" AS ENUM ('APERTURA', 'INGRESO', 'EGRESO', 'AJUSTE', 'TRANSFERENCIA_ENTRADA', 'TRANSFERENCIA_SALIDA');

-- CreateEnum
CREATE TYPE "AccountStatus" AS ENUM ('PENDIENTE', 'PARCIAL', 'CANCELADO', 'ANULADO');

-- CreateEnum
CREATE TYPE "PurchaseStatus" AS ENUM ('BORRADOR', 'RECIBIDA', 'ANULADA');

-- CreateEnum
CREATE TYPE "CostSnapshotReason" AS ENUM ('MANUAL', 'CAMBIO_PRECIO_MATERIAL', 'CAMBIO_TARIFA_SERVICIO', 'CAMBIO_FICHA_TECNICA', 'COMPRA');

-- CreateTable
CREATE TABLE "roles" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "permissions" TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "roles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "roleId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "entity" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "reason" TEXT,
    "data" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "clients" (
    "id" TEXT NOT NULL,
    "type" "ClientType" NOT NULL,
    "businessName" TEXT NOT NULL,
    "fantasyName" TEXT,
    "documentType" "DocumentType" NOT NULL DEFAULT 'DNI',
    "documentNumber" TEXT,
    "taxCondition" "TaxCondition" NOT NULL DEFAULT 'CONSUMIDOR_FINAL',
    "email" TEXT,
    "phone" TEXT,
    "whatsapp" TEXT,
    "address" TEXT,
    "city" TEXT,
    "province" TEXT,
    "postalCode" TEXT,
    "creditLimit" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "paymentTermDays" INTEGER NOT NULL DEFAULT 0,
    "tags" TEXT[],
    "purchaseMonths" INTEGER[],
    "notes" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "clients_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "client_designs" (
    "id" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "vectorLogoUrl" TEXT,
    "embroideryFileUrl" TEXT,
    "stitchCount" INTEGER,
    "institutionalColors" TEXT[],
    "sizeCurve" JSONB,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "client_designs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "leads" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "company" TEXT,
    "email" TEXT,
    "phone" TEXT,
    "source" TEXT,
    "status" "LeadStatus" NOT NULL DEFAULT 'NUEVO',
    "estimatedValue" DECIMAL(14,2),
    "expectedClose" TIMESTAMP(3),
    "notes" TEXT,
    "clientId" TEXT,
    "ownerId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "leads_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "quotes" (
    "id" TEXT NOT NULL,
    "number" SERIAL NOT NULL,
    "status" "QuoteStatus" NOT NULL DEFAULT 'BORRADOR',
    "clientId" TEXT,
    "leadId" TEXT,
    "userId" TEXT NOT NULL,
    "validUntil" TIMESTAMP(3) NOT NULL,
    "subtotal" DECIMAL(14,2) NOT NULL,
    "taxTotal" DECIMAL(14,2) NOT NULL,
    "total" DECIMAL(14,2) NOT NULL,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "quotes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "quote_items" (
    "id" TEXT NOT NULL,
    "quoteId" TEXT NOT NULL,
    "productId" TEXT,
    "description" TEXT NOT NULL,
    "quantity" DECIMAL(12,4) NOT NULL,
    "unitPrice" DECIMAL(14,2) NOT NULL,
    "vatRate" DECIMAL(6,2) NOT NULL DEFAULT 21,
    "subtotal" DECIMAL(14,2) NOT NULL,

    CONSTRAINT "quote_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "suppliers" (
    "id" TEXT NOT NULL,
    "businessName" TEXT NOT NULL,
    "cuit" TEXT,
    "taxCondition" "TaxCondition" NOT NULL DEFAULT 'RESPONSABLE_INSCRIPTO',
    "email" TEXT,
    "phone" TEXT,
    "address" TEXT,
    "paymentTermDays" INTEGER NOT NULL DEFAULT 30,
    "notes" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "suppliers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "raw_materials" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" "RawMaterialType" NOT NULL,
    "uom" "UnitOfMeasure" NOT NULL,
    "composition" TEXT,
    "color" TEXT,
    "widthCm" DECIMAL(8,2),
    "metersPerKg" DECIMAL(10,4),
    "currentCost" DECIMAL(14,4) NOT NULL,
    "stockQty" DECIMAL(14,4) NOT NULL DEFAULT 0,
    "minStock" DECIMAL(14,4) NOT NULL DEFAULT 0,
    "supplierId" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "raw_materials_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "raw_material_price_history" (
    "id" TEXT NOT NULL,
    "rawMaterialId" TEXT NOT NULL,
    "previousCost" DECIMAL(14,4) NOT NULL,
    "newCost" DECIMAL(14,4) NOT NULL,
    "source" TEXT NOT NULL DEFAULT 'MANUAL',
    "purchaseId" TEXT,
    "userId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "raw_material_price_history_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "purchases" (
    "id" TEXT NOT NULL,
    "supplierId" TEXT NOT NULL,
    "invoiceType" "InvoiceType",
    "invoiceNumber" TEXT,
    "remitNumber" TEXT,
    "status" "PurchaseStatus" NOT NULL DEFAULT 'BORRADOR',
    "date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "subtotal" DECIMAL(14,2) NOT NULL,
    "taxTotal" DECIMAL(14,2) NOT NULL,
    "total" DECIMAL(14,2) NOT NULL,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "purchases_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "purchase_items" (
    "id" TEXT NOT NULL,
    "purchaseId" TEXT NOT NULL,
    "rawMaterialId" TEXT NOT NULL,
    "quantity" DECIMAL(14,4) NOT NULL,
    "uom" "UnitOfMeasure" NOT NULL,
    "unitCost" DECIMAL(14,4) NOT NULL,
    "vatRate" DECIMAL(6,2) NOT NULL DEFAULT 21,
    "subtotal" DECIMAL(14,2) NOT NULL,

    CONSTRAINT "purchase_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "products" (
    "id" TEXT NOT NULL,
    "sku" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "category" "ProductCategory" NOT NULL,
    "description" TEXT,
    "pricingMode" "PricingMode" NOT NULL DEFAULT 'MARKUP',
    "pricingPct" DECIMAL(6,2) NOT NULL DEFAULT 100,
    "overheadPct" DECIMAL(6,2) NOT NULL DEFAULT 0,
    "vatRate" DECIMAL(6,2) NOT NULL DEFAULT 21,
    "listPrice" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "currentCost" DECIMAL(14,4) NOT NULL DEFAULT 0,
    "costUpdatedAt" TIMESTAMP(3),
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "products_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "product_variants" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "sku" TEXT NOT NULL,
    "size" TEXT NOT NULL,
    "color" TEXT,
    "barcode" TEXT,
    "stockQty" DECIMAL(12,4) NOT NULL DEFAULT 0,
    "priceAdjustmentPct" DECIMAL(6,2) NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "product_variants_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "product_bom" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "rawMaterialId" TEXT NOT NULL,
    "quantity" DECIMAL(12,4) NOT NULL,
    "wastePct" DECIMAL(6,2) NOT NULL DEFAULT 0,
    "notes" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "product_bom_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "service_costs" (
    "id" TEXT NOT NULL,
    "type" "ServiceType" NOT NULL,
    "name" TEXT NOT NULL,
    "workshopId" TEXT,
    "unitCost" DECIMAL(14,4) NOT NULL,
    "unitLabel" TEXT NOT NULL DEFAULT 'prenda',
    "validFrom" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "service_costs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "product_service_costs" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "serviceCostId" TEXT NOT NULL,
    "quantity" DECIMAL(12,4) NOT NULL DEFAULT 1,
    "notes" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "product_service_costs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "product_cost_snapshots" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "reason" "CostSnapshotReason" NOT NULL,
    "materialsCost" DECIMAL(14,4) NOT NULL,
    "servicesCost" DECIMAL(14,4) NOT NULL,
    "overheadCost" DECIMAL(14,4) NOT NULL,
    "totalCost" DECIMAL(14,4) NOT NULL,
    "suggestedPrice" DECIMAL(14,2) NOT NULL,
    "breakdown" JSONB NOT NULL,
    "userId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "product_cost_snapshots_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "workshops" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "types" "WorkshopType"[],
    "isInternal" BOOLEAN NOT NULL DEFAULT false,
    "cuit" TEXT,
    "contact" TEXT,
    "phone" TEXT,
    "address" TEXT,
    "notes" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "workshops_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "production_orders" (
    "id" TEXT NOT NULL,
    "number" SERIAL NOT NULL,
    "productId" TEXT NOT NULL,
    "clientId" TEXT,
    "clientDesignId" TEXT,
    "saleId" TEXT,
    "status" "ProductionOrderStatus" NOT NULL DEFAULT 'BORRADOR',
    "currentStage" "ProductionStage" NOT NULL DEFAULT 'CORTE_INTERNO',
    "quantityPlanned" INTEGER NOT NULL,
    "quantityFinished" INTEGER NOT NULL DEFAULT 0,
    "estimatedUnitCost" DECIMAL(14,4) NOT NULL,
    "actualCost" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "dueDate" TIMESTAMP(3),
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "production_orders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "production_order_items" (
    "id" TEXT NOT NULL,
    "productionOrderId" TEXT NOT NULL,
    "variantId" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "quantityFinished" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "production_order_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "production_stage_logs" (
    "id" TEXT NOT NULL,
    "productionOrderId" TEXT NOT NULL,
    "fromStage" "ProductionStage",
    "toStage" "ProductionStage" NOT NULL,
    "workshopId" TEXT,
    "quantityIn" INTEGER NOT NULL,
    "quantityOut" INTEGER NOT NULL,
    "wasteQty" INTEGER NOT NULL DEFAULT 0,
    "userId" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "production_stage_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "workshop_remits" (
    "id" TEXT NOT NULL,
    "number" SERIAL NOT NULL,
    "type" "WorkshopRemitType" NOT NULL,
    "workshopId" TEXT NOT NULL,
    "productionOrderId" TEXT NOT NULL,
    "stage" "ProductionStage" NOT NULL,
    "date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "pieces" INTEGER NOT NULL,
    "wasteQty" INTEGER NOT NULL DEFAULT 0,
    "laborUnitCost" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "laborTotal" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "workshop_remits_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sales" (
    "id" TEXT NOT NULL,
    "number" SERIAL NOT NULL,
    "channel" "SaleChannel" NOT NULL DEFAULT 'MOSTRADOR',
    "status" "SaleStatus" NOT NULL DEFAULT 'PENDIENTE',
    "clientId" TEXT,
    "userId" TEXT NOT NULL,
    "cashSessionId" TEXT,
    "invoiceType" "InvoiceType" NOT NULL DEFAULT 'TICKET_INTERNO',
    "pointOfSale" INTEGER,
    "invoiceNumber" INTEGER,
    "cae" TEXT,
    "caeDueDate" TIMESTAMP(3),
    "subtotal" DECIMAL(14,2) NOT NULL,
    "discountTotal" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "discountReason" TEXT,
    "taxTotal" DECIMAL(14,2) NOT NULL,
    "total" DECIMAL(14,2) NOT NULL,
    "deliveryMethod" "DeliveryMethod" NOT NULL DEFAULT 'RETIRO_SUCURSAL',
    "shippingAddress" TEXT,
    "shippingCost" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "sales_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sale_items" (
    "id" TEXT NOT NULL,
    "saleId" TEXT NOT NULL,
    "productId" TEXT,
    "variantId" TEXT,
    "description" TEXT NOT NULL,
    "quantity" DECIMAL(12,4) NOT NULL,
    "unitPrice" DECIMAL(14,2) NOT NULL,
    "discountPct" DECIMAL(6,2) NOT NULL DEFAULT 0,
    "discountReason" TEXT,
    "vatRate" DECIMAL(6,2) NOT NULL DEFAULT 21,
    "subtotal" DECIMAL(14,2) NOT NULL,
    "unitCost" DECIMAL(14,4) NOT NULL DEFAULT 0,

    CONSTRAINT "sale_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cash_registers" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "kind" "CashRegisterKind" NOT NULL,
    "requiresSession" BOOLEAN NOT NULL DEFAULT true,
    "bankName" TEXT,
    "cbu" TEXT,
    "alias" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "cash_registers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cash_register_sessions" (
    "id" TEXT NOT NULL,
    "cashRegisterId" TEXT NOT NULL,
    "status" "CashSessionStatus" NOT NULL DEFAULT 'ABIERTA',
    "openedById" TEXT NOT NULL,
    "openedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "openingAmount" DECIMAL(14,2) NOT NULL,
    "closedById" TEXT,
    "closedAt" TIMESTAMP(3),
    "expectedAmount" DECIMAL(14,2),
    "declaredAmount" DECIMAL(14,2),
    "difference" DECIMAL(14,2),
    "notes" TEXT,

    CONSTRAINT "cash_register_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cash_movements" (
    "id" TEXT NOT NULL,
    "cashRegisterId" TEXT NOT NULL,
    "sessionId" TEXT,
    "type" "CashMovementType" NOT NULL,
    "method" "PaymentMethod" NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "concept" TEXT NOT NULL,
    "saleId" TEXT,
    "transferGroupId" TEXT,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "cash_movements_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payments" (
    "id" TEXT NOT NULL,
    "method" "PaymentMethod" NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "reference" TEXT,
    "receiptUrl" TEXT,
    "cardBrand" TEXT,
    "installments" INTEGER,
    "surchargePct" DECIMAL(6,2) NOT NULL DEFAULT 0,
    "saleId" TEXT,
    "accountReceivableId" TEXT,
    "accountPayableId" TEXT,
    "cashRegisterId" TEXT,
    "cashMovementId" TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "payments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "accounts_receivable" (
    "id" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "saleId" TEXT,
    "description" TEXT NOT NULL,
    "issueDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "dueDate" TIMESTAMP(3) NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "balance" DECIMAL(14,2) NOT NULL,
    "status" "AccountStatus" NOT NULL DEFAULT 'PENDIENTE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "accounts_receivable_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "accounts_payable" (
    "id" TEXT NOT NULL,
    "supplierId" TEXT,
    "workshopId" TEXT,
    "purchaseId" TEXT,
    "workshopRemitId" TEXT,
    "description" TEXT NOT NULL,
    "issueDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "dueDate" TIMESTAMP(3) NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "balance" DECIMAL(14,2) NOT NULL,
    "status" "AccountStatus" NOT NULL DEFAULT 'PENDIENTE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "accounts_payable_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "roles_name_key" ON "roles"("name");

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE INDEX "audit_logs_entity_entityId_idx" ON "audit_logs"("entity", "entityId");

-- CreateIndex
CREATE INDEX "audit_logs_createdAt_idx" ON "audit_logs"("createdAt");

-- CreateIndex
CREATE INDEX "clients_type_idx" ON "clients"("type");

-- CreateIndex
CREATE INDEX "clients_businessName_idx" ON "clients"("businessName");

-- CreateIndex
CREATE UNIQUE INDEX "clients_documentType_documentNumber_key" ON "clients"("documentType", "documentNumber");

-- CreateIndex
CREATE INDEX "client_designs_clientId_idx" ON "client_designs"("clientId");

-- CreateIndex
CREATE INDEX "leads_status_idx" ON "leads"("status");

-- CreateIndex
CREATE UNIQUE INDEX "quotes_number_key" ON "quotes"("number");

-- CreateIndex
CREATE UNIQUE INDEX "suppliers_cuit_key" ON "suppliers"("cuit");

-- CreateIndex
CREATE UNIQUE INDEX "raw_materials_code_key" ON "raw_materials"("code");

-- CreateIndex
CREATE INDEX "raw_materials_type_idx" ON "raw_materials"("type");

-- CreateIndex
CREATE INDEX "raw_material_price_history_rawMaterialId_createdAt_idx" ON "raw_material_price_history"("rawMaterialId", "createdAt");

-- CreateIndex
CREATE INDEX "purchases_supplierId_date_idx" ON "purchases"("supplierId", "date");

-- CreateIndex
CREATE UNIQUE INDEX "products_sku_key" ON "products"("sku");

-- CreateIndex
CREATE INDEX "products_category_idx" ON "products"("category");

-- CreateIndex
CREATE UNIQUE INDEX "product_variants_sku_key" ON "product_variants"("sku");

-- CreateIndex
CREATE UNIQUE INDEX "product_variants_barcode_key" ON "product_variants"("barcode");

-- CreateIndex
CREATE UNIQUE INDEX "product_variants_productId_size_color_key" ON "product_variants"("productId", "size", "color");

-- CreateIndex
CREATE UNIQUE INDEX "product_bom_productId_rawMaterialId_key" ON "product_bom"("productId", "rawMaterialId");

-- CreateIndex
CREATE INDEX "service_costs_type_active_idx" ON "service_costs"("type", "active");

-- CreateIndex
CREATE UNIQUE INDEX "product_service_costs_productId_serviceCostId_key" ON "product_service_costs"("productId", "serviceCostId");

-- CreateIndex
CREATE INDEX "product_cost_snapshots_productId_createdAt_idx" ON "product_cost_snapshots"("productId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "workshops_cuit_key" ON "workshops"("cuit");

-- CreateIndex
CREATE UNIQUE INDEX "production_orders_number_key" ON "production_orders"("number");

-- CreateIndex
CREATE INDEX "production_orders_status_currentStage_idx" ON "production_orders"("status", "currentStage");

-- CreateIndex
CREATE UNIQUE INDEX "production_order_items_productionOrderId_variantId_key" ON "production_order_items"("productionOrderId", "variantId");

-- CreateIndex
CREATE INDEX "production_stage_logs_productionOrderId_createdAt_idx" ON "production_stage_logs"("productionOrderId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "workshop_remits_number_key" ON "workshop_remits"("number");

-- CreateIndex
CREATE INDEX "workshop_remits_workshopId_date_idx" ON "workshop_remits"("workshopId", "date");

-- CreateIndex
CREATE UNIQUE INDEX "sales_number_key" ON "sales"("number");

-- CreateIndex
CREATE INDEX "sales_createdAt_idx" ON "sales"("createdAt");

-- CreateIndex
CREATE INDEX "sales_clientId_idx" ON "sales"("clientId");

-- CreateIndex
CREATE UNIQUE INDEX "sales_invoiceType_pointOfSale_invoiceNumber_key" ON "sales"("invoiceType", "pointOfSale", "invoiceNumber");

-- CreateIndex
CREATE INDEX "sale_items_productId_idx" ON "sale_items"("productId");

-- CreateIndex
CREATE UNIQUE INDEX "cash_registers_name_key" ON "cash_registers"("name");

-- CreateIndex
CREATE INDEX "cash_register_sessions_cashRegisterId_status_idx" ON "cash_register_sessions"("cashRegisterId", "status");

-- CreateIndex
CREATE INDEX "cash_movements_cashRegisterId_createdAt_idx" ON "cash_movements"("cashRegisterId", "createdAt");

-- CreateIndex
CREATE INDEX "cash_movements_sessionId_idx" ON "cash_movements"("sessionId");

-- CreateIndex
CREATE UNIQUE INDEX "payments_cashMovementId_key" ON "payments"("cashMovementId");

-- CreateIndex
CREATE INDEX "payments_saleId_idx" ON "payments"("saleId");

-- CreateIndex
CREATE INDEX "payments_createdAt_method_idx" ON "payments"("createdAt", "method");

-- CreateIndex
CREATE INDEX "accounts_receivable_clientId_status_dueDate_idx" ON "accounts_receivable"("clientId", "status", "dueDate");

-- CreateIndex
CREATE INDEX "accounts_payable_supplierId_status_dueDate_idx" ON "accounts_payable"("supplierId", "status", "dueDate");

-- CreateIndex
CREATE INDEX "accounts_payable_workshopId_status_dueDate_idx" ON "accounts_payable"("workshopId", "status", "dueDate");

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "roles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "client_designs" ADD CONSTRAINT "client_designs_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "clients"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "leads" ADD CONSTRAINT "leads_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "clients"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "leads" ADD CONSTRAINT "leads_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quotes" ADD CONSTRAINT "quotes_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "clients"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quotes" ADD CONSTRAINT "quotes_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "leads"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quotes" ADD CONSTRAINT "quotes_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quote_items" ADD CONSTRAINT "quote_items_quoteId_fkey" FOREIGN KEY ("quoteId") REFERENCES "quotes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quote_items" ADD CONSTRAINT "quote_items_productId_fkey" FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "raw_materials" ADD CONSTRAINT "raw_materials_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "suppliers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "raw_material_price_history" ADD CONSTRAINT "raw_material_price_history_rawMaterialId_fkey" FOREIGN KEY ("rawMaterialId") REFERENCES "raw_materials"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "raw_material_price_history" ADD CONSTRAINT "raw_material_price_history_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchases" ADD CONSTRAINT "purchases_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "suppliers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_items" ADD CONSTRAINT "purchase_items_purchaseId_fkey" FOREIGN KEY ("purchaseId") REFERENCES "purchases"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_items" ADD CONSTRAINT "purchase_items_rawMaterialId_fkey" FOREIGN KEY ("rawMaterialId") REFERENCES "raw_materials"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_variants" ADD CONSTRAINT "product_variants_productId_fkey" FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_bom" ADD CONSTRAINT "product_bom_productId_fkey" FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_bom" ADD CONSTRAINT "product_bom_rawMaterialId_fkey" FOREIGN KEY ("rawMaterialId") REFERENCES "raw_materials"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "service_costs" ADD CONSTRAINT "service_costs_workshopId_fkey" FOREIGN KEY ("workshopId") REFERENCES "workshops"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_service_costs" ADD CONSTRAINT "product_service_costs_productId_fkey" FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_service_costs" ADD CONSTRAINT "product_service_costs_serviceCostId_fkey" FOREIGN KEY ("serviceCostId") REFERENCES "service_costs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_cost_snapshots" ADD CONSTRAINT "product_cost_snapshots_productId_fkey" FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_cost_snapshots" ADD CONSTRAINT "product_cost_snapshots_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "production_orders" ADD CONSTRAINT "production_orders_productId_fkey" FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "production_orders" ADD CONSTRAINT "production_orders_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "clients"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "production_orders" ADD CONSTRAINT "production_orders_clientDesignId_fkey" FOREIGN KEY ("clientDesignId") REFERENCES "client_designs"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "production_orders" ADD CONSTRAINT "production_orders_saleId_fkey" FOREIGN KEY ("saleId") REFERENCES "sales"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "production_order_items" ADD CONSTRAINT "production_order_items_productionOrderId_fkey" FOREIGN KEY ("productionOrderId") REFERENCES "production_orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "production_order_items" ADD CONSTRAINT "production_order_items_variantId_fkey" FOREIGN KEY ("variantId") REFERENCES "product_variants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "production_stage_logs" ADD CONSTRAINT "production_stage_logs_productionOrderId_fkey" FOREIGN KEY ("productionOrderId") REFERENCES "production_orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "production_stage_logs" ADD CONSTRAINT "production_stage_logs_workshopId_fkey" FOREIGN KEY ("workshopId") REFERENCES "workshops"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "production_stage_logs" ADD CONSTRAINT "production_stage_logs_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "workshop_remits" ADD CONSTRAINT "workshop_remits_workshopId_fkey" FOREIGN KEY ("workshopId") REFERENCES "workshops"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "workshop_remits" ADD CONSTRAINT "workshop_remits_productionOrderId_fkey" FOREIGN KEY ("productionOrderId") REFERENCES "production_orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales" ADD CONSTRAINT "sales_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "clients"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales" ADD CONSTRAINT "sales_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales" ADD CONSTRAINT "sales_cashSessionId_fkey" FOREIGN KEY ("cashSessionId") REFERENCES "cash_register_sessions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sale_items" ADD CONSTRAINT "sale_items_saleId_fkey" FOREIGN KEY ("saleId") REFERENCES "sales"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sale_items" ADD CONSTRAINT "sale_items_productId_fkey" FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sale_items" ADD CONSTRAINT "sale_items_variantId_fkey" FOREIGN KEY ("variantId") REFERENCES "product_variants"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cash_register_sessions" ADD CONSTRAINT "cash_register_sessions_cashRegisterId_fkey" FOREIGN KEY ("cashRegisterId") REFERENCES "cash_registers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cash_register_sessions" ADD CONSTRAINT "cash_register_sessions_openedById_fkey" FOREIGN KEY ("openedById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cash_register_sessions" ADD CONSTRAINT "cash_register_sessions_closedById_fkey" FOREIGN KEY ("closedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cash_movements" ADD CONSTRAINT "cash_movements_cashRegisterId_fkey" FOREIGN KEY ("cashRegisterId") REFERENCES "cash_registers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cash_movements" ADD CONSTRAINT "cash_movements_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "cash_register_sessions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cash_movements" ADD CONSTRAINT "cash_movements_saleId_fkey" FOREIGN KEY ("saleId") REFERENCES "sales"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cash_movements" ADD CONSTRAINT "cash_movements_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_saleId_fkey" FOREIGN KEY ("saleId") REFERENCES "sales"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_accountReceivableId_fkey" FOREIGN KEY ("accountReceivableId") REFERENCES "accounts_receivable"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_accountPayableId_fkey" FOREIGN KEY ("accountPayableId") REFERENCES "accounts_payable"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_cashRegisterId_fkey" FOREIGN KEY ("cashRegisterId") REFERENCES "cash_registers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_cashMovementId_fkey" FOREIGN KEY ("cashMovementId") REFERENCES "cash_movements"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "accounts_receivable" ADD CONSTRAINT "accounts_receivable_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "clients"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "accounts_receivable" ADD CONSTRAINT "accounts_receivable_saleId_fkey" FOREIGN KEY ("saleId") REFERENCES "sales"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "accounts_payable" ADD CONSTRAINT "accounts_payable_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "suppliers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "accounts_payable" ADD CONSTRAINT "accounts_payable_workshopId_fkey" FOREIGN KEY ("workshopId") REFERENCES "workshops"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "accounts_payable" ADD CONSTRAINT "accounts_payable_purchaseId_fkey" FOREIGN KEY ("purchaseId") REFERENCES "purchases"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "accounts_payable" ADD CONSTRAINT "accounts_payable_workshopRemitId_fkey" FOREIGN KEY ("workshopRemitId") REFERENCES "workshop_remits"("id") ON DELETE SET NULL ON UPDATE CASCADE;
