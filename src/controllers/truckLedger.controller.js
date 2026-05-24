const service = require('../services/truckLedger.service');
const asyncHandler = require('../utils/asyncHandler');

const list = asyncHandler(async (req, res) => {
  const items = await service.list(req.params.truckId, req.empresaId, req.query);
  res.json(items);
});

const summary = asyncHandler(async (req, res) => {
  const sum = await service.summary(req.params.truckId, req.empresaId);
  res.json(sum);
});

const overview = asyncHandler(async (req, res) => {
  const ov = await service.overview(req.empresaId);
  res.json(ov);
});

const create = asyncHandler(async (req, res) => {
  const item = await service.create(req.params.truckId, req.empresaId, req, req.body);
  res.status(201).json(item);
});

const update = asyncHandler(async (req, res) => {
  const item = await service.update(req.params.truckId, req.params.id, req.empresaId, req, req.body);
  res.json(item);
});

const remove = asyncHandler(async (req, res) => {
  await service.remove(req.params.truckId, req.params.id, req.empresaId, req);
  res.json({ ok: true });
});

const uploadAnexo = asyncHandler(async (req, res) => {
  const meta = { nome: req.body?.nome };
  const item = await service.addAnexoFile(req.params.truckId, req.params.id, req.empresaId, req, req.file, meta);
  res.status(201).json(item);
});

const addAnexoUrl = asyncHandler(async (req, res) => {
  const item = await service.addAnexoUrl(req.params.truckId, req.params.id, req.empresaId, req, req.body);
  res.status(201).json(item);
});

const downloadAnexo = asyncHandler(async (req, res) => {
  const entry = await service.getAnexoFile(req.params.truckId, req.params.id, req.empresaId);
  const filename = entry.anexo_nome || 'anexo';
  res.setHeader('Content-Type', entry.anexo_mime || 'application/octet-stream');
  res.setHeader('Content-Disposition', `inline; filename="${encodeURIComponent(filename)}"`);
  if (entry.anexo_tamanho) res.setHeader('Content-Length', entry.anexo_tamanho);
  res.send(Buffer.from(entry.anexo_dados));
});

const removeAnexo = asyncHandler(async (req, res) => {
  await service.removeAnexo(req.params.truckId, req.params.id, req.empresaId, req);
  res.json({ ok: true });
});

const importXlsx = asyncHandler(async (req, res) => {
  const options = { truck_id: req.body?.truck_id || null };
  const result = await service.importXlsx(req.empresaId, req, req.file, options);
  res.status(201).json(result);
});

const undoImport = asyncHandler(async (req, res) => {
  const result = await service.undoImport(req.empresaId, req, req.params.batchId);
  res.json(result);
});

module.exports = {
  list, summary, overview,
  create, update, remove,
  uploadAnexo, addAnexoUrl, downloadAnexo, removeAnexo,
  importXlsx, undoImport,
};
