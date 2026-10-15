
-- AlterTable
ALTER TABLE "cash_movements" ADD COLUMN     "expenseCategoryId" TEXT;

-- CreateTable
CREATE TABLE "expense_categories" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "fixed" BOOLEAN NOT NULL DEFAULT false,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "expense_categories_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "expense_categories_name_key" ON "expense_categories"("name");

-- CreateIndex
CREATE INDEX "cash_movements_expenseCategoryId_createdAt_idx" ON "cash_movements"("expenseCategoryId", "createdAt");

-- AddForeignKey
ALTER TABLE "cash_movements" ADD CONSTRAINT "cash_movements_expenseCategoryId_fkey" FOREIGN KEY ("expenseCategoryId") REFERENCES "expense_categories"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- Categorías iniciales (el seed también las crea si faltan).
INSERT INTO "expense_categories" ("id", "name", "fixed", "sortOrder") VALUES
  ('expcat_alquiler', 'Alquiler', true, 1),
  ('expcat_servicios', 'Servicios (luz, gas, agua, internet, teléfono)', true, 2),
  ('expcat_impuestos', 'Impuestos y tasas', true, 3),
  ('expcat_honorarios', 'Honorarios (contador, abogado)', true, 4),
  ('expcat_cargas', 'Cargas sociales y sindicato', true, 5),
  ('expcat_fletes', 'Fletes y envíos', false, 6),
  ('expcat_publicidad', 'Publicidad y marketing', false, 7),
  ('expcat_mantenimiento', 'Mantenimiento y reparaciones', false, 8),
  ('expcat_libreria', 'Librería, limpieza y oficina', false, 9),
  ('expcat_bancarios', 'Gastos bancarios y comisiones', false, 10),
  ('expcat_movilidad', 'Combustible y movilidad', false, 11),
  ('expcat_sistemas', 'Sistemas y suscripciones', true, 12),
  ('expcat_otros', 'Otros gastos', false, 99)
ON CONFLICT ("name") DO NOTHING;
