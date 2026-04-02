-- CreateEnum
CREATE TYPE "Role" AS ENUM ('ADMIN', 'GESTOR');
CREATE TYPE "TripStatus" AS ENUM ('OK', 'PENDENTE', 'CANCELADA');
CREATE TYPE "ExpenseCategory" AS ENUM ('DESC_CTE_1', 'DESC_CTE_2', 'DESC_CTE_3', 'DESC_CTE_4', 'DESC_CTE_5', 'DESC_CTE_6', 'ABASTECIMENTO', 'COMISSAO_MOTORISTA', 'BORRACHARIA', 'LIMPEZA', 'ESTACIONAMENTO', 'CARREGAMENTO', 'AGENCIAMENTO', 'EXTRAS', 'PEDAGIO', 'ARLA', 'AVARIA');
CREATE TYPE "AttachmentType" AS ENUM ('DOC_CAMINHAO', 'DOC_MOTORISTA', 'NOTA_ABASTECIMENTO', 'CTE_ARQUIVO', 'RECIBO', 'COMPROVANTE', 'OUTRO');

-- CreateTable
CREATE TABLE "empresas" (
    "id" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "cnpj" TEXT,
    "logo_url" TEXT,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "empresas_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "empresa_id" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "senha_hash" TEXT NOT NULL,
    "role" "Role" NOT NULL DEFAULT 'GESTOR',
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "refresh_tokens" (
    "id" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "refresh_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "trucks" (
    "id" TEXT NOT NULL,
    "empresa_id" TEXT NOT NULL,
    "placa" TEXT NOT NULL,
    "modelo" TEXT,
    "motorista" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),
    CONSTRAINT "trucks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "trips" (
    "id" TEXT NOT NULL,
    "truck_id" TEXT NOT NULL,
    "data_inicio" TIMESTAMP(3) NOT NULL,
    "data_fim" TIMESTAMP(3),
    "origem" TEXT,
    "destino" TEXT,
    "carga" TEXT,
    "km_total" INTEGER NOT NULL DEFAULT 0,
    "status" "TripStatus" NOT NULL DEFAULT 'PENDENTE',
    "adiantamento" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "observacoes" TEXT,
    "km_inicial" DECIMAL(12,2),
    "km_final" DECIMAL(12,2),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),
    CONSTRAINT "trips_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ctes" (
    "id" TEXT NOT NULL,
    "trip_id" TEXT NOT NULL,
    "data" TIMESTAMP(3),
    "numero" TEXT,
    "origem" TEXT,
    "destino" TEXT,
    "valor" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ctes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "fuels" (
    "id" TEXT NOT NULL,
    "trip_id" TEXT NOT NULL,
    "data" TIMESTAMP(3),
    "litros" DECIMAL(10,3) NOT NULL DEFAULT 0,
    "preco_litro" DECIMAL(8,4) NOT NULL DEFAULT 0,
    "posto_cnpj" TEXT,
    "nota_fiscal" TEXT,
    "km" INTEGER,
    "valor_total" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "fuels_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "expenses" (
    "id" TEXT NOT NULL,
    "trip_id" TEXT NOT NULL,
    "categoria" "ExpenseCategory" NOT NULL,
    "valor" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "expenses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "attachments" (
    "id" TEXT NOT NULL,
    "empresa_id" TEXT NOT NULL,
    "tipo" "AttachmentType" NOT NULL,
    "nome_arquivo" TEXT NOT NULL,
    "storage_key" TEXT NOT NULL,
    "mime_type" TEXT NOT NULL,
    "tamanho" INTEGER NOT NULL,
    "truck_id" TEXT,
    "trip_id" TEXT,
    "cte_id" TEXT,
    "fuel_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "attachments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "empresas_cnpj_key" ON "empresas"("cnpj");
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");
CREATE INDEX "users_empresa_id_idx" ON "users"("empresa_id");
CREATE UNIQUE INDEX "refresh_tokens_token_key" ON "refresh_tokens"("token");
CREATE INDEX "refresh_tokens_user_id_idx" ON "refresh_tokens"("user_id");
CREATE UNIQUE INDEX "trucks_placa_key" ON "trucks"("placa");
CREATE INDEX "trucks_empresa_id_idx" ON "trucks"("empresa_id");
CREATE INDEX "trips_truck_id_idx" ON "trips"("truck_id");
CREATE INDEX "trips_data_inicio_idx" ON "trips"("data_inicio");
CREATE INDEX "ctes_trip_id_idx" ON "ctes"("trip_id");
CREATE INDEX "fuels_trip_id_idx" ON "fuels"("trip_id");
CREATE UNIQUE INDEX "expenses_trip_id_categoria_key" ON "expenses"("trip_id", "categoria");
CREATE INDEX "expenses_trip_id_idx" ON "expenses"("trip_id");
CREATE INDEX "attachments_empresa_id_idx" ON "attachments"("empresa_id");
CREATE INDEX "attachments_truck_id_idx" ON "attachments"("truck_id");
CREATE INDEX "attachments_trip_id_idx" ON "attachments"("trip_id");

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_empresa_id_fkey" FOREIGN KEY ("empresa_id") REFERENCES "empresas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "refresh_tokens" ADD CONSTRAINT "refresh_tokens_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "trucks" ADD CONSTRAINT "trucks_empresa_id_fkey" FOREIGN KEY ("empresa_id") REFERENCES "empresas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "trips" ADD CONSTRAINT "trips_truck_id_fkey" FOREIGN KEY ("truck_id") REFERENCES "trucks"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ctes" ADD CONSTRAINT "ctes_trip_id_fkey" FOREIGN KEY ("trip_id") REFERENCES "trips"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "fuels" ADD CONSTRAINT "fuels_trip_id_fkey" FOREIGN KEY ("trip_id") REFERENCES "trips"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_trip_id_fkey" FOREIGN KEY ("trip_id") REFERENCES "trips"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "attachments" ADD CONSTRAINT "attachments_empresa_id_fkey" FOREIGN KEY ("empresa_id") REFERENCES "empresas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "attachments" ADD CONSTRAINT "attachments_truck_id_fkey" FOREIGN KEY ("truck_id") REFERENCES "trucks"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "attachments" ADD CONSTRAINT "attachments_trip_id_fkey" FOREIGN KEY ("trip_id") REFERENCES "trips"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "attachments" ADD CONSTRAINT "attachments_cte_id_fkey" FOREIGN KEY ("cte_id") REFERENCES "ctes"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "attachments" ADD CONSTRAINT "attachments_fuel_id_fkey" FOREIGN KEY ("fuel_id") REFERENCES "fuels"("id") ON DELETE SET NULL ON UPDATE CASCADE;
