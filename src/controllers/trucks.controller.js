const trucksService = require('../services/trucks.service');
const asyncHandler = require('../utils/asyncHandler');

const list = asyncHandler(async (req, res) => {
  const trucks = await trucksService.list(req.empresaId);
  res.json(trucks);
});

const getById = asyncHandler(async (req, res) => {
  const withAnexos = req.query.anexos === '1' || req.query.anexos === 'true';
  const truck = await trucksService.getById(req.params.id, req.empresaId, { withAnexos });
  res.json(truck);
});

const create = asyncHandler(async (req, res) => {
  const truck = await trucksService.create(req.empresaId, req, req.body);
  res.status(201).json(truck);
});

const update = asyncHandler(async (req, res) => {
  const truck = await trucksService.update(req.params.id, req.empresaId, req, req.body);
  res.json(truck);
});

const remove = asyncHandler(async (req, res) => {
  await trucksService.remove(req.params.id, req.empresaId, req);
  res.json({ message: 'Caminhão removido.' });
});

const addAnexo = asyncHandler(async (req, res) => {
  const anexo = await trucksService.addAnexo(req.params.id, req.empresaId, req, req.body);
  res.status(201).json(anexo);
});

const uploadAnexo = asyncHandler(async (req, res) => {
  const meta = {
    tipo:      req.body?.tipo,
    nome:      req.body?.nome,
    descricao: req.body?.descricao,
  };
  const anexo = await trucksService.addAnexoFile(req.params.id, req.empresaId, req, req.file, meta);
  res.status(201).json(anexo);
});

const downloadAnexo = asyncHandler(async (req, res) => {
  const anexo = await trucksService.getAnexoFile(req.params.id, req.params.anexoId, req.empresaId);
  const filename = anexo.nome || 'anexo';
  res.setHeader('Content-Type', anexo.mime_type || 'application/octet-stream');
  res.setHeader('Content-Disposition', `inline; filename="${encodeURIComponent(filename)}"`);
  if (anexo.tamanho) res.setHeader('Content-Length', anexo.tamanho);
  res.send(Buffer.from(anexo.dados));
});

const removeAnexo = asyncHandler(async (req, res) => {
  await trucksService.removeAnexo(req.params.id, req.params.anexoId, req.empresaId, req);
  res.json({ ok: true });
});

module.exports = {
  list, getById, create, update, remove,
  addAnexo, uploadAnexo, downloadAnexo, removeAnexo,
};
