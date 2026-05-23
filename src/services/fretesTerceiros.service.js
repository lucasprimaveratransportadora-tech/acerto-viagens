const prisma = require('../config/database');
const ApiError = require('../utils/ApiError');
const audit = require('./audit.service');

function computeStatus({ valor_total, valor_adiantamento, valor_pago, forma_pagamento }) {
  const total = Number(valor_total || 0);
  const adi   = Number(valor_adiantamento || 0);
  const pago  = Number(valor_pago || 0);
  const liquidado = adi + pago;
  if (total <= 0) return 'ABERTO';
  if (liquidado >= total - 0.001) return 'PAGO';
  if (liquidado > 0) return 'PAGO_PARCIAL';
  return 'ABERTO';
}

async function getById(id, empresaId) {
  const frete = await prisma.freteTerceiro.findFirst({
    where: { id, empresa_id: empresaId, deleted_at: null },
    include: {
      truck: { select: { id: true, placa: true, modelo: true, motorista: true } },
      trip:  { select: { id: true, data_inicio: true, origem: true, destino: true } },
      created_by: { select: { id: true, nome: true, email: true } },
      paid_by:    { select: { id: true, nome: true, email: true } },
    },
  });
  if (!frete) throw ApiError.notFound('Frete terceiro não encontrado.');
  return frete;
}

async function list(empresaId, filters = {}) {
  const where = { empresa_id: empresaId, deleted_at: null };
  if (filters.status)    where.status = filters.status;
  if (filters.truck_id)  where.truck_id = filters.truck_id;
  if (filters.trip_id === 'null')      where.trip_id = null;
  else if (filters.trip_id)            where.trip_id = filters.trip_id;
  if (filters.from || filters.to) {
    where.data = {};
    if (filters.from) where.data.gte = new Date(filters.from);
    if (filters.to)   where.data.lte = new Date(filters.to);
  }
  if (filters.q) {
    where.OR = [
      { empresa_pagadora: { contains: filters.q, mode: 'insensitive' } },
      { motorista:        { contains: filters.q, mode: 'insensitive' } },
      { veiculo:          { contains: filters.q, mode: 'insensitive' } },
    ];
  }
  return prisma.freteTerceiro.findMany({
    where,
    include: {
      truck: { select: { id: true, placa: true, modelo: true } },
      trip:  { select: { id: true, data_inicio: true } },
      created_by: { select: { id: true, nome: true } },
      paid_by:    { select: { id: true, nome: true } },
    },
    orderBy: [{ data: 'desc' }, { created_at: 'desc' }],
    take: filters.limit ? Math.min(Number(filters.limit), 500) : 200,
  });
}

async function summary(empresaId) {
  const all = await prisma.freteTerceiro.findMany({
    where: { empresa_id: empresaId, deleted_at: null },
    select: { status: true, valor_total: true, valor_adiantamento: true, valor_pago: true, data: true },
  });
  const now = new Date();
  const startMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  let aberto = 0, adiantado = 0, pagoMes = 0, qtdMes = 0;
  for (const f of all) {
    const total = Number(f.valor_total);
    const adi   = Number(f.valor_adiantamento);
    const pago  = Number(f.valor_pago);
    if (f.status === 'ABERTO' || f.status === 'PAGO_PARCIAL') aberto += (total - adi - pago);
    adiantado += adi;
    if (f.data >= startMonth) {
      qtdMes += 1;
      pagoMes += pago + adi;
    }
  }
  return { aberto, adiantado, pagoMes, qtdMes };
}

async function create(empresaId, req, data) {
  let placa = data.veiculo || '';
  if (data.truck_id) {
    const truck = await prisma.truck.findFirst({ where: { id: data.truck_id, empresa_id: empresaId, deleted_at: null } });
    if (!truck) throw ApiError.notFound('Caminhão não encontrado.');
    placa = truck.placa;
  }
  if (!placa) throw ApiError.badRequest('Selecione o caminhão.');

  const total = Number(data.valor_total || 0);
  const adi   = Number(data.valor_adiantamento || 0);
  const status = computeStatus({ valor_total: total, valor_adiantamento: adi, valor_pago: 0, forma_pagamento: data.forma_pagamento });

  const frete = await prisma.freteTerceiro.create({
    data: {
      empresa_id:         empresaId,
      empresa_pagadora:   data.empresa_pagadora,
      data:               new Date(data.data),
      motorista:          data.motorista,
      veiculo:            placa,
      origem:             data.origem || null,
      destino:            data.destino || null,
      truck_id:           data.truck_id || null,
      valor_total:        total,
      valor_adiantamento: adi,
      valor_pago:         0,
      forma_pagamento:    data.forma_pagamento || 'INTEGRAL',
      status,
      data_adiantamento:  adi > 0 ? new Date(data.data_adiantamento || data.data) : null,
      observacoes:        data.observacoes || null,
      created_by_id:      req.user.id,
    },
    include: {
      truck: { select: { id: true, placa: true } },
      created_by: { select: { id: true, nome: true } },
    },
  });
  await audit.log({ req, empresaId, entity: 'FRETE_TERCEIRO', action: 'CREATE', entityId: frete.id, before: null, after: frete });
  return frete;
}

