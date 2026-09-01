function safeColor(value) {
  return /^#[0-9a-f]{6}$/i.test(String(value || '')) ? String(value).toUpperCase() : '#E30613';
}

function darken(value, factor = .7) {
  const h = safeColor(value).slice(1);
  return `#${[0,2,4].map(i => Math.round(parseInt(h.slice(i,i+2),16)*factor).toString(16).padStart(2,'0')).join('')}`;
}

export function applyBranding(empresa) {
  if (!empresa) return;
  const color = safeColor(empresa.cor_primaria);
  document.documentElement.style.setProperty('--accent', color);
  document.documentElement.style.setProperty('--accent2', darken(color));
  const logo = empresa.logo_mime ? `/api/empresas/${empresa.id}/logo` : empresa.logo_url;
  if (logo) document.querySelectorAll('img.logo-img').forEach(img => { img.src = logo; img.alt = empresa.nome; });
  document.title = `${empresa.nome} — Acerto de Viagens`;
  document.querySelectorAll('[data-brand-name]').forEach(el => { el.textContent = empresa.nome; });
}
