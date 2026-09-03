const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const usersServicePath = require.resolve('../src/services/users.service');
const prismaPath = require.resolve('../src/config/database');
const authServicePath = require.resolve('../src/services/auth.service');
const auditServicePath = require.resolve('../src/services/audit.service');

function loadUsersService({ prisma, authService = { hashPassword: async () => 'hash' }, audit = { log: async () => {} } }) {
  delete require.cache[usersServicePath];
  delete require.cache[prismaPath];
  delete require.cache[authServicePath];
  delete require.cache[auditServicePath];

  require.cache[prismaPath] = {
    id: prismaPath,
    filename: prismaPath,
    loaded: true,
    exports: prisma,
  };
  require.cache[authServicePath] = {
    id: authServicePath,
    filename: authServicePath,
    loaded: true,
    exports: authService,
  };
  require.cache[auditServicePath] = {
    id: auditServicePath,
    filename: auditServicePath,
    loaded: true,
    exports: audit,
  };

  return {
    usersService: require('../src/services/users.service'),
    restore() {
      delete require.cache[usersServicePath];
      delete require.cache[prismaPath];
      delete require.cache[authServicePath];
      delete require.cache[auditServicePath];
    },
  };
}

async function runValidator(validator, body) {
  const req = { body };
  for (const rule of validator) {
    await rule.run(req);
  }
  return req;
}

test('registerValidator rejeita role privilegiada, empresa_id e modulo invalido', async () => {
  const { registerValidator } = require('../src/validators/auth.validator');
  const req = await runValidator(registerValidator, {
    nome: 'Operador',
    email: 'operador@acme.com',
    senha: 'Senha123',
    role: 'SUPER_ADMIN',
    empresa_id: 'empresa-externa',
    permissoes: ['frota', 'modulo-invalido'],
  });
  const { validationResult } = require('express-validator');
  const errors = validationResult(req).array()
    .map((item) => ({ field: item.path, message: item.msg }))
    .sort((a, b) => a.field.localeCompare(b.field));

  assert.deepEqual(errors, [
    { field: 'empresa_id', message: 'empresa_id não pode ser enviado nesta rota.' },
    { field: 'permissoes', message: 'Permissões inválidas.' },
    { field: 'role', message: 'Role inválido.' },
  ]);
});

test('ADMIN cria GESTOR com modulos selecionados na propria empresa', async () => {
  const created = [];
  const audits = [];
  const prisma = {
    user: {
      create: async (args) => {
        created.push(args);
        return {
          id: 'u-novo',
          nome: args.data.nome,
          email: args.data.email,
          role: args.data.role,
          permissoes: args.data.permissoes,
          ativo: true,
          created_at: new Date('2026-09-02T12:00:00Z'),
        };
      },
    },
  };
  const req = {
    user: { id: 'admin-1', email: 'admin@acme.com', role: 'ADMIN', empresa_id: 'empresa-admin' },
    headers: {},
  };
  const { usersService, restore } = loadUsersService({
    prisma,
    audit: { log: async (entry) => audits.push(entry) },
  });

  try {
    const result = await usersService.create(req, {
      nome: 'Gestor de Frota',
      email: 'gestor@acme.com',
      senha: 'Senha123',
      role: 'GESTOR',
      empresa_id: 'empresa-externa',
      permissoes: ['controle-viagens', 'frota'],
    });

    assert.equal(result.role, 'GESTOR');
    assert.deepEqual(result.permissoes, ['controle-viagens', 'frota']);
    assert.equal(created[0].data.empresa_id, 'empresa-admin');
    assert.equal(created[0].data.role, 'GESTOR');
    assert.deepEqual(audits[0].after.permissoes, ['controle-viagens', 'frota']);
    assert.equal(audits[0].after.senha_hash, undefined);
  } finally {
    restore();
  }
});

test('GESTOR nao pode criar usuarios', async () => {
  const prisma = {
    user: {
      create: async () => {
        throw new Error('nao deveria criar');
      },
    },
  };
  const req = {
    user: { id: 'gestor-1', email: 'gestor@acme.com', role: 'GESTOR', empresa_id: 'empresa-admin' },
    headers: {},
  };
  const { usersService, restore } = loadUsersService({ prisma });

  try {
    await assert.rejects(
      () => usersService.create(req, {
        nome: 'Outro Usuario',
        email: 'novo@acme.com',
        senha: 'Senha123',
        role: 'GESTOR',
        permissoes: ['frota'],
      }),
      (error) => error?.statusCode === 403 && error?.message === 'Apenas ADMIN pode criar usuários.'
    );
  } finally {
    restore();
  }
});

