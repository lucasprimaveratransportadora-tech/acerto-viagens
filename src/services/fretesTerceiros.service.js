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

async function getById(id, empresaId, options = {}, client = prisma) {
  if (!empresaId) throw ApiError.unauthorized('Empresa não identificada.');
  const include = {
    cte: { select: { id: true, trip_id: true, numero: true, valor: true } },
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
      select: {
        id: true, frete_id: true, tipo: true, nome: true, url: true,
        mime_type: true, tamanho: true, descricao: true,
        created_by_id: true, created_at: true,
      },
    };
  }
  const frete = await client.freteTerceiro.findFirst({
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
      ? await client.user.findMany({ where: { id: { in: allIds } }, select: { id: true, nome: true, email: true } })
      : [];
    const byId = Object.fromEntries(users.map(u => [u.id, u]));
    frete.baixas = frete.baixas.map(b => ({ ...b, baixou_por: b.baixou_por_id ? byId[b.baixou_por_id] || null : null }));
    frete.anexos = frete.anexos.map(a => ({ ...a, created_by: a.created_by_id ? byId[a.created_by_id] || null : null }));
  }
  return frete;
}

async function list(empresaId, filters = {}) {
  if (!empresaId) throw ApiError.unauthorized('Empresa não identificada.');
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
      cte: { select: { id: true, trip_id: true, numero: true, valor: true } },
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
  // !== undefined (não != null) — assim o cliente CONSEGUE limpar a data
  // mandando { data_adiantamento: null } explicitamente. Com != null, a
  // checagem era false pra null, então o patch nunca incluía a chave e
  // o backend nunca conseguia voltar a data pra null.
  if (data.data_adiantamento !== undefined) patch.data_adiantamento = data.data_adiantamento ? new Date(data.data_adiantamento) : null;
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
   ANEXOS — URL externa ou upload nativo (bytea).
   ============================================================ */

// Campos pesados (Bytes) que NÃO devem voltar em listagens
const ANEXO_LIST_SELECT = {
  id: true, frete_id: true, tipo: true, nome: true, url: true,
  mime_type: true, tamanho: true, descricao: true, created_by_id: true,
  created_at: true, deleted_at: true,
};

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
    select: ANEXO_LIST_SELECT,
  });
  await audit.log({ req, empresaId, entity: 'FRETE_TERCEIRO', action: 'UPDATE', entityId: freteId, before: null, after: { anexo } });
  return anexo;
}

async function addAnexoFile(freteId, empresaId, req, file, meta) {
  await getById(freteId, empresaId);
  if (!file || !file.buffer) throw ApiError.badRequest('Arquivo obrigatório.');
  const nome = (meta?.nome && meta.nome.trim()) || file.originalname || 'anexo';
  const anexo = await prisma.freteTerceiroAnexo.create({
    data: {
      frete_id:       freteId,
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
  await audit.log({ req, empresaId, entity: 'FRETE_TERCEIRO', action: 'UPDATE', entityId: freteId, before: null, after: { anexo } });
  return anexo;
}

async function getAnexoFile(freteId, anexoId, empresaId) {
  await getById(freteId, empresaId);
  const anexo = await prisma.freteTerceiroAnexo.findFirst({
    where: { id: anexoId, frete_id: freteId, deleted_at: null },
  });
  if (!anexo) throw ApiError.notFound('Anexo não encontrado.');
  if (!anexo.dados) throw ApiError.notFound('Este anexo é um link externo, abra pela URL.');
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
        // Se zerou pagamentos, limpa datas E o paid_by_id — senão o frete
        // ficava com "pago por fulano" mesmo sem nenhuma baixa, dando a
        // impressão de que foi pago.
        data_pagamento: novoPago > 0 ? frete.data_pagamento : null,
        data_adiantamento: novoPago > 0 ? frete.data_adiantamento : null,
        paid_by_id: novoPago > 0 ? frete.paid_by_id : null,
      },
    }),
  ]);
  await audit.log({ req, empresaId, entity: 'FRETE_TERCEIRO', action: 'UPDATE', entityId: freteId, before: { baixa }, after: null });
  return { ok: true };
}

