const { body } = require('express-validator');

const createFuel = [
  // Antes era só `optional()` sem isISO8601 — qualquer string passava
  // e o service tentava `new Date(...)` que aceita lixo (vira "Invalid Date").
  body('data').optional({ nullable: true, checkFalsy: true }).isISO8601().withMessage('Data inválida.'),
  body('litros').notEmpty().withMessage('Litros obrigatório.').isFloat({ min: 0 }).withMessage('Litros deve ser numérico ≥ 0.'),
  body('preco_litro').optional().isFloat({ min: 0 }).withMessage('Preço por litro deve ser numérico ≥ 0.'),
  body('posto_cnpj').optional({ nullable: true }).isLength({ max: 200 }),
  body('nota_fiscal').optional({ nullable: true }).isLength({ max: 100 }),
  body('km').optional({ nullable: true }).isInt({ min: 0 }).withMessage('km deve ser inteiro ≥ 0.'),
  body('valor_total').notEmpty().withMessage('Valor total obrigatório.').isFloat({ min: 0 }).withMessage('Valor total deve ser numérico ≥ 0.'),
];

const updateFuel = [
  body('data').optional({ nullable: true, checkFalsy: true }).isISO8601().withMessage('Data inválida.'),
  body('litros').optional().isFloat({ min: 0 }).withMessage('Litros deve ser numérico ≥ 0.'),
  body('preco_litro').optional().isFloat({ min: 0 }).withMessage('Preço por litro deve ser numérico ≥ 0.'),
  body('posto_cnpj').optional({ nullable: true }).isLength({ max: 200 }),
  body('nota_fiscal').optional({ nullable: true }).isLength({ max: 100 }),
  body('km').optional({ nullable: true }).isInt({ min: 0 }).withMessage('km deve ser inteiro ≥ 0.'),
  body('valor_total').optional().isFloat({ min: 0 }).withMessage('Valor total deve ser numérico ≥ 0.'),
];

module.exports = { createFuel, updateFuel };
