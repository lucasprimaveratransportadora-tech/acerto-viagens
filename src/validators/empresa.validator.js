const { body } = require('express-validator');

const createEmpresa = [
  body('nome').trim().notEmpty().withMessage('Nome obrigatório.').isLength({ max: 200 }),
  body('cnpj').optional({ nullable: true, checkFalsy: true }).trim().isLength({ max: 20 }),
  body('logo_url').optional({ nullable: true, checkFalsy: true }).isURL().withMessage('URL do logo inválida.'),
];

const updateEmpresa = [
  // .optional() permite omitir o campo, mas se vier precisa não ser
  // string vazia depois do trim — senão dá pra apagar o nome da empresa
  // mandando { nome: "  " }.
  body('nome').optional().trim().notEmpty().withMessage('Nome não pode ser vazio.').isLength({ max: 200 }),
  body('cnpj').optional({ nullable: true, checkFalsy: true }).trim().isLength({ max: 20 }),
  body('logo_url').optional({ nullable: true, checkFalsy: true }).isURL().withMessage('URL do logo inválida.'),
];

module.exports = { createEmpresa, updateEmpresa };
