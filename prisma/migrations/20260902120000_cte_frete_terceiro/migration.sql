-- Nullable: CT-es manuais e vínculos legados com viagem continuam válidos.
ALTER TABLE "ctes" ADD COLUMN "frete_terceiro_id" TEXT;

CREATE UNIQUE INDEX "ctes_frete_terceiro_id_key" ON "ctes"("frete_terceiro_id");

ALTER TABLE "ctes" ADD CONSTRAINT "ctes_frete_terceiro_id_fkey"
  FOREIGN KEY ("frete_terceiro_id") REFERENCES "fretes_terceiros"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

-- O fluxo legado de edição de viagem substitui CT-es com deleteMany.
-- A liberação precisa valer também fora de ctes.service.remove, sem tocar
-- em fretes que só possuem o vínculo legado com a viagem.
CREATE FUNCTION release_cte_frete_terceiro() RETURNS trigger AS $$
BEGIN
  UPDATE fretes_terceiros
     SET trip_id = NULL, updated_at = CURRENT_TIMESTAMP
   WHERE id = OLD.frete_terceiro_id
     AND trip_id = OLD.trip_id
     AND empresa_id = (SELECT empresa_id FROM trips WHERE id = OLD.trip_id);
  RETURN OLD;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER ctes_release_frete_after_delete
AFTER DELETE ON ctes
FOR EACH ROW
WHEN (OLD.frete_terceiro_id IS NOT NULL)
EXECUTE FUNCTION release_cte_frete_terceiro();
