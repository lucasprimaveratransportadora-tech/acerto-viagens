-- Livro-caixa por caminhão (espelho da planilha do pai do usuário).
-- Cada lançamento é débito ou crédito; saldo é calculado em tempo de
-- consulta. O caminhão "se paga" quando o saldo acumulado vira positivo.

-- AlterEnum: adiciona TRUCK_LEDGER ao AuditEntity (idempotente)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_type t
      JOIN pg_enum e ON e.enumtypid = t.oid
     WHERE t.typname = 'AuditEntity' AND e.enumlabel = 'TRUCK_LEDGER'
  ) THEN
    ALTER TYPE "AuditEntity" ADD VALUE 'TRUCK_LEDGER';
  END IF;
END $$;

-- CreateEnum
CREATE TYPE "TruckLedgerTipo" AS ENUM ('DEBITO', 'CREDITO');

CREATE TYPE "TruckLedgerCategoria" AS ENUM (
  'AQUISICAO',
  'IPVA',
  'SEGURO',
  'MANUTENCAO',
  'PNEU',
  'RASTREADOR',
  'DESPACHANTE_TAXAS',
  'PEDAGIO_AVULSO',
  'ABASTECIMENTO_AVULSO',
  'ACERTO_CTE',
  'OUTRO_CUSTO',
  'OUTRA_RECEITA'
);

-- CreateTable
CREATE TABLE "truck_ledger_entries" (
  "id"              TEXT NOT NULL,
  "truck_id"        TEXT NOT NULL,
  "data"            DATE NOT NULL,
  "historico"       TEXT NOT NULL,
  "categoria"       "TruckLedgerCategoria" NOT NULL DEFAULT 'OUTRO_CUSTO',
  "tipo"            "TruckLedgerTipo" NOT NULL,
  "valor"           DECIMAL(12,2) NOT NULL,
  "observacoes"     TEXT,
  "anexo_url"       TEXT,
  "anexo_dados"     BYTEA,
  "anexo_mime"      TEXT,
  "anexo_tamanho"   INTEGER,
  "anexo_nome"      TEXT,
  "imported_batch"  TEXT,
  "created_by_id"   TEXT,
  "created_at"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at"      TIMESTAMP(3) NOT NULL,
  "deleted_at"      TIMESTAMP(3),

  CONSTRAINT "truck_ledger_entries_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "truck_ledger_entries_truck_id_data_idx"
  ON "truck_ledger_entries"("truck_id", "data");
CREATE INDEX "truck_ledger_entries_truck_id_categoria_idx"
  ON "truck_ledger_entries"("truck_id", "categoria");
CREATE INDEX "truck_ledger_entries_imported_batch_idx"
  ON "truck_ledger_entries"("imported_batch");

-- AddForeignKey
ALTER TABLE "truck_ledger_entries"
  ADD CONSTRAINT "truck_ledger_entries_truck_id_fkey"
  FOREIGN KEY ("truck_id") REFERENCES "trucks"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
