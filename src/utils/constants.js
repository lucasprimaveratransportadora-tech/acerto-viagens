const ROLES = {
  ADMIN: 'ADMIN',
  GESTOR: 'GESTOR',
};

const TRIP_STATUS = {
  OK: 'OK',
  PENDENTE: 'PENDENTE',
  CANCELADA: 'CANCELADA',
};

const EXPENSE_CATEGORIES = [
  'DESC_CTE_1', 'DESC_CTE_2', 'DESC_CTE_3', 'DESC_CTE_4', 'DESC_CTE_5', 'DESC_CTE_6',
  'ABASTECIMENTO', 'COMISSAO_MOTORISTA', 'BORRACHARIA', 'LIMPEZA',
  'ESTACIONAMENTO', 'CARREGAMENTO', 'AGENCIAMENTO', 'EXTRAS',
  'PEDAGIO', 'ARLA', 'AVARIA',
];

const EXPENSE_LABELS = {
  DESC_CTE_1: 'Descarga CTE 1',
  DESC_CTE_2: 'Descarga CTE 2',
  DESC_CTE_3: 'Descarga CTE 3',
  DESC_CTE_4: 'Descarga CTE 4',
  DESC_CTE_5: 'Descarga CTE 5',
  DESC_CTE_6: 'Descarga CTE 6',
  ABASTECIMENTO: 'Abastecimento',
  COMISSAO_MOTORISTA: 'Comissão Motorista',
  BORRACHARIA: 'Borracharia',
  LIMPEZA: 'Limpeza carreta JT',
  ESTACIONAMENTO: 'Estacionamento',
  CARREGAMENTO: 'Carregamento preforma',
  AGENCIAMENTO: 'Agenciamento',
  EXTRAS: 'Extras',
  PEDAGIO: 'Pedágio',
  ARLA: 'Arla',
  AVARIA: 'Avaria',
};

const ATTACHMENT_TYPES = [
  'DOC_CAMINHAO', 'DOC_MOTORISTA', 'NOTA_ABASTECIMENTO', 'CTE_ARQUIVO',
  'RECIBO', 'COMPROVANTE', 'OUTRO',
];

const ALLOWED_MIME_TYPES = [
  'application/pdf',
  'image/jpeg',
  'image/png',
  'image/webp',
  'application/xml',
  'text/xml',
];

// Tipos aceitos no importer XLSX do truck-ledger.
// .xlsx moderno = openxml; .xls antigo = ms-excel; alguns navegadores
// reportam octet-stream pra arquivos baixados — aceitamos com cautela
// porque o parse interno (xlsx package) já rejeita formatos inválidos.
const XLSX_MIME_TYPES = [
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-excel',
  'application/octet-stream',
];

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB

module.exports = {
  ROLES,
  TRIP_STATUS,
  EXPENSE_CATEGORIES,
  EXPENSE_LABELS,
  ATTACHMENT_TYPES,
  ALLOWED_MIME_TYPES,
  XLSX_MIME_TYPES,
  MAX_FILE_SIZE,
};
