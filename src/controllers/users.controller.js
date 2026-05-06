const usersService = require('../services/users.service');
const asyncHandler = require('../utils/asyncHandler');

const list = asyncHandler(async (req, res) => {
  const users = await usersService.list(req.user.empresa_id);
  res.json(users);
});

const create = asyncHandler(async (req, res) => {
  const user = await usersService.create(req.user.empresa_id, req, req.body);
  res.status(201).json(user);
});

const update = asyncHandler(async (req, res) => {
  const user = await usersService.update(req.params.id, req.user.empresa_id, req, req.body);
  res.json(user);
});

const remove = asyncHandler(async (req, res) => {
  await usersService.deactivate(req.params.id, req.user.empresa_id, req);
  res.json({ message: 'Usuário desativado.' });
});

const resetPassword = asyncHandler(async (req, res) => {
  const { senha } = req.body;
  const result = await usersService.resetPassword(req.params.id, req.user.empresa_id, req, senha);
  res.json({ message: 'Senha redefinida e sessões encerradas.', ...result });
});

const revokeSessions = asyncHandler(async (req, res) => {
  const result = await usersService.revokeSessions(req.params.id, req.user.empresa_id, req);
  res.json({ message: 'Sessões encerradas.', ...result });
});

module.exports = { list, create, update, remove, resetPassword, revokeSessions };
