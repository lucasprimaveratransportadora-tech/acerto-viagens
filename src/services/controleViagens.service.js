const prisma = require('../config/database');
const ApiError = require('../utils/ApiError');
const activity = require('./controleViagensActivity.service');
const audit = require('./audit.service');

const VALID_COLUMNS = [
  'VAZIO_AGUARDANDO_CARGA',
  'INDO_CARREGAR',
  'NA_FABRICA',
  'CARREGADO_EM_VIAGEM',
  'EM_DESCARGA_NO_CLIENTE',
  'EM_MANUTENCAO',
];
const DEFAULT_COLUMN = 'VAZIO_AGUARDANDO_CARGA';

function virtualColumn(truckId) {
  return {
    id: null,
    truck_id: truckId,
    coluna: DEFAULT_COLUMN,
    manutencao_descricao: null,
    descricao_geral: null,
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
      column: {
        include: { updated_by: { select: { id: true, nome: true, email: true } } },
      },
      viagens: {
        where: { deleted_at: null, status_viagem: { in: ['EM_CURSO', 'PLANEJADA'] } },
        orderBy: { created_at: 'desc' },
      },
    },
    orderBy: [{ placa: 'asc' }],
  });

  // Agrega contadores por truck — 1 query group
  const activityCounts = await prisma.truckActivityEvent.groupBy({
    by: ['truck_id'],
    where: { truck_id: { in: trucks.map(t => t.id) }, deleted_at: null },
    _count: { _all: true },
    _max:   { created_at: true },
  });
  const byTruckActivity = Object.fromEntries(activityCounts.map(c => [c.truck_id, c]));

  let maxColumn = 0;
  let maxActivity = 0;

  const board = trucks.map(t => {
    const col = t.column || virtualColumn(t.id);
    const colTs = col.updated_at ? new Date(col.updated_at).getTime() : 0;
    const actTs = byTruckActivity[t.id]?._max?.created_at
      ? new Date(byTruckActivity[t.id]._max.created_at).getTime() : 0;
    if (colTs > maxColumn) maxColumn = colTs;
    if (actTs > maxActivity) maxActivity = actTs;

    const viagemEmCurso = t.viagens.find(v => v.status_viagem === 'EM_CURSO') || null;
    const planejadasCount = t.viagens.filter(v => v.status_viagem === 'PLANEJADA').length;

    return {
      truck: {
        id: t.id, placa: t.placa, modelo: t.modelo, motorista: t.motorista,
        carreta_placa: t.carreta_placa, carreta_modelo: t.carreta_modelo,
      },
      column: col,
      viagem_em_curso: viagemEmCurso,
      viagens_planejadas_count: planejadasCount,
      activity_count: byTruckActivity[t.id]?._count?._all || 0,
      last_activity_at: byTruckActivity[t.id]?._max?.created_at || null,
    };
  });

  return { board, fingerprint: `${board.length}-${maxColumn}-${maxActivity}` };
}

async function getTruckDetail(truckId, empresaId) {
  const truck = await prisma.truck.findFirst({
    where: { id: truckId, empresa_id: empresaId, deleted_at: null },
    select: {
      id: true, placa: true, modelo: true, motorista: true,
      carreta_placa: true, carreta_modelo: true,
      column: {
        include: { updated_by: { select: { id: true, nome: true, email: true } } },
      },
      viagens: {
        where: { deleted_at: null },
        orderBy: [{ status_viagem: 'asc' }, { created_at: 'desc' }],
      },
    },
  });
  if (!truck) throw ApiError.notFound('Caminhão não encontrado.');

  const events = await activity.list({ truckId, empresaId, limit: 50 });

  return {
    truck: {
      id: truck.id, placa: truck.placa, modelo: truck.modelo,
      motorista: truck.motorista,
      carreta_placa: truck.carreta_placa, carreta_modelo: truck.carreta_modelo,
    },
    column: truck.column || virtualColumn(truck.id),
    viagens: truck.viagens,
    activity: events,
  };
}

