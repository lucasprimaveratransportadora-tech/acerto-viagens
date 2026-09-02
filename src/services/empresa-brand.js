const CAPA_MAX_BYTES = 5 * 1024 * 1024;
const CAPA_MIME_TYPES = new Set(['image/jpeg', 'image/webp']);
const CAPA_POSICOES = new Set(['center', 'top', 'bottom']);

function empresaBrandSelect() {
  return {
    id: true,
    nome: true,
    logo_url: true,
    logo_mime: true,
    logo_tamanho: true,
    cor_primaria: true,
    capa_mime: true,
    capa_tamanho: true,
    capa_posicao: true,
  };
}

function validateCoverFile(file) {
  if (!file?.buffer?.length || !file.size) return { ok: false, error: 'Arquivo de capa obrigatório.' };
  if (!CAPA_MIME_TYPES.has(file.mimetype)) return { ok: false, error: 'A capa deve ser uma imagem JPEG ou WebP.' };
  if (file.size > CAPA_MAX_BYTES) return { ok: false, error: 'A capa deve ter no máximo 5 MB.' };
  return { ok: true };
}

function normalizeCoverPosition(value) {
  return CAPA_POSICOES.has(value) ? value : 'center';
}

module.exports = {
  CAPA_MAX_BYTES,
  CAPA_MIME_TYPES,
  empresaBrandSelect,
  validateCoverFile,
  normalizeCoverPosition,
};
