-- Adiciona saldo histórico anterior ao primeiro lançamento do livro.
-- Caminhões antigos (anteriores ao período coberto pela planilha) podem
-- iniciar com saldo positivo, refletindo o que já se pagaram no passado.

ALTER TABLE "trucks"
  ADD COLUMN IF NOT EXISTS "saldo_inicial" DECIMAL(12,2) NOT NULL DEFAULT 0;
