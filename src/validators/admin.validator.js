const { body } = require('express-validator');

const resetPasswordValidator = [
  body('senha')
    .isString()
    .isLength({ min: 8 }).withMessage('Senha deve ter no mínimo 8 caracteres.')
    .matches(/[a-zA-Z]/).withMessage('Senha deve conter pelo menos 1 letra.')
    .matches(/\d/).withMessage('Senha deve conter pelo menos 1 dígito.'),
];

module.exports = { resetPasswordValidator };
