const { body } = require('express-validator');

const createEmpresa = [
  body('nome').trim().notEmpty().withMessage('Nome obrigatório.').isLength({ max: 200 }),
  body('cnpj').optional({ nullable: true, checkFalsy: true }).trim().isLength({ max: 20 }),
  body('logo_url').optional({ nullable: true, checkFalsy: true }).isURL().withMessage('URL do logo inválida.'),
  body('cor_primaria').optional().matches(/^#[0-9A-Fa-f]{6}$/).withMessage('Cor deve estar em #RRGGBB.'),
  body('admin_nome').trim().notEmpty().isLength({ max: 120 }),
  body('admin_email').trim().isEmail().normalizeEmail(),
  body('admin_senha').isLength({ min: 8, max: 100 }).matches(/[A-Za-z]/).matches(/\d/),
];

const updateEmpresa = [
  // .optional() permite omitir o campo, mas se vier precisa não ser
  // string vazia depois do trim — senão dá pra apagar o nome da empresa
  // mandando { nome: "  " }.
  body('nome').optional().trim().notEmpty().withMessage('Nome não pode ser vazio.').isLength({ max: 200 }),
  body('cnpj').optional({ nullable: true, checkFalsy: true }).trim().isLength({ max: 20 }),
  body('logo_url').optional({ nullable: true, checkFalsy: true }).isURL().withMessage('URL do logo inválida.'),
  body('cor_primaria').optional().matches(/^#[0-9A-Fa-f]{6}$/).withMessage('Cor deve estar em #RRGGBB.'),
];

module.exports = { createEmpresa, updateEmpresa };
