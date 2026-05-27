-- 1. Adiciona colunas (nullable durante backfill)
ALTER TABLE "trips" ADD COLUMN "empresa_id" UUID;
ALTER TABLE "trips" ADD COLUMN "numero" INTEGER;

-- 2. Backfill empresa_id a partir de trucks
UPDATE "trips"
SET "empresa_id" = "trucks"."empresa_id"
FROM "trucks"
WHERE "trips"."truck_id" = "trucks"."id";

-- 3. Backfill numero em ordem cronologica por empresa (inclui soft-deleted —
--    numeros nunca sao reaproveitados pra evitar confusao no historico)
WITH numbered AS (
  SELECT "id",
         ROW_NUMBER() OVER (
           PARTITION BY "empresa_id"
           ORDER BY "data_inicio" ASC, "created_at" ASC
         ) AS rn
  FROM "trips"
)
UPDATE "trips"
SET "numero" = numbered.rn
FROM numbered
WHERE "trips"."id" = numbered."id";

-- 4. Tornar NOT NULL apos backfill
ALTER TABLE "trips" ALTER COLUMN "empresa_id" SET NOT NULL;
ALTER TABLE "trips" ALTER COLUMN "numero" SET NOT NULL;

-- 5. FK + unique + index
ALTER TABLE "trips"
  ADD CONSTRAINT "trips_empresa_id_fkey"
  FOREIGN KEY ("empresa_id") REFERENCES "empresas"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE UNIQUE INDEX "trips_empresa_id_numero_key" ON "trips" ("empresa_id", "numero");
CREATE INDEX "trips_empresa_id_idx" ON "trips" ("empresa_id");
