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
  const trip = await tripsService.create(req.params.truckId, req.empresaId, req, req.body);
  res.status(201).json(trip);
});

const update = asyncHandler(async (req, res) => {
  const trip = await tripsService.update(req.params.id, req.empresaId, req, req.body);
  res.json(trip);
});

const remove = asyncHandler(async (req, res) => {
  await tripsService.remove(req.params.id, req.empresaId, req);
  res.json({ message: 'Viagem removida.' });
});

const addAnexo = asyncHandler(async (req, res) => {
  const anexo = await tripsService.addAnexo(req.params.id, req.empresaId, req, req.body);
  res.status(201).json(anexo);
});

const uploadAnexo = asyncHandler(async (req, res) => {
  const meta = {
    tipo:      req.body?.tipo,
    nome:      req.body?.nome,
    descricao: req.body?.descricao,
  };
  const anexo = await tripsService.addAnexoFile(req.params.id, req.empresaId, req, req.file, meta);
  res.status(201).json(anexo);
});

const downloadAnexo = asyncHandler(async (req, res) => {
  const anexo = await tripsService.getAnexoFile(req.params.id, req.params.anexoId, req.empresaId);
  const filename = anexo.nome || 'anexo';
  res.setHeader('Content-Type', anexo.mime_type || 'application/octet-stream');
  res.setHeader('Content-Disposition', `inline; filename="${encodeURIComponent(filename)}"`);
  if (anexo.tamanho) res.setHeader('Content-Length', anexo.tamanho);
  res.send(Buffer.from(anexo.dados));
});

const removeAnexo = asyncHandler(async (req, res) => {
  await tripsService.removeAnexo(req.params.id, req.params.anexoId, req.empresaId, req);
  res.json({ ok: true });
});

module.exports = {
  listByTruck, getById, create, update, remove,
  addAnexo, uploadAnexo, downloadAnexo, removeAnexo,
};
