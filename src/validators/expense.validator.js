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

module.exports = { upsertExpenses };
