// trips.js — Trip detail rendering and inline editing

import { api } from './api.js';
import { state, DESP } from './state.js';
import { fmt, fmtD, esc, calcFrete, calcDesp } from './utils.js';

// ==================== DETAIL BUILD ====================

export function buildDetail(tr) {
  const frete = calcFrete(tr);
  const despTotal = calcDesp(tr);
  const adto = parseFloat(tr.adiantamento || 0);
  const saldo = frete - despTotal;

  const fuels = tr.fuels || [];
  const totL = fuels.reduce((s, f) => s + parseFloat(f.litros || 0), 0);
  const totFuelVal = fuels.reduce((s, f) => s + parseFloat(f.valor_total || 0), 0);
  const kmIni = parseFloat(tr.km_inicial || 0);
  const kmFin = parseFloat(tr.km_final || 0);
  const kmPerc = kmFin > kmIni ? kmFin - kmIni : 0;
  const media = (totL > 0 && kmPerc > 0) ? (kmPerc / totL).toFixed(2) + ' km/L' : '\u2014';

  // Build expense lookup from array
  const despMap = {};
  (tr.expenses || []).forEach(e => { despMap[e.categoria] = parseFloat(e.valor || 0); });

  let h = `<div class="detail-grid">`;

  // ---- Faixa info no topo (editável inline) ----
  const isoDate = (d) => d ? String(d).slice(0, 10) : '';
  const tid = esc(tr.id);
  h += `<div class="trip-info-bar" style="grid-column:1/-1">
    <div class="trip-info-item">
      <span class="trip-info-lbl">📅 Início *</span>
      <input type="date" class="trip-info-input" value="${isoDate(tr.data_inicio)}"
        onchange="inlineUpdateTrip('${tid}','data_inicio',this.value,this)" title="Data de início da viagem">
    </div>
    <div class="trip-info-item">
      <span class="trip-info-lbl">🏁 Fim</span>
      <input type="date" class="trip-info-input" value="${isoDate(tr.data_fim)}"
        onchange="inlineUpdateTrip('${tid}','data_fim',this.value,this)" title="Data de retorno (deixe vazio se em curso)">
    </div>
    <div class="trip-info-item">
      <span class="trip-info-lbl">👤 Motorista</span>
      <input type="text" class="trip-info-input" value="${esc(tr.motorista || '')}" maxlength="120"
        placeholder="${esc(tr.truck?.motorista || 'Quem rodou')}"
        onchange="inlineUpdateTrip('${tid}','motorista',this.value,this)" title="Motorista da viagem">
    </div>
    <div class="trip-info-item">
      <span class="trip-info-lbl">📍 KM Inicial</span>
      <input type="number" class="trip-info-input" value="${tr.km_inicial || ''}"
        placeholder="ex: 152000"
        onchange="inlineUpdateTrip('${tid}','km_inicial',this.value,this)" onfocus="this.select()" title="KM do hodômetro na saída">
    </div>
    <div class="trip-info-item">
      <span class="trip-info-lbl">🏁 KM Final</span>
      <input type="number" class="trip-info-input" value="${tr.km_final || ''}"
        placeholder="ex: 154500"
        onchange="inlineUpdateTrip('${tid}','km_final',this.value,this)" onfocus="this.select()" title="KM do hodômetro na chegada">
    </div>
    <div class="trip-info-item">
      <span class="trip-info-lbl">🛣️ Percorridos</span>
      <span class="trip-info-val" style="color:var(--accent)">${kmPerc > 0 ? kmPerc.toLocaleString('pt-BR') + ' km' : '—'}</span>
    </div>
    <div class="trip-info-item">
      <span class="trip-info-lbl">⛽ Média</span>
      <span class="trip-info-val" style="color:var(--info)">${media}</span>
    </div>
  </div>`;

  // ---- CTEs ----
  h += `<div class="detail-section"><div class="detail-section-hdr"><span class="detail-section-title">&#x1F4C4; CTes / Fretes</span><span class="detail-section-total val pos">R$ ${fmt(frete)}</span></div>`;
  if (tr.ctes && tr.ctes.length) {
    h += `<div class="cte-list">`;
    tr.ctes.forEach(c => {
      h += `<div class="cte-row">
        <span class="cte-date">${fmtD(c.data)}</span>
        <span class="cte-num">${esc(c.numero || '\u2014')}</span>
        <span class="cte-route-lbl">${esc(c.origem || '')}${c.destino ? ' \u2192 ' + esc(c.destino) : ''}</span>
        <span class="cte-val">R$ ${fmt(c.valor)}</span>
        <button class="inline-del" onclick="event.stopPropagation();inlineRemoveCte('${esc(tr.id)}','${esc(c.id)}')" title="Remover">\u2715</button>
      </div>`;
    });
    h += `</div>`;
  } else {
    h += `<div style="padding:.6rem;text-align:center;font-size:.72rem;color:var(--muted)">Nenhum CTE registrado</div>`;
  }
  h += `<div class="inline-add-row">
    <input type="date" id="inCteDate_${esc(tr.id)}" class="inline-input" style="width:110px">
    <input type="text" id="inCteNum_${esc(tr.id)}" class="inline-input" placeholder="N\u00BA CTE" style="width:85px">
    <input type="text" id="inCteOri_${esc(tr.id)}" class="inline-input" placeholder="Origem" style="width:85px">
    <input type="text" id="inCteDst_${esc(tr.id)}" class="inline-input" placeholder="Destino" style="width:85px">
    <input type="number" id="inCteVal_${esc(tr.id)}" class="inline-input" placeholder="Valor" step="0.01" style="width:85px">
    <button class="btn btn-accent btn-sm" onclick="event.stopPropagation();inlineSaveCte('${esc(tr.id)}')">+ CTE</button>
  </div>`;
  h += `</div>`;

  // ---- Abastecimentos ----
  h += `<div class="detail-section"><div class="detail-section-hdr"><span class="detail-section-title">&#x26FD; Abastecimentos</span><span class="detail-section-total" style="color:var(--info)">R$ ${fmt(totFuelVal)} \u00B7 ${totL.toLocaleString('pt-BR', { maximumFractionDigits: 1 })}L</span></div>`;

  if (kmPerc > 0) {
    h += `<div style="display:flex;gap:1.5rem;padding:.35rem .75rem;background:rgba(56,189,248,.05);border-bottom:1px solid rgba(255,255,255,.04);font-size:.72rem;font-family:'IBM Plex Mono',monospace">
      <span style="color:var(--muted)">KM Inicial: <strong style="color:var(--text)">${kmIni.toLocaleString('pt-BR')}</strong></span>
      <span style="color:var(--muted)">KM Final: <strong style="color:var(--text)">${kmFin.toLocaleString('pt-BR')}</strong></span>
      <span style="color:var(--muted)">Percorridos: <strong style="color:var(--accent)">${kmPerc.toLocaleString('pt-BR')} km</strong></span>
      <span style="color:var(--muted)">M\u00E9dia: <strong style="color:var(--accent)">${media}</strong></span>
    </div>`;
  }

  if (fuels.length) {
    h += `<table class="mini-table"><thead><tr><th>Data</th><th>Litros</th><th>R$/L</th><th>Posto</th><th>Nota Fiscal</th><th>KM</th><th>Valor</th><th></th></tr></thead><tbody>`;
    fuels.forEach(f => {
      const pl = parseFloat(f.preco_litro || 0);
      const litF = parseFloat(f.litros || 0);
      const valF = parseFloat(f.valor_total || 0);
      const precoCalc = pl > 0 ? pl : (litF > 0 && valF > 0 ? (valF / litF) : 0);
      h += `<tr>
        <td style="font-family:'IBM Plex Mono',monospace;color:var(--accent);font-size:.7rem">${fmtD(f.data)}</td>
        <td style="font-family:'IBM Plex Mono',monospace">${litF.toLocaleString('pt-BR', { maximumFractionDigits: 2 })}L</td>
        <td style="font-family:'IBM Plex Mono',monospace;color:var(--info)">${precoCalc > 0 ? 'R$ ' + fmt(precoCalc) : '\u2014'}</td>
        <td style="color:var(--muted)">${esc(f.posto_cnpj || '\u2014')}</td>
        <td style="color:var(--muted);font-size:.7rem">${esc(f.nota_fiscal || '\u2014')}</td>
        <td style="font-family:'IBM Plex Mono',monospace;color:var(--muted)">${f.km ? parseInt(f.km).toLocaleString('pt-BR') + 'km' : '\u2014'}</td>
        <td class="val neu">R$ ${fmt(f.valor_total)}</td>
        <td><button class="inline-del" onclick="event.stopPropagation();inlineRemoveFuel('${esc(tr.id)}','${esc(f.id)}')" title="Remover">\u2715</button></td>
      </tr>`;
    });
    h += `<tr><td colspan="6" style="text-align:right;color:var(--muted);font-size:.68rem;padding:.3rem .75rem">${media !== '\u2014' ? 'M\u00E9dia: ' + media : ''}</td><td class="val pos" style="padding:.3rem .75rem">R$ ${fmt(totFuelVal)}</td><td></td></tr>`;
    h += `</tbody></table>`;
  } else {
    h += `<div style="padding:.6rem;text-align:center;font-size:.72rem;color:var(--muted)">Nenhum abastecimento</div>`;
  }

  h += `<div class="inline-add-row">
    <input type="date" id="inFuelDate_${esc(tr.id)}" class="inline-input" style="width:110px">
    <input type="number" id="inFuelLit_${esc(tr.id)}" class="inline-input" placeholder="Litros" step="0.01" style="width:70px" oninput="inlineAutoCalcFuel('${esc(tr.id)}','litros')">
    <input type="number" id="inFuelPreco_${esc(tr.id)}" class="inline-input" placeholder="R$/L" step="0.01" style="width:70px" oninput="inlineAutoCalcFuel('${esc(tr.id)}','preco')">
    <input type="text" id="inFuelPosto_${esc(tr.id)}" class="inline-input" placeholder="Posto/CNPJ" style="width:100px">
    <input type="text" id="inFuelNf_${esc(tr.id)}" class="inline-input" placeholder="NF" style="width:75px">
    <input type="number" id="inFuelKm_${esc(tr.id)}" class="inline-input" placeholder="KM" style="width:70px">
    <input type="number" id="inFuelVal_${esc(tr.id)}" class="inline-input" placeholder="Valor" step="0.01" style="width:80px" oninput="inlineAutoCalcFuel('${esc(tr.id)}','valor')">
    <button class="btn btn-accent btn-sm" onclick="event.stopPropagation();inlineSaveFuel('${esc(tr.id)}')">+ Abast.</button>
  </div>`;
  h += `</div></div>`;

  // ---- Despesas ----
  h += `<div class="detail-section" style="grid-column:1/-1"><div class="detail-section-hdr"><span class="detail-section-title">&#x1F4B8; Despesas</span><span class="detail-section-total val neg" id="inlineDespTotal_${esc(tr.id)}">R$ ${fmt(despTotal)}</span></div><div class="desp-grid">`;
  DESP.forEach(dk => {
    // ABASTECIMENTO = soma automática dos abastecimentos lançados (readonly).
    const isAuto = dk.k === 'ABASTECIMENTO';
    const v = isAuto ? totFuelVal : (despMap[dk.k] || 0);
    const valStr = v > 0 ? (isAuto ? v.toFixed(2) : v) : '';
    const labelExtra = isAuto ? ' <small style="color:var(--info);font-size:.6rem">(auto = ⛽)</small>' : '';
    const inputAttrs = isAuto
      ? `readonly tabindex="-1" style="opacity:.75;cursor:not-allowed;background:rgba(56,189,248,.06)" title="Somatório dos abastecimentos — edite na seção ⛽ Abastecimentos"`
      : `onchange="inlineUpdateDesp('${esc(tr.id)}','${esc(dk.k)}',this.value)" onfocus="this.select()"`;
    h += `<div class="desp-row">
      <span class="desp-label">${esc(dk.l)}${labelExtra}</span>
      <input type="number" class="desp-inline-input ${v > 0 ? 'has-val' : ''}" value="${valStr}" step="0.01" placeholder="0,00"
        data-trip="${esc(tr.id)}" data-desp="${esc(dk.k)}"
        ${inputAttrs}>
    </div>`;
  });
  h += `</div></div>`;

  // ---- Acerto ----
  const obs = tr.observacoes || '';
  h += `<div class="acerto-box" style="grid-column:1/-1">
    <div class="acerto-line"><span class="al-label">Total Fretes (CTes)</span><span class="al-val" style="color:var(--success)">R$ ${fmt(frete)}</span></div>
    <div class="acerto-line"><span class="al-label">(-) Total Despesas</span><span class="al-val" style="color:var(--danger)">R$ ${fmt(despTotal)}</span></div>
    ${obs ? `<div class="acerto-line"><span class="al-label" style="font-size:.7rem;color:var(--muted)">Obs: ${esc(obs)}</span></div>` : ''}
    <div class="acerto-line"><span class="al-label">SALDO ACERTO MOTORISTA</span><span class="al-val" style="color:${saldo >= 0 ? 'var(--success)' : 'var(--danger)'}">R$ ${fmt(saldo)}</span></div>
    ${adto > 0 ? `<div style="margin-top:.5rem;padding:.4rem .5rem;background:rgba(227,6,19,.06);border:1px solid rgba(227,6,19,.2);border-radius:5px;font-size:.72rem;display:flex;justify-content:space-between"><span style="color:var(--muted)">&#x2139;&#xFE0F; Adiantamento motorista (informativo)</span><span style="font-family:'IBM Plex Mono',monospace;color:var(--accent)">R$ ${fmt(adto)}</span></div>` : ''}
  </div>`;

  return h;
}

// ==================== INLINE REFRESH ====================

async function inlineRefreshTrip(tripId) {
  try {
    const trip = await api.get('/api/trips/' + tripId);
    // Update trip in local state
    const idx = state.trips.findIndex(t => t.id === tripId);
    if (idx >= 0) state.trips[idx] = trip;

    // Re-render detail
    const det = document.getElementById('detail_' + tripId);
    if (det) {
      det.innerHTML = buildDetail(trip);
    }

    // Update trip header numbers
    const f = calcFrete(trip), d = calcDesp(trip), l = f - d;
    const card = det?.closest('.trip-card');
    if (card) {
      const nums = card.querySelector('.trip-nums');
      if (nums) {
        nums.innerHTML = `
          <span class="val pos">R$ ${fmt(f)}</span>
          <span class="val neg">- R$ ${fmt(d)}</span>
          <span class="val ${l >= 0 ? 'pos' : 'neg'}">${l >= 0 ? '=' : ''} R$ ${fmt(l)}</span>
          ${trip.km_total ? `<span style="color:var(--muted);font-size:.7rem">${parseInt(trip.km_total).toLocaleString('pt-BR')}km</span>` : ''}`;
      }
    }

    // Update KPIs
    updateKPIs();
    updateMonthStats();
  } catch (e) {
    console.error('Erro ao atualizar viagem:', e);
  }
}

function updateKPIs() {
  const trips = state.trips;
  let totF = 0, totD = 0, totKm = 0, totL = 0;
  trips.forEach(t => {
    totF += calcFrete(t);
    totD += calcDesp(t);
    totKm += parseInt(t.km_total || 0);
    (t.fuels || []).forEach(f => totL += parseFloat(f.litros || 0));
  });
  const kpis = document.querySelectorAll('.kpi-card .kpi-value');
  if (kpis.length >= 6) {
    kpis[0].textContent = trips.length;
    kpis[1].textContent = 'R$' + fmt(totF); kpis[1].style.color = 'var(--success)';
    kpis[2].textContent = 'R$' + fmt(totD); kpis[2].style.color = 'var(--danger)';
    kpis[3].textContent = 'R$' + fmt(totF - totD); kpis[3].style.color = totF - totD >= 0 ? 'var(--success)' : 'var(--danger)';
    kpis[4].textContent = totKm.toLocaleString('pt-BR');
    kpis[5].textContent = totL.toLocaleString('pt-BR', { maximumFractionDigits: 0 }) + 'L';
  }
}

function updateMonthStats() {
  const trips = state.trips;
  const byM = {};
  trips.forEach(tr => {
    const d = new Date((tr.data_inicio || '2000-01-01').slice(0, 10) + 'T12:00:00');
    const k = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    if (!byM[k]) byM[k] = [];
    byM[k].push(tr);
  });
  Object.keys(byM).forEach(mk => {
    const mTrips = byM[mk];
    const mF = mTrips.reduce((s, t) => s + calcFrete(t), 0);
    const mD = mTrips.reduce((s, t) => s + calcDesp(t), 0);
    const mL = mF - mD;
    const block = document.getElementById('mb_' + mk);
    if (block) {
      const stats = block.querySelector('.month-stats');
      if (stats) stats.innerHTML = `
        <div>${mTrips.length} viagem(ns)</div>
        <div>Frete:<span> R$${fmt(mF)}</span></div>
        <div>Desp:<span style="color:var(--danger)"> R$${fmt(mD)}</span></div>
        <div>Liq:<span style="color:${mL >= 0 ? 'var(--success)' : 'var(--danger)'}"> R$${fmt(mL)}</span></div>`;
    }
  });
}

// ==================== INLINE TRIP FIELDS (data, motorista, km) ====================

// Update cirúrgico após PATCH de campo da faixa info: NÃO re-renderiza os
// inputs (isso causava o "indo e voltando" — toda a faixa era destruída
// no onchange e o foco se perdia ao tabular pro próximo campo).
// Aqui atualizamos só os valores derivados (Percorridos, Média, header
// numbers, KPIs, stats do mês). Os inputs já mostram o valor digitado.
// Quando data_inicio muda de mês, o card fica no bloco antigo até o
// próximo F5 ou save via modal — re-render inline durante a digitação
// fazia a página pular antes do usuário terminar de digitar o ano.
function syncInlineTripPatch(tripId, patch) {
  const idx = state.trips.findIndex(t => t.id === tripId);
  if (idx < 0) return;
  Object.assign(state.trips[idx], patch);
  const trip = state.trips[idx];

  const det = document.getElementById('detail_' + tripId);
  if (det) {
    // Recalcula Percorridos e Média sem tocar nos inputs.
    const fuels = trip.fuels || [];
    const totL = fuels.reduce((s, f) => s + parseFloat(f.litros || 0), 0);
    const kmIni = parseFloat(trip.km_inicial || 0);
    const kmFin = parseFloat(trip.km_final || 0);
    const kmPerc = kmFin > kmIni ? kmFin - kmIni : 0;
    const media = (totL > 0 && kmPerc > 0) ? (kmPerc / totL).toFixed(2) + ' km/L' : '—';

    // Os dois últimos .trip-info-val da faixa são Percorridos e Média (ordem do template).
    const valSpans = det.querySelectorAll('.trip-info-bar .trip-info-val');
    if (valSpans[0]) valSpans[0].textContent = kmPerc > 0 ? kmPerc.toLocaleString('pt-BR') + ' km' : '—';
    if (valSpans[1]) valSpans[1].textContent = media;
  }

  // Header numbers do card (frete / despesa / líquido / km total) e data
  const card = det?.closest('.trip-card');
  if (card) {
    const f = calcFrete(trip), d = calcDesp(trip), l = f - d;
    const nums = card.querySelector('.trip-nums');
    if (nums) {
      nums.innerHTML = `
        <span class="val pos">R$ ${fmt(f)}</span>
        <span class="val neg">- R$ ${fmt(d)}</span>
        <span class="val ${l >= 0 ? 'pos' : 'neg'}">${l >= 0 ? '=' : ''} R$ ${fmt(l)}</span>
        ${trip.km_total ? `<span style="color:var(--muted);font-size:.7rem">${parseInt(trip.km_total).toLocaleString('pt-BR')}km</span>` : ''}`;
    }
    // Data exibida no cabeçalho do card (em vermelho) — quando muda
    // data_inicio inline, sincronizar pra não ficar dessincronizada
    // do input lá embaixo.
    if (patch.data_inicio !== undefined) {
      const dateLbl = card.querySelector('.trip-date');
      if (dateLbl) {
        const ds = (trip.data_inicio || '').slice(0, 10);
        dateLbl.textContent = fmtD(ds);
      }
    }
  }

  updateKPIs();
  updateMonthStats();
}

window.inlineUpdateTrip = async function (tripId, field, value, inputEl) {
  // Data Início é obrigatória. Durante a digitação no input type=date o
  // browser pode reportar value="" temporariamente (entre dia/mês/ano).
  // Em vez de alertar agressivamente, ignoramos o vazio e restauramos
  // o valor anterior silenciosamente — o usuário continua digitando.
  if (field === 'data_inicio' && !value) {
    const tr = state.trips.find(t => t.id === tripId);
    const orig = tr?.data_inicio ? String(tr.data_inicio).slice(0, 10) : '';
    if (inputEl) inputEl.value = orig;
    return;
  }

  const body = {};
  if (field === 'data_inicio' || field === 'data_fim') {
    body[field] = value || null;
  } else if (field === 'km_inicial' || field === 'km_final') {
    body[field] = parseFloat(value) || 0;
  } else if (field === 'motorista') {
    body[field] = (value || '').trim() || null;
  } else {
    body[field] = value;
  }

  // Quando muda km inicial/final, recalcula km_total no mesmo PATCH
  if (field === 'km_inicial' || field === 'km_final') {
    const tr = state.trips.find(t => t.id === tripId);
    const kmIni = field === 'km_inicial' ? body.km_inicial : parseFloat(tr?.km_inicial || 0);
    const kmFin = field === 'km_final'   ? body.km_final   : parseFloat(tr?.km_final   || 0);
    body.km_total = kmFin > kmIni ? Math.round(kmFin - kmIni) : 0;
  }

  try {
    await api.patch('/api/trips/' + tripId, body);
    syncInlineTripPatch(tripId, body);
  } catch (e) {
    alert('Erro ao salvar: ' + e.message);
    // Reverte o input pro valor armazenado em state (fonte da verdade local).
    const tr = state.trips.find(t => t.id === tripId);
    if (tr && inputEl) {
      if (field === 'data_inicio' || field === 'data_fim') {
        inputEl.value = tr[field] ? String(tr[field]).slice(0, 10) : '';
      } else {
        inputEl.value = tr[field] != null ? tr[field] : '';
      }
    }
  }
};

// ==================== INLINE DESPESAS ====================

window.inlineUpdateDesp = async function (tripId, categoria, val) {
  try {
    await api.patch('/api/expenses/trip/' + tripId + '/' + categoria, { valor: parseFloat(val) || 0 });

    // Optimistic update in local state
    const tr = state.trips.find(t => t.id === tripId);
    if (tr) {
      if (!tr.expenses) tr.expenses = [];
      const existing = tr.expenses.find(e => e.categoria === categoria);
      if (existing) {
        existing.valor = parseFloat(val) || 0;
      } else {
        tr.expenses.push({ categoria, valor: parseFloat(val) || 0 });
      }

      const despTotal = calcDesp(tr);
      const frete = calcFrete(tr);
      const saldo = frete - despTotal;

      // Update total inline
      const totalEl = document.getElementById('inlineDespTotal_' + tripId);
      if (totalEl) totalEl.textContent = 'R$ ' + fmt(despTotal);

      // Update input style
      const input = document.querySelector(`input[data-trip="${tripId}"][data-desp="${categoria}"]`);
      if (input) input.classList.toggle('has-val', parseFloat(val) > 0);

      // Update acerto box
      const det = document.getElementById('detail_' + tripId);
      if (det) {
        const acerto = det.querySelector('.acerto-box');
        if (acerto) {
          const lines = acerto.querySelectorAll('.al-val');
          if (lines.length >= 2) lines[1].textContent = 'R$ ' + fmt(despTotal);
          const lastLine = acerto.querySelector('.acerto-line:last-child .al-val');
          if (lastLine) {
            lastLine.textContent = 'R$ ' + fmt(saldo);
            lastLine.style.color = saldo >= 0 ? 'var(--success)' : 'var(--danger)';
          }
        }
      }

      // Update trip header
      const f = frete, d = despTotal, l = f - d;
      const card = det?.closest('.trip-card');
      if (card) {
        const nums = card.querySelector('.trip-nums');
        if (nums) nums.innerHTML = `
          <span class="val pos">R$ ${fmt(f)}</span>
          <span class="val neg">- R$ ${fmt(d)}</span>
          <span class="val ${l >= 0 ? 'pos' : 'neg'}">${l >= 0 ? '=' : ''} R$ ${fmt(l)}</span>
          ${tr.km_total ? `<span style="color:var(--muted);font-size:.7rem">${parseInt(tr.km_total).toLocaleString('pt-BR')}km</span>` : ''}`;
      }

      updateKPIs();
      updateMonthStats();
    }
  } catch (e) {
    alert('Erro ao atualizar despesa: ' + e.message);
  }
};

// ==================== INLINE CTEs ====================

window.inlineSaveCte = async function (tripId) {
  const data = (document.getElementById('inCteDate_' + tripId)?.value || '').trim();
  const num = document.getElementById('inCteNum_' + tripId)?.value || '';
  const origin = document.getElementById('inCteOri_' + tripId)?.value || '';
  const dest = document.getElementById('inCteDst_' + tripId)?.value || '';
  const valor = document.getElementById('inCteVal_' + tripId)?.value || '';
  if (!num && !valor) { alert('Informe pelo menos o N\u00BA CTE ou valor.'); return; }
  try {
    await api.post('/api/ctes/trip/' + tripId, {
      data: data || null,
      numero: num,
      origem: origin,
      destino: dest,
      valor: parseFloat(valor) || 0,
    });
    // Limpa o input row pra pr\u00F3xima entrada
    ['inCteDate_', 'inCteNum_', 'inCteOri_', 'inCteDst_', 'inCteVal_'].forEach(p => {
      const el = document.getElementById(p + tripId);
      if (el) el.value = '';
    });
    await inlineRefreshTrip(tripId);
  } catch (e) {
    alert('Erro ao adicionar CTE: ' + e.message);
  }
};

window.inlineRemoveCte = async function (tripId, cteId) {
  try {
    await api.delete('/api/ctes/' + cteId);
    await inlineRefreshTrip(tripId);
  } catch (e) {
    alert('Erro ao remover CTE: ' + e.message);
  }
};

// ==================== INLINE FUELS ====================

window.inlineSaveFuel = async function (tripId) {
  const data = (document.getElementById('inFuelDate_' + tripId)?.value || '').trim();
  const litros = document.getElementById('inFuelLit_' + tripId)?.value || '';
  const precoLitro = document.getElementById('inFuelPreco_' + tripId)?.value || '';
  const posto = document.getElementById('inFuelPosto_' + tripId)?.value || '';
  const nf = document.getElementById('inFuelNf_' + tripId)?.value || '';
  const km = document.getElementById('inFuelKm_' + tripId)?.value || '';
  const valor = document.getElementById('inFuelVal_' + tripId)?.value || '';
  if (!litros && !valor) { alert('Informe pelo menos litros ou valor.'); return; }
  try {
    await api.post('/api/fuels/trip/' + tripId, {
      data: data || null,
      litros: parseFloat(litros) || 0,
      preco_litro: parseFloat(precoLitro) || 0,
      posto_cnpj: posto,
      nota_fiscal: nf,
      km: parseFloat(km) || 0,
      valor_total: parseFloat(valor) || 0,
    });
    ['inFuelDate_', 'inFuelLit_', 'inFuelPreco_', 'inFuelPosto_', 'inFuelNf_', 'inFuelKm_', 'inFuelVal_'].forEach(p => {
      const el = document.getElementById(p + tripId);
      if (el) el.value = '';
    });
    await inlineRefreshTrip(tripId);
  } catch (e) {
    alert('Erro ao adicionar abastecimento: ' + e.message);
  }
};

window.inlineRemoveFuel = async function (tripId, fuelId) {
  try {
    await api.delete('/api/fuels/' + fuelId);
    await inlineRefreshTrip(tripId);
  } catch (e) {
    alert('Erro ao remover abastecimento: ' + e.message);
  }
};

// ==================== INLINE AUTO CALC FUEL ====================

window.inlineAutoCalcFuel = function (tripId, field) {
  const litEl = document.getElementById('inFuelLit_' + tripId);
  const precoEl = document.getElementById('inFuelPreco_' + tripId);
  const valEl = document.getElementById('inFuelVal_' + tripId);
  const litros = parseFloat(litEl?.value) || 0;
  const preco = parseFloat(precoEl?.value) || 0;
  const valor = parseFloat(valEl?.value) || 0;
  if (field === 'litros') {
    if (preco > 0) valEl.value = (litros * preco).toFixed(2);
    else if (valor > 0 && litros > 0) precoEl.value = (valor / litros).toFixed(2);
  } else if (field === 'preco') {
    if (litros > 0) valEl.value = (litros * preco).toFixed(2);
    else if (valor > 0 && preco > 0) litEl.value = (valor / preco).toFixed(2);
  } else if (field === 'valor') {
    if (litros > 0) precoEl.value = (valor / litros).toFixed(2);
    else if (preco > 0 && valor > 0) litEl.value = (valor / preco).toFixed(2);
  }
};
