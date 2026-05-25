-- Adiciona campo de permissões por módulo. ADMIN sempre tem acesso a
-- tudo (override no app); o array só restringe usuários GESTOR.
-- Default inclui todos os módulos atuais — usuários existentes mantêm
-- acesso total automaticamente após o migrate deploy.

ALTER TABLE "users"
  ADD COLUMN IF NOT EXISTS "permissoes" TEXT[] NOT NULL
  DEFAULT ARRAY['frota','frete-terceiro','veiculos','rentabilidade']::TEXT[];
