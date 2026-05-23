const prisma = require('../config/database');

const SENSITIVE_KEY_PATTERNS = [
  /_hash$/,
  /_secret$/,
  /^senha/,
  /^password/,
  /^refresh_token/,
];

function sanitize(obj) {
  if (obj === null || obj === undefined) return obj;
  if (typeof obj !== 'object') return obj;
  if (Array.isArray(obj)) return obj.map(sanitize);
  const out = {};
  for (const [k, v] of Object.entries(obj)) {
    if (SENSITIVE_KEY_PATTERNS.some((p) => p.test(k))) continue;
    out[k] = sanitize(v);
  }
  return out;
}

async function log({ req, empresaId, entity, action, entityId, before, after }) {
  // Audit log é diagnóstico secundário: nunca deve derrubar a operação principal.
  try {
    await prisma.auditLog.create({
      data: {
        empresa_id: empresaId,
        actor_id: req.user?.id || null,
        actor_email: req.user?.email || 'system',
        entity_type: entity,
        entity_id: entityId,
        action,
        before: before ? sanitize(before) : null,
        after: after ? sanitize(after) : null,
        ip: req.ip || null,
        user_agent: (req.headers?.['user-agent'] || '').slice(0, 500) || null,
      },
    });
  } catch (err) {
    console.error('[audit.log] falha ao gravar:', { entity, action, entityId, error: err?.message });
  }
}

async function list(empresaId, filters = {}) {
  const { page = 1, limit = 50, entity, entity_id, actor_id, action, from, to } = filters;
  const safeLimit = Math.min(Math.max(parseInt(limit, 10) || 50, 1), 200);
  const safePage = Math.max(parseInt(page, 10) || 1, 1);

  const where = { empresa_id: empresaId };
  if (entity) where.entity_type = entity;
  if (entity_id) where.entity_id = entity_id;
  if (actor_id) where.actor_id = actor_id;
  if (action) where.action = action;
  if (from || to) {
    where.created_at = {};
    if (from) where.created_at.gte = new Date(from);
    if (to) where.created_at.lte = new Date(to);
  }

  const [total, items] = await Promise.all([
    prisma.auditLog.count({ where }),
    prisma.auditLog.findMany({
      where,
      include: { actor: { select: { id: true, nome: true, email: true } } },
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

async function listByEntity(empresaId, entityType, entityId) {
  return prisma.auditLog.findMany({
    where: { empresa_id: empresaId, entity_type: entityType, entity_id: entityId },
    include: { actor: { select: { id: true, nome: true, email: true } } },
    orderBy: { created_at: 'desc' },
    take: 100,
  });
}

module.exports = { log, list, listByEntity, sanitize };
