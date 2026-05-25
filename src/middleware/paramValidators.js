const { param } = require('express-validator');
const { EXPENSE_CATEGORIES } = require('../utils/constants');
const validate = require('./validate');

// Antes desta camada, qualquer :id malformado caía direto no Prisma e
// estourava como P2023, virando 500 opaco no errorHandler.
// Aqui rejeitamos cedo, com 400 e mensagem específica do campo.

function uuidParams(...names) {
  return [
    ...names.map((n) =>
      param(n).isUUID().withMessage(`Parâmetro "${n}" deve ser um UUID válido.`)
    ),
    validate,
  ];
}

function expenseCategoryParam(name = 'cat') {
  return [
    param(name)
      .isIn(EXPENSE_CATEGORIES)
      .withMessage(`Parâmetro "${name}" deve ser uma categoria de despesa válida.`),
    validate,
  ];
}

function entityTypeParam(name = 'entityType') {
  return [
    param(name)
      .matches(/^[A-Za-z_]{2,30}$/)
      .withMessage(`Parâmetro "${name}" deve conter apenas letras (2-30 chars).`),
    validate,
  ];
}

module.exports = { uuidParams, expenseCategoryParam, entityTypeParam };
