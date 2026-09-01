ALTER TYPE "Role" ADD VALUE IF NOT EXISTS 'SUPER_ADMIN' BEFORE 'ADMIN';
ALTER TYPE "AuditEntity" ADD VALUE IF NOT EXISTS 'EMPRESA';

ALTER TABLE "empresas"
  ADD COLUMN "cor_primaria" TEXT NOT NULL DEFAULT '#E30613',
  ADD COLUMN "logo_dados" BYTEA,
  ADD COLUMN "logo_mime" TEXT,
  ADD COLUMN "logo_tamanho" INTEGER;

ALTER TABLE "refresh_tokens"
  ADD COLUMN "impersonated_empresa_id" TEXT;

DROP INDEX IF EXISTS "trucks_placa_key";
CREATE UNIQUE INDEX "trucks_empresa_id_placa_key" ON "trucks"("empresa_id", "placa");
