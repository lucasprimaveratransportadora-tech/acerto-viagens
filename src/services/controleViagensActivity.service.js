const prisma = require('../config/database');

const COMMENT_TYPE = 'COMMENT';

// Registra um evento no activity log. NÃO falha a operação principal se o
// registro do log falhar — apenas loga no console. Esse helper é usado pelos
// outros services dentro de transações; se chamado fora de transação, vira
// uma escrita atômica isolada.
async function record({ tx, truckId, viagemId = null, tipo, payload, author }) {
  const client = tx || prisma;
  try {
    return await client.truckActivityEvent.create({
      data: {
        truck_id:     truckId,
        viagem_id:    viagemId,
        tipo,
        payload:      payload || {},
        author_id:    author?.id || null,
        author_email: author?.email || 'system',
        author_nome:  author?.nome  || 'system',
      },
    });
  } catch (err) {
    console.error('[activity] falha ao gravar:', { tipo, truckId, viagemId, error: err?.message });
    return null;
  }
}

// Lista com paginação por cursor (created_at). Mistura comentários e eventos
// automáticos. Filtra deletados.
async function list({ truckId, empresaId, viagemId, limit = 50, before }) {
  // Garante que o truck pertence à empresa (gating multi-tenant)
  const truck = await prisma.truck.findFirst({
    where: { id: truckId, empresa_id: empresaId, deleted_at: null },
    select: { id: true },
  });
  if (!truck) return [];

  const where = { truck_id: truckId, deleted_at: null };
  if (viagemId) where.viagem_id = viagemId;
  if (before) {
    const d = new Date(before);
    if (!isNaN(d.getTime())) where.created_at = { lt: d };
  }

  return prisma.truckActivityEvent.findMany({
    where,
    orderBy: { created_at: 'desc' },
    take: Math.min(Math.max(parseInt(limit, 10) || 50, 1), 200),
  });
}

// Soft-delete só de eventos COMMENT. Autor ou ADMIN.
async function deleteComment({ eventId, empresaId, req }) {
  const ApiError = require('../utils/ApiError');
  const event = await prisma.truckActivityEvent.findFirst({
    where: { id: eventId, deleted_at: null },
    include: {
      truck: { select: { empresa_id: true } },
    },
  });
  if (!event) throw ApiError.notFound('Evento não encontrado.');
  if (event.truck.empresa_id !== empresaId) throw ApiError.notFound('Evento não encontrado.');
  if (event.tipo !== COMMENT_TYPE) {
    throw ApiError.badRequest('Apenas comentários podem ser apagados.');
  }

  const isAuthor = event.author_id && event.author_id === req.user.id;
  const isAdmin  = req.user.role === 'ADMIN';
  if (!isAuthor && !isAdmin) {
    throw ApiError.forbidden('Só o autor ou um ADMIN pode apagar este comentário.');
  }

  return prisma.truckActivityEvent.update({
    where: { id: eventId },
    data: { deleted_at: new Date(), deleted_by_id: req.user.id },
  });
}

module.exports = { record, list, deleteComment, COMMENT_TYPE };