// Uma tradução de conflitos para todos os caminhos que alteram o vínculo.
async function withLinkTransaction(work, options) {
  try {
    return await prisma.$transaction(work, options);
  } catch (error) {
    // Queries SQL de lock retornam P2010 + SQLSTATE, não P2034.
    const sqlConflict = error.code === 'P2010' && ['40001', '40P01'].includes(error.meta?.code);
    if (error.code === 'P2002' || error.code === 'P2034' || sqlConflict) {
      throw ApiError.conflict('Conflito no vínculo do frete. Atualize os dados e tente novamente.');
    }
    throw error;
  }
}

// Todas as operações travam frete antes de CT-e, inclusive a rota legada.
// tx deve ser uma transação interativa; os parâmetros são bindados.
async function lockForLink(tx, id, empresaId) {
  if (!empresaId) throw ApiError.unauthorized('Empresa não identificada.');
  const rows = await tx.$queryRaw`
    SELECT id FROM fretes_terceiros
    WHERE id = ${id} AND empresa_id = ${empresaId} AND deleted_at IS NULL
    FOR UPDATE
  `;
  if (!rows.length) throw ApiError.notFound('Frete terceiro não encontrado.');
  return getById(id, empresaId, {}, tx);
}

function linkAudit(frete) {
  return {
    trip_id: frete.trip_id, cte_id: frete.cte?.id || null, truck_id: frete.truck_id,
    deleted_at: frete.deleted_at ? frete.deleted_at.toISOString() : null,
  };
}

async function linkTrip(id, tripId, empresaId, req) {
  const { before, after } = await withLinkTransaction(async tx => {
    const before = await lockForLink(tx, id, empresaId);
    const trip = await tx.trip.findFirst({
      where: { id: tripId, empresa_id: empresaId, deleted_at: null, truck: { empresa_id: empresaId, deleted_at: null } },
    });
    if (!trip) throw ApiError.notFound('Viagem não encontrada.');
    if (before.trip_id || before.cte || before.status === 'CANCELADO') {
      throw ApiError.conflict('Frete indisponível para vínculo.');
    }
    await tx.freteTerceiro.update({
      where: { id, empresa_id: empresaId },
      data: { trip_id: tripId, truck_id: before.truck_id || trip.truck_id },
    });
    return { before, after: await getById(id, empresaId, {}, tx) };
  });
  await audit.log({ req, empresaId, entity: 'FRETE_TERCEIRO', action: 'UPDATE', entityId: id,
    before: linkAudit(before), after: linkAudit(after) });
  return after;
}

async function clearLink(id, empresaId, req, removing) {
  const { before, after } = await withLinkTransaction(async tx => {
    const before = await lockForLink(tx, id, empresaId);
    // O CT-e permanece na viagem com seus dados; só a referência ao frete é limpa.
    await tx.cte.updateMany({
      where: { frete_terceiro_id: id, trip: { empresa_id: empresaId } },
      data: { frete_terceiro_id: null },
    });
    const after = await tx.freteTerceiro.update({
      where: { id, empresa_id: empresaId },
      data: { trip_id: null, ...(removing ? { deleted_at: new Date() } : {}) },
      include: { cte: true, truck: { select: { id: true, placa: true } } },
    });
    return { before, after };
  });
  await audit.log({ req, empresaId, entity: 'FRETE_TERCEIRO', action: removing ? 'DELETE' : 'UPDATE', entityId: id,
    before: linkAudit(before), after: linkAudit(after) });
  if (before.cte) {
    await audit.log({ req, empresaId, entity: 'CTE', action: 'UPDATE', entityId: before.cte.id,
      before: { frete_terceiro_id: id }, after: { frete_terceiro_id: null } });
  }
  return after;
}

async function unlinkTrip(id, empresaId, req) {
  return clearLink(id, empresaId, req, false);
}

async function remove(id, empresaId, req) {
  return clearLink(id, empresaId, req, true);
}

module.exports = {
  list, summary, getById, create, update,
  baixar, removeBaixa,
  addAnexo, addAnexoFile, getAnexoFile, removeAnexo,
  linkTrip, unlinkTrip, remove, lockForLink, withLinkTransaction,
};
