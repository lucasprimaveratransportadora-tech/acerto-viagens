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
  body('empresa_id').optional().isUUID().withMessage('ID da empresa inválido.'),
];

module.exports = { loginValidator, registerValidator };
