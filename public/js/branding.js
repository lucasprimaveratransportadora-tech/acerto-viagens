function safeColor(value) {
  return /^#[0-9a-f]{6}$/i.test(String(value || '')) ? String(value).toUpperCase() : '#E30613';
}

function darken(value, factor = .7) {
  const h = safeColor(value).slice(1);
  return `#${[0,2,4].map(i => Math.round(parseInt(h.slice(i,i+2),16)*factor).toString(16).padStart(2,'0')).join('')}`;
}

function coverDetails(empresa = {}) {
  const position = ['top', 'center', 'bottom'].includes(empresa.capa_posicao) ? empresa.capa_posicao : 'center';
  const hasCover = Boolean(empresa.id && empresa.capa_mime);
  const name = String(empresa.nome || '').trim().toLocaleLowerCase('pt-BR');
  const hasOwnLogo = Boolean(empresa.logo_mime || empresa.logo_url);
  return {
    url: hasCover ? `/api/empresas/${empresa.id}/capa` : null,
    position,
    fallback: !hasCover && hasOwnLogo && !name.includes('prima'),
  };
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
  document.querySelectorAll('[data-brand-hub-name]').forEach(el => { el.textContent = empresa.nome; });
  document.querySelectorAll('[data-brand-hub-badge]').forEach(el => { el.textContent = empresa.nome.toUpperCase(); });

  const cover = coverDetails(empresa);
  const hero = document.querySelector('.hub-hero');
  if (hero) {
    hero.classList.toggle('has-brand-cover', Boolean(cover.url));
    hero.classList.toggle('has-brand-fallback', cover.fallback);
    document.documentElement.style.setProperty('--brand-cover-url', cover.url ? `url("${cover.url}")` : 'none');
    document.documentElement.style.setProperty('--brand-cover-position', cover.position);
  }
  const heroMark = document.querySelector('.hub-brand-mark');
  if (heroMark) {
    heroMark.hidden = !(logo && (cover.url || cover.fallback));
    if (logo) { heroMark.src = logo; heroMark.alt = empresa.nome; }
  }
}
