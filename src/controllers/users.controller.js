const prisma = require('../config/database');
const { hashPassword } = require('../services/auth.service');
const asyncHandler = require('../utils/asyncHandler');

const list = asyncHandler(async (req, res) => {
  const users = await prisma.user.findMany({
    where: { empresa_id: req.user.empresa_id },
    select: { id: true, nome: true, email: true, role: true, ativo: true, created_at: true },
    orderBy: { nome: 'asc' },
  });
  res.json(users);
});

const create = asyncHandler(async (req, res) => {
  const { nome, email, senha, role, empresa_id } = req.body;
  const senha_hash = await hashPassword(senha);

  const user = await prisma.user.create({
    data: {
      nome,
      email,
      senha_hash,
      role: role || 'GESTOR',
      empresa_id: empresa_id || req.user.empresa_id,
    },
    select: { id: true, nome: true, email: true, role: true, ativo: true, created_at: true },
  });
  res.status(201).json(user);
});

const update = asyncHandler(async (req, res) => {
  const { role, ativo, nome } = req.body;
  const data = {};
  if (role !== undefined) data.role = role;
  if (ativo !== undefined) data.ativo = ativo;
  if (nome !== undefined) data.nome = nome;

  const user = await prisma.user.update({
    where: { id: req.params.id },
    data,
    select: { id: true, nome: true, email: true, role: true, ativo: true, created_at: true },
  });
  res.json(user);
});

const remove = asyncHandler(async (req, res) => {
  await prisma.user.update({
    where: { id: req.params.id },
    data: { ativo: false },
  });
  res.json({ message: 'Usuário desativado.' });
});

module.exports = { list, create, update, remove };
