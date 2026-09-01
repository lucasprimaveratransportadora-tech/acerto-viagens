function normalizeBrandColor(value) {
  return /^#[0-9a-f]{6}$/i.test(String(value || '')) ? String(value).toUpperCase() : '#E30613';
}

function darkenHex(value, factor = 0.7) {
  const hex = normalizeBrandColor(value).slice(1);
  const parts = [0, 2, 4].map(i => Math.round(parseInt(hex.slice(i, i + 2), 16) * factor));
  return `#${parts.map(n => n.toString(16).padStart(2, '0')).join('')}`.toUpperCase();
}

module.exports = { normalizeBrandColor, darkenHex };
