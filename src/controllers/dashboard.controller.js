const dashboardService = require('../services/dashboard.service');
const asyncHandler = require('../utils/asyncHandler');

const getGlobal = asyncHandler(async (req, res) => {
  const data = await dashboardService.getGlobal(req.empresaId);
  res.json(data);
});

const getByTruck = asyncHandler(async (req, res) => {
  const data = await dashboardService.getByTruck(req.params.truckId, req.empresaId);
  res.json(data);
});

module.exports = { getGlobal, getByTruck };
