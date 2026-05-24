-- Permite upload nativo de arquivo armazenado direto na coluna `dados` (bytea).
-- `url` passa a ser opcional para suportar anexos sem link externo.

ALTER TABLE "frete_terceiro_anexos" ALTER COLUMN "url" DROP NOT NULL;
ALTER TABLE "frete_terceiro_anexos" ADD COLUMN IF NOT EXISTS "dados"     BYTEA;
ALTER TABLE "frete_terceiro_anexos" ADD COLUMN IF NOT EXISTS "mime_type" TEXT;
ALTER TABLE "frete_terceiro_anexos" ADD COLUMN IF NOT EXISTS "tamanho"   INTEGER;
