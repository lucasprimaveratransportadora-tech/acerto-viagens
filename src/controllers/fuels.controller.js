const fuelsService = require('../services/fuels.service');
const asyncHandler = require('../utils/asyncHandler');

const create = asyncHandler(async (req, res) => {
  const fuel = await fuelsService.create(req.params.tripId, req.empresaId, req.body);
  res.status(201).json(fuel);
});

const update = asyncHandler(async (req, res) => {
  const fuel = await fuelsService.update(req.params.id, req.empresaId, req.body);
  res.json(fuel);
});

const remove = asyncHandler(async (req, res) => {
  await fuelsService.remove(req.params.id, req.empresaId);
  res.json({ message: 'Abastecimento removido.' });
});

module.exports = { create, update, remove };
