const service = require('../services/controleViagens.service');
const asyncHandler = require('../utils/asyncHandler');

const getBoard = asyncHandler(async (req, res) => {
  const board = await service.getBoard(req.empresaId);
  // ETag-like: hash do maior updated_at + nº de cards. Permite ao client
  // pular re-render quando nada mudou (ver controle-viagens.js no polling).
  const maxUpdated = board.reduce((acc, row) => {
    const u = row.state?.updated_at ? new Date(row.state.updated_at).getTime() : 0;
    return Math.max(acc, u);
  }, 0);
  const maxComment = board.reduce((acc, row) => {
    const u = row.last_comment_at ? new Date(row.last_comment_at).getTime() : 0;
    return Math.max(acc, u);
  }, 0);
  res.json({ board, fingerprint: `${board.length}-${maxUpdated}-${maxComment}` });
});

const getDetail = asyncHandler(async (req, res) => {
  const data = await service.getDetail(req.params.truckId, req.empresaId);
  res.json(data);
});

const upsertState = asyncHandler(async (req, res) => {
  const state = await service.upsertState(req.params.truckId, req.empresaId, req, req.body);
  res.json(state);
});

const listComments = asyncHandler(async (req, res) => {
  const items = await service.listComments(req.params.truckId, req.empresaId, req.query);
  res.json(items);
});

const addComment = asyncHandler(async (req, res) => {
  const c = await service.addComment(req.params.truckId, req.empresaId, req, req.body);
  res.status(201).json(c);
});

const deleteComment = asyncHandler(async (req, res) => {
  await service.deleteComment(req.params.truckId, req.params.id, req.empresaId, req);
  res.json({ ok: true });
});

module.exports = { getBoard, getDetail, upsertState, listComments, addComment, deleteComment };
