// scripts/unstuck-migration.js
// Roda antes do `prisma migrate deploy` no startup do Railway.
// Detecta DRIFT de schema: se _prisma_migrations diz que a migration foi
// aplicada mas as colunas reais NÃO existem no banco, deleta o registro
// pra forçar re-aplicação. Idempotente.
//
// Pode ser apagado depois que a app estabilizar.

const { PrismaClient } = require('@prisma/client');

const TARGET = '20260527130000_trip_numero';
// Colunas que a migration adiciona — se não existirem, a migration não foi
// aplicada de fato (mesmo que _prisma_migrations diga que sim).
const EXPECTED_COLUMNS = ['empresa_id', 'numero'];

(async () => {
  const prisma = new PrismaClient();
  try {
    // 1. Estado do registro da migration
    const reg = await prisma.$queryRawUnsafe(
      `SELECT migration_name, started_at, finished_at, rolled_back_at, applied_steps_count
       FROM "_prisma_migrations" WHERE migration_name = $1`,
      TARGET,
    );
    console.log(`[unstuck] _prisma_migrations: ${JSON.stringify(reg)}`);

    // 2. Estado real das colunas no banco
    const cols = await prisma.$queryRawUnsafe(
      `SELECT column_name FROM information_schema.columns
       WHERE table_name = 'trips' AND column_name = ANY($1::text[])`,
      EXPECTED_COLUMNS,
    );
    const existing = cols.map(c => c.column_name);
    const missing = EXPECTED_COLUMNS.filter(c => !existing.includes(c));
    console.log(`[unstuck] Colunas existentes em "trips": [${existing.join(', ')}]`);
    console.log(`[unstuck] Colunas FALTANDO: [${missing.join(', ')}]`);

    const registeredAsApplied = reg.length > 0 && reg[0].finished_at;
    const driftDetected = registeredAsApplied && missing.length > 0;

    if (driftDetected) {
      console.warn(`[unstuck] ⚠️ DRIFT: migration marcada como APPLIED mas colunas faltam. Limpando…`);

      // Apaga TODO registro da migration target (independente do estado)
      const deleted = await prisma.$executeRawUnsafe(
        'DELETE FROM "_prisma_migrations" WHERE migration_name = $1',
        TARGET,
      );
      console.log(`[unstuck] DELETE removeu ${deleted} linha(s) de _prisma_migrations.`);

      // Confirma que sumiu
      const conf = await prisma.$queryRawUnsafe(
        `SELECT COUNT(*)::int AS n FROM "_prisma_migrations" WHERE migration_name = $1`,
        TARGET,
      );
      console.log(`[unstuck] AFTER DELETE: existem ${conf[0].n} registros com esse nome.`);

      // Limpa colunas parciais (defensivo — caso existam só metade)
      await prisma.$executeRawUnsafe('ALTER TABLE "trips" DROP COLUMN IF EXISTS "empresa_id" CASCADE');
      await prisma.$executeRawUnsafe('ALTER TABLE "trips" DROP COLUMN IF EXISTS "numero"');
      console.log(`[unstuck] Drift resolvido — prisma migrate deploy vai aplicar a migration de novo ✓`);
    } else if (reg.length > 0 && reg[0].finished_at) {
      console.log(`[unstuck] Migration OK: registrada como aplicada E colunas existem. Nada a fazer.`);
    } else if (reg.length === 0) {
      console.log(`[unstuck] Migration não registrada — migrate deploy aplica normalmente.`);
    } else {
      // Existe registro mas não aplicada (failed ou rolled-back) — deletar pra reaplicar
      console.log(`[unstuck] Registro pendente (failed/rolled-back). DELETE…`);
      const deleted = await prisma.$executeRawUnsafe(
        'DELETE FROM "_prisma_migrations" WHERE migration_name = $1',
        TARGET,
      );
      console.log(`[unstuck] DELETE removeu ${deleted} linha(s).`);
      await prisma.$executeRawUnsafe('ALTER TABLE "trips" DROP COLUMN IF EXISTS "empresa_id" CASCADE');
      await prisma.$executeRawUnsafe('ALTER TABLE "trips" DROP COLUMN IF EXISTS "numero"');
    }

    console.log('[unstuck] Pronto.');
  } catch (e) {
    console.error('[unstuck] Erro (NÃO crítico — seguindo mesmo assim):', e.message);
    console.error(e.stack);
  } finally {
    await prisma.$disconnect();
  }
})();
