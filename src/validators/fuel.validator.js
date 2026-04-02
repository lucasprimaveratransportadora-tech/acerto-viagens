const { body } = require('express-validator');

const createFuel = [
  body('data').optional(),
  body('litros').notEmpty().withMessage('Litros obrigatório.').isFloat().withMessage('Litros deve ser numérico.'),
  body('preco_litro').optional().isFloat().withMessage('Preço por litro deve ser numérico.'),
  body('posto_cnpj').optional(),
  body('nota_fiscal').optional(),
  body('km').optional().isInt().withMessage('km deve ser inteiro.'),
  body('valor_total').notEmpty().withMessage('Valor total obrigatório.').isFloat().withMessage('Valor total deve ser numérico.'),
];

const updateFuel = [
  body('data').optional(),
  body('litros').optional().isFloat().withMessage('Litros deve ser numérico.'),
  body('preco_litro').optional().isFloat().withMessage('Preço por litro deve ser numérico.'),
  body('posto_cnpj').optional(),
  body('nota_fiscal').optional(),
  body('km').optional().isInt().withMessage('km deve ser inteiro.'),
  body('valor_total').optional().isFloat().withMessage('Valor total deve ser numérico.'),
];

module.exports = { createFuel, updateFuel };
