function normalizeBrandColor(value) {
  return /^#[0-9a-f]{6}$/i.test(String(value || '')) ? String(value).toUpperCase() : '#E30613';
}

function darkenHex(value, factor = 0.7) {
  const hex = normalizeBrandColor(value).slice(1);
  const parts = [0, 2, 4].map(i => Math.round(parseInt(hex.slice(i, i + 2), 16) * factor));
  return `#${parts.map(n => n.toString(16).padStart(2, '0')).join('')}`.toUpperCase();
}

function resolveBrandCover(empresa = {}) {
  const position = ['top', 'center', 'bottom'].includes(empresa.capa_posicao) ? empresa.capa_posicao : 'center';
  if (empresa.id && empresa.capa_mime) return { url: `/api/empresas/${empresa.id}/capa`, position, fallback: false };
  const name = String(empresa.nome || '').trim().toLocaleLowerCase('pt-BR');
  const hasOwnLogo = Boolean(empresa.logo_mime || empresa.logo_url);
  return { url: null, position, fallback: hasOwnLogo && !name.includes('prima') };
}

function resolveBrandIcon(empresa = {}) {
  if (empresa.id && empresa.logo_mime) {
    const version = Number.isInteger(empresa.logo_tamanho) ? `?v=${empresa.logo_tamanho}` : '';
    return `/api/empresas/${empresa.id}/logo${version}`;
  }
  return empresa.logo_url || '/assets/images/logo-icon.png';
}

function resolveBrandLogo(empresa = {}) {
  if (empresa.id && empresa.logo_mime) return resolveBrandIcon(empresa);
  return empresa.logo_url || '/assets/images/logo-full.png';
}

function shortBrandName(name) {
  const cleaned = String(name || '').trim()
    .replace(/\s+(transportadora|log[ií]stica)$/i, '')
    .trim();
  return cleaned || 'Sua empresa';
}

module.exports = { normalizeBrandColor, darkenHex, resolveBrandCover, resolveBrandIcon, resolveBrandLogo, shortBrandName };
