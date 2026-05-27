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

module.exports = { getBoard, VALID_STATUS, DEFAULT_STATUS };
