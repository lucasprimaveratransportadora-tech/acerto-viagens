const prisma = require('../config/database');

const RETENTION_HOURS = 48;

async function log({ req, action, user, emailAttempt }) {
  try {
    await prisma.loginEvent.create({
      data: {
        empresa_id: user?.empresa_id || null,
        user_id: user?.id || null,
        email_attempt: emailAttempt || user?.email || 'unknown',
        action,
        ip: req?.ip || null,
        user_agent: (req?.headers?.['user-agent'] || '').slice(0, 500) || null,
      },
    });
  } catch (err) {
    // Login events nao devem quebrar o fluxo de login (decisao spec sec 10).
    console.error('[loginEvents.log] failed:', err.message);
  }
}

async function list(empresaId, filters = {}) {
  const { page = 1, limit = 50, user_id, action } = filters;
  const safeLimit = Math.min(Math.max(parseInt(limit, 10) || 50, 1), 200);
  const safePage = Math.max(parseInt(page, 10) || 1, 1);

  const cutoff = new Date(Date.now() - RETENTION_HOURS * 60 * 60 * 1000);

  // Spec sec 9: empresa_id IS NULL (LOGIN_FAILED com email desconhecido)
  // tambem aparece para o admin - sinal de seguranca util.
  const where = {
    AND: [
      { created_at: { gte: cutoff } },
      { OR: [{ empresa_id: empresaId }, { empresa_id: null }] },
    ],
  };
  if (user_id) where.AND.push({ user_id });
  if (action) where.AND.push({ action });

  const [total, items] = await Promise.all([
    prisma.loginEvent.count({ where }),
    prisma.loginEvent.findMany({
      where,
      include: { user: { select: { id: true, nome: true, email: true } } },
      orderBy: { created_at: 'desc' },
      skip: (safePage - 1) * safeLimit,
      take: safeLimit,
    }),
  ]);

  return {
    items,
    total,
    page: safePage,
    limit: safeLimit,
    totalPages: Math.max(Math.ceil(total / safeLimit), 1),
  };
}

module.exports = { log, list, RETENTION_HOURS };
