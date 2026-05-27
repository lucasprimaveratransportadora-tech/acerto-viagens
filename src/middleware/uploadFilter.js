const { ALLOWED_MIME_TYPES, XLSX_MIME_TYPES } = require('../utils/constants');

// Factory de fileFilter pro multer. Antes, todas as 4 instâncias de upload
// (trips, trucks, fretes terceiros, truckLedger) só limitavam tamanho —
// qualquer arquivo (executável, HTML com active content) podia ser enviado
// e depois servido de volta no /download.
function makeMimeFilter(allowedList, label = 'arquivo') {
  return (req, file, cb) => {
    if (allowedList.includes(file.mimetype)) {
      return cb(null, true);
    }
    // Sinaliza tipo errado. errorHandler mapeia MulterError pra 400.
    const err = new Error(
      `Tipo de ${label} não permitido: ${file.mimetype}. ` +
      `Aceitos: ${allowedList.join(', ')}.`
    );
    err.code = 'LIMIT_UNEXPECTED_FILE';
    err.field = file.fieldname;
    return cb(err, false);
  };
}

// Filtros prontos pros casos comuns.
const anexoFilter = makeMimeFilter(ALLOWED_MIME_TYPES, 'anexo');
const xlsxFilter = makeMimeFilter(XLSX_MIME_TYPES, 'planilha');

module.exports = { makeMimeFilter, anexoFilter, xlsxFilter };
