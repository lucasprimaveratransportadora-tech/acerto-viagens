const test = require('node:test');
const assert = require('node:assert/strict');

const authServicePath = require.resolve('../src/services/auth.service');
const prismaPath = require.resolve('../src/config/database');
const configPath = require.resolve('../src/config');
const loginEventsPath = require.resolve('../src/services/loginEvents.service');

function loadAuthService({ prisma, bcryptImpl, config = { bcryptRounds: 12 }, loginEvents = { log: async () => {} } }) {
  delete require.cache[authServicePath];
  delete require.cache[prismaPath];
  delete require.cache[configPath];
  delete require.cache[loginEventsPath];

  require.cache[prismaPath] = {
    id: prismaPath,
    filename: prismaPath,
    loaded: true,
    exports: prisma,
  };
  require.cache[configPath] = {
    id: configPath,
    filename: configPath,
    loaded: true,
    exports: config,
  };
  require.cache[loginEventsPath] = {
    id: loginEventsPath,
    filename: loginEventsPath,
    loaded: true,
    exports: loginEvents,
  };

  const bcrypt = require('bcrypt');
  const originalCompare = bcrypt.compare;
  const originalHash = bcrypt.hash;
  bcrypt.compare = bcryptImpl.compare;
  bcrypt.hash = bcryptImpl.hash;

  const authService = require('../src/services/auth.service');

  return {
    authService,
    restore() {
      bcrypt.compare = originalCompare;
      bcrypt.hash = originalHash;
      delete require.cache[authServicePath];
      delete require.cache[prismaPath];
      delete require.cache[configPath];
      delete require.cache[loginEventsPath];
    },
  };
}

test('rejeita troca quando a senha atual esta incorreta', async () => {
  const prisma = {
    user: {
      findUnique: async () => ({ id: 'u1', senha_hash: 'hash-atual', ativo: true }),
    },
    $transaction: async () => {
      throw new Error('nao deveria abrir transacao');
    },
  };
  const bcryptImpl = {
    compare: async () => false,
    hash: async () => 'novo-hash',
  };

  const { authService, restore } = loadAuthService({ prisma, bcryptImpl });

  try {
    assert.equal(typeof authService.changePassword, 'function');
    await assert.rejects(
      () => authService.changePassword('u1', 'SenhaAtual1', 'NovaSenha9'),
      (error) => error?.message === 'Senha atual incorreta.'
    );
  } finally {
    restore();
  }
});

test('atualiza a senha quando a senha atual confere e a nova senha e valida', async () => {
  const updates = [];
  const prisma = {
    user: {
      findUnique: async () => ({ id: 'u1', senha_hash: 'hash-atual', ativo: true }),
    },
    $transaction: async (callback) => callback({
      user: {
        update: async (args) => {
          updates.push(args);
        },
      },
      refreshToken: {
        deleteMany: async () => ({ count: 2 }),
      },
    }),
  };
  const bcryptImpl = {
    compare: async () => true,
    hash: async () => 'hash-novo',
  };

  const { authService, restore } = loadAuthService({ prisma, bcryptImpl });

  try {
    assert.equal(typeof authService.changePassword, 'function');
    const result = await authService.changePassword('u1', 'SenhaAtual1', 'NovaSenha9');
    assert.deepEqual(result, { sessions_revoked: 2 });
    assert.deepEqual(updates, [
      {
        where: { id: 'u1' },
        data: { senha_hash: 'hash-novo' },
      },
    ]);
  } finally {
    restore();
  }
});

test('revoga somente as sessoes do proprio usuario na mesma transacao', async () => {
  const deletedWhere = [];
  const prisma = {
    user: {
      findUnique: async () => ({ id: 'u1', senha_hash: 'hash-atual', ativo: true }),
    },
    $transaction: async (callback) => callback({
      user: {
        update: async () => {},
      },
      refreshToken: {
        deleteMany: async (args) => {
          deletedWhere.push(args.where);
          return { count: 3 };
        },
      },
    }),
  };
  const bcryptImpl = {
    compare: async () => true,
    hash: async () => 'hash-novo',
  };

  const { authService, restore } = loadAuthService({ prisma, bcryptImpl });

  try {
    assert.equal(typeof authService.changePassword, 'function');
    const result = await authService.changePassword('u1', 'SenhaAtual1', 'NovaSenha9');
    assert.equal(result.sessions_revoked, 3);
    assert.deepEqual(deletedWhere, [{ user_id: 'u1' }]);
  } finally {
    restore();
  }
});
