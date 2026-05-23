const { body } = require('express-validator');

const createFreteTerceiro = [
  body('empresa_pagadora').notEmpty().withMessage('Empresa pagadora obrigatória.'),
  body('data').notEmpty().withMessage('Data obrigatória.').isISO8601().withMessage('Data inválida.'),
  body('motorista').notEmpty().withMessage('Motorista obrigatório.'),
  body('veiculo').notEmpty().withMessage('Veículo obrigatório.'),
  body('truck_id').optional({ nullable: true }),
  body('valor_total').notEmpty().withMessage('Valor total obrigatório.').isFloat({ gt: 0 }).withMessage('Valor total deve ser maior que zero.'),
  body('valor_adiantamento').optional().isFloat({ min: 0 }).withMessage('Adiantamento inválido.'),
  body('forma_pagamento').optional().isIn(['INTEGRAL', 'ADIANTAMENTO_SALDO']).withMessage('Forma de pagamento inválida.'),
  body('data_adiantamento').optional({ nullable: true }).isISO8601().withMessage('Data de adiantamento inválida.'),
  body('observacoes').optional(),
];

const updateFreteTerceiro = [
  body('empresa_pagadora').optional().notEmpty(),
  body('data').optional().isISO8601(),
  body('motorista').optional().notEmpty(),
  body('veiculo').optional().notEmpty(),
  body('truck_id').optional({ nullable: true }),
  body('valor_total').optional().isFloat({ gt: 0 }),
  body('valor_adiantamento').optional().isFloat({ min: 0 }),
  body('forma_pagamento').optional().isIn(['INTEGRAL', 'ADIANTAMENTO_SALDO']),
  body('data_adiantamento').optional({ nullable: true }).isISO8601(),
  body('observacoes').optional(),
];

const baixar = [
  body('valor').notEmpty().withMessage('Valor obrigatório.').isFloat({ gt: 0 }).withMessage('Valor deve ser maior que zero.'),
  body('data_pagamento').optional().isISO8601().withMessage('Data inválida.'),
  body('observacoes').optional(),
];

const linkTrip = [
  body('trip_id').notEmpty().withMessage('trip_id obrigatório.'),
];

module.exports = { createFreteTerceiro, updateFreteTerceiro, baixar, linkTrip };
