-- Controle de Viagens v2: viagens como entidade + activity log unificado.
-- Substitui o schema da v1. A v1 foi mergeada em main (commit 81a9bdb) e
-- pode ter sido aplicada parcialmente no Railway. Esse migration limpa
-- qualquer resíduo da v1 antes de criar a v2. Idempotente: usa IF EXISTS.

-- DropV1 (defensivo — se v1 nunca foi aplicada, no-op)
DROP TABLE IF EXISTS "truck_operational_comments" CASCADE;
DROP TABLE IF EXISTS "truck_operational_states" CASCADE;
DROP TYPE  IF EXISTS "TruckOperationalStatus";

-- Restaura o default das permissões caso a v1 tenha mudado (v1 incluía 'controle-viagens')
-- Mantém a permissão pra usuários — só não força o default a ter ela mais (v2 também usa).
-- (sem alteração — o default já contém controle-viagens, e UPDATE da v1 ainda valeu pros existentes)

-- CreateEnum
CREATE TYPE "TruckKanbanColumn" AS ENUM (
  'VAZIO_AGUARDANDO_CARGA',
  'INDO_CARREGAR',
  'NA_FABRICA',
  'CARREGADO_EM_VIAGEM',
  'EM_DESCARGA_NO_CLIENTE',
  'EM_MANUTENCAO'
);

CREATE TYPE "TruckViagemStatus" AS ENUM (
  'PLANEJADA',
  'EM_CURSO',
  'FINALIZADA',
  'CANCELADA'
);

CREATE TYPE "TruckActivityType" AS ENUM (
  'COLUMN_MOVED',
  'VIAGEM_CREATED',
  'VIAGEM_FIELD_EDITED',
  'VIAGEM_STARTED',
  'VIAGEM_FINALIZED',
  'VIAGEM_CANCELLED',
  'VIAGEM_DELETED',
  'COMMENT',
  'COLUMN_FIELD_EDITED'
);

-- CreateTable
CREATE TABLE "truck_columns" (
  "id"                       TEXT NOT NULL,
  "truck_id"                 TEXT NOT NULL,
  "coluna"                   "TruckKanbanColumn" NOT NULL DEFAULT 'VAZIO_AGUARDANDO_CARGA',
  "manutencao_descricao"     TEXT,
  "descricao_geral"          TEXT,
  "updated_at"               TIMESTAMP(3) NOT NULL,
  "updated_by_id"            TEXT,

  CONSTRAINT "truck_columns_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "truck_viagens" (
  "id"                          TEXT NOT NULL,
  "truck_id"                    TEXT NOT NULL,
  "status_viagem"               "TruckViagemStatus" NOT NULL DEFAULT 'PLANEJADA',
  "origem"                      TEXT,
  "destino"                     TEXT,
  "carga_descricao"             TEXT,
  "fabrica"                     TEXT,
  "cliente_descarga"            TEXT,
  "valor_frete"                 DECIMAL(12,2),
  "data_coleta"                 DATE,
  "data_carregamento"           DATE,
  "data_agendamento_entrega"    DATE,
  "data_entrega_realizada"      DATE,
  "observacoes"                 TEXT,
  "finalized_at"                TIMESTAMP(3),
  "cancelled_at"                TIMESTAMP(3),
  "cancel_motivo"               TEXT,
  "created_at"                  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at"                  TIMESTAMP(3) NOT NULL,
  "deleted_at"                  TIMESTAMP(3),
  "created_by_id"               TEXT,

  CONSTRAINT "truck_viagens_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "truck_activity_events" (
  "id"             TEXT NOT NULL,
  "truck_id"       TEXT NOT NULL,
  "viagem_id"      TEXT,
  "tipo"           "TruckActivityType" NOT NULL,
  "payload"        JSONB NOT NULL,
  "author_id"      TEXT,
  "author_email"   TEXT NOT NULL,
  "author_nome"    TEXT NOT NULL,
  "created_at"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "deleted_at"     TIMESTAMP(3),
  "deleted_by_id"  TEXT,

  CONSTRAINT "truck_activity_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "truck_columns_truck_id_key" ON "truck_columns"("truck_id");
CREATE INDEX "truck_columns_coluna_idx" ON "truck_columns"("coluna");

CREATE INDEX "truck_viagens_truck_id_status_viagem_idx" ON "truck_viagens"("truck_id", "status_viagem");
CREATE INDEX "truck_viagens_truck_id_created_at_idx" ON "truck_viagens"("truck_id", "created_at" DESC);
CREATE INDEX "truck_viagens_data_coleta_idx" ON "truck_viagens"("data_coleta");
CREATE INDEX "truck_viagens_data_agendamento_entrega_idx" ON "truck_viagens"("data_agendamento_entrega");

CREATE INDEX "truck_activity_events_truck_id_created_at_idx" ON "truck_activity_events"("truck_id", "created_at" DESC);
CREATE INDEX "truck_activity_events_viagem_id_created_at_idx" ON "truck_activity_events"("viagem_id", "created_at" DESC);
CREATE INDEX "truck_activity_events_tipo_idx" ON "truck_activity_events"("tipo");

-- AddForeignKey
ALTER TABLE "truck_columns" ADD CONSTRAINT "truck_columns_truck_id_fkey"
  FOREIGN KEY ("truck_id") REFERENCES "trucks"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "truck_columns" ADD CONSTRAINT "truck_columns_updated_by_id_fkey"
  FOREIGN KEY ("updated_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "truck_viagens" ADD CONSTRAINT "truck_viagens_truck_id_fkey"
  FOREIGN KEY ("truck_id") REFERENCES "trucks"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "truck_viagens" ADD CONSTRAINT "truck_viagens_created_by_id_fkey"
  FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "truck_activity_events" ADD CONSTRAINT "truck_activity_events_truck_id_fkey"
  FOREIGN KEY ("truck_id") REFERENCES "trucks"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "truck_activity_events" ADD CONSTRAINT "truck_activity_events_viagem_id_fkey"
  FOREIGN KEY ("viagem_id") REFERENCES "truck_viagens"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "truck_activity_events" ADD CONSTRAINT "truck_activity_events_author_id_fkey"
  FOREIGN KEY ("author_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
