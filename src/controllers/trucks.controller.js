const trucksService = require('../services/trucks.service');
const asyncHandler = require('../utils/asyncHandler');

const list = asyncHandler(async (req, res) => {
  const trucks = await trucksService.list(req.empresaId);
  res.json(trucks);
});

const getById = asyncHandler(async (req, res) => {
  const truck = await trucksService.getById(req.params.id, req.empresaId);
  res.json(truck);
});

const create = asyncHandler(async (req, res) => {
  const truck = await trucksService.create(req.empresaId, req.body);
  res.status(201).json(truck);
});

const update = asyncHandler(async (req, res) => {
  const truck = await trucksService.update(req.params.id, req.empresaId, req.body);
  res.json(truck);
});

const remove = asyncHandler(async (req, res) => {
  await trucksService.remove(req.params.id, req.empresaId);
  res.json({ message: 'Caminhão removido.' });
});

module.exports = { list, getById, create, update, remove };
