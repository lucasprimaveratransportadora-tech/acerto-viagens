const prisma = require('../config/database');
const ApiError = require('../utils/ApiError');
const audit = require('./audit.service');

function computeStatus({ valor_total, valor_pago }) {
  const total = Number(valor_total || 0);
  const pago  = Number(valor_pago || 0);
  if (total <= 0) return 'ABERTO';
  if (pago >= total - 0.001) return 'PAGO';
  if (pago > 0) return 'PAGO_PARCIAL';
  return 'ABERTO';
}

async function getById(id, empresaId, options = {}) {
  const include = {
    truck: { select: { id: true, placa: true, modelo: true, motorista: true } },
    trip:  { select: { id: true, data_inicio: true, origem: true, destino: true } },
    created_by: { select: { id: true, nome: true, email: true } },
    paid_by:    { select: { id: true, nome: true, email: true } },
  };
  if (options.withDetails) {
    include.baixas = {
      where: { deleted_at: null },
      orderBy: { data_pagamento: 'asc' },
    };
    include.anexos = {
      where: { deleted_at: null },
      orderBy: { created_at: 'desc' },
    };
  }
  const frete = await prisma.freteTerceiro.findFirst({
    where: { id, empresa_id: empresaId, deleted_at: null },
    include,
  });
  if (!frete) throw ApiError.notFound('Frete terceiro não encontrado.');

  if (options.withDetails) {
    // Enriquece baixas com nome do usuário que baixou
    const userIds = [...new Set(frete.baixas.map(b => b.baixou_por_id).filter(Boolean))];
    const anexoUserIds = [...new Set(frete.anexos.map(a => a.created_by_id).filter(Boolean))];
    const allIds = [...new Set([...userIds, ...anexoUserIds])];
    const users = allIds.length
      ? await prisma.user.findMany({ where: { id: { in: allIds } }, select: { id: true, nome: true, email: true } })
      : [];
    const byId = Object.fromEntries(users.map(u => [u.id, u]));
    frete.baixas = frete.baixas.map(b => ({ ...b, baixou_por: b.baixou_por_id ? byId[b.baixou_por_id] || null : null }));
    frete.anexos = frete.anexos.map(a => ({ ...a, created_by: a.created_by_id ? byId[a.created_by_id] || null : null }));
  }
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
    select: { status: true, valor_total: true, valor_adiantamento: true, valor_pago: true, data: true, forma_pagamento: true, data_pagamento: true },
  });
  const now = new Date();
  const startMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  let aberto = 0;             // saldo a receber em fretes não pagos
  let adiantadoPendente = 0;  // adiantamentos planejados ainda não recebidos
  let pagoMes = 0;            // valor recebido cuja última baixa caiu no mês
  let qtdMes = 0;             // fretes lançados no mês

  for (const f of all) {
    const total = Number(f.valor_total);
    const adi   = Number(f.valor_adiantamento);
    const pago  = Number(f.valor_pago);
    const status = f.status;

    if (status !== 'PAGO' && status !== 'CANCELADO') {
      aberto += (total - pago);
      if (f.forma_pagamento === 'ADIANTAMENTO_SALDO' && pago < adi) {
        adiantadoPendente += (adi - pago);
      }
    }
    if (f.data >= startMonth) qtdMes += 1;
    if (pago > 0 && f.data_pagamento && f.data_pagamento >= startMonth) {
      pagoMes += pago;
    }
  }
  return { aberto, adiantado: adiantadoPendente, pagoMes, qtdMes };
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
  // Adiantamento é o valor PLANEJADO da 1ª parcela (ainda não recebido).
  // Status inicial é sempre ABERTO; só muda quando há baixa.
  const status = computeStatus({ valor_total: total, valor_pago: 0 });

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
      data_adiantamento:  null,
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
  const status = computeStatus({ valor_total: total, valor_pago: pago });

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
  const pagoAnterior = Number(before.valor_pago);
  const pago  = pagoAnterior + valor;
  if (pago > total + 0.001) {
    throw ApiError.badRequest('Valor de baixa excede o saldo em aberto.');
  }
  const status = computeStatus({ valor_total: total, valor_pago: pago });
  const data_pagamento = data.data_pagamento ? new Date(data.data_pagamento) : new Date();

  const isFirstBaixa = pagoAnterior <= 0.001;

  // Determina a label da parcela
  let parcela = 'AVULSO';
  if (before.forma_pagamento === 'ADIANTAMENTO_SALDO') {
    parcela = isFirstBaixa ? 'ADIANTAMENTO' : 'SALDO';
  } else if (before.forma_pagamento === 'INTEGRAL') {
    parcela = 'INTEGRAL';
  }

  const [, after] = await prisma.$transaction([
    prisma.freteTerceiroBaixa.create({
      data: {
        frete_id:       id,
        valor,
        data_pagamento,
        parcela,
        observacoes:    data.observacoes || null,
        baixou_por_id:  req.user.id,
      },
    }),
    prisma.freteTerceiro.update({
      where: { id },
      data: {
        valor_pago: pago,
        status,
        data_pagamento,
        data_adiantamento: (isFirstBaixa && before.forma_pagamento === 'ADIANTAMENTO_SALDO')
          ? data_pagamento
          : before.data_adiantamento,
        paid_by_id: req.user.id,
      },
      include: {
        truck: { select: { id: true, placa: true } },
        trip:  { select: { id: true, data_inicio: true } },
        created_by: { select: { id: true, nome: true } },
        paid_by:    { select: { id: true, nome: true } },
      },
    }),
  ]);
  await audit.log({ req, empresaId, entity: 'FRETE_TERCEIRO', action: 'UPDATE', entityId: id, before, after });
  return after;
}

