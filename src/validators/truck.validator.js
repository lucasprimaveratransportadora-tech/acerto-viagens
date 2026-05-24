const { body } = require('express-validator');

const PLATE_REGEX = /^[A-Z]{3}-?\d[A-Z0-9]\d{2}$/;

const createTruck = [
  body('placa')
    .trim()
    .notEmpty().withMessage('Placa obrigatória.')
    .customSanitizer(v => v.toUpperCase())
    .matches(PLATE_REGEX).withMessage('Placa inválida. Use o formato ABC-1D23 ou ABC1D23.'),
  body('modelo').optional(),
  body('motorista').optional(),
  body('carreta_placa').optional({ checkFalsy: true })
    .customSanitizer(v => v ? v.toUpperCase().trim() : v)
    .matches(PLATE_REGEX).withMessage('Placa da carreta inválida.'),
  body('carreta_modelo').optional(),
  body('saldo_inicial').optional().isFloat().withMessage('Saldo inicial deve ser numérico.'),
  body('observacoes').optional(),
];

const updateTruck = [
  body('placa').optional()
    .trim()
    .customSanitizer(v => v.toUpperCase())
    .matches(PLATE_REGEX).withMessage('Placa inválida.'),
  body('modelo').optional(),
  body('motorista').optional(),
  body('carreta_placa').optional({ checkFalsy: true })
    .customSanitizer(v => v ? v.toUpperCase().trim() : v)
    .matches(PLATE_REGEX).withMessage('Placa da carreta inválida.'),
  body('carreta_modelo').optional(),
  body('saldo_inicial').optional().isFloat().withMessage('Saldo inicial deve ser numérico.'),
  body('observacoes').optional(),
];

const addAnexo = [
  body('nome').notEmpty().withMessage('Nome obrigatório.'),
  body('url').notEmpty().withMessage('URL obrigatória.').isLength({ max: 4000 }),
  body('tipo').optional().isIn(['GR_APROVADO','CRLV_VEICULO','CRLV_CARRETA','CNH_MOTORISTA','CONTRATO','ANTT','OUTRO']).withMessage('Tipo inválido.'),
  body('descricao').optional(),
];

module.exports = { createTruck, updateTruck, addAnexo };
