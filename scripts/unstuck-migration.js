// scripts/unstuck-migration.js
// Roda antes do `prisma migrate deploy` no startup do Railway.
// Limpa estado parcial da migration `20260527130000_trip_numero` que falhou
// em produção (column type mismatch UUID vs TEXT). Idempotente: se nada
// estiver bagunçado, não faz nada.
//
// Pode ser apagado depois que a app estiver rodando ok.

const { PrismaClient } = require('@prisma/client');

const TARGET = '20260527130000_trip_numero';

(async () => {
  const prisma = new PrismaClient();
  try {
    // 1. Estado atual no _prisma_migrations
    const rows = await prisma.$queryRawUnsafe(
      'SELECT migration_name, finished_at, rolled_back_at FROM "_prisma_migrations" WHERE migration_name = $1',
      TARGET,
    );

    if (rows.length === 0) {
      console.log(`[unstuck] Migration ${TARGET} não está registrada — nada a fazer.`);
    } else {
      const row = rows[0];
      if (row.finished_at) {
        console.log(`[unstuck] Migration ${TARGET} já aplicada com sucesso — nada a fazer.`);
      } else {
        // Inclui o caso rolled-back: migrate deploy pula migrations rolled-back,
        // então pra re-aplicar precisamos DELETAR o registro completo.
        const reason = row.rolled_back_at ? 'rolled-back' : 'failed sem rollback';
        console.log(`[unstuck] Migration ${TARGET} está ${reason}. Deletando o registro para re-aplicar…`);
        await prisma.$executeRawUnsafe(
          'DELETE FROM "_prisma_migrations" WHERE migration_name = $1 AND finished_at IS NULL',
          TARGET,
        );
        console.log('[unstuck] Registro deletado — prisma migrate deploy vai re-aplicar do zero ✓');
      }
    }

    // 2. Limpa estado parcial das colunas (idempotente — DROP IF EXISTS)
    console.log('[unstuck] Limpando colunas parciais (se existirem)…');
    await prisma.$executeRawUnsafe('ALTER TABLE "trips" DROP COLUMN IF EXISTS "empresa_id" CASCADE');
    await prisma.$executeRawUnsafe('ALTER TABLE "trips" DROP COLUMN IF EXISTS "numero"');
    console.log('[unstuck] Colunas parciais removidas (se havia) ✓');

    console.log('[unstuck] Pronto.');
  } catch (e) {
    console.error('[unstuck] Erro (NÃO crítico — seguindo mesmo assim):', e.message);
    // Não derruba o boot se algo der errado aqui; o prisma migrate deploy
    // vai reportar o estado real e travar se necessário.
  } finally {
    await prisma.$disconnect();
  }
})();
