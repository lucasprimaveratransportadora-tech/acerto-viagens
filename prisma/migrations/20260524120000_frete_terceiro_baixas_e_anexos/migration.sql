-- CreateEnum
CREATE TYPE "FreteTerceiroParcela" AS ENUM ('ADIANTAMENTO', 'SALDO', 'INTEGRAL', 'AVULSO');
CREATE TYPE "FreteTerceiroAnexoTipo" AS ENUM ('COMPROVANTE_PAGAMENTO', 'CTE', 'RECIBO', 'OUTRO');

-- CreateTable: histórico de baixas (cada pagamento gera um registro)
CREATE TABLE "frete_terceiro_baixas" (
    "id"             TEXT NOT NULL,
    "frete_id"       TEXT NOT NULL,
    "valor"          DECIMAL(12,2) NOT NULL,
    "data_pagamento" TIMESTAMP(3) NOT NULL,
    "parcela"        "FreteTerceiroParcela" NOT NULL DEFAULT 'AVULSO',
    "observacoes"    TEXT,
    "baixou_por_id"  TEXT,
    "created_at"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deleted_at"     TIMESTAMP(3),

    CONSTRAINT "frete_terceiro_baixas_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "frete_terceiro_baixas_frete_id_data_idx"
  ON "frete_terceiro_baixas"("frete_id", "data_pagamento" DESC);

ALTER TABLE "frete_terceiro_baixas"
  ADD CONSTRAINT "frete_terceiro_baixas_frete_id_fkey"
  FOREIGN KEY ("frete_id") REFERENCES "fretes_terceiros"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

-- CreateTable: anexos (URLs externas — comprovantes, CT-e, recibos)
CREATE TABLE "frete_terceiro_anexos" (
    "id"            TEXT NOT NULL,
    "frete_id"      TEXT NOT NULL,
    "tipo"          "FreteTerceiroAnexoTipo" NOT NULL DEFAULT 'OUTRO',
    "nome"          TEXT NOT NULL,
    "url"           TEXT NOT NULL,
    "descricao"     TEXT,
    "created_by_id" TEXT,
    "created_at"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deleted_at"    TIMESTAMP(3),

    CONSTRAINT "frete_terceiro_anexos_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "frete_terceiro_anexos_frete_id_idx"
  ON "frete_terceiro_anexos"("frete_id", "created_at" DESC);

ALTER TABLE "frete_terceiro_anexos"
  ADD CONSTRAINT "frete_terceiro_anexos_frete_id_fkey"
  FOREIGN KEY ("frete_id") REFERENCES "fretes_terceiros"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
