-- Painel Kanban operacional. Independente de Trip/Truck — apenas
-- referencia truck_id e snapshot de user.

-- CreateEnum
CREATE TYPE "TruckOperationalStatus" AS ENUM (
  'VAZIO_AGUARDANDO_CARGA',
  'INDO_CARREGAR',
  'NA_FABRICA',
  'CARREGADO_EM_VIAGEM',
  'EM_DESCARGA_NO_CLIENTE',
  'EM_MANUTENCAO'
);

-- CreateTable
CREATE TABLE "truck_operational_states" (
  "id"                          TEXT NOT NULL,
  "truck_id"                    TEXT NOT NULL,
  "status"                      "TruckOperationalStatus" NOT NULL DEFAULT 'VAZIO_AGUARDANDO_CARGA',
  "contexto_atual"              TEXT,
  "data_coleta"                 DATE,
  "data_agendamento_entrega"    DATE,
  "carga_descricao"             TEXT,
  "descricao"                   TEXT,
  "updated_at"                  TIMESTAMP(3) NOT NULL,
  "updated_by_id"               TEXT,

  CONSTRAINT "truck_operational_states_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "truck_operational_comments" (
  "id"             TEXT NOT NULL,
  "truck_id"       TEXT NOT NULL,
  "author_id"      TEXT,
  "author_email"   TEXT NOT NULL,
  "author_nome"    TEXT NOT NULL,
  "texto"          TEXT NOT NULL,
  "created_at"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "deleted_at"     TIMESTAMP(3),
  "deleted_by_id"  TEXT,

  CONSTRAINT "truck_operational_comments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "truck_operational_states_truck_id_key" ON "truck_operational_states"("truck_id");
CREATE INDEX "truck_operational_states_status_idx" ON "truck_operational_states"("status");
CREATE INDEX "truck_operational_comments_truck_id_created_at_idx"
  ON "truck_operational_comments"("truck_id", "created_at" DESC);

-- AddForeignKey
ALTER TABLE "truck_operational_states" ADD CONSTRAINT "truck_operational_states_truck_id_fkey"
  FOREIGN KEY ("truck_id") REFERENCES "trucks"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "truck_operational_states" ADD CONSTRAINT "truck_operational_states_updated_by_id_fkey"
  FOREIGN KEY ("updated_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "truck_operational_comments" ADD CONSTRAINT "truck_operational_comments_truck_id_fkey"
  FOREIGN KEY ("truck_id") REFERENCES "trucks"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "truck_operational_comments" ADD CONSTRAINT "truck_operational_comments_author_id_fkey"
  FOREIGN KEY ("author_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Adiciona 'controle-viagens' ao default das permissoes e a todos os usuarios atuais.
ALTER TABLE "users"
  ALTER COLUMN "permissoes" SET DEFAULT
  ARRAY['frota','frete-terceiro','veiculos','rentabilidade','controle-viagens']::TEXT[];

UPDATE "users"
SET "permissoes" = array_append("permissoes", 'controle-viagens')
WHERE NOT ('controle-viagens' = ANY("permissoes"));
