const prisma = require('../config/database');
const ApiError = require('../utils/ApiError');
const audit = require('./audit.service');

// Campos do anexo de viagem que NÃO podem voltar em listagens (Bytes pesado)
const TRIP_ANEXO_LIST_SELECT = {
  id: true, trip_id: true, tipo: true, nome: true, url: true,
  mime_type: true, tamanho: true, descricao: true, created_by_id: true,
  created_at: true,
};

async function verifyTruckOwnership(truckId, empresaId) {
  const truck = await prisma.truck.findFirst({
    where: { id: truckId, empresa_id: empresaId, deleted_at: null },
  });
  if (!truck) throw ApiError.notFound('Caminhão não encontrado.');
  return truck;
}

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

async function listByTruck(truckId, empresaId) {
  await verifyTruckOwnership(truckId, empresaId);

  return prisma.trip.findMany({
    where: { truck_id: truckId, deleted_at: null },
    include: {
      ctes: true,
      fuels: true,
      expenses: true,
      _count: { select: { trip_anexos: { where: { deleted_at: null } } } },
    },
    orderBy: { data_inicio: 'desc' },
  });
}

async function getById(id, empresaId) {
  const trip = await prisma.trip.findFirst({
    where: {
      id,
      deleted_at: null,
      truck: { empresa_id: empresaId, deleted_at: null },
    },
    include: {
      ctes: true,
      fuels: true,
      expenses: true,
      truck: { select: { id: true, placa: true, modelo: true, motorista: true } },
      trip_anexos: {
        where: { deleted_at: null },
        orderBy: { created_at: 'desc' },
        select: TRIP_ANEXO_LIST_SELECT,
      },
    },
  });
  if (!trip) throw ApiError.notFound('Viagem não encontrada.');
  return trip;
}

async function create(truckId, empresaId, req, data) {
  await verifyTruckOwnership(truckId, empresaId);

  const trip = await prisma.trip.create({
    data: {
      truck_id: truckId,
      data_inicio: new Date(data.data_inicio),
      data_fim: data.data_fim ? new Date(data.data_fim) : null,
      origem: data.origem,
      destino: data.destino,
      carga: data.carga,
      motorista: data.motorista || null,
      km_total: data.km_total,
      status: data.status,
      adiantamento: data.adiantamento,
      observacoes: data.observacoes,
      km_inicial: data.km_inicial,
      km_final: data.km_final,
      imported_batch: data.imported_batch || null,
    },
    include: {
      ctes: true,
      fuels: true,
      expenses: true,
    },
  });
  await audit.log({ req, empresaId, entity: 'TRIP', action: 'CREATE', entityId: trip.id, before: null, after: trip });
  return trip;
}

async function update(id, empresaId, req, data) {
  await verifyTripOwnership(id, empresaId);

  if (data.data_inicio) data.data_inicio = new Date(data.data_inicio);
  if (data.data_fim) data.data_fim = new Date(data.data_fim);
  // Normaliza motorista: string vazia vira null
  if (data.motorista !== undefined) data.motorista = data.motorista || null;

  const before = await prisma.trip.findUnique({ where: { id } });
  const after = await prisma.trip.update({
    where: { id },
    data,
    include: {
      ctes: true,
      fuels: true,
      expenses: true,
    },
  });
  await audit.log({ req, empresaId, entity: 'TRIP', action: 'UPDATE', entityId: id, before, after });
  return after;
}

async function remove(id, empresaId, req) {
  await verifyTripOwnership(id, empresaId);

  const before = await prisma.trip.findUnique({ where: { id } });
  const after = await prisma.trip.update({
    where: { id },
    data: { deleted_at: new Date() },
  });
  await audit.log({ req, empresaId, entity: 'TRIP', action: 'DELETE', entityId: id, before, after });
  return after;
}

/* ============================================================
   ANEXOS DA VIAGEM — folha de acerto digitalizada, comprovantes.
   Mesmo padrão de TruckAnexo / FreteTerceiroAnexo.
   ============================================================ */

async function addAnexo(tripId, empresaId, req, data) {
  await verifyTripOwnership(tripId, empresaId);
  if (!data.url)  throw ApiError.badRequest('URL do anexo obrigatória.');
  if (!data.nome) throw ApiError.badRequest('Nome do anexo obrigatório.');
  const anexo = await prisma.tripAnexo.create({
    data: {
      trip_id:        tripId,
      tipo:           data.tipo || 'FOLHA_ACERTO',
      nome:           data.nome,
      url:            data.url,
      descricao:      data.descricao || null,
      created_by_id:  req.user.id,
    },
    select: TRIP_ANEXO_LIST_SELECT,
  });
  await audit.log({ req, empresaId, entity: 'TRIP_ANEXO', action: 'CREATE', entityId: anexo.id, before: null, after: anexo });
  return anexo;
}

async function addAnexoFile(tripId, empresaId, req, file, meta) {
  await verifyTripOwnership(tripId, empresaId);
  if (!file || !file.buffer) throw ApiError.badRequest('Arquivo obrigatório.');
  const nome = (meta?.nome && meta.nome.trim()) || file.originalname || 'anexo';
  const anexo = await prisma.tripAnexo.create({
    data: {
      trip_id:        tripId,
      tipo:           meta?.tipo || 'FOLHA_ACERTO',
      nome,
      url:            null,
      dados:          file.buffer,
      mime_type:      file.mimetype || 'application/octet-stream',
      tamanho:        file.size || file.buffer.length,
      descricao:      meta?.descricao || null,
      created_by_id:  req.user.id,
    },
    select: TRIP_ANEXO_LIST_SELECT,
  });
  await audit.log({ req, empresaId, entity: 'TRIP_ANEXO', action: 'CREATE', entityId: anexo.id, before: null, after: anexo });
  return anexo;
}

async function getAnexoFile(tripId, anexoId, empresaId) {
  await verifyTripOwnership(tripId, empresaId);
  const anexo = await prisma.tripAnexo.findFirst({
    where: { id: anexoId, trip_id: tripId, deleted_at: null },
  });
  if (!anexo) throw ApiError.notFound('Anexo não encontrado.');
  if (!anexo.dados) throw ApiError.notFound('Este anexo é um link externo, abra pela URL.');
  return anexo;
}

async function removeAnexo(tripId, anexoId, empresaId, req) {
  await verifyTripOwnership(tripId, empresaId);
  const anexo = await prisma.tripAnexo.findFirst({
    where: { id: anexoId, trip_id: tripId, deleted_at: null },
  });
  if (!anexo) throw ApiError.notFound('Anexo não encontrado.');
  await prisma.tripAnexo.update({
    where: { id: anexoId },
    data: { deleted_at: new Date() },
  });
  await audit.log({ req, empresaId, entity: 'TRIP_ANEXO', action: 'DELETE', entityId: anexoId, before: { anexo }, after: null });
  return { ok: true };
}

module.exports = {
  listByTruck, getById, create, update, remove,
  addAnexo, addAnexoFile, getAnexoFile, removeAnexo,
};
