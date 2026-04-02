const expensesService = require('../services/expenses.service');
const asyncHandler = require('../utils/asyncHandler');

const upsertAll = asyncHandler(async (req, res) => {
  const expenses = await expensesService.upsertAll(req.params.tripId, req.empresaId, req.body);
  res.json(expenses);
});

const updateOne = asyncHandler(async (req, res) => {
  const expense = await expensesService.updateOne(req.params.tripId, req.empresaId, req.params.cat, req.body.valor);
  res.json(expense);
});

const getByTrip = asyncHandler(async (req, res) => {
  const expenses = await expensesService.getByTrip(req.params.tripId, req.empresaId);
  res.json(expenses);
});

module.exports = { upsertAll, updateOne, getByTrip };
