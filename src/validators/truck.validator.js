const { body } = require('express-validator');

const createTruck = [
  body('placa')
    .trim()
    .notEmpty().withMessage('Placa obrigatória.')
    .customSanitizer(v => v.toUpperCase())
    .matches(/^[A-Z]{3}-?\d[A-Z0-9]\d{2}$/).withMessage('Placa inválida. Use o formato ABC-1D23 ou ABC1D23.'),
  body('modelo').optional(),
  body('motorista').optional(),
];

const updateTruck = [
  body('placa')
    .optional()
    .trim()
    .customSanitizer(v => v.toUpperCase())
    .matches(/^[A-Z]{3}-?\d[A-Z0-9]\d{2}$/).withMessage('Placa inválida. Use o formato ABC-1D23 ou ABC1D23.'),
  body('modelo').optional(),
  body('motorista').optional(),
];

module.exports = { createTruck, updateTruck };
