const { body } = require('express-validator');

const createCte = [
  body('data').optional().isISO8601().withMessage('Data inválida.'),
  body('numero').optional(),
  body('origem').optional(),
  body('destino').optional(),
  body('valor').notEmpty().withMessage('Valor obrigatório.').isFloat({ min: 0 }).withMessage('Valor deve ser numérico e >= 0.'),
];

const updateCte = [
  body('data').optional().isISO8601().withMessage('Data inválida.'),
  body('numero').optional(),
  body('origem').optional(),
  body('destino').optional(),
  body('valor').optional().isFloat({ min: 0 }).withMessage('Valor deve ser numérico e >= 0.'),
];

module.exports = { createCte, updateCte };
