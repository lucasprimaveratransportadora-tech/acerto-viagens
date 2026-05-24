const crypto = require('crypto');
const prisma = require('../config/database');
const ApiError = require('../utils/ApiError');
const audit = require('./audit.service');

// Campos do entry que NÃO podem voltar em listagens (bytea pesado)
const ENTRY_LIST_SELECT = {
  id: true, truck_id: true, data: true, historico: true, categoria: true,
  tipo: true, valor: true, observacoes: true,
  anexo_url: true, anexo_mime: true, anexo_tamanho: true, anexo_nome: true,
  imported_batch: true, created_by_id: true, created_at: true,
};

async function ensureTruck(truckId, empresaId) {
  const truck = await prisma.truck.findFirst({
    where: { id: truckId, empresa_id: empresaId, deleted_at: null },
  });
  if (!truck) throw ApiError.notFound('Caminhão não encontrado.');
  return truck;
}

/* ============================================================
   CRUD
   ============================================================ */

async function list(truckId, empresaId, filters = {}) {
  await ensureTruck(truckId, empresaId);
  const where = { truck_id: truckId, deleted_at: null };
  if (filters.tipo)      where.tipo = filters.tipo;
  if (filters.categoria) where.categoria = filters.categoria;
  if (filters.from || filters.to) {
    where.data = {};
    if (filters.from) where.data.gte = new Date(filters.from);
    if (filters.to)   where.data.lte = new Date(filters.to);
  }
  if (filters.q) {
    where.historico = { contains: filters.q, mode: 'insensitive' };
  }
  return prisma.truckLedgerEntry.findMany({
    where,
    orderBy: [{ data: 'asc' }, { created_at: 'asc' }],
    select: ENTRY_LIST_SELECT,
    take: filters.limit ? Math.min(Number(filters.limit), 5000) : 2000,
  });
}

async function getById(truckId, entryId, empresaId) {
  await ensureTruck(truckId, empresaId);
  const entry = await prisma.truckLedgerEntry.findFirst({
    where: { id: entryId, truck_id: truckId, deleted_at: null },
    select: ENTRY_LIST_SELECT,
  });
  if (!entry) throw ApiError.notFound('Lançamento não encontrado.');
  return entry;
}

async function create(truckId, empresaId, req, data) {
  await ensureTruck(truckId, empresaId);
  const entry = await prisma.truckLedgerEntry.create({
    data: {
      truck_id:      truckId,
      data:          new Date(data.data),
      historico:     data.historico,
      categoria:     data.categoria || 'OUTRO_CUSTO',
      tipo:          data.tipo,
      valor:         Number(data.valor || 0),
      observacoes:   data.observacoes || null,
      created_by_id: req.user.id,
    },
    select: ENTRY_LIST_SELECT,
  });
  await audit.log({ req, empresaId, entity: 'TRUCK_LEDGER', action: 'CREATE', entityId: entry.id, before: null, after: entry });
  return entry;
}

async function update(truckId, entryId, empresaId, req, data) {
  const before = await getById(truckId, entryId, empresaId);
  const patch = {};
  if (data.data !== undefined)        patch.data = new Date(data.data);
  if (data.historico !== undefined)   patch.historico = data.historico;
  if (data.categoria !== undefined)   patch.categoria = data.categoria;
  if (data.tipo !== undefined)        patch.tipo = data.tipo;
  if (data.valor !== undefined)       patch.valor = Number(data.valor);
  if (data.observacoes !== undefined) patch.observacoes = data.observacoes || null;
  const after = await prisma.truckLedgerEntry.update({
    where: { id: entryId },
    data: patch,
    select: ENTRY_LIST_SELECT,
  });
  await audit.log({ req, empresaId, entity: 'TRUCK_LEDGER', action: 'UPDATE', entityId: entryId, before, after });
  return after;
}

async function remove(truckId, entryId, empresaId, req) {
  const before = await getById(truckId, entryId, empresaId);
  await prisma.truckLedgerEntry.update({
    where: { id: entryId },
    data: { deleted_at: new Date() },
  });
  await audit.log({ req, empresaId, entity: 'TRUCK_LEDGER', action: 'DELETE', entityId: entryId, before, after: null });
  return { ok: true };
}

