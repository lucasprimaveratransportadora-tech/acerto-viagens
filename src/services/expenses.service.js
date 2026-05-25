const prisma = require('../config/database');
const ApiError = require('../utils/ApiError');
const audit = require('./audit.service');
const { EXPENSE_CATEGORIES } = require('../utils/constants');

async function verifyTripOwnership(tripId, empresaId) {
  const trip = await prisma.trip.findFirst({
    where: {
      id: tripId,
      deleted_at: null,
      truck: { empresa_id: empresaId, deleted_at: null },
    },
  });
  if (!trip) throw ApiError.notFound('Viagem não encontrada.');
  return trip;
}

// Defense-in-depth: o validator da rota PUT também checa, mas o service
// não pode confiar — pode ser chamado por outro caminho no futuro.
// Antes, uma categoria inválida virava 500 (enum violation no Prisma).
function normalizeEntries(expenses) {
  if (!expenses || typeof expenses !== 'object' || Array.isArray(expenses)) {
    throw ApiError.badRequest('Body deve ser um objeto { CATEGORIA: valor }.');
  }
  const entries = [];
  for (const [categoria, valorRaw] of Object.entries(expenses)) {
    if (!EXPENSE_CATEGORIES.includes(categoria)) {
      throw ApiError.badRequest(`Categoria inválida: ${categoria}`);
    }
    const valor = Number(valorRaw);
    if (!Number.isFinite(valor)) {
      throw ApiError.badRequest(`Valor de ${categoria} deve ser numérico.`);
    }
    entries.push([categoria, valor]);
  }
  return entries;
}

async function upsertAll(tripId, empresaId, req, expenses) {
  await verifyTripOwnership(tripId, empresaId);
  const entries = normalizeEntries(expenses);

  // Atomicidade: ou todas as categorias gravam, ou nenhuma.
  // Antes, qualquer falha no meio deixava algumas categorias persistidas
  // e outras não.
  const beforeAndAfter = await prisma.$transaction(async (tx) => {
    const out = [];
    for (const [categoria, valor] of entries) {
      const before = await tx.expense.findUnique({
        where: { trip_id_categoria: { trip_id: tripId, categoria } },
      });
      const after = await tx.expense.upsert({
        where: { trip_id_categoria: { trip_id: tripId, categoria } },
        update: { valor },
        create: { trip_id: tripId, categoria, valor },
      });
      out.push({ before, after });
    }
    return out;
  });

  // Audit fora da tx (audit.log captura suas próprias exceções).
  for (const { before, after } of beforeAndAfter) {
    await audit.log({
      req, empresaId, entity: 'EXPENSE',
      action: before ? 'UPDATE' : 'CREATE',
      entityId: after.id,
      before, after,
    });
  }
  return beforeAndAfter.map((e) => e.after);
}

async function updateOne(tripId, empresaId, req, categoria, valorRaw) {
  await verifyTripOwnership(tripId, empresaId);

  if (!EXPENSE_CATEGORIES.includes(categoria)) {
    throw ApiError.badRequest(`Categoria inválida: ${categoria}`);
  }
  const valor = Number(valorRaw);
  if (!Number.isFinite(valor)) {
    throw ApiError.badRequest('Valor deve ser numérico.');
  }

  const before = await prisma.expense.findUnique({
    where: { trip_id_categoria: { trip_id: tripId, categoria } },
  });
  const after = await prisma.expense.upsert({
    where: { trip_id_categoria: { trip_id: tripId, categoria } },
    update: { valor },
    create: { trip_id: tripId, categoria, valor },
  });
  await audit.log({
    req, empresaId, entity: 'EXPENSE',
    action: before ? 'UPDATE' : 'CREATE',
    entityId: after.id,
    before, after,
  });
  return after;
}

async function getByTrip(tripId, empresaId) {
  await verifyTripOwnership(tripId, empresaId);

  return prisma.expense.findMany({
    where: { trip_id: tripId },
    orderBy: { categoria: 'asc' },
  });
}

module.exports = { upsertAll, updateOne, getByTrip };
