const { body, query } = require('express-validator');

const listFretesDisponiveis = [
  query('q').optional().isString().withMessage('Busca inválida.').bail()
    .isLength({ max: 200 }).withMessage('Busca deve ter no máximo 200 caracteres.').trim(),
];

const createCte = [
  body('frete_terceiro_id').optional({ nullable: true })
    .isString().withMessage('Frete terceiro deve ser uma string.').bail()
    .isUUID().withMessage('Frete terceiro inválido.'),
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

module.exports = { createCte, updateCte, listFretesDisponiveis };
