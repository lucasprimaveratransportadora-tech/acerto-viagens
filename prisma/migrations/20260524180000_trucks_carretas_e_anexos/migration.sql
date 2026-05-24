-- Adiciona vínculo de carreta e fichário de anexos ao caminhão.

CREATE TYPE "TruckAnexoTipo" AS ENUM (
  'GR_APROVADO',
  'CRLV_VEICULO',
  'CRLV_CARRETA',
  'CNH_MOTORISTA',
  'CONTRATO',
  'ANTT',
  'OUTRO'
);

ALTER TABLE "trucks" ADD COLUMN IF NOT EXISTS "carreta_placa"  TEXT;
ALTER TABLE "trucks" ADD COLUMN IF NOT EXISTS "carreta_modelo" TEXT;
ALTER TABLE "trucks" ADD COLUMN IF NOT EXISTS "observacoes"    TEXT;

CREATE TABLE "truck_anexos" (
  "id"            TEXT NOT NULL,
  "truck_id"      TEXT NOT NULL,
  "tipo"          "TruckAnexoTipo" NOT NULL DEFAULT 'OUTRO',
  "nome"          TEXT NOT NULL,
  "url"           TEXT,
  "dados"         BYTEA,
  "mime_type"     TEXT,
  "tamanho"       INTEGER,
  "descricao"     TEXT,
  "created_by_id" TEXT,
  "created_at"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "deleted_at"    TIMESTAMP(3),

  CONSTRAINT "truck_anexos_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "truck_anexos_truck_id_idx"
  ON "truck_anexos"("truck_id", "created_at" DESC);

ALTER TABLE "truck_anexos"
  ADD CONSTRAINT "truck_anexos_truck_id_fkey"
  FOREIGN KEY ("truck_id") REFERENCES "trucks"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
