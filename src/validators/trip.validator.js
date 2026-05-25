const { body } = require('express-validator');

const createTrip = [
  body('data_inicio').notEmpty().withMessage('Data de início obrigatória.').isISO8601().withMessage('Data de início inválida.'),
  body('data_fim').optional({ nullable: true, checkFalsy: true }).isISO8601().withMessage('Data de fim inválida.'),
  body('origem').optional(),
  body('destino').optional(),
  body('carga').optional(),
  body('motorista').optional().isLength({ max: 120 }).withMessage('Motorista até 120 caracteres.'),
  body('km_total').optional().isInt().withMessage('km_total deve ser inteiro.'),
  body('status').optional().isIn(['OK', 'PENDENTE', 'CANCELADA']).withMessage('Status inválido.'),
  body('adiantamento').optional().isFloat().withMessage('Adiantamento deve ser numérico.'),
  body('observacoes').optional(),
  body('km_inicial').optional().isFloat().withMessage('km_inicial deve ser numérico.'),
  body('km_final').optional().isFloat().withMessage('km_final deve ser numérico.'),
  body('imported_batch').optional().isString(),
];

const updateTrip = [
  body('data_inicio').optional().isISO8601().withMessage('Data de início inválida.'),
  body('data_fim').optional({ nullable: true, checkFalsy: true }).isISO8601().withMessage('Data de fim inválida.'),
  body('origem').optional(),
  body('destino').optional(),
  body('carga').optional(),
  body('motorista').optional().isLength({ max: 120 }).withMessage('Motorista até 120 caracteres.'),
  body('km_total').optional().isInt().withMessage('km_total deve ser inteiro.'),
  body('status').optional().isIn(['OK', 'PENDENTE', 'CANCELADA']).withMessage('Status inválido.'),
  body('adiantamento').optional().isFloat().withMessage('Adiantamento deve ser numérico.'),
  body('observacoes').optional(),
  body('km_inicial').optional().isFloat().withMessage('km_inicial deve ser numérico.'),
  body('km_final').optional().isFloat().withMessage('km_final deve ser numérico.'),
];

const addAnexo = [
  body('nome').notEmpty().withMessage('Nome do anexo obrigatório.').isLength({ max: 200 }),
  body('url').notEmpty().withMessage('URL do anexo obrigatória.').isURL().withMessage('URL inválida.'),
  body('tipo').optional().isIn(['FOLHA_ACERTO', 'COMPROVANTE', 'NOTA_FISCAL', 'OUTRO']),
  body('descricao').optional().isLength({ max: 500 }),
];

module.exports = { createTrip, updateTrip, addAnexo };