/* ============================================================
   ANEXO (upload/download)
   ============================================================ */

async function addAnexoFile(truckId, entryId, empresaId, req, file, meta) {
  const before = await getById(truckId, entryId, empresaId);
  if (!file || !file.buffer) throw ApiError.badRequest('Arquivo obrigatório.');
  const nome = (meta?.nome && meta.nome.trim()) || file.originalname || 'anexo';
  const after = await prisma.truckLedgerEntry.update({
    where: { id: entryId },
    data: {
      anexo_url:     null,
      anexo_dados:   file.buffer,
      anexo_mime:    file.mimetype || 'application/octet-stream',
      anexo_tamanho: file.size || file.buffer.length,
      anexo_nome:    nome,
    },
    select: ENTRY_LIST_SELECT,
  });
  await audit.log({ req, empresaId, entity: 'TRUCK_LEDGER', action: 'UPDATE', entityId: entryId, before, after });
  return after;
}

async function addAnexoUrl(truckId, entryId, empresaId, req, body) {
  const before = await getById(truckId, entryId, empresaId);
  if (!body.url)  throw ApiError.badRequest('URL obrigatória.');
  if (!body.nome) throw ApiError.badRequest('Nome obrigatório.');
  const after = await prisma.truckLedgerEntry.update({
    where: { id: entryId },
    data: {
      anexo_url:     body.url,
      anexo_dados:   null,
      anexo_mime:    null,
      anexo_tamanho: null,
      anexo_nome:    body.nome,
    },
    select: ENTRY_LIST_SELECT,
  });
  await audit.log({ req, empresaId, entity: 'TRUCK_LEDGER', action: 'UPDATE', entityId: entryId, before, after });
  return after;
}

async function getAnexoFile(truckId, entryId, empresaId) {
  await ensureTruck(truckId, empresaId);
  const entry = await prisma.truckLedgerEntry.findFirst({
    where: { id: entryId, truck_id: truckId, deleted_at: null },
  });
  if (!entry) throw ApiError.notFound('Lançamento não encontrado.');
  if (!entry.anexo_dados) throw ApiError.notFound('Este anexo é um link externo, abra pela URL.');
  return entry;
}

async function removeAnexo(truckId, entryId, empresaId, req) {
  const before = await getById(truckId, entryId, empresaId);
  const after = await prisma.truckLedgerEntry.update({
    where: { id: entryId },
    data: {
      anexo_url: null, anexo_dados: null, anexo_mime: null,
      anexo_tamanho: null, anexo_nome: null,
    },
    select: ENTRY_LIST_SELECT,
  });
  await audit.log({ req, empresaId, entity: 'TRUCK_LEDGER', action: 'UPDATE', entityId: entryId, before, after });
  return { ok: true };
}

/* ============================================================
   SUMMARY (KPIs + payback + byMonth)
   ============================================================ */

