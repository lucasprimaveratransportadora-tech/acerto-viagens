const { body } = require('express-validator');

const createFreteTerceiro = [
  body('empresa_pagadora').notEmpty().withMessage('Empresa pagadora obrigatória.').isLength({ max: 200 }),
  body('data').notEmpty().withMessage('Data obrigatória.').isISO8601().withMessage('Data inválida.'),
  body('motorista').notEmpty().withMessage('Motorista obrigatório.').isLength({ max: 120 }),
  body('truck_id').notEmpty().withMessage('Selecione o caminhão.').isUUID().withMessage('truck_id inválido.'),
  body('veiculo').optional().isLength({ max: 20 }),
  body('origem').optional({ nullable: true }).isLength({ max: 200 }),
  body('destino').optional({ nullable: true }).isLength({ max: 200 }),
  body('valor_total').notEmpty().withMessage('Valor total obrigatório.').isFloat({ gt: 0 }).withMessage('Valor total deve ser maior que zero.'),
  body('valor_adiantamento').optional().isFloat({ min: 0 }).withMessage('Adiantamento inválido.'),
  body('forma_pagamento').optional().isIn(['INTEGRAL', 'ADIANTAMENTO_SALDO']).withMessage('Forma de pagamento inválida.'),
  body('data_adiantamento').optional({ nullable: true }).isISO8601().withMessage('Data de adiantamento inválida.'),
  body('observacoes').optional({ nullable: true }).isLength({ max: 1000 }),
];

const updateFreteTerceiro = [
  body('empresa_pagadora').optional().notEmpty().isLength({ max: 200 }),
  body('data').optional().isISO8601(),
  body('motorista').optional().notEmpty().isLength({ max: 120 }),
  // truck_id pode vir null pra desvincular, mas se vier preenchido, precisa ser UUID
  body('truck_id').optional({ nullable: true, checkFalsy: true }).isUUID().withMessage('truck_id inválido.'),
  body('veiculo').optional().isLength({ max: 20 }),
  body('origem').optional({ nullable: true }).isLength({ max: 200 }),
  body('destino').optional({ nullable: true }).isLength({ max: 200 }),
  body('valor_total').optional().isFloat({ gt: 0 }),
  body('valor_adiantamento').optional().isFloat({ min: 0 }),
  body('forma_pagamento').optional().isIn(['INTEGRAL', 'ADIANTAMENTO_SALDO']),
  body('data_adiantamento').optional({ nullable: true }).isISO8601(),
  body('observacoes').optional({ nullable: true }).isLength({ max: 1000 }),
];

const baixar = [
  body('valor').notEmpty().withMessage('Valor obrigatório.').isFloat({ gt: 0 }).withMessage('Valor deve ser maior que zero.'),
  body('data_pagamento').optional().isISO8601().withMessage('Data inválida.'),
  body('observacoes').optional({ nullable: true }).isLength({ max: 1000 }),
];

const linkTrip = [
  body('trip_id').notEmpty().withMessage('trip_id obrigatório.').isUUID().withMessage('trip_id inválido.'),
];

const addAnexo = [
  body('nome').notEmpty().withMessage('Nome obrigatório.').isLength({ max: 200 }),
  body('url')
    .notEmpty().withMessage('URL obrigatória.')
    .isURL({ require_protocol: true }).withMessage('URL inválida (precisa começar com http:// ou https://).')
    .isLength({ max: 4000 }),
  body('tipo').optional().isIn(['COMPROVANTE_PAGAMENTO', 'CTE', 'RECIBO', 'OUTRO']).withMessage('Tipo inválido.'),
  body('descricao').optional({ nullable: true }).isLength({ max: 500 }),
];

module.exports = { createFreteTerceiro, updateFreteTerceiro, baixar, linkTrip, addAnexo };
