const ctesService = require('../services/ctes.service');
const asyncHandler = require('../utils/asyncHandler');

const listFretesDisponiveis = asyncHandler(async (req, res) => {
  res.json(await ctesService.listFretesDisponiveis(req.empresaId, req.query.q));
});

const listByTrip = asyncHandler(async (req, res) => {
  res.json(await ctesService.listByTrip(req.params.tripId, req.empresaId));
});

const create = asyncHandler(async (req, res) => {
  const cte = await ctesService.create(req.params.tripId, req.empresaId, req, req.body);
  res.status(201).json(cte);
});

const update = asyncHandler(async (req, res) => {
  const cte = await ctesService.update(req.params.id, req.empresaId, req, req.body);
  res.json(cte);
});

const remove = asyncHandler(async (req, res) => {
  await ctesService.remove(req.params.id, req.empresaId, req);
  res.json({ message: 'CT-e removido.' });
});

module.exports = { listFretesDisponiveis, listByTrip, create, update, remove };
