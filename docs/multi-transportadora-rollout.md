# Rollout — multi-transportadora e marca branca

Esta branch **não deve ir direto para produção**. Ela altera enum, índice único de placa e autenticação.

## Staging

1. Criar um Postgres separado no Railway e um serviço da aplicação apontando para a branch
   `feat/multi-tenant-white-label-v2`.
2. Configurar no serviço de staging as mesmas variáveis obrigatórias da aplicação, mas com a
   `DATABASE_URL` do banco de staging.
3. Executar `npm run migrate:deploy` e depois `npm run seed`.
4. Promover o usuário dono da plataforma:
   `node scripts/promover-superadmin.js EMAIL_DO_LUCAS`.
5. Validar: criar empresa; subir logo; entrar como; cadastrar a mesma placa em duas empresas;
   lançar frete; editar valor/motorista/adiantamento na tabela; sair da impersonação; bloquear empresa.

## Produção

Somente depois do staging aprovado:

1. Backup do Postgres.
2. `npm run migrate:deploy`.
3. `node scripts/promover-superadmin.js EMAIL_DO_LUCAS`.
4. Deploy da aplicação.

O script de promoção exige email explícito e não cria caminho de escalada pela interface.
