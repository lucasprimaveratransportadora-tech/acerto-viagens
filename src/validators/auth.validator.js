const { body } = require('express-validator');

const loginValidator = [
  body('email').isEmail().normalizeEmail().withMessage('Email inválido.'),
  body('senha').notEmpty().withMessage('Senha obrigatória.'),
];

const registerValidator = [
  body('nome').trim().notEmpty().withMessage('Nome obrigatório.').isLength({ max: 100 }),
  body('email').isEmail().normalizeEmail().withMessage('Email inválido.'),
  body('senha').isLength({ min: 6 }).withMessage('Senha deve ter no mínimo 6 caracteres.'),
  body('role').optional().isIn(['ADMIN', 'GESTOR']).withMessage('Role inválido.'),
  body('permissoes').optional().custom((value) => {
    if (!Array.isArray(value)) return false;
    return value.every((item) => ['frota', 'frete-terceiro', 'veiculos', 'rentabilidade', 'controle-viagens'].includes(item));
  }).withMessage('Permissões inválidas.'),
  body('empresa_id').not().exists().withMessage('empresa_id não pode ser enviado nesta rota.'),
];

module.exports = { loginValidator, registerValidator };
