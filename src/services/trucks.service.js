const prisma = require('../config/database');
const ApiError = require('../utils/ApiError');
const audit = require('./audit.service');

// Campos do anexo que NÃO podem voltar em listagens (Bytes pesado)
const ANEXO_LIST_SELECT = {
  id: true, truck_id: true, tipo: true, nome: true, url: true,
  mime_type: true, tamanho: true, descricao: true, created_by_id: true,
  created_at: true,
};

async function list(empresaId) {
  return prisma.truck.findMany({
    where: { empresa_id: empresaId, deleted_at: null },
    orderBy: { placa: 'asc' },
    include: {
      _count: { select: { trips: true, truck_anexos: { where: { deleted_at: null } } } },
    },
  });
}

async function getById(id, empresaId, options = {}) {
  const include = options.withAnexos ? {
    truck_anexos: {
      where: { deleted_at: null },
      orderBy: { created_at: 'desc' },
      select: ANEXO_LIST_SELECT,
    },
  } : undefined;
  const truck = await prisma.truck.findFirst({
    where: { id, empresa_id: empresaId, deleted_at: null },
    include,
  });
  if (!truck) throw ApiError.notFound('Caminhão não encontrado.');

  if (options.withAnexos && truck.truck_anexos?.length) {
    const userIds = [...new Set(truck.truck_anexos.map(a => a.created_by_id).filter(Boolean))];
    const users = userIds.length
      ? await prisma.user.findMany({ where: { id: { in: userIds } }, select: { id: true, nome: true } })
      : [];
    const byId = Object.fromEntries(users.map(u => [u.id, u]));
    truck.truck_anexos = truck.truck_anexos.map(a => ({
      ...a,
      created_by: a.created_by_id ? byId[a.created_by_id] || null : null,
    }));
  }
  return truck;
}

async function create(empresaId, req, data) {
  const { placa, modelo, motorista, carreta_placa, carreta_modelo, saldo_inicial, observacoes } = data;
  const existing = await prisma.truck.findFirst({ where: { empresa_id: empresaId, placa } });
  if (existing && existing.deleted_at === null) {
    throw ApiError.conflict('Placa já cadastrada.');
  }
  const truck = await prisma.truck.create({
    data: {
      empresa_id: empresaId,
      placa,
      modelo:          modelo || null,
      motorista:       motorista || null,
      carreta_placa:   carreta_placa || null,
      carreta_modelo:  carreta_modelo || null,
      saldo_inicial:   Number(saldo_inicial) || 0,
      observacoes:     observacoes || null,
    },
  });
  await audit.log({ req, empresaId, entity: 'TRUCK', action: 'CREATE', entityId: truck.id, before: null, after: truck });
  return truck;
}

async function update(id, empresaId, req, data) {
  const before = await prisma.truck.findFirst({
    where: { id, empresa_id: empresaId, deleted_at: null },
  });
  if (!before) throw ApiError.notFound('Caminhão não encontrado.');

  if (data.placa && data.placa !== before.placa) {
    const existing = await prisma.truck.findFirst({ where: { empresa_id: empresaId, placa: data.placa } });
    if (existing && existing.deleted_at === null) {
      throw ApiError.conflict('Placa já cadastrada.');
    }
  }

  // Normaliza nulláveis: string vazia vira null
  const patch = {};
  ['placa','modelo','motorista','carreta_placa','carreta_modelo','observacoes'].forEach(k => {
    if (data[k] !== undefined) patch[k] = data[k] || null;
  });
  if (data.saldo_inicial !== undefined) patch.saldo_inicial = Number(data.saldo_inicial) || 0;

  const after = await prisma.truck.update({ where: { id }, data: patch });
  await audit.log({ req, empresaId, entity: 'TRUCK', action: 'UPDATE', entityId: id, before, after });
  return after;
}

async function remove(id, empresaId, req) {
  const before = await prisma.truck.findFirst({
    where: { id, empresa_id: empresaId, deleted_at: null },
  });
  if (!before) throw ApiError.notFound('Caminhão não encontrado.');

  const after = await prisma.truck.update({
    where: { id },
    data: { deleted_at: new Date() },
  });
  await audit.log({ req, empresaId, entity: 'TRUCK', action: 'DELETE', entityId: id, before, after });
  return after;
}

/* ============================================================
   ANEXOS DO TRUCK — URL externa ou upload nativo (bytea).
   ============================================================ */

async function addAnexo(truckId, empresaId, req, data) {
  await getById(truckId, empresaId);
  if (!data.url)  throw ApiError.badRequest('URL do anexo obrigatória.');
  if (!data.nome) throw ApiError.badRequest('Nome do anexo obrigatório.');
  const anexo = await prisma.truckAnexo.create({
    data: {
      truck_id:       truckId,
      tipo:           data.tipo || 'OUTRO',
      nome:           data.nome,
      url:            data.url,
      descricao:      data.descricao || null,
      created_by_id:  req.user.id,
    },
    select: ANEXO_LIST_SELECT,
  });
  await audit.log({ req, empresaId, entity: 'TRUCK', action: 'UPDATE', entityId: truckId, before: null, after: { anexo } });
  return anexo;
}

async function addAnexoFile(truckId, empresaId, req, file, meta) {
  await getById(truckId, empresaId);
  if (!file || !file.buffer) throw ApiError.badRequest('Arquivo obrigatório.');
  const nome = (meta?.nome && meta.nome.trim()) || file.originalname || 'anexo';
  const anexo = await prisma.truckAnexo.create({
    data: {
      truck_id:       truckId,
      tipo:           meta?.tipo || 'OUTRO',
      nome,
      url:            null,
      dados:          file.buffer,
      mime_type:      file.mimetype || 'application/octet-stream',
      tamanho:        file.size || file.buffer.length,
      descricao:      meta?.descricao || null,
      created_by_id:  req.user.id,
    },
    select: ANEXO_LIST_SELECT,
  });
  await audit.log({ req, empresaId, entity: 'TRUCK', action: 'UPDATE', entityId: truckId, before: null, after: { anexo } });
  return anexo;
}

async function getAnexoFile(truckId, anexoId, empresaId) {
  await getById(truckId, empresaId);
  const anexo = await prisma.truckAnexo.findFirst({
    where: { id: anexoId, truck_id: truckId, deleted_at: null },
  });
  if (!anexo) throw ApiError.notFound('Anexo não encontrado.');
  if (!anexo.dados) throw ApiError.notFound('Este anexo é um link externo, abra pela URL.');
  return anexo;
}

async function removeAnexo(truckId, anexoId, empresaId, req) {
  await getById(truckId, empresaId);
  const anexo = await prisma.truckAnexo.findFirst({
    where: { id: anexoId, truck_id: truckId, deleted_at: null },
  });
  if (!anexo) throw ApiError.notFound('Anexo não encontrado.');
  await prisma.truckAnexo.update({
    where: { id: anexoId },
    data: { deleted_at: new Date() },
  });
  await audit.log({ req, empresaId, entity: 'TRUCK', action: 'DELETE', entityId: truckId, before: { anexo }, after: null });
  return { ok: true };
}

module.exports = {
  list, getById, create, update, remove,
  addAnexo, addAnexoFile, getAnexoFile, removeAnexo,
};
