-- Número informado do frete/CT-e: texto preserva prefixos e zeros à esquerda.
-- Legados continuam NULL; não inferir números a partir de anexos ou observações.
ALTER TABLE "fretes_terceiros" ADD COLUMN "numero" VARCHAR(50);

CREATE INDEX "fretes_terceiros_empresa_id_numero_idx"
ON "fretes_terceiros"("empresa_id", "numero");
