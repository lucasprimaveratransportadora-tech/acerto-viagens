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
  const empresa = await empresasService.create(req, req.body);
  res.status(201).json(empresa);
});

const update = asyncHandler(async (req, res) => {
  const empresa = await empresasService.update(req.params.id, req, req.body);
  res.json(empresa);
});

const remove = asyncHandler(async (req, res) => {
  await empresasService.remove(req.params.id, req);
  res.json({ message: 'Empresa desativada.' });
});

const uploadLogo = asyncHandler(async (req, res) => res.json(await empresasService.saveLogo(req.params.id, req, req.file)));
const logo = asyncHandler(async (req, res) => {
  const item = await empresasService.getLogo(req.params.id);
  res.set('Content-Type', item.logo_mime);
  res.set('Cache-Control', 'public, max-age=3600');
  res.send(item.logo_dados);
});
const setStatus = asyncHandler(async (req, res) => res.json(await empresasService.setStatus(req.params.id, req, req.body.ativo === true)));

module.exports = { list, getById, create, update, remove, uploadLogo, logo, setStatus };
