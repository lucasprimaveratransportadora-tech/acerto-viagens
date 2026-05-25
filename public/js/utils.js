// utils.js — Pure utility functions, no side effects

export function fmt(v) {
  return parseFloat(v || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function fmtD(d) {
  if (!d) return '\u2014';
  // Aceita tanto "YYYY-MM-DD" (input type=date) quanto ISO completo
  // ("2026-05-25T17:00:00.000Z" \u2014 Prisma DateTime). Sem o ajuste, somar
  // 'T12:00:00' num ISO completo gera "Invalid Date".
  const s = String(d);
  const date = new Date(/T/.test(s) ? s : s + 'T12:00:00');
  if (isNaN(date.getTime())) return '\u2014';
  return date.toLocaleDateString('pt-BR');
}

export function esc(str) {
  if (!str) return '';
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

export function calcFrete(trip) {
  return (trip.ctes || []).reduce((s, c) => s + parseFloat(c.valor || 0), 0);
}

export function calcDesp(trip) {
  // Total de despesas que entra no acerto = todas as Expenses (exceto a
  // categoria ABASTECIMENTO, que é auto-calculada a partir dos Fuels)
  // + soma dos abastecimentos lançados na seção ⛽.
  const sumOutras = (trip.expenses || [])
    .filter(e => e.categoria !== 'ABASTECIMENTO')
    .reduce((s, e) => s + parseFloat(e.valor || 0), 0);
  const sumFuels = (trip.fuels || []).reduce((s, f) => s + parseFloat(f.valor_total || 0), 0);
  return sumOutras + sumFuels;
}