/* ============================================================
   ANEXOS — URLs externas (Drive, Dropbox, etc.) ou data URIs.
   ============================================================ */
async function addAnexo(freteId, empresaId, req, data) {
  await getById(freteId, empresaId); // garante ownership multi-tenant
  if (!data.url) throw ApiError.badRequest('URL do anexo obrigatória.');
  if (!data.nome) throw ApiError.badRequest('Nome do anexo obrigatório.');
  const anexo = await prisma.freteTerceiroAnexo.create({
    data: {
      frete_id:       freteId,
      tipo:           data.tipo || 'OUTRO',
      nome:           data.nome,
      url:            data.url,
      descricao:      data.descricao || null,
      created_by_id:  req.user.id,
    },
  });
  await audit.log({ req, empresaId, entity: 'FRETE_TERCEIRO', action: 'UPDATE', entityId: freteId, before: null, after: { anexo } });
  return anexo;
}

async function removeAnexo(freteId, anexoId, empresaId, req) {
  await getById(freteId, empresaId);
  const anexo = await prisma.freteTerceiroAnexo.findFirst({
    where: { id: anexoId, frete_id: freteId, deleted_at: null },
  });
  if (!anexo) throw ApiError.notFound('Anexo não encontrado.');
  await prisma.freteTerceiroAnexo.update({
    where: { id: anexoId },
    data: { deleted_at: new Date() },
  });
  await audit.log({ req, empresaId, entity: 'FRETE_TERCEIRO', action: 'DELETE', entityId: freteId, before: { anexo }, after: null });
  return { ok: true };
}

async function removeBaixa(freteId, baixaId, empresaId, req) {
  const frete = await getById(freteId, empresaId);
  const baixa = await prisma.freteTerceiroBaixa.findFirst({
    where: { id: baixaId, frete_id: freteId, deleted_at: null },
  });
  if (!baixa) throw ApiError.notFound('Baixa não encontrada.');

  const novoPago = Math.max(0, Number(frete.valor_pago) - Number(baixa.valor));
  const novoStatus = computeStatus({ valor_total: Number(frete.valor_total), valor_pago: novoPago });

  await prisma.$transaction([
    prisma.freteTerceiroBaixa.update({
      where: { id: baixaId },
      data: { deleted_at: new Date() },
    }),
    prisma.freteTerceiro.update({
      where: { id: freteId },
      data: {
        valor_pago: novoPago,
        status: novoStatus,
        // Se zerou pagamentos, limpa datas
        data_pagamento: novoPago > 0 ? frete.data_pagamento : null,
        data_adiantamento: novoPago > 0 ? frete.data_adiantamento : null,
      },
    }),
  ]);
  await audit.log({ req, empresaId, entity: 'FRETE_TERCEIRO', action: 'UPDATE', entityId: freteId, before: { baixa }, after: null });
  return { ok: true };
}

async function linkTrip(id, tripId, empresaId, req) {
  const before = await getById(id, empresaId);
  // Garante que a viagem existe E pertence à mesma empresa via truck.empresa_id
  const trip = await prisma.trip.findFirst({
    where: { id: tripId, deleted_at: null, truck: { empresa_id: empresaId, deleted_at: null } },
    include: { truck: { select: { id: true, empresa_id: true } } },
  });
  if (!trip) throw ApiError.notFound('Viagem não encontrada.');

  // Se o frete ainda não tem truck e a viagem tem, herda — mas só se for da mesma empresa
  let truck_id_final = before.truck_id;
  if (!truck_id_final && trip.truck_id && trip.truck?.empresa_id === empresaId) {
    truck_id_final = trip.truck_id;
  }

  const after = await prisma.freteTerceiro.update({
    where: { id },
    data: { trip_id: tripId, truck_id: truck_id_final },
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
