// utils.js — Pure utility functions, no side effects

export function fmt(v) {
  return parseFloat(v || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function fmtD(d) {
  if (!d) return '\u2014';
  // Data de calend\u00e1rio (CTE/abastecimento) \u2014 ignora hora/timezone do ISO
  // do Prisma ("2025-09-19T00:00:00.000Z") pra n\u00e3o perder 1 dia em UTC-3.
  const s = String(d).slice(0, 10);
  const date = new Date(s + 'T12:00:00');
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