async function summary(truckId, empresaId) {
  const truck = await ensureTruck(truckId, empresaId);
  const saldoInicial = Number(truck.saldo_inicial || 0);
  const rows = await prisma.truckLedgerEntry.findMany({
    where: { truck_id: truckId, deleted_at: null },
    orderBy: { data: 'asc' },
    select: { data: true, tipo: true, valor: true },
  });

  let totalDebito = 0, totalCredito = 0;
  for (const r of rows) {
    const v = Number(r.valor);
    if (r.tipo === 'CREDITO') totalCredito += v;
    else                       totalDebito  += v;
  }
  // Saldo total considera o histórico anterior ao livro.
  const saldo = saldoInicial + totalCredito - totalDebito;
  // Percentual pago: quanto do total investido já foi coberto pelo (saldo
  // inicial + créditos). Limitado a 100%.
  const pctPago = totalDebito > 0
    ? Math.min(100, ((saldoInicial + totalCredito) / totalDebito) * 100)
    : (saldoInicial >= 0 ? 100 : 0);

  // byMonth: agrupa por YYYY-MM. O saldo acumulado parte do saldo_inicial,
  // então uma série que começa positiva permanece positiva.
  const monthMap = new Map();
  for (const r of rows) {
    const d = new Date(r.data);
    const key = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
    if (!monthMap.has(key)) monthMap.set(key, { mes: key, debito: 0, credito: 0 });
    const m = monthMap.get(key);
    const v = Number(r.valor);
    if (r.tipo === 'CREDITO') m.credito += v;
    else                       m.debito  += v;
  }
  const byMonth = Array.from(monthMap.values()).sort((a, b) => a.mes.localeCompare(b.mes));
  let acc = saldoInicial;
  for (const m of byMonth) {
    acc += m.credito - m.debito;
    m.saldo_acumulado = acc;
  }

  // paid_at: se já começa positivo (saldoInicial >= 0 e houver débitos),
  // considera pago desde a primeira data; senão, primeira data em que
  // saldo acumulado cruza zero.
  let paid_at = null;
  let accSerial = saldoInicial;
  if (saldoInicial >= 0 && totalDebito > 0 && rows.length) {
    // Caminhão já trazia saldo positivo e há débitos no livro: paid_at é
    // a primeira data se o acumulado nunca ficar negativo.
    let nuncaNeg = true;
    let probe = saldoInicial;
    for (const r of rows) {
      probe += r.tipo === 'CREDITO' ? Number(r.valor) : -Number(r.valor);
      if (probe < 0) { nuncaNeg = false; break; }
    }
    if (nuncaNeg) paid_at = rows[0].data;
  }
  if (!paid_at) {
    accSerial = saldoInicial;
    for (const r of rows) {
      const v = Number(r.valor);
      accSerial += r.tipo === 'CREDITO' ? v : -v;
      if (accSerial >= 0 && totalDebito > 0) { paid_at = r.data; break; }
    }
  }

  // payback_estimado: se não pago, média positiva dos últimos 6 meses
  let payback_estimado = null;
  if (!paid_at && saldo < 0) {
    const last6 = byMonth.slice(-6);
    const positives = last6.map(m => m.credito - m.debito).filter(v => v > 0);
    if (positives.length) {
      const media = positives.reduce((a, b) => a + b, 0) / positives.length;
      if (media > 0) {
        const meses = Math.ceil(Math.abs(saldo) / media);
        const d = new Date();
        d.setMonth(d.getMonth() + meses);
        payback_estimado = d.toISOString().slice(0, 10);
      }
    }
  }

  return { saldoInicial, totalDebito, totalCredito, saldo, pctPago, paid_at, payback_estimado, byMonth };
}

/* ============================================================
   OVERVIEW (grid principal — uma linha por caminhão da empresa)
   ============================================================ */

async function overview(empresaId) {
  const trucks = await prisma.truck.findMany({
    where: { empresa_id: empresaId, deleted_at: null },
    orderBy: { placa: 'asc' },
    select: { id: true, placa: true, modelo: true, motorista: true, carreta_placa: true, saldo_inicial: true },
  });
  const grouped = await prisma.truckLedgerEntry.groupBy({
    by: ['truck_id', 'tipo'],
    where: {
      deleted_at: null,
      truck: { empresa_id: empresaId, deleted_at: null },
    },
    _sum: { valor: true },
  });
  const byTruck = {};
  for (const g of grouped) {
    if (!byTruck[g.truck_id]) byTruck[g.truck_id] = { debito: 0, credito: 0 };
    const s = Number(g._sum.valor || 0);
    if (g.tipo === 'CREDITO') byTruck[g.truck_id].credito += s;
    else                       byTruck[g.truck_id].debito  += s;
  }
  return trucks.map(t => {
    const agg = byTruck[t.id] || { debito: 0, credito: 0 };
    const saldoInicial = Number(t.saldo_inicial || 0);
    const saldo = saldoInicial + agg.credito - agg.debito;
    const pctPago = agg.debito > 0
      ? Math.min(100, ((saldoInicial + agg.credito) / agg.debito) * 100)
      : (saldoInicial >= 0 ? 100 : 0);
    let status = 'SEM_DADOS';
    if (agg.debito > 0 || agg.credito > 0 || saldoInicial !== 0) {
      status = saldo >= 0 ? 'PAGO' : 'EM_PAYBACK';
    }
    return {
      truck_id: t.id,
      placa: t.placa,
      modelo: t.modelo,
      motorista: t.motorista,
      carreta_placa: t.carreta_placa,
      saldoInicial,
      totalDebito:  agg.debito,
      totalCredito: agg.credito,
      saldo,
      pctPago,
      status,
    };
  });
}

