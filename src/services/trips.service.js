const prisma = require('../config/database');
const ApiError = require('../utils/ApiError');
const audit = require('./audit.service');
const { lockForLink, withLinkTransaction } = require('./fretesTerceiros.service');

// Campos do anexo de viagem que NÃO podem voltar em listagens (Bytes pesado)
const TRIP_ANEXO_LIST_SELECT = {
  id: true, trip_id: true, tipo: true, nome: true, url: true,
  mime_type: true, tamanho: true, descricao: true, created_by_id: true,
  created_at: true,
};

// Whitelist explícito do que o cliente pode editar via PATCH/POST.
// Antes, `data` (= req.body) ia direto pro Prisma — abrindo brecha de
// mass-assignment (cliente podia mandar truck_id e mover viagem entre tenants).
// origem/destino sairam do whitelist: agora vem derivados do 1o CTE em runtime
// (deriveOrigemDestino mais abaixo). Campos legados no banco permanecem como
// fallback de display, mas nao podem mais ser editados via API.
const TRIP_PATCH_FIELDS = [
  'data_inicio', 'data_fim', 'carga', 'motorista',
  'km_total', 'status', 'adiantamento', 'observacoes',
  'km_inicial', 'km_final',
];
const TRIP_CREATE_FIELDS = [...TRIP_PATCH_FIELDS, 'imported_batch'];

function pick(src, fields) {
  const out = {};
  for (const f of fields) {
    if (src && Object.prototype.hasOwnProperty.call(src, f)) out[f] = src[f];
  }
  return out;
}

function normalizeTripFields(patch) {
  if (patch.data_inicio) patch.data_inicio = new Date(patch.data_inicio);
  if (patch.data_fim) patch.data_fim = new Date(patch.data_fim);
  // string vazia em motorista vira null (consistente com create() antigo)
  if (patch.motorista !== undefined) patch.motorista = patch.motorista || null;
  return patch;
}

// CTE/Fuel aninhados em payload de trip — também com whitelist explícito.
function normalizeCte(c) {
  return {
    data: c?.data ? new Date(c.data) : null,
    numero: c?.numero ?? null,
    origem: c?.origem ?? null,
    destino: c?.destino ?? null,
    valor: c?.valor ?? 0,
  };
}

function normalizeCtePatch(cte) {
  if (!cte || typeof cte !== 'object' || Array.isArray(cte)
      || (cte.id !== undefined && typeof cte.id !== 'string')
      || (cte.frete_terceiro_id != null && typeof cte.frete_terceiro_id !== 'string')) {
    throw ApiError.badRequest('CT-e e identificadores inválidos.');
  }
  return { ...normalizeCte(cte), id: cte.id, frete_terceiro_id: cte.frete_terceiro_id };
}

