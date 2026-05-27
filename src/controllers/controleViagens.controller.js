const service = require('../services/controleViagens.service');
const viagens = require('../services/controleViagensViagens.service');
const activity = require('../services/controleViagensActivity.service');
const asyncHandler = require('../utils/asyncHandler');

const getBoard = asyncHandler(async (req, res) => {
  const data = await service.getBoard(req.empresaId);
  res.json(data);
});

const getTruckDetail = asyncHandler(async (req, res) => {
  const data = await service.getTruckDetail(req.params.truckId, req.empresaId);
  res.json(data);
});

const updateColumn = asyncHandler(async (req, res) => {
  const col = await service.updateColumn(req.params.truckId, req.empresaId, req, req.body);
  res.json(col);
});

// Viagens
const listViagens = asyncHandler(async (req, res) => {
  const items = await viagens.listByTruck(req.params.truckId, req.empresaId, req.query);
  res.json(items);
});

const createViagem = asyncHandler(async (req, res) => {
  const v = await viagens.create(req.params.truckId, req.empresaId, req, req.body);
  res.status(201).json(v);
});

const updateViagem = asyncHandler(async (req, res) => {
  const v = await viagens.update(req.params.viagemId, req.empresaId, req, req.body);
  res.json(v);
});

const startViagem = asyncHandler(async (req, res) => {
  const v = await viagens.start(req.params.viagemId, req.empresaId, req);
  res.json(v);
});

const finalizeViagem = asyncHandler(async (req, res) => {
  const v = await viagens.finalize(req.params.viagemId, req.empresaId, req, req.body);
  res.json(v);
});

const cancelViagem = asyncHandler(async (req, res) => {
  const v = await viagens.cancel(req.params.viagemId, req.empresaId, req, req.body);
  res.json(v);
});

const removeViagem = asyncHandler(async (req, res) => {
  await viagens.remove(req.params.viagemId, req.empresaId, req);
  res.json({ ok: true });
});

// Activity
const listActivity = asyncHandler(async (req, res) => {
  const items = await activity.list({
    truckId: req.params.truckId,
    empresaId: req.empresaId,
    viagemId: req.query.viagem_id,
    limit: req.query.limit,
    before: req.query.before,
  });
  res.json(items);
});

const addComment = asyncHandler(async (req, res) => {
  const c = await service.addComment(req.params.truckId, req.empresaId, req, req.body);
  res.status(201).json(c);
});

const deleteComment = asyncHandler(async (req, res) => {
  await activity.deleteComment({
    eventId: req.params.eventId,
    empresaId: req.empresaId,
    req,
  });
  res.json({ ok: true });
});

module.exports = {
  getBoard, getTruckDetail, updateColumn,
  listViagens, createViagem, updateViagem,
  startViagem, finalizeViagem, cancelViagem, removeViagem,
  listActivity, addComment, deleteComment,
};
