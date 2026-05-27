const prisma = require('../config/database');
const ApiError = require('../utils/ApiError');
const audit = require('./audit.service');

const VALID_STATUS = [
  'VAZIO_AGUARDANDO_CARGA',
  'INDO_CARREGAR',
  'NA_FABRICA',
  'CARREGADO_EM_VIAGEM',
  'EM_DESCARGA_NO_CLIENTE',
  'EM_MANUTENCAO',
];
const DEFAULT_STATUS = 'VAZIO_AGUARDANDO_CARGA';

// Devolve um state "virtual" se o caminhão ainda não tem registro.
// Só persiste no primeiro PATCH/edição.
function virtualState(truckId) {
  return {
    id: null,
    truck_id: truckId,
    status: DEFAULT_STATUS,
    contexto_atual: null,
    data_coleta: null,
    data_agendamento_entrega: null,
    carga_descricao: null,
    descricao: null,
    updated_at: null,
    updated_by_id: null,
    updated_by: null,
  };
}

async function getBoard(empresaId) {
  const trucks = await prisma.truck.findMany({
    where: { empresa_id: empresaId, deleted_at: null },
    select: {
      id: true, placa: true, modelo: true, motorista: true,
      carreta_placa: true, carreta_modelo: true,
      operational_state: {
        include: {
          updated_by: { select: { id: true, nome: true, email: true } },
        },
      },
    },
    orderBy: [{ placa: 'asc' }],
  });

  // Contagem de comentários ativos por truck — uma única query agrupada
  const counts = await prisma.truckOperationalComment.groupBy({
    by: ['truck_id'],
    where: { truck_id: { in: trucks.map(t => t.id) }, deleted_at: null },
    _count: { _all: true },
    _max:   { created_at: true },
  });
  const byTruck = Object.fromEntries(counts.map(c => [c.truck_id, c]));

  return trucks.map(t => ({
    truck: {
      id: t.id, placa: t.placa, modelo: t.modelo, motorista: t.motorista,
      carreta_placa: t.carreta_placa, carreta_modelo: t.carreta_modelo,
    },
    state: t.operational_state || virtualState(t.id),
    comments_count: byTruck[t.id]?._count?._all || 0,
    last_comment_at: byTruck[t.id]?._max?.created_at || null,
  }));
}

async function getDetail(truckId, empresaId, { commentsLimit = 50 } = {}) {
  const truck = await prisma.truck.findFirst({
    where: { id: truckId, empresa_id: empresaId, deleted_at: null },
    select: {
      id: true, placa: true, modelo: true, motorista: true,
      carreta_placa: true, carreta_modelo: true,
      operational_state: {
        include: {
          updated_by: { select: { id: true, nome: true, email: true } },
        },
      },
    },
  });
  if (!truck) throw ApiError.notFound('Caminhão não encontrado.');

  const comments = await prisma.truckOperationalComment.findMany({
    where: { truck_id: truckId, deleted_at: null },
    orderBy: { created_at: 'desc' },
    take: Math.min(commentsLimit, 200),
  });

  return {
    truck: {
      id: truck.id, placa: truck.placa, modelo: truck.modelo,
      motorista: truck.motorista,
      carreta_placa: truck.carreta_placa, carreta_modelo: truck.carreta_modelo,
    },
    state: truck.operational_state || virtualState(truck.id),
    comments,
  };
}

async function upsertState(truckId, empresaId, req, payload) {
  const truck = await prisma.truck.findFirst({
    where: { id: truckId, empresa_id: empresaId, deleted_at: null },
    select: { id: true },
  });
  if (!truck) throw ApiError.notFound('Caminhão não encontrado.');

  if (payload.status && !VALID_STATUS.includes(payload.status)) {
    throw ApiError.badRequest('Status inválido.');
  }

  const before = await prisma.truckOperationalState.findUnique({ where: { truck_id: truckId } });

  // Whitelist + normalização de datas. Campos não enviados ficam intactos
  // (preservação histórica entre mudanças de status, ver spec §4).
  const data = { updated_by_id: req.user.id };
  if (payload.status !== undefined) data.status = payload.status;
  if (payload.contexto_atual !== undefined) data.contexto_atual = payload.contexto_atual || null;
  if (payload.carga_descricao !== undefined) data.carga_descricao = payload.carga_descricao || null;
  if (payload.descricao !== undefined) data.descricao = payload.descricao || null;
  if (payload.data_coleta !== undefined) {
    data.data_coleta = payload.data_coleta ? new Date(payload.data_coleta) : null;
  }
  if (payload.data_agendamento_entrega !== undefined) {
    data.data_agendamento_entrega = payload.data_agendamento_entrega ? new Date(payload.data_agendamento_entrega) : null;
  }

  const after = await prisma.truckOperationalState.upsert({
    where: { truck_id: truckId },
    create: { truck_id: truckId, status: payload.status || DEFAULT_STATUS, ...data },
    update: data,
    include: { updated_by: { select: { id: true, nome: true, email: true } } },
  });

  await audit.log({
    req, empresaId, entity: 'TRUCK', action: 'UPDATE',
    entityId: truckId,
    before: before ? { operational_state: before } : null,
    after:  { operational_state: after },
  });

  return after;
}

module.exports = { getBoard, getDetail, upsertState, VALID_STATUS, DEFAULT_STATUS };
