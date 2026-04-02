const { body } = require('express-validator');

const createEmpresa = [
  body('nome').trim().notEmpty().withMessage('Nome obrigatório.'),
  body('cnpj').optional().trim(),
];

const updateEmpresa = [
  body('nome').optional().trim(),
  body('cnpj').optional().trim(),
];

module.exports = { createEmpresa, updateEmpresa };
