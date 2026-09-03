const test = require('node:test');
const assert = require('node:assert/strict');

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