async function updateColumn(truckId, empresaId, req, body) {
  const truck = await prisma.truck.findFirst({
    where: { id: truckId, empresa_id: empresaId, deleted_at: null },
    select: { id: true },
  });
  if (!truck) throw ApiError.notFound('Caminhão não encontrado.');

  if (body.coluna && !VALID_COLUMNS.includes(body.coluna)) {
    throw ApiError.badRequest('Coluna inválida.');
  }

  const before = await prisma.truckColumn.findUnique({ where: { truck_id: truckId } });
  const oldColuna = before?.coluna || DEFAULT_COLUMN;
  const oldManut  = before?.manutencao_descricao || null;
  const oldDesc   = before?.descricao_geral || null;

  const data = { updated_by_id: req.user.id };
  if (body.coluna !== undefined) data.coluna = body.coluna;
  if (body.manutencao_descricao !== undefined) {
    data.manutencao_descricao = (body.manutencao_descricao || '').trim() || null;
  }
  if (body.descricao_geral !== undefined) {
    data.descricao_geral = (body.descricao_geral || '').trim() || null;
  }

  const after = await prisma.$transaction(async (tx) => {
    const u = await tx.truckColumn.upsert({
      where: { truck_id: truckId },
      create: { truck_id: truckId, coluna: body.coluna || DEFAULT_COLUMN, ...data },
      update: data,
      include: { updated_by: { select: { id: true, nome: true, email: true } } },
    });

    // Eventos: COLUMN_MOVED se mudou coluna; COLUMN_FIELD_EDITED pros outros campos.
    if (body.coluna && body.coluna !== oldColuna) {
      await activity.record({
        tx, truckId, tipo: 'COLUMN_MOVED',
        payload: { from: oldColuna, to: body.coluna },
        author: req.user,
      });
    }
    if (body.manutencao_descricao !== undefined && (data.manutencao_descricao !== oldManut)) {
      await activity.record({
        tx, truckId, tipo: 'COLUMN_FIELD_EDITED',
        payload: { field: 'manutencao_descricao', before: oldManut, after: data.manutencao_descricao },
        author: req.user,
      });
    }
    if (body.descricao_geral !== undefined && (data.descricao_geral !== oldDesc)) {
      await activity.record({
        tx, truckId, tipo: 'COLUMN_FIELD_EDITED',
        payload: { field: 'descricao_geral', before: oldDesc, after: data.descricao_geral },
        author: req.user,
      });
    }
    return u;
  });

  await audit.log({ req, empresaId, entity: 'TRUCK', action: 'UPDATE', entityId: truckId,
    before: before ? { column: before } : null,
    after:  { column: after } });
  return after;
}

async function addComment(truckId, empresaId, req, body) {
  const truck = await prisma.truck.findFirst({
    where: { id: truckId, empresa_id: empresaId, deleted_at: null },
    select: { id: true },
  });
  if (!truck) throw ApiError.notFound('Caminhão não encontrado.');

  const texto = (body?.texto || '').trim();
  if (!texto) throw ApiError.badRequest('Texto do comentário não pode ser vazio.');
  if (texto.length > 4000) throw ApiError.badRequest('Comentário muito longo (máx 4000).');

  // Se veio viagem_id, valida que pertence ao mesmo truck
  let viagemId = null;
  if (body?.viagem_id) {
    const v = await prisma.truckViagem.findFirst({
      where: { id: body.viagem_id, truck_id: truckId, deleted_at: null },
      select: { id: true },
    });
    if (!v) throw ApiError.notFound('Viagem do comentário não encontrada.');
    viagemId = v.id;
  }

  return activity.record({
    truckId, viagemId, tipo: 'COMMENT',
    payload: { texto },
    author: req.user,
  });
}

module.exports = {
  getBoard, getTruckDetail, updateColumn, addComment,
  VALID_COLUMNS, DEFAULT_COLUMN,
};
