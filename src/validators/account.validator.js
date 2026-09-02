const { body } = require('express-validator');

const passwordRule = body('nova_senha')
  .isString().withMessage('Nova senha obrigatória.')
  .isLength({ min: 8 }).withMessage('Nova senha deve ter no mínimo 8 caracteres.')
  .matches(/[a-zA-Z]/).withMessage('Nova senha deve conter pelo menos 1 letra.')
  .matches(/\d/).withMessage('Nova senha deve conter pelo menos 1 dígito.');

const changePasswordValidator = [
  body('senha_atual')
    .isString().withMessage('Senha atual obrigatória.')
    .notEmpty().withMessage('Senha atual obrigatória.'),
  passwordRule,
];

module.exports = { changePasswordValidator };