/* ============================================================
   IMPORT XLSX
   ============================================================ */

// Regras de classificação por regex sobre o histórico.
// Refinadas após análise das 21 abas da planilha do pai do usuário
// (7.1k lançamentos) — cobertura ~88% após as adições abaixo.
const REGEX_CATEGORIA = [
  // Créditos / receitas (vêm primeiro)
  { re: /\bACERTO\s+CTE\b|\bACERTO\s+.*ATACAD/i,   cat: 'ACERTO_CTE',           tipoForce: 'CREDITO' },
  { re: /\bCARGILL\b|\bATACAD/i,                    cat: 'ACERTO_CTE',           tipoForce: 'CREDITO' },
  { re: /\bACERTO\s+\d|\bCT[-\s]*E\s*\d|\bCTE\s*\d/i, cat: 'ACERTO_CTE',         tipoForce: 'CREDITO' },

  // Aquisição (compra + financiamento + acessórios estruturais)
  { re: /\bFINANCIAMENTO|\bFIANCIAMENTO|\bPARCELA\b|\bITAU\b.*\d+\/\d+|\bSICOOB\b.*\d+\/\d+|\bCONS[ÓO]RCIO/i, cat: 'AQUISICAO' },
  { re: /\bPAGTO\s+CAV|\bPAGTO\s+CAVELO|\bCOMPRA\s+CAVAL|\bCAVALO\s+ITAU/i, cat: 'AQUISICAO' },
  { re: /\bBA[ÚU]\b|\bFACCHINI|\bRANDON|\bPAGTO.*BA[ÚU]|\b%\s+DO\s+BA[ÚU]|\bNF\s+TANQUE|\bTANQUE\s+ADICIONAL|\bTANQUE\s+COMBUS/i, cat: 'AQUISICAO' },
  { re: /\bCOMPRA\s+CAMINH|\bCOMPRA\s+TANQUE|\bCOMPRA\s+CARRETA|\bEMPLACAMENTO|\bINMETRO|\bAEROF[ÓO]LIO|\bADESIVOS|\bPELICULA|\bP[ÉE]LICULA/i, cat: 'AQUISICAO' },
  { re: /\bPAINTURA|\bPINTURA\s+RODAS|\bPINTURA\s+CAB|\bPINTURA\s+BA[ÚU]/i, cat: 'AQUISICAO' },

  // Impostos / taxas / despachante
  { re: /\bIPVA\b/i,                                cat: 'IPVA' },
  { re: /\bDESPACHANTE|\bTAXA\s+ADES[ÃA]O|\bTAXA\s+ADMINIST|\bSICOOB\s+TAXA|\bMEGATRANZ|\bINCLUS[ÃA]O\s+ANTT|\bRENOVA[ÇC][ÃA]O\s+ANTT|\bGRAVAME|\bALIENA[ÇC][ÃA]O|\bTAXA\s+RASTREADOR/i, cat: 'DESPACHANTE_TAXAS' },

  // Seguro
  { re: /\bSEGURO\b|\bHDI\b|\bASTRACO\b|\bAKAD\b|\bTOKIA\s+MARINE/i, cat: 'SEGURO' },

  // Pneu / borracharia
  { re: /\bPNEU|\bMICHELIN|\bMICHILAN|\bCARAJAS|\bBORRACHARIA|\bMASTER\s+PNEUS|\bRESSOLAGEM|\bRECAUCHU/i, cat: 'PNEU' },

  // Rastreador
  { re: /\bRASTREADOR|\bAUTOTRAC|\bONIX\b|\bLOCALIZADOR|\bMENSALIDADE\s+RASTR/i, cat: 'RASTREADOR' },

  // Pedágio
  { re: /\bPED[ÁA]GIO|\bREPOM\b|\bSEM\s*PARAR|\bCONECTCAR/i, cat: 'PEDAGIO_AVULSO' },

  // Abastecimento avulso
  { re: /\bABASTECIMENTO|\bPOSTO\b|\bDIESEL\b|\bCOMBUST[IÍ]VEL/i, cat: 'ABASTECIMENTO_AVULSO' },

  // Manutenção (oficinas + serviços + peças)
  { re: /\bMANUTEN|\bDACARI|\bSOMAFERTIL|\bCASTRILLON|\b[ÓO]LEO|\bFILTRO/i, cat: 'MANUTENCAO' },
  { re: /\bMR\s+AUTO\s+EL[ÉE]TRICA|\bAUTO\s*EL[ÉE]TRICA|\bAUTOEL[ÉE]TRICA/i, cat: 'MANUTENCAO' },
  { re: /\bBRASIL\s+MANGUEIRAS|\bLG\s+MANGUEIRAS|\bMANGUEIR/i, cat: 'MANUTENCAO' },
  { re: /\bTORNEADORA|\bHORIZONTE\b|\bEUROEX|\bGAIOLATA|\bRODOPONTA|\bCATARINA/i, cat: 'MANUTENCAO' },
  { re: /\bALINHAR|\bCASTER|\bRETROVISOR|\bPARA[\s-]*BRISA|\bLAVAGEM|\bLAVADA|\bGRAXA|\bSOLDA|\bCHAVE\s+TIC\s*TAC|\bL[ÂA]MPADA|\bFUS[IÍ]VEL/i, cat: 'MANUTENCAO' },
  { re: /\bSUSPENSAO|\bLONA\s+FREIO|\bARREBITE|\bDISCO\s+FREIO|\bPASTILHA|\bROLAMENTO|\bENGATE|\bV[ÁA]LVULA|\bBOMBA\b|\bC[ÂA]MBIO|\bEMBREAG/i, cat: 'MANUTENCAO' },
  { re: /\bAFERI[ÇC][ÃA]O\s+TAC[ÓO]GRAFO|\bTAC[ÓO]GRAFO/i, cat: 'MANUTENCAO' },
  { re: /\bFREIO|\bFRENAGEM|\bFLEX[ÍI]VEL/i, cat: 'MANUTENCAO' },
  { re: /\bSTRAD[ÃA]O|\bBATER\s+AUTO|\bDR\s+FREIOS|\bMR\s+AUITO/i, cat: 'MANUTENCAO' }, // oficinas locais (typo AUITO incluso)
  { re: /\bVULCANIZ/i, cat: 'PNEU' },
  { re: /\bLAVA[\s-]?JATO|\bLAVA\s+JATO/i, cat: 'MANUTENCAO' },
  { re: /\bBATERIA|\bELETRIC|\bEL[ÉE]TRIC/i, cat: 'MANUTENCAO' },
  { re: /\bPARALAMA|\bREFIL\s+PALHA|\bCLIMATIZADOR|\bVAR[ÃA]O|\bLANTERNA|\bCABO\s+ESPIRAL/i, cat: 'MANUTENCAO' },
  { re: /\bBA[ÚU]S\b|\bCONSERTO\s+BA|\bBAUS\s+RIO\s+VERDE|\bCASA\s+DO\s+DECK|\bMADERIT|\bPORTA\s+LATERAL/i, cat: 'MANUTENCAO' },
  { re: /\bCONSERTO|\bREPARO|\bSERVI[ÇC]O\s+EL[ÉE]TR|\bWASHINGTON/i, cat: 'MANUTENCAO' },
  { re: /\bPACHECO\s+FOTOS|\bFOTOS\s+TANQUE/i, cat: 'AQUISICAO' },
];