test('list usa somente a empresa da sessao', async () => {
  const calls = [];
  const prisma = {
    user: {
      findMany: async (args) => {
        calls.push(args);
        return [];
      },
    },
  };
  const req = {
    user: { id: 'admin-1', email: 'admin@acme.com', role: 'ADMIN', empresa_id: 'empresa-sessao' },
    headers: {},
  };
  const { usersService, restore } = loadUsersService({ prisma });

  try {
    await usersService.list(req);
    assert.deepEqual(calls, [{
      where: { empresa_id: 'empresa-sessao' },
      select: {
        id: true,
        nome: true,
        email: true,
        role: true,
        permissoes: true,
        ativo: true,
        created_at: true,
      },
      orderBy: { nome: 'asc' },
    }]);
  } finally {
    restore();
  }
});

test('update mantem escopo da sessao, nao eleva indevidamente e audita sem senha hash', async () => {
  const findFirstCalls = [];
  const updateCalls = [];
  const audits = [];
  const prisma = {
    user: {
      findFirst: async (args) => {
        findFirstCalls.push(args);
        return {
          id: 'u-alvo',
          nome: 'Gestor Atual',
          email: 'gestor@acme.com',
          role: 'GESTOR',
          permissoes: ['frota'],
          ativo: true,
          created_at: new Date('2026-09-02T12:00:00Z'),
        };
      },
      update: async (args) => {
        updateCalls.push(args);
        return {
          id: 'u-alvo',
          nome: args.data.nome ?? 'Gestor Atual',
          email: 'gestor@acme.com',
          role: args.data.role ?? 'GESTOR',
          permissoes: args.data.permissoes ?? ['frota'],
          ativo: args.data.ativo ?? true,
          created_at: new Date('2026-09-02T12:00:00Z'),
        };
      },
    },
  };
  const req = {
    user: { id: 'admin-1', email: 'admin@acme.com', role: 'ADMIN', empresa_id: 'empresa-sessao' },
    headers: {},
  };
  const { usersService, restore } = loadUsersService({
    prisma,
    audit: { log: async (entry) => audits.push(entry) },
  });

  try {
    const result = await usersService.update('u-alvo', req, {
      nome: 'Promover sem poder',
      role: 'ADMIN',
      permissoes: ['frota', 'rentabilidade'],
      senha_hash: 'nao-devia-entrar',
    });

    assert.equal(result.role, 'GESTOR');
    assert.deepEqual(findFirstCalls, [{
      where: { id: 'u-alvo', empresa_id: 'empresa-sessao' },
      select: {
        id: true,
        nome: true,
        email: true,
        role: true,
        permissoes: true,
        ativo: true,
        created_at: true,
      },
    }]);
    assert.deepEqual(updateCalls, [{
      where: { id: 'u-alvo' },
      data: {
        nome: 'Promover sem poder',
        role: 'GESTOR',
        permissoes: ['frota', 'rentabilidade'],
      },
      select: {
        id: true,
        nome: true,
        email: true,
        role: true,
        permissoes: true,
        ativo: true,
        created_at: true,
      },
    }]);
    assert.equal(audits[0].before.senha_hash, undefined);
    assert.equal(audits[0].after.senha_hash, undefined);
    assert.equal(audits[0].after.password, undefined);
  } finally {
    restore();
  }
});

test('update preserva ADMIN existente quando o ator nao pode alterar esse papel', async () => {
  const updateCalls = [];
  const prisma = {
    user: {
      findFirst: async () => ({
        id: 'u-admin',
        nome: 'Admin Atual',
        email: 'admin2@acme.com',
        role: 'ADMIN',
        permissoes: ['frota', 'rentabilidade'],
        ativo: true,
        created_at: new Date('2026-09-02T12:00:00Z'),
      }),
      update: async (args) => {
        updateCalls.push(args);
        return {
          id: 'u-admin',
          nome: args.data.nome ?? 'Admin Atual',
          email: 'admin2@acme.com',
          role: args.data.role ?? 'ADMIN',
          permissoes: args.data.permissoes ?? ['frota', 'rentabilidade'],
          ativo: args.data.ativo ?? true,
          created_at: new Date('2026-09-02T12:00:00Z'),
        };
      },
    },
  };
  const req = {
    user: { id: 'admin-1', email: 'admin@acme.com', role: 'ADMIN', empresa_id: 'empresa-sessao' },
    headers: {},
  };
  const { usersService, restore } = loadUsersService({ prisma });

  try {
    const result = await usersService.update('u-admin', req, {
      nome: 'Admin Mantido',
      role: 'GESTOR',
      permissoes: ['frota'],
    });

    assert.equal(result.role, 'ADMIN');
    assert.equal(updateCalls[0].data.role, 'ADMIN');
  } finally {
    restore();
  }
});