async function replaceCtes(tx, trip, empresaId, incoming) {
  // O snapshot Serializable delimita o conjunto de CT-es desta substituição.
  // Sempre fretes (ordenados por id) -> CT-es, inclusive para as exclusões.
  const freteIds = [...new Set([
    ...trip.ctes.map(cte => cte.frete_terceiro_id),
    ...incoming.map(cte => cte.frete_terceiro_id),
  ].filter(id => id != null))].sort();
  const fretes = new Map();
  for (const freteId of freteIds) {
    fretes.set(freteId, await lockForLink(tx, freteId, empresaId));
  }
  await tx.$queryRaw`
    SELECT c.id FROM ctes c JOIN trips t ON t.id = c.trip_id
    WHERE c.trip_id = ${trip.id} AND t.empresa_id = ${empresaId}
    ORDER BY c.id FOR UPDATE OF c
  `;

  const byId = new Map(trip.ctes.map(cte => [cte.id, cte]));
  const byFrete = new Map(trip.ctes.filter(cte => cte.frete_terceiro_id)
    .map(cte => [cte.frete_terceiro_id, cte]));
  const retained = new Set();
  const usedFretes = new Set();
  const rows = incoming.map(cte => {
    const existing = cte.id !== undefined ? byId.get(cte.id) : byFrete.get(cte.frete_terceiro_id);
    if (cte.id !== undefined && !existing) throw ApiError.notFound('CT-e não encontrado nesta viagem.');
    // Trocar/desfazer um vínculo existente usa a operação explícita de unlink.
    // Omitir o campo no PATCH nunca apaga a referência que está no banco.
    if (existing && cte.frete_terceiro_id !== undefined
        && cte.frete_terceiro_id !== existing.frete_terceiro_id) {
      throw ApiError.conflict('Desvincule o frete antes de alterar o vínculo do CT-e.');
    }
    const freteId = existing ? existing.frete_terceiro_id : (cte.frete_terceiro_id ?? null);
    if (existing && retained.has(existing.id)) throw ApiError.conflict('CT-e repetido na viagem.');
    if (freteId) {
      const frete = fretes.get(freteId);
      if (usedFretes.has(freteId)) throw ApiError.conflict('Frete repetido na viagem.');
      if (existing) {
        if (frete.trip_id !== trip.id || frete.cte?.id !== existing.id) {
          throw ApiError.conflict('O vínculo do frete mudou. Atualize a viagem.');
        }
      } else if (frete.trip_id || frete.cte || frete.status === 'CANCELADO') {
        throw ApiError.conflict('Frete indisponível para vínculo.');
      }
      usedFretes.add(freteId);
    }
    if (existing) retained.add(existing.id);
    return { id: existing?.id, freteId, data: normalizeCte(cte) };
  });

  const removedIds = trip.ctes.filter(cte => !retained.has(cte.id)).map(cte => cte.id);
  if (removedIds.length) {
    await tx.cte.deleteMany({ where: { id: { in: removedIds }, trip_id: trip.id } });
  }
  for (const row of rows) {
    if (row.id) {
      // Mantém a identidade, o FK e eventuais anexos do CT-e sobrevivente.
      await tx.cte.update({ where: { id: row.id, trip_id: trip.id }, data: row.data });
    } else {
      if (row.freteId) {
        await tx.freteTerceiro.update({
          where: { id: row.freteId, empresa_id: empresaId }, data: { trip_id: trip.id },
        });
      }
      await tx.cte.create({ data: { ...row.data, trip_id: trip.id, frete_terceiro_id: row.freteId } });
    }
  }
}

function normalizeFuel(f) {
  return {
    data: f?.data ? new Date(f.data) : null,
    litros: f?.litros ?? 0,
    preco_litro: f?.preco_litro ?? 0,
    posto_cnpj: f?.posto_cnpj ?? null,
    nota_fiscal: f?.nota_fiscal ?? null,
    km: f?.km == null || f.km === '' ? null : Math.round(Number(f.km)),
    valor_total: f?.valor_total ?? 0,
  };
}

// Origem/destino exibidos no card vem do 1o CTE (data ASC, created_at ASC).
// Fallback: campos legados origem/destino da Trip — viagens criadas antes
// desta mudanca ainda tem origem/destino digitados; mantemos como display
// quando nao ha CTE. Retorna { origem_calc, destino_calc } (nullable).
function deriveOrigemDestino(trip) {
  const ctes = Array.isArray(trip?.ctes) ? trip.ctes : [];
  if (ctes.length > 0) {
    const sorted = [...ctes].sort((a, b) => {
      const da = a.data ? new Date(a.data).getTime() : 0;
      const db = b.data ? new Date(b.data).getTime() : 0;
      if (da !== db) return da - db;
      const ca = a.created_at ? new Date(a.created_at).getTime() : 0;
      const cb = b.created_at ? new Date(b.created_at).getTime() : 0;
      return ca - cb;
    });
    const first = sorted[0];
    if (first?.origem || first?.destino) {
      return {
        origem_calc: first.origem || null,
        destino_calc: first.destino || null,
      };
    }
  }
  return {
    origem_calc: trip?.origem || null,
    destino_calc: trip?.destino || null,
  };
}

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

  const trips = await prisma.trip.findMany({
    where: { truck_id: truckId, deleted_at: null },
    include: {
      ctes: true,
      fuels: true,
      expenses: true,
      _count: { select: { trip_anexos: { where: { deleted_at: null } } } },
    },
    orderBy: { data_inicio: 'desc' },
  });
  return trips.map((t) => ({ ...t, ...deriveOrigemDestino(t) }));
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
  return { ...trip, ...deriveOrigemDestino(trip) };
}

