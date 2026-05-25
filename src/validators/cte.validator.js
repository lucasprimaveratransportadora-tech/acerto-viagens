const { body } = require('express-validator');

const createCte = [
  body('data').optional({ nullable: true, checkFalsy: true }).isISO8601().withMessage('Data inválida.'),
  body('numero').optional({ nullable: true }),
  body('origem').optional({ nullable: true }),
  body('destino').optional({ nullable: true }),
  body('valor').notEmpty().withMessage('Valor obrigatório.').isFloat({ min: 0 }).withMessage('Valor deve ser numérico e >= 0.'),
];

const updateCte = [
  body('data').optional({ nullable: true, checkFalsy: true }).isISO8601().withMessage('Data inválida.'),
  body('numero').optional({ nullable: true }),
  body('origem').optional({ nullable: true }),
  body('destino').optional({ nullable: true }),
  body('valor').optional().isFloat({ min: 0 }).withMessage('Valor deve ser numérico e >= 0.'),
];

module.exports = { createCte, updateCte };
