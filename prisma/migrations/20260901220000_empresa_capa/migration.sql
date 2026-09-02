ALTER TABLE "empresas"
  ADD COLUMN "capa_dados" BYTEA,
  ADD COLUMN "capa_mime" TEXT,
  ADD COLUMN "capa_tamanho" INTEGER,
  ADD COLUMN "capa_posicao" TEXT NOT NULL DEFAULT 'center';
