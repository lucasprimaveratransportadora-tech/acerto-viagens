// utils.js — Pure utility functions, no side effects

export function fmt(v) {
  return parseFloat(v || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function fmtD(d) {
  if (!d) return '\u2014';
  return new Date(d + 'T12:00:00').toLocaleDateString('pt-BR');
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
  return (trip.expenses || []).reduce((s, e) => s + parseFloat(e.valor || 0), 0);
}
