const service = require('../services/fretesTerceiros.service');
const asyncHandler = require('../utils/asyncHandler');

const list = asyncHandler(async (req, res) => {
  const items = await service.list(req.empresaId, req.query);
  res.json(items);
});

const summary = asyncHandler(async (req, res) => {
  const sum = await service.summary(req.empresaId);
  res.json(sum);
});

const getById = asyncHandler(async (req, res) => {
  const item = await service.getById(req.params.id, req.empresaId);
  res.json(item);
});

const create = asyncHandler(async (req, res) => {
  const item = await service.create(req.empresaId, req, req.body);
  res.status(201).json(item);
});

const update = asyncHandler(async (req, res) => {
  const item = await service.update(req.params.id, req.empresaId, req, req.body);
  res.json(item);
});

const baixar = asyncHandler(async (req, res) => {
  const item = await service.baixar(req.params.id, req.empresaId, req, req.body);
  res.json(item);
});

const linkTrip = asyncHandler(async (req, res) => {
  const item = await service.linkTrip(req.params.id, req.body.trip_id, req.empresaId, req);
  res.json(item);
});

const unlinkTrip = asyncHandler(async (req, res) => {
  const item = await service.unlinkTrip(req.params.id, req.empresaId, req);
  res.json(item);
});

const remove = asyncHandler(async (req, res) => {
  await service.remove(req.params.id, req.empresaId, req);
  res.json({ message: 'Frete terceiro removido.' });
});

module.exports = { list, summary, getById, create, update, baixar, linkTrip, unlinkTrip, remove };
