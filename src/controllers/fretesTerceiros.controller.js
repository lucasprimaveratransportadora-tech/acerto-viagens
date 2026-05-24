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
  const withDetails = req.query.details === '1' || req.query.details === 'true';
  const item = await service.getById(req.params.id, req.empresaId, { withDetails });
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

const removeBaixa = asyncHandler(async (req, res) => {
  await service.removeBaixa(req.params.id, req.params.baixaId, req.empresaId, req);
  res.json({ ok: true });
});

const addAnexo = asyncHandler(async (req, res) => {
  const anexo = await service.addAnexo(req.params.id, req.empresaId, req, req.body);
  res.status(201).json(anexo);
});

const removeAnexo = asyncHandler(async (req, res) => {
  await service.removeAnexo(req.params.id, req.params.anexoId, req.empresaId, req);
  res.json({ ok: true });
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

module.exports = {
  list, summary, getById, create, update,
  baixar, removeBaixa,
  addAnexo, removeAnexo,
  linkTrip, unlinkTrip, remove,
};
