-- Adiciona motorista por viagem + lote de importação na Trip,
-- e cria tabela trip_anexos (fichário de folhas de acerto digitalizadas).
-- Idempotente: pode rodar várias vezes sem erro.

-- 1) Novo enum TripAnexoTipo
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'TripAnexoTipo') THEN
    CREATE TYPE "TripAnexoTipo" AS ENUM (
      'FOLHA_ACERTO',
      'COMPROVANTE',
      'NOTA_FISCAL',
      'OUTRO'
    );
  END IF;
END$$;

-- 2) AuditEntity ganha valor TRIP_ANEXO
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_enum
    WHERE enumlabel = 'TRIP_ANEXO'
      AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'AuditEntity')
  ) THEN
    ALTER TYPE "AuditEntity" ADD VALUE 'TRIP_ANEXO';
  END IF;
END$$;

-- 3) Trip ganha motorista + imported_batch (idempotente)
ALTER TABLE "trips" ADD COLUMN IF NOT EXISTS "motorista"      TEXT;
ALTER TABLE "trips" ADD COLUMN IF NOT EXISTS "imported_batch" TEXT;

CREATE INDEX IF NOT EXISTS "trips_imported_batch_idx"
  ON "trips"("imported_batch");

-- 4) Tabela trip_anexos
CREATE TABLE IF NOT EXISTS "trip_anexos" (
  "id"            TEXT NOT NULL,
  "trip_id"       TEXT NOT NULL,
  "tipo"          "TripAnexoTipo" NOT NULL DEFAULT 'FOLHA_ACERTO',
  "nome"          TEXT NOT NULL,
  "url"           TEXT,
  "dados"         BYTEA,
  "mime_type"     TEXT,
  "tamanho"       INTEGER,
  "descricao"     TEXT,
  "created_by_id" TEXT,
  "created_at"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "deleted_at"    TIMESTAMP(3),

  CONSTRAINT "trip_anexos_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "trip_anexos_trip_id_idx"
  ON "trip_anexos"("trip_id", "created_at" DESC);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'trip_anexos_trip_id_fkey'
  ) THEN
    ALTER TABLE "trip_anexos"
      ADD CONSTRAINT "trip_anexos_trip_id_fkey"
      FOREIGN KEY ("trip_id") REFERENCES "trips"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END$$;
