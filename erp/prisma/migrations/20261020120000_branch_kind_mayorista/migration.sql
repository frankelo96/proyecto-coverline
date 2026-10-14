-- CreateEnum
CREATE TYPE "BranchKind" AS ENUM ('LOCAL', 'MAYORISTA');

-- AlterTable
ALTER TABLE "branches" ADD COLUMN     "kind" "BranchKind" NOT NULL DEFAULT 'LOCAL';


-- Depósito mayorista: pedidos personalizados que se producen directo (no se publica en la web).
INSERT INTO "branches" ("id", "name", "kind", "active", "createdAt", "updatedAt")
VALUES ('branch_mayorista', 'Mayorista', 'MAYORISTA', true, NOW(), NOW())
ON CONFLICT ("name") DO UPDATE SET "kind" = 'MAYORISTA';
