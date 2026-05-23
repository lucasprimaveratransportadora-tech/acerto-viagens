-- AlterEnum
ALTER TYPE "AuditEntity" ADD VALUE 'FRETE_TERCEIRO';

-- CreateEnum
CREATE TYPE "FreteTerceiroStatus" AS ENUM ('ABERTO', 'PAGO_PARCIAL', 'PAGO', 'CANCELADO');

-- CreateEnum
CREATE TYPE "FreteTerceiroPagamento" AS ENUM ('INTEGRAL', 'ADIANTAMENTO_SALDO');

-- CreateTable
CREATE TABLE "fretes_terceiros" (
    "id" TEXT NOT NULL,
    "empresa_id" TEXT NOT NULL,
    "empresa_pagadora" TEXT NOT NULL,
    "data" TIMESTAMP(3) NOT NULL,
    "motorista" TEXT NOT NULL,
    "veiculo" TEXT NOT NULL,
    "truck_id" TEXT,
    "valor_total" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "valor_adiantamento" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "valor_pago" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "forma_pagamento" "FreteTerceiroPagamento" NOT NULL DEFAULT 'INTEGRAL',
    "status" "FreteTerceiroStatus" NOT NULL DEFAULT 'ABERTO',
    "data_adiantamento" TIMESTAMP(3),
    "data_pagamento" TIMESTAMP(3),
    "trip_id" TEXT,
    "observacoes" TEXT,
    "created_by_id" TEXT,
    "paid_by_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "fretes_terceiros_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "fretes_terceiros_empresa_id_created_at_idx" ON "fretes_terceiros"("empresa_id", "created_at" DESC);
CREATE INDEX "fretes_terceiros_truck_id_idx" ON "fretes_terceiros"("truck_id");
CREATE INDEX "fretes_terceiros_trip_id_idx" ON "fretes_terceiros"("trip_id");
CREATE INDEX "fretes_terceiros_status_idx" ON "fretes_terceiros"("status");

-- AddForeignKey
ALTER TABLE "fretes_terceiros" ADD CONSTRAINT "fretes_terceiros_empresa_id_fkey"     FOREIGN KEY ("empresa_id")     REFERENCES "empresas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "fretes_terceiros" ADD CONSTRAINT "fretes_terceiros_truck_id_fkey"       FOREIGN KEY ("truck_id")       REFERENCES "trucks"("id")   ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "fretes_terceiros" ADD CONSTRAINT "fretes_terceiros_trip_id_fkey"        FOREIGN KEY ("trip_id")        REFERENCES "trips"("id")    ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "fretes_terceiros" ADD CONSTRAINT "fretes_terceiros_created_by_id_fkey"  FOREIGN KEY ("created_by_id")  REFERENCES "users"("id")    ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "fretes_terceiros" ADD CONSTRAINT "fretes_terceiros_paid_by_id_fkey"     FOREIGN KEY ("paid_by_id")     REFERENCES "users"("id")    ON DELETE SET NULL ON UPDATE CASCADE;
