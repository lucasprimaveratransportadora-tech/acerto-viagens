const empresasService = require('../services/empresas.service');
const asyncHandler = require('../utils/asyncHandler');

const list = asyncHandler(async (req, res) => {
  const empresas = await empresasService.list();
  res.json(empresas);
});

const getById = asyncHandler(async (req, res) => {
  const empresa = await empresasService.getById(req.params.id);
  res.json(empresa);
});

const create = asyncHandler(async (req, res) => {
  const empresa = await empresasService.create(req.body);
  res.status(201).json(empresa);
});

const update = asyncHandler(async (req, res) => {
  const empresa = await empresasService.update(req.params.id, req.body);
  res.json(empresa);
});

const remove = asyncHandler(async (req, res) => {
  await empresasService.remove(req.params.id);
  res.json({ message: 'Empresa desativada.' });
});

module.exports = { list, getById, create, update, remove };
