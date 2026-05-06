import { esc } from '../utils.js';

const FIELD_LABELS = {
  valor: 'Valor', categoria: 'Categoria', nome: 'Nome', email: 'Email',
  role: 'Role', ativo: 'Ativo', placa: 'Placa', modelo: 'Modelo',
  motorista: 'Motorista', numero: 'CTE', origem: 'Origem', destino: 'Destino',
  litros: 'Litros', preco_litro: 'R$/L', valor_total: 'Total', km: 'KM',
  posto_cnpj: 'Posto', nota_fiscal: 'NF', adiantamento: 'Adiant.',
  status: 'Status', data_inicio: 'Início', data_fim: 'Fim', km_total: 'KM Total',
  carga: 'Carga', observacoes: 'Obs', km_inicial: 'KM Ini', km_final: 'KM Fim',
  data: 'Data', sessions_revoked: 'Sessões revog.', password_reset: 'Senha resetada',
};

const HIDDEN_KEYS = new Set([
  'updated_at', 'created_at', 'id', 'truck_id', 'trip_id', 'empresa_id',
  'deleted_at', 'cte_id', 'fuel_id',
]);

function fmt(v) {
  if (v === null || v === undefined) return '—';
  if (typeof v === 'number') return v.toLocaleString('pt-BR');
  if (typeof v === 'boolean') return v ? 'sim' : 'não';
  if (typeof v === 'object') return JSON.stringify(v);
  const s = String(v);
  // ISO date detection
  if (/^\d{4}-\d{2}-\d{2}T/.test(s)) {
    return new Date(s).toLocaleString('pt-BR');
  }
  return s;
}

export function summarize(entry) {
  const { action, before, after, entity_type } = entry;
  if (action === 'CREATE' && after) {
    const main = after.numero || after.placa || after.email || after.categoria || after.nome;
    const val = after.valor || after.valor_total;
    return `${entity_type}: ${main || ''}${val ? ' R$ ' + Number(val).toFixed(2) : ''}`;
  }
  if (action === 'DELETE' && before) {
    const main = before.numero || before.placa || before.email || before.categoria || before.nome;
    return `Removido: ${main || entity_type}`;
  }
  if (action === 'UPDATE' && before && after) {
    const changes = [];
    for (const k of Object.keys(after)) {
      if (HIDDEN_KEYS.has(k)) continue;
      const a = JSON.stringify(after[k]);
      const b = JSON.stringify(before[k]);
      if (a !== b) {
        const label = FIELD_LABELS[k] || k;
        changes.push(`${label}: ${fmt(before[k])} → ${fmt(after[k])}`);
        if (changes.length >= 3) break;
      }
    }
    return changes.join(' | ') || 'sem mudança visível';
  }
  return '—';
}

export function renderDiff(entry) {
  const { before, after } = entry;
  const allKeys = new Set([
    ...Object.keys(before || {}),
    ...Object.keys(after || {}),
  ]);
  const lines = [];
  for (const k of allKeys) {
    if (HIDDEN_KEYS.has(k)) continue;
    const b = before?.[k];
    const a = after?.[k];
    const changed = JSON.stringify(b) !== JSON.stringify(a);
    const label = FIELD_LABELS[k] || k;
    lines.push({ label, b, a, changed });
  }
  return `
    <div class="diff-grid">
      <div class="diff-col">
        <h4>ANTES</h4>
        ${(before === null || before === undefined) ? '<em style="color:var(--muted)">(criação)</em>' :
          lines.map(l => `<div class="diff-line${l.changed ? ' changed' : ''}">${esc(l.label)}: ${esc(fmt(l.b))}</div>`).join('')}
      </div>
      <div class="diff-col">
        <h4>DEPOIS</h4>
        ${(after === null || after === undefined) ? '<em style="color:var(--muted)">(remoção)</em>' :
          lines.map(l => `<div class="diff-line${l.changed ? ' changed' : ''}">${esc(l.label)}: ${esc(fmt(l.a))}</div>`).join('')}
      </div>
    </div>
  `;
}
