-- Migration corretiva idempotente: garante que o enum AuditEntity tem
-- FRETE_TERCEIRO e que a tabela fretes_terceiros tem origem/destino.
-- Não toca migrations anteriores; só completa o estado caso alguma
-- delas tenha falhado parcialmente em produção.

DO $$
BEGIN
  -- Garante valor FRETE_TERCEIRO no enum AuditEntity
  IF NOT EXISTS (
    SELECT 1 FROM pg_type t
      JOIN pg_enum e ON e.enumtypid = t.oid
     WHERE t.typname = 'AuditEntity' AND e.enumlabel = 'FRETE_TERCEIRO'
  ) THEN
    ALTER TYPE "AuditEntity" ADD VALUE 'FRETE_TERCEIRO';
  END IF;
END $$;

-- Garante colunas origem e destino na tabela fretes_terceiros
ALTER TABLE "fretes_terceiros" ADD COLUMN IF NOT EXISTS "origem"  TEXT;
ALTER TABLE "fretes_terceiros" ADD COLUMN IF NOT EXISTS "destino" TEXT;
