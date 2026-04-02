const { body } = require('express-validator');
const { EXPENSE_CATEGORIES } = require('../utils/constants');

const upsertExpenses = [
  body()
    .isObject().withMessage('Body deve ser um objeto.')
    .custom((value) => {
      const keys = Object.keys(value);
      if (keys.length === 0) {
        throw new Error('Pelo menos uma categoria deve ser informada.');
      }
      for (const key of keys) {
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

module.exports = { upsertExpenses };