function classify(historico, hasCredito) {
  for (const r of REGEX_CATEGORIA) {
    if (r.re.test(historico)) {
      return { categoria: r.cat, tipo: r.tipoForce || (hasCredito ? 'CREDITO' : 'DEBITO') };
    }
  }
  return { categoria: hasCredito ? 'OUTRA_RECEITA' : 'OUTRO_CUSTO', tipo: hasCredito ? 'CREDITO' : 'DEBITO' };
}

// Converte número serial do Excel (1900-based) em Date
function excelSerialToDate(n) {
  if (n instanceof Date) return n;
  if (typeof n === 'string') {
    const d = new Date(n);
    if (!isNaN(d)) return d;
    return null;
  }
  if (typeof n !== 'number') return null;
  // Excel: 1 = 1900-01-01 (com bug do 1900-02-29 — desconta 2)
  const ms = (n - 25569) * 86400 * 1000;
  return new Date(ms);
}

function normalizePlaca(s) {
  return String(s || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
}

async function importXlsx(empresaId, req, file, options = {}) {
  if (!file || !file.buffer) throw ApiError.badRequest('Arquivo XLSX obrigatório.');
  let XLSX;
  try { XLSX = require('xlsx'); }
  catch { throw new ApiError(500, 'Biblioteca xlsx não instalada no servidor.'); }

  const wb = XLSX.read(file.buffer, { type: 'buffer', cellDates: true });

  // Lista caminhões da empresa pra fazer match por placa
  const trucks = await prisma.truck.findMany({
    where: { empresa_id: empresaId, deleted_at: null },
    select: { id: true, placa: true },
  });
  const trucksByPlate = new Map(trucks.map(t => [normalizePlaca(t.placa), t]));

  const batch_id = crypto.randomUUID();
  const results = [];
  const truckIdFilter = options.truck_id || null; // se especificado, importa só pra esse caminhão

  for (const sheetName of wb.SheetNames) {
    if (/menu/i.test(sheetName)) continue;
    const placaKey = normalizePlaca(sheetName);
    const truck = trucksByPlate.get(placaKey);
    if (!truck) {
      results.push({ sheet: sheetName, status: 'sem-caminhao-correspondente', criados: 0, ignorados: 0 });
      continue;
    }
    if (truckIdFilter && truck.id !== truckIdFilter) continue;

    const ws = wb.Sheets[sheetName];
    const aoa = XLSX.utils.sheet_to_json(ws, { header: 1, defval: null, raw: true });

    // Acha linha de cabeçalho
    let headerRow = -1;
    for (let i = 0; i < Math.min(aoa.length, 15); i++) {
      const row = aoa[i] || [];
      const txt = row.map(c => String(c || '')).join('|').toUpperCase();
      if (txt.includes('DATA') && txt.includes('HIST') && (txt.includes('DEBITO') || txt.includes('DÉBITO'))) {
        headerRow = i;
        break;
      }
    }
    if (headerRow < 0) {
      results.push({ sheet: sheetName, status: 'cabecalho-nao-encontrado', criados: 0, ignorados: 0 });
      continue;
    }

    // Já carrega entries existentes pra detectar duplicatas
    const existing = await prisma.truckLedgerEntry.findMany({
      where: { truck_id: truck.id, deleted_at: null },
      select: { data: true, historico: true, valor: true },
    });
    const existingKeys = new Set(existing.map(e => `${e.data.toISOString().slice(0,10)}|${Number(e.valor).toFixed(2)}|${e.historico.trim().slice(0,80)}`));

    // Detecta linha de SALDO INICIAL imediatamente após o header.
    // Padrão da planilha: data/histórico/débito/crédito vazios e SALDO
    // (col E) preenchido — fórmula da próxima linha é =Eanterior-C+D.
    let saldoInicialDetectado = null;
    let saldoInicialRow = -1;
    for (let k = headerRow + 1; k < Math.min(aoa.length, headerRow + 5); k++) {
      const r = aoa[k] || [];
      const [dt, hist, deb, cred, saldo] = r;
      const semData = dt == null || dt === '';
      const semHist = !hist || String(hist).trim() === '';
      const debZero  = !deb  || Number(deb)  === 0;
      const credZero = !cred || Number(cred) === 0;
      const saldoNum = Number(saldo);
      if (semData && semHist && debZero && credZero && !isNaN(saldoNum) && saldo !== null && saldo !== '') {
        saldoInicialDetectado = saldoNum;
        saldoInicialRow = k;
        break;
      }
      // Se já achou uma linha com data válida, para de procurar
      if (!semData) break;
    }
    if (saldoInicialDetectado !== null) {
      await prisma.truck.update({
        where: { id: truck.id },
        data:  { saldo_inicial: saldoInicialDetectado },
      });
    }

    const toCreate = [];
    let ignorados = 0;
    let datasInvalidas = 0;
    const MIN_YEAR = 2010, MAX_YEAR = 2030;
    for (let i = headerRow + 1; i < aoa.length; i++) {
      if (i === saldoInicialRow) continue;  // pula a linha do saldo inicial
      const row = aoa[i] || [];
      const [data, historico, debito, credito] = row;
      if (data == null && !historico) continue;
      const d = excelSerialToDate(data);
      if (!d) continue;
      const ano = d.getUTCFullYear();
      if (ano < MIN_YEAR || ano > MAX_YEAR) {
        // Célula com data corrompida do Excel — ignora silenciosamente
        datasInvalidas++;
        continue;
      }
      const hist = String(historico || '').trim();
      if (!hist) continue;
      const debitoN  = Number(debito  || 0);
      const creditoN = Number(credito || 0);
      const hasCred  = creditoN > 0.001;
      const valor    = hasCred ? creditoN : debitoN;
      if (valor <= 0) continue;

      const { categoria, tipo } = classify(hist, hasCred);
      const key = `${d.toISOString().slice(0,10)}|${valor.toFixed(2)}|${hist.slice(0,80)}`;
      if (existingKeys.has(key)) { ignorados++; continue; }
      existingKeys.add(key);

      toCreate.push({
        truck_id:       truck.id,
        data:           d,
        historico:      hist.slice(0, 500),
        categoria,
        tipo,
        valor,
        imported_batch: batch_id,
        created_by_id:  req.user.id,
      });
    }

    let criados = 0;
    if (toCreate.length) {
      const r = await prisma.truckLedgerEntry.createMany({ data: toCreate, skipDuplicates: true });
      criados = r.count;
    }
    results.push({
      sheet: sheetName, truck_id: truck.id, placa: truck.placa,
      criados, ignorados, datas_invalidas: datasInvalidas,
      saldo_inicial_detectado: saldoInicialDetectado,
    });
  }

  await audit.log({
    req, empresaId, entity: 'TRUCK_LEDGER', action: 'CREATE',
    entityId: batch_id,
    before: null,
    after: { batch_id, results },
  });

  return { batch_id, results, total_criados: results.reduce((s, r) => s + r.criados, 0), total_ignorados: results.reduce((s, r) => s + r.ignorados, 0) };
}

async function undoImport(empresaId, req, batchId) {
  // Confirma que o batch pertence a entries de trucks da empresa
  const sample = await prisma.truckLedgerEntry.findFirst({
    where: { imported_batch: batchId, deleted_at: null },
    include: { truck: { select: { empresa_id: true } } },
  });
  if (!sample) throw ApiError.notFound('Lote de importação não encontrado.');
  if (sample.truck.empresa_id !== empresaId) throw ApiError.notFound('Lote de importação não encontrado.');

  const r = await prisma.truckLedgerEntry.updateMany({
    where: { imported_batch: batchId, deleted_at: null },
    data:  { deleted_at: new Date() },
  });
  await audit.log({
    req, empresaId, entity: 'TRUCK_LEDGER', action: 'DELETE',
    entityId: batchId,
    before: { batch_id: batchId, count: r.count },
    after: null,
  });
  return { ok: true, removidos: r.count };
}

module.exports = {
  list, getById, create, update, remove,
  addAnexoFile, addAnexoUrl, getAnexoFile, removeAnexo,
  summary, overview,
  importXlsx, undoImport,
};
