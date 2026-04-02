const ctesService = require('../services/ctes.service');
const asyncHandler = require('../utils/asyncHandler');

const create = asyncHandler(async (req, res) => {
  const cte = await ctesService.create(req.params.tripId, req.empresaId, req.body);
  res.status(201).json(cte);
});

const update = asyncHandler(async (req, res) => {
  const cte = await ctesService.update(req.params.id, req.empresaId, req.body);
  res.json(cte);
});

const remove = asyncHandler(async (req, res) => {
  await ctesService.remove(req.params.id, req.empresaId);
  res.json({ message: 'CT-e removido.' });
});

module.exports = { create, update, remove };