test('delete usa empresa da sessao para localizar o usuario', async () => {
  const findFirstCalls = [];
  const updateCalls = [];
  const prisma = {
    user: {
      findFirst: async (args) => {
        findFirstCalls.push(args);
        return {
          id: 'u-alvo',
          nome: 'Gestor Atual',
          email: 'gestor@acme.com',
          role: 'GESTOR',
          permissoes: ['frota'],
          ativo: true,
          created_at: new Date('2026-09-02T12:00:00Z'),
        };
      },
      update: async (args) => {
        updateCalls.push(args);
        return {
          id: 'u-alvo',
          nome: 'Gestor Atual',
          email: 'gestor@acme.com',
          role: 'GESTOR',
          permissoes: ['frota'],
          ativo: false,
          created_at: new Date('2026-09-02T12:00:00Z'),
        };
      },
    },
  };
  const req = {
    user: { id: 'admin-1', email: 'admin@acme.com', role: 'ADMIN', empresa_id: 'empresa-sessao' },
    headers: {},
  };
  const { usersService, restore } = loadUsersService({ prisma });

  try {
    await usersService.deactivate('u-alvo', req);
    assert.equal(findFirstCalls[0].where.empresa_id, 'empresa-sessao');
    assert.equal(updateCalls[0].data.ativo, false);
  } finally {
    restore();
  }
});

test('resetPassword usa empresa da sessao e audita sem credenciais', async () => {
  const findFirstCalls = [];
  const txUpdates = [];
  const txDeletes = [];
  const audits = [];
  const prisma = {
    user: {
      findFirst: async (args) => {
        findFirstCalls.push(args);
        return { id: 'u-alvo', nome: 'Gestor Atual', email: 'gestor@acme.com' };
      },
    },
    refreshToken: {},
    $transaction: async (callback) => callback({
      user: {
        update: async (args) => {
          txUpdates.push(args);
        },
      },
      refreshToken: {
        deleteMany: async (args) => {
          txDeletes.push(args);
          return { count: 4 };
        },
      },
    }),
  };
  const req = {
    user: { id: 'admin-1', email: 'admin@acme.com', role: 'ADMIN', empresa_id: 'empresa-sessao' },
    headers: {},
  };
  const { usersService, restore } = loadUsersService({
    prisma,
    authService: { hashPassword: async () => 'hash-novo' },
    audit: { log: async (entry) => audits.push(entry) },
  });

  try {
    const result = await usersService.resetPassword('u-alvo', req, 'SenhaNova9');
    assert.deepEqual(result, { sessions_revoked: 4 });
    assert.equal(findFirstCalls[0].where.empresa_id, 'empresa-sessao');
    assert.deepEqual(txUpdates, [{ where: { id: 'u-alvo' }, data: { senha_hash: 'hash-novo' } }]);
    assert.deepEqual(txDeletes, [{ where: { user_id: 'u-alvo' } }]);
    assert.equal(audits[0].before.senha_hash, undefined);
    assert.equal(audits[0].after.senha_hash, undefined);
    assert.equal(audits[0].after.password, undefined);
    assert.equal(audits[0].after.password_reset, true);
  } finally {
    restore();
  }
});

test('ui preserva admin existente para ator sem permissao e bloqueia envio coercitivo', () => {
  const source = fs.readFileSync(path.join(__dirname, '../public/js/admin/users.js'), 'utf8');

  assert.match(source, /const isLockedAdmin = !isNew && u\.role === 'ADMIN' && !canAssignAdmin;/);
  assert.match(source, /<select id="uRole"[^>]*\$\{isLockedAdmin \? 'disabled' : ''\}/);
  assert.match(source, /<option value="ADMIN" \$\{u\.role === 'ADMIN' \? 'selected' : ''\}/);
  assert.match(source, /const requestedRole = roleSelect \? roleSelect\.value : 'GESTOR';/);
  assert.match(source, /const role = roleSelect\?\.disabled && !isNew \? null : requestedRole;/);
});