async function update(id, empresaId, req, data) {
  const before = await getById(id, empresaId);
  const total = data.valor_total != null ? Number(data.valor_total) : Number(before.valor_total);
  const adi   = data.valor_adiantamento != null ? Number(data.valor_adiantamento) : Number(before.valor_adiantamento);
  const pago  = Number(before.valor_pago);
  const status = computeStatus({ valor_total: total, valor_adiantamento: adi, valor_pago: pago });

  const patch = {};
  if (data.empresa_pagadora != null) patch.empresa_pagadora = data.empresa_pagadora;
  if (data.data != null)             patch.data = new Date(data.data);
  if (data.motorista != null)        patch.motorista = data.motorista;
  if (data.origem !== undefined)     patch.origem = data.origem || null;
  if (data.destino !== undefined)    patch.destino = data.destino || null;
  if (data.truck_id !== undefined) {
    patch.truck_id = data.truck_id || null;
    if (data.truck_id) {
      const truck = await prisma.truck.findFirst({ where: { id: data.truck_id, empresa_id: empresaId, deleted_at: null } });
      if (!truck) throw ApiError.notFound('Caminhão não encontrado.');
      patch.veiculo = truck.placa;
    }
  } else if (data.veiculo != null) {
    patch.veiculo = data.veiculo;
  }
  if (data.valor_total != null)      patch.valor_total = total;
  if (data.valor_adiantamento != null) patch.valor_adiantamento = adi;
  if (data.forma_pagamento != null)  patch.forma_pagamento = data.forma_pagamento;
  if (data.data_adiantamento != null) patch.data_adiantamento = data.data_adiantamento ? new Date(data.data_adiantamento) : null;
  if (data.observacoes !== undefined) patch.observacoes = data.observacoes || null;
  patch.status = status;

  const after = await prisma.freteTerceiro.update({
    where: { id },
    data: patch,
    include: {
      truck: { select: { id: true, placa: true } },
      trip:  { select: { id: true, data_inicio: true } },
      created_by: { select: { id: true, nome: true } },
      paid_by:    { select: { id: true, nome: true } },
    },
  });
  await audit.log({ req, empresaId, entity: 'FRETE_TERCEIRO', action: 'UPDATE', entityId: id, before, after });
  return after;
}

async function baixar(id, empresaId, req, data) {
  const before = await getById(id, empresaId);
  if (before.status === 'PAGO' || before.status === 'CANCELADO') {
    throw ApiError.badRequest('Frete já liquidado ou cancelado.');
  }
  const valor = Number(data.valor || 0);
  if (valor <= 0) throw ApiError.badRequest('Valor de baixa deve ser maior que zero.');

  const total = Number(before.valor_total);
  const adi   = Number(before.valor_adiantamento);
  const pago  = Number(before.valor_pago) + valor;
  if (adi + pago > total + 0.001) {
    throw ApiError.badRequest('Valor de baixa excede o saldo em aberto.');
  }
  const status = computeStatus({ valor_total: total, valor_adiantamento: adi, valor_pago: pago });
  const data_pagamento = data.data_pagamento ? new Date(data.data_pagamento) : new Date();

  const after = await prisma.freteTerceiro.update({
    where: { id },
    data: {
      valor_pago: pago,
      status,
      data_pagamento,
      paid_by_id: req.user.id,
      observacoes: data.observacoes ? `${before.observacoes ? before.observacoes + '\n' : ''}[BAIXA ${data_pagamento.toISOString().slice(0,10)}] ${data.observacoes}` : before.observacoes,
    },
    include: {
      truck: { select: { id: true, placa: true } },
      trip:  { select: { id: true, data_inicio: true } },
      created_by: { select: { id: true, nome: true } },
      paid_by:    { select: { id: true, nome: true } },
    },
  });
  await audit.log({ req, empresaId, entity: 'FRETE_TERCEIRO', action: 'UPDATE', entityId: id, before, after });
  return after;
}

async function linkTrip(id, tripId, empresaId, req) {
  const before = await getById(id, empresaId);
  const trip = await prisma.trip.findFirst({
    where: { id: tripId, deleted_at: null, truck: { empresa_id: empresaId, deleted_at: null } },
  });
  if (!trip) throw ApiError.notFound('Viagem não encontrada.');

  const after = await prisma.freteTerceiro.update({
    where: { id },
    data: { trip_id: tripId, truck_id: before.truck_id || trip.truck_id },
    include: {
      truck: { select: { id: true, placa: true } },
      trip:  { select: { id: true, data_inicio: true, origem: true, destino: true } },
    },
  });
  await audit.log({ req, empresaId, entity: 'FRETE_TERCEIRO', action: 'UPDATE', entityId: id, before, after });
  return after;
}

async function unlinkTrip(id, empresaId, req) {
  const before = await getById(id, empresaId);
  if (!before.trip_id) return before;
  const after = await prisma.freteTerceiro.update({
    where: { id },
    data: { trip_id: null },
    include: { truck: { select: { id: true, placa: true } } },
  });
  await audit.log({ req, empresaId, entity: 'FRETE_TERCEIRO', action: 'UPDATE', entityId: id, before, after });
  return after;
}

async function remove(id, empresaId, req) {
  const before = await getById(id, empresaId);
  const after = await prisma.freteTerceiro.update({
    where: { id },
    data: { deleted_at: new Date() },
  });
  await audit.log({ req, empresaId, entity: 'FRETE_TERCEIRO', action: 'DELETE', entityId: id, before, after });
  return after;
}

module.exports = { list, summary, getById, create, update, baixar, linkTrip, unlinkTrip, remove };
