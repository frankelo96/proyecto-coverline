-- CreateEnum
CREATE TYPE "SalaryConcept" AS ENUM ('SUELDO', 'ADELANTO', 'AGUINALDO', 'VACACIONES', 'PREMIO', 'HORAS_EXTRA', 'OTRO');

-- AlterTable
ALTER TABLE "payment_orders" ADD COLUMN     "employeeId" TEXT,
ADD COLUMN     "salaryConcept" "SalaryConcept",
ADD COLUMN     "salaryPeriod" TEXT;

-- CreateTable
CREATE TABLE "employees" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "cuil" TEXT,
    "position" TEXT NOT NULL,
    "branchId" TEXT,
    "startDate" TIMESTAMP(3),
    "baseSalary" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "phone" TEXT,
    "email" TEXT,
    "bankAccount" TEXT,
    "notes" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "employees_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "employees_cuil_key" ON "employees"("cuil");

-- CreateIndex
CREATE INDEX "payment_orders_employeeId_salaryPeriod_idx" ON "payment_orders"("employeeId", "salaryPeriod");

-- AddForeignKey
ALTER TABLE "payment_orders" ADD CONSTRAINT "payment_orders_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "employees"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employees" ADD CONSTRAINT "employees_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "branches"("id") ON DELETE SET NULL ON UPDATE CASCADE;

