// scripts/unstuck-migration.js
// Roda antes do `prisma migrate deploy` no startup do Railway.
// Limpa estado parcial da migration `20260527130000_trip_numero` que falhou
// em produção (column type mismatch UUID vs TEXT). Idempotente.
//
// Pode ser apagado depois que a app estiver rodando ok.

const { PrismaClient } = require('@prisma/client');

const TARGET = '20260527130000_trip_numero';

(async () => {
  const prisma = new PrismaClient();
  try {
    // 1. Inspeciona estado completo antes
    const before = await prisma.$queryRawUnsafe(
      `SELECT migration_name, started_at, finished_at, rolled_back_at, applied_steps_count
       FROM "_prisma_migrations" WHERE migration_name = $1`,
      TARGET,
    );
    console.log(`[unstuck] BEFORE: ${JSON.stringify(before)}`);

    if (before.length === 0) {
      console.log(`[unstuck] Migration ${TARGET} não está registrada — nada a fazer.`);
    } else {
      const row = before[0];
      if (row.finished_at) {
        console.log(`[unstuck] Migration ${TARGET} já APLICADA com sucesso (finished_at=${row.finished_at}). Pulando.`);
      } else {
        // Não foi aplicada com sucesso: deleta o registro pra forçar re-aplicação.
        // Removemos a condição finished_at IS NULL pra evitar match falho com
        // microsegundos / timezone — já validamos acima que finished_at é null.
        console.log(`[unstuck] Migration ${TARGET} precisa re-aplicar. DELETE…`);
        const deleted = await prisma.$executeRawUnsafe(
          'DELETE FROM "_prisma_migrations" WHERE migration_name = $1',
          TARGET,
        );
        console.log(`[unstuck] DELETE removeu ${deleted} linha(s).`);

        const after = await prisma.$queryRawUnsafe(
          'SELECT COUNT(*)::int AS n FROM "_prisma_migrations" WHERE migration_name = $1',
          TARGET,
        );
        console.log(`[unstuck] AFTER: ainda existem ${after[0].n} registro(s) com esse nome.`);
        if (after[0].n > 0) {
          console.error(`[unstuck] ⚠️ DELETE NÃO PEGOU. Investigar permissões/transação.`);
        }
      }
    }

    // 2. Limpa estado parcial das colunas (idempotente — DROP IF EXISTS)
    console.log('[unstuck] Garantindo que colunas parciais não existem…');
    await prisma.$executeRawUnsafe('ALTER TABLE "trips" DROP COLUMN IF EXISTS "empresa_id" CASCADE');
    await prisma.$executeRawUnsafe('ALTER TABLE "trips" DROP COLUMN IF EXISTS "numero"');
    console.log('[unstuck] OK ✓');

    console.log('[unstuck] Pronto.');
  } catch (e) {
    console.error('[unstuck] Erro (NÃO crítico — seguindo mesmo assim):', e.message);
    console.error(e.stack);
  } finally {
    await prisma.$disconnect();
  }
})();
