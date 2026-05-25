const { body } = require('express-validator');
const { EXPENSE_CATEGORIES } = require('../utils/constants');

const upsertExpenses = [
  body()
    .custom((value) => {
      // Aceita objeto { CATEGORIA: valor } — vazio é OK (no-op).
      // Array ou tipos não-objeto são rejeitados.
      if (value === null || typeof value !== 'object' || Array.isArray(value)) {
        throw new Error('Body deve ser um objeto { CATEGORIA: valor }.');
      }
      for (const key of Object.keys(value)) {
        if (!EXPENSE_CATEGORIES.includes(key)) {
          throw new Error(`Categoria inválida: ${key}`);
        }
        if (typeof value[key] !== 'number' || isNaN(value[key])) {
          throw new Error(`Valor de ${key} deve ser numérico.`);
        }
      }
      return true;
    }),
];

// Validador pro PATCH /expenses/trip/:tripId/:cat — antes faltava (o body
// `valor` era passado direto pro service e virava 500 se viesse não-numérico).
const updateOneExpense = [
  body('valor')
    .notEmpty().withMessage('valor obrigatório.')
    .isFloat().withMessage('valor deve ser numérico.'),
];

module.exports = { upsertExpenses, updateOneExpense };
