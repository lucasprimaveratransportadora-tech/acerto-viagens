const tripsService = require('../services/trips.service');
const asyncHandler = require('../utils/asyncHandler');

const listByTruck = asyncHandler(async (req, res) => {
  const trips = await tripsService.listByTruck(req.params.truckId, req.empresaId);
  res.json(trips);
});

const getById = asyncHandler(async (req, res) => {
  const trip = await tripsService.getById(req.params.id, req.empresaId);
  res.json(trip);
});

const create = asyncHandler(async (req, res) => {
  const trip = await tripsService.create(req.params.truckId, req.empresaId, req.body);
  res.status(201).json(trip);
});

const update = asyncHandler(async (req, res) => {
  const trip = await tripsService.update(req.params.id, req.empresaId, req.body);
  res.json(trip);
});

const remove = asyncHandler(async (req, res) => {
  await tripsService.remove(req.params.id, req.empresaId);
  res.json({ message: 'Viagem removida.' });
});

module.exports = { listByTruck, getById, create, update, remove };