async function create(truckId, empresaId, req, data) {
  await verifyTruckOwnership(truckId, empresaId);

  const tripData = normalizeTripFields(pick(data, TRIP_CREATE_FIELDS));
  const ctes = Array.isArray(data?.ctes) ? data.ctes.map(normalizeCte) : null;
  const fuels = Array.isArray(data?.fuels) ? data.fuels.map(normalizeFuel) : null;

  // Atomicidade: ou tudo entra, ou nada. Antes o front fazia N+M+1
  // requests separados — qualquer falha no meio deixava viagem
  // parcialmente preenchida.
  // Numero sequencial por empresa: MAX(numero)+1 dentro da transacao com
  // isolation Serializable pra dois creates concorrentes nao pegarem
  // o mesmo numero (unique [empresa_id, numero] no banco e a rede final
  // de seguranca).
  const trip = await prisma.$transaction(async (tx) => {
    const last = await tx.trip.findFirst({
      where: { empresa_id: empresaId },
      orderBy: { numero: 'desc' },
      select: { numero: true },
    });
    const proximoNumero = (last?.numero ?? 0) + 1;

    const created = await tx.trip.create({
      data: {
        ...tripData,
        truck_id: truckId,
        empresa_id: empresaId,
        numero: proximoNumero,
      },
    });
    if (ctes && ctes.length > 0) {
      await tx.cte.createMany({
        data: ctes.map((c) => ({ ...c, trip_id: created.id })),
      });
    }
    if (fuels && fuels.length > 0) {
      await tx.fuel.createMany({
        data: fuels.map((f) => ({ ...f, trip_id: created.id })),
      });
    }
    return tx.trip.findUnique({
      where: { id: created.id },
      include: { ctes: true, fuels: true, expenses: true },
    });
  }, {
    isolationLevel: 'Serializable',
  });

  await audit.log({ req, empresaId, entity: 'TRIP', action: 'CREATE', entityId: trip.id, before: null, after: trip });
  return { ...trip, ...deriveOrigemDestino(trip) };
}

async function update(id, empresaId, req, data) {
  if (!empresaId) throw ApiError.unauthorized('Empresa não identificada.');
  await verifyTripOwnership(id, empresaId);

  const tripPatch = normalizeTripFields(pick(data, TRIP_PATCH_FIELDS));
  // Semântica: se a chave `ctes`/`fuels` vier no body, é a lista COMPLETA
  // nova (replace all). Se não vier, não toca nas linhas existentes.
  const ctes = Array.isArray(data?.ctes) ? data.ctes.map(normalizeCtePatch) : null;
  const fuels = Array.isArray(data?.fuels) ? data.fuels.map(normalizeFuel) : null;

  const result = await withLinkTransaction(async (tx) => {
    const before = await tx.trip.findFirst({
      where: { id, empresa_id: empresaId, deleted_at: null, truck: { empresa_id: empresaId, deleted_at: null } },
      include: { ctes: true, fuels: true, expenses: true },
    });
    if (!before) throw ApiError.notFound('Viagem não encontrada.');

    if (ctes !== null) await replaceCtes(tx, before, empresaId, ctes);

    if (Object.keys(tripPatch).length > 0) {
      await tx.trip.update({ where: { id }, data: tripPatch });
    }

    if (fuels !== null) {
      await tx.fuel.deleteMany({ where: { trip_id: id } });
      if (fuels.length > 0) {
        await tx.fuel.createMany({
          data: fuels.map((f) => ({ ...f, trip_id: id })),
        });
      }
    }

    const after = await tx.trip.findUnique({
      where: { id },
      include: { ctes: true, fuels: true, expenses: true },
    });
    return { before, after };
  }, { isolationLevel: 'Serializable' });

  await audit.log({ req, empresaId, entity: 'TRIP', action: 'UPDATE', entityId: id,
    before: JSON.parse(JSON.stringify(result.before)), after: JSON.parse(JSON.stringify(result.after)) });
  return { ...result.after, ...deriveOrigemDestino(result.after) };
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
