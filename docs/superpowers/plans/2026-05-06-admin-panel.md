# Admin Panel Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Adicionar área administrativa com gestão de usuários, trilha de auditoria financeira e histórico de logins (janela 48h), seguindo o spec aprovado em [docs/superpowers/specs/2026-05-06-admin-panel-design.md](../specs/2026-05-06-admin-panel-design.md).

**Architecture:** Approach 1 (Lean MVP) — duas tabelas novas (`audit_logs` append-only + `login_events` 48h), helper `audit.log()` chamado explicitamente em services de mutação financeira, cleanup via `setInterval`, frontend Vanilla JS com toggle de view (Frota ↔ Admin) e 3 tabs internas.

**Tech Stack:** Node 20, Express 4, Prisma 5, PostgreSQL, bcrypt, JWT, Vanilla JS ESM (sem framework de testes — verificação por checklist manual conforme spec §11).

**Verification approach:** Cada task termina com **smoke test manual** (curl, Prisma Studio, ou abrir página) em vez de TDD automatizado. O checklist consolidado de aceitação é a Task 20.

---

## File map

### Backend
| Arquivo | Ação | Responsabilidade |
|---|---|---|
| `prisma/schema.prisma` | 🔧 | Adicionar 2 enums (`AuditEntity`, `AuditAction`, `LoginAction`), 2 models (`AuditLog`, `LoginEvent`), relações inversas em `Empresa` e `User` |
| `prisma/migrations/<timestamp>_add_audit_and_login_events/migration.sql` | 🆕 | Gerada por `prisma migrate dev` |
| `src/services/audit.service.js` | 🆕 | Helper `log({req, empresaId, entity, action, entityId, before, after})`, sanitiza campos sensíveis |
| `src/services/loginEvents.service.js` | 🆕 | Helper `log({req, action, user, emailAttempt})` + `list({empresaId, filters})` |
| `src/jobs/cleanupLoginEvents.js` | 🆕 | `cleanup()` + `schedule()` via `setInterval` |
| `src/server.js` | 🔧 | Chamar `scheduleCleanup()` no boot |
| `src/services/auth.service.js` | 🔧 | Aceitar `reqMeta` em `login/refresh/logout`, chamar `loginEvents.log()` |
| `src/controllers/auth.controller.js` | 🔧 | Passar `{ip, userAgent}` para o service |
| `src/services/trips.service.js` | 🔧 | Aceitar `req`, chamar `audit.log()` em create/update/remove |
| `src/services/ctes.service.js` | 🔧 | Idem |
| `src/services/fuels.service.js` | 🔧 | Idem |
| `src/services/expenses.service.js` | 🔧 | Idem (inclui upsert) |
| `src/services/trucks.service.js` | 🔧 | Idem |
| `src/controllers/{trips,ctes,fuels,expenses,trucks}.controller.js` | 🔧 | Passar `req` adiante |
| `src/services/users.service.js` | 🆕 | Extrair lógica do controller; adicionar `resetPassword`, `revokeSessions` |
| `src/controllers/users.controller.js` | 🔧 | Usar o service novo, expor 2 endpoints novos |
| `src/routes/users.routes.js` | 🔧 | Registrar `POST /:id/reset-password`, `DELETE /:id/sessions` |
| `src/controllers/audit.controller.js` | 🆕 | `list`, `byEntity` |
| `src/routes/audit.routes.js` | 🆕 | `GET /` e `GET /:entityType/:entityId` |
| `src/controllers/loginEvents.controller.js` | 🆕 | `list` |
| `src/routes/loginEvents.routes.js` | 🆕 | `GET /` |
| `src/routes/index.js` | 🔧 | Registrar `/audit` e `/login-events` |
| `src/validators/admin.validator.js` | 🆕 | `resetPasswordValidator`, `auditFiltersValidator` |

### Frontend
| Arquivo | Ação | Responsabilidade |
|---|---|---|
| `public/index.html` | 🔧 | Botão `⚙️ Admin`, container `#adminView` com tabs vazios (preenchidos via JS) |
| `public/css/admin.css` | 🆕 | Tabs, filter bar, diff modal, badges de ação |
| `public/js/state.js` | 🔧 | Adicionar `adminView`, `adminTab`, `adminFilters`, caches paginados |
| `public/js/app.js` | 🔧 | Wiring: detectar role, mostrar/esconder botão, ouvir clique |
| `public/js/admin/index.js` | 🆕 | Orquestra: troca de view, troca de tab, dispara renders |
| `public/js/admin/users.js` | 🆕 | Lista + modais (criar, editar, reset senha, force logout) |
| `public/js/admin/audit.js` | 🆕 | Lista + filtros + paginação + modal de detalhe |
| `public/js/admin/logins.js` | 🆕 | Lista + filtros + paginação |
| `public/js/admin/diff-renderer.js` | 🆕 | `summarize(before, after)` e `renderDiff(before, after)` |

### Docs
| Arquivo | Ação |
|---|---|
| `docs/superpowers/testing/admin-panel-checklist.md` | 🆕 |

---

## Phase 1 — Backend foundation

### Task 1: Schema + migration

**Files:**
- Modify: `prisma/schema.prisma`
- Create: `prisma/migrations/<timestamp>_add_audit_and_login_events/migration.sql` (gerado)

- [ ] **Step 1: Adicionar enums em `schema.prisma`** (após o enum `AttachmentType`)

```prisma
enum AuditEntity {
  TRIP
  CTE
  FUEL
  EXPENSE
  USER
  TRUCK
}

enum AuditAction {
  CREATE
  UPDATE
  DELETE
}

enum LoginAction {
  LOGIN_SUCCESS
  LOGIN_FAILED
  LOGOUT
  REFRESH_FAILED
}
```

- [ ] **Step 2: Adicionar models `AuditLog` e `LoginEvent`** (no final do arquivo, após `Attachment`)

```prisma
model AuditLog {
  id           String       @id @default(uuid())
  empresa_id   String
  empresa      Empresa      @relation(fields: [empresa_id], references: [id])
  actor_id     String?
  actor        User?        @relation(fields: [actor_id], references: [id])
  actor_email  String
  entity_type  AuditEntity
  entity_id    String
  action       AuditAction
  before       Json?
  after        Json?
  ip           String?
  user_agent   String?
  created_at   DateTime     @default(now())

  @@index([empresa_id, created_at(sort: Desc)])
  @@index([entity_type, entity_id])
  @@index([actor_id, created_at(sort: Desc)])
  @@map("audit_logs")
}

model LoginEvent {
  id            String       @id @default(uuid())
  empresa_id    String?
  empresa       Empresa?     @relation(fields: [empresa_id], references: [id])
  user_id       String?
  user          User?        @relation(fields: [user_id], references: [id])
  email_attempt String
  action        LoginAction
  ip            String?
  user_agent    String?
  created_at    DateTime     @default(now())

  @@index([empresa_id, created_at(sort: Desc)])
  @@index([user_id, created_at(sort: Desc)])
  @@index([created_at])
  @@map("login_events")
}
```

- [ ] **Step 3: Adicionar relações inversas em `Empresa` e `User`**

Em `model Empresa` (após `attachments Attachment[]`):
```prisma
  audit_logs   AuditLog[]
  login_events LoginEvent[]
```

Em `model User` (após `refresh_tokens RefreshToken[]`):
```prisma
  audit_logs    AuditLog[]
  login_events  LoginEvent[]
```

- [ ] **Step 4: Validar schema**

Run: `npx prisma format && npx prisma validate`
Expected: "The schema at prisma\schema.prisma is valid" (sem erros).

- [ ] **Step 5: Gerar migration**

Run: `npx prisma migrate dev --name add_audit_and_login_events --create-only`
Expected: cria `prisma/migrations/<timestamp>_add_audit_and_login_events/migration.sql` sem aplicar.

Inspecionar a SQL gerada e confirmar:
- 3 `CREATE TYPE` (enums)
- 2 `CREATE TABLE` (audit_logs, login_events)
- 6 `CREATE INDEX`
- 4 `ADD CONSTRAINT FOREIGN KEY` (empresa, user em ambas as tabelas)

- [ ] **Step 6: Aplicar migration localmente**

Run: `npx prisma migrate dev`
Expected: "Database is now in sync with your schema." e Prisma Client é regenerado.

- [ ] **Step 7: Smoke test no Prisma Studio**

Run: `npx prisma studio`
Abrir as tabelas `audit_logs` e `login_events` — devem existir vazias. Fechar o studio.

- [ ] **Step 8: Commit**

```bash
git add prisma/schema.prisma prisma/migrations/
git commit -m "feat: add audit_logs and login_events tables (admin panel foundation)"
```

---

### Task 2: Helper services (audit + login events)

**Files:**
- Create: `src/services/audit.service.js`
- Create: `src/services/loginEvents.service.js`

- [ ] **Step 1: Criar `src/services/audit.service.js`**

```js
const prisma = require('../config/database');

const SENSITIVE_KEY_PATTERNS = [
  /_hash$/,
  /_secret$/,
  /^senha/,
  /^password/,
  /^refresh_token/,
];

function sanitize(obj) {
  if (obj === null || obj === undefined) return obj;
  if (typeof obj !== 'object') return obj;
  if (Array.isArray(obj)) return obj.map(sanitize);
  const out = {};
  for (const [k, v] of Object.entries(obj)) {
    if (SENSITIVE_KEY_PATTERNS.some((p) => p.test(k))) continue;
    out[k] = sanitize(v);
  }
  return out;
}

async function log({ req, empresaId, entity, action, entityId, before, after }) {
  await prisma.auditLog.create({
    data: {
      empresa_id: empresaId,
      actor_id: req.user?.id || null,
      actor_email: req.user?.email || 'system',
      entity_type: entity,
      entity_id: entityId,
      action,
      before: before ? sanitize(before) : null,
      after: after ? sanitize(after) : null,
      ip: req.ip || null,
      user_agent: (req.headers?.['user-agent'] || '').slice(0, 500) || null,
    },
  });
}

async function list(empresaId, filters = {}) {
  const { page = 1, limit = 50, entity, entity_id, actor_id, action, from, to } = filters;
  const safeLimit = Math.min(Math.max(parseInt(limit, 10) || 50, 1), 200);
  const safePage = Math.max(parseInt(page, 10) || 1, 1);

  const where = { empresa_id: empresaId };
  if (entity) where.entity_type = entity;
  if (entity_id) where.entity_id = entity_id;
  if (actor_id) where.actor_id = actor_id;
  if (action) where.action = action;
  if (from || to) {
    where.created_at = {};
    if (from) where.created_at.gte = new Date(from);
    if (to) where.created_at.lte = new Date(to);
  }

  const [total, items] = await Promise.all([
    prisma.auditLog.count({ where }),
    prisma.auditLog.findMany({
      where,
      include: { actor: { select: { id: true, nome: true, email: true } } },
      orderBy: { created_at: 'desc' },
      skip: (safePage - 1) * safeLimit,
      take: safeLimit,
    }),
  ]);

  return {
    items,
    total,
    page: safePage,
    limit: safeLimit,
    totalPages: Math.max(Math.ceil(total / safeLimit), 1),
  };
}

async function listByEntity(empresaId, entityType, entityId) {
  return prisma.auditLog.findMany({
    where: { empresa_id: empresaId, entity_type: entityType, entity_id: entityId },
    include: { actor: { select: { id: true, nome: true, email: true } } },
    orderBy: { created_at: 'desc' },
    take: 100,
  });
}

module.exports = { log, list, listByEntity, sanitize };
```

- [ ] **Step 2: Criar `src/services/loginEvents.service.js`**

```js
const prisma = require('../config/database');

const RETENTION_HOURS = 48;

async function log({ req, action, user, emailAttempt }) {
  try {
    await prisma.loginEvent.create({
      data: {
        empresa_id: user?.empresa_id || null,
        user_id: user?.id || null,
        email_attempt: emailAttempt || user?.email || 'unknown',
        action,
        ip: req.ip || null,
        user_agent: (req.headers?.['user-agent'] || '').slice(0, 500) || null,
      },
    });
  } catch (err) {
    // Login events nao devem quebrar o fluxo de login (decisao spec sec 10).
    console.error('[loginEvents.log] failed:', err.message);
  }
}

async function list(empresaId, filters = {}) {
  const { page = 1, limit = 50, user_id, action } = filters;
  const safeLimit = Math.min(Math.max(parseInt(limit, 10) || 50, 1), 200);
  const safePage = Math.max(parseInt(page, 10) || 1, 1);

  const cutoff = new Date(Date.now() - RETENTION_HOURS * 60 * 60 * 1000);

  // Spec sec 9: empresa_id IS NULL (LOGIN_FAILED com email desconhecido)
  // tambem aparece para o admin - sinal de seguranca util.
  const where = {
    AND: [
      { created_at: { gte: cutoff } },
      { OR: [{ empresa_id: empresaId }, { empresa_id: null }] },
    ],
  };
  if (user_id) where.AND.push({ user_id });
  if (action) where.AND.push({ action });

  const [total, items] = await Promise.all([
    prisma.loginEvent.count({ where }),
    prisma.loginEvent.findMany({
      where,
      include: { user: { select: { id: true, nome: true, email: true } } },
      orderBy: { created_at: 'desc' },
      skip: (safePage - 1) * safeLimit,
      take: safeLimit,
    }),
  ]);

  return {
    items,
    total,
    page: safePage,
    limit: safeLimit,
    totalPages: Math.max(Math.ceil(total / safeLimit), 1),
  };
}

module.exports = { log, list, RETENTION_HOURS };
```

- [ ] **Step 3: Smoke test (require sem erro)**

Run: `node -e "const a=require('./src/services/audit.service'); const l=require('./src/services/loginEvents.service'); console.log(Object.keys(a), Object.keys(l));"`
Expected: imprime `[ 'log', 'list', 'listByEntity', 'sanitize' ] [ 'log', 'list', 'RETENTION_HOURS' ]` sem erros.

- [ ] **Step 4: Smoke test do sanitize**

Run:
```
node -e "const {sanitize}=require('./src/services/audit.service');console.log(JSON.stringify(sanitize({nome:'Lucas',senha_hash:'abc',email:'a@b',refresh_token:'xyz',aninhado:{password:'123',ok:true}})))"
```
Expected: `{"nome":"Lucas","email":"a@b","aninhado":{"ok":true}}` (campos sensíveis removidos, recursivo).

- [ ] **Step 5: Commit**

```bash
git add src/services/audit.service.js src/services/loginEvents.service.js
git commit -m "feat: audit and login event helper services with sensitive field sanitization"
```

---

### Task 3: Cleanup job 48h + wiring no server

**Files:**
- Create: `src/jobs/cleanupLoginEvents.js`
- Modify: `src/server.js`

- [ ] **Step 1: Criar diretório e arquivo do job**

Run: `mkdir -p src/jobs`

Criar `src/jobs/cleanupLoginEvents.js`:
```js
const prisma = require('../config/database');

async function cleanup() {
  const cutoff = new Date(Date.now() - 48 * 60 * 60 * 1000);
  const { count } = await prisma.loginEvent.deleteMany({
    where: { created_at: { lt: cutoff } },
  });
  if (count > 0) console.log(`[cleanup] removed ${count} login_events older than 48h`);
}

function schedule() {
  cleanup().catch((err) => console.error('[cleanup] initial run failed:', err.message));
  setInterval(() => {
    cleanup().catch((err) => console.error('[cleanup] periodic run failed:', err.message));
  }, 6 * 60 * 60 * 1000);
}

module.exports = { cleanup, schedule };
```

- [ ] **Step 2: Wire no `src/server.js`**

Editar `src/server.js`:
```js
const app = require('./app');
const config = require('./config');
const prisma = require('./config/database');
const { schedule: scheduleCleanup } = require('./jobs/cleanupLoginEvents');

async function main() {
  try {
    await prisma.$connect();
    console.log('Database connected successfully');

    scheduleCleanup();
    console.log('Login events cleanup scheduled (every 6h, retention 48h)');

    app.listen(config.port, () => {
      console.log(`Server running on port ${config.port} [${config.nodeEnv}]`);
    });
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
}
// ... (resto inalterado)
```

- [ ] **Step 3: Smoke test (sobe local)**

Run: `npm run dev`
Expected: aparece nos logs "Login events cleanup scheduled (every 6h, retention 48h)" sem erro. Encerre o processo (Ctrl+C).

- [ ] **Step 4: Commit**

```bash
git add src/jobs/cleanupLoginEvents.js src/server.js
git commit -m "feat: schedule login_events cleanup every 6h (48h retention)"
```

---

## Phase 2 — Auth instrumentation (login events)

### Task 4: Capturar login/logout/refresh events

**Files:**
- Modify: `src/services/auth.service.js`
- Modify: `src/controllers/auth.controller.js`

- [ ] **Step 1: Refatorar `auth.service.login` para receber `reqMeta` e gravar evento**

Em `src/services/auth.service.js`, substituir a função `login` por:
```js
const loginEvents = require('./loginEvents.service');

async function login(email, senha, reqMeta) {
  const user = await prisma.user.findUnique({
    where: { email },
    include: { empresa: { select: { id: true, nome: true, ativo: true } } },
  });

  if (!user || !user.ativo) {
    // Bcrypt dummy para evitar enumeracao por timing
    await bcrypt.compare('dummy', '$2b$12$abcdefghijklmnopqrstuv');
    await loginEvents.log({
      req: reqMeta,
      action: 'LOGIN_FAILED',
      user: null,
      emailAttempt: email,
    });
    throw ApiError.unauthorized('Email ou senha invalidos.');
  }

  if (!user.empresa.ativo) {
    await loginEvents.log({
      req: reqMeta,
      action: 'LOGIN_FAILED',
      user,
      emailAttempt: email,
    });
    throw ApiError.unauthorized('Empresa inativa. Contate o administrador.');
  }

  const senhaValida = await bcrypt.compare(senha, user.senha_hash);
  if (!senhaValida) {
    await loginEvents.log({
      req: reqMeta,
      action: 'LOGIN_FAILED',
      user,
      emailAttempt: email,
    });
    throw ApiError.unauthorized('Email ou senha invalidos.');
  }

  const accessToken = generateAccessToken(user);
  const refreshToken = await generateRefreshToken(user.id);

  await loginEvents.log({
    req: reqMeta,
    action: 'LOGIN_SUCCESS',
    user,
    emailAttempt: email,
  });

  return {
    accessToken,
    refreshToken,
    user: {
      id: user.id,
      nome: user.nome,
      email: user.email,
      role: user.role,
      empresa: user.empresa,
    },
  };
}
```

- [ ] **Step 2: Modificar `refresh` para registrar falhas**

Substituir o início da função `refresh`:
```js
async function refresh(refreshTokenValue, reqMeta) {
  if (!refreshTokenValue) {
    await loginEvents.log({
      req: reqMeta,
      action: 'REFRESH_FAILED',
      user: null,
      emailAttempt: 'unknown',
    });
    throw ApiError.unauthorized('Refresh token nao fornecido.');
  }

  const stored = await prisma.refreshToken.findUnique({
    where: { token: refreshTokenValue },
    include: { user: { include: { empresa: { select: { id: true, nome: true, ativo: true } } } } },
  });

  if (!stored || stored.expires_at < new Date()) {
    if (stored) await prisma.refreshToken.delete({ where: { id: stored.id } });
    await loginEvents.log({
      req: reqMeta,
      action: 'REFRESH_FAILED',
      user: stored?.user || null,
      emailAttempt: stored?.user?.email || 'unknown',
    });
    throw ApiError.unauthorized('Refresh token invalido ou expirado.');
  }
  // resto inalterado: rotaciona, gera novos tokens, retorna
  // ...
}
```

- [ ] **Step 3: Modificar `logout` para registrar evento**

```js
async function logout(refreshTokenValue, reqMeta) {
  if (refreshTokenValue) {
    const stored = await prisma.refreshToken.findUnique({
      where: { token: refreshTokenValue },
      include: { user: true },
    });
    await prisma.refreshToken.deleteMany({ where: { token: refreshTokenValue } });
    if (stored?.user && reqMeta) {
      await loginEvents.log({
        req: reqMeta,
        action: 'LOGOUT',
        user: stored.user,
        emailAttempt: stored.user.email,
      });
    }
  }
}
```

- [ ] **Step 4: Atualizar `auth.controller.js` para passar `reqMeta`**

```js
const login = asyncHandler(async (req, res) => {
  const { email, senha } = req.body;
  const reqMeta = { ip: req.ip, headers: req.headers };
  const result = await authService.login(email, senha, reqMeta);
  // ... resto inalterado (cookie + json)
});

const refresh = asyncHandler(async (req, res) => {
  const refreshToken = req.cookies.refreshToken;
  const reqMeta = { ip: req.ip, headers: req.headers };
  const result = await authService.refresh(refreshToken, reqMeta);
  // ... resto inalterado
});

const logout = asyncHandler(async (req, res) => {
  const refreshToken = req.cookies.refreshToken;
  const reqMeta = { ip: req.ip, headers: req.headers };
  await authService.logout(refreshToken, reqMeta);
  res.clearCookie('refreshToken', { path: '/api/auth' });
  res.json({ message: 'Logout realizado.' });
});
```

- [ ] **Step 5: Smoke test — login + login falho**

```bash
npm run dev
```

Em outro terminal:
```bash
curl -i -X POST http://localhost:3000/api/auth/login -H "Content-Type: application/json" -d "{\"email\":\"errado@x.com\",\"senha\":\"x\"}"
curl -i -X POST http://localhost:3000/api/auth/login -H "Content-Type: application/json" -d "{\"email\":\"<seu-admin>\",\"senha\":\"<sua-senha>\"}"
```

Expected: o primeiro retorna 401 ("Email ou senha invalidos."), o segundo 200 com `accessToken`. **Tempo de resposta similar nas duas chamadas** (>500ms cada — bcrypt dummy).

Abrir Prisma Studio na tabela `login_events` — devem aparecer 2 entradas (`LOGIN_FAILED` com `user_id NULL` + `LOGIN_SUCCESS`).

- [ ] **Step 6: Commit**

```bash
git add src/services/auth.service.js src/controllers/auth.controller.js
git commit -m "feat: capture login/logout/refresh events with timing-safe failure path"
```

---

## Phase 3 — Audit instrumentation in mutation services

### Task 5: Pattern de propagação de `req` para services

**Files:**
- Modify: `src/services/{trips,ctes,fuels,expenses,trucks}.service.js`
- Modify: `src/controllers/{trips,ctes,fuels,expenses,trucks}.controller.js`

> Pattern: cada `create/update/delete` ganha um parâmetro `req` (após `empresaId`). Controllers passam `req` adiante. Helper `audit.log()` é chamado **após** a operação.

- [ ] **Step 1: Modificar `trips.service.js`**

Editar funções `create`, `update`, `remove` (assinatura nova + chamada `audit.log`):

```js
const audit = require('./audit.service');

async function create(truckId, empresaId, req, data) {
  await verifyTruckOwnership(truckId, empresaId);
  const trip = await prisma.trip.create({
    data: {
      truck_id: truckId,
      data_inicio: data.data_inicio,
      data_fim: data.data_fim,
      origem: data.origem,
      destino: data.destino,
      carga: data.carga,
      km_total: data.km_total,
      status: data.status,
      adiantamento: data.adiantamento,
      observacoes: data.observacoes,
      km_inicial: data.km_inicial,
      km_final: data.km_final,
    },
    include: { ctes: true, fuels: true, expenses: true },
  });
  await audit.log({ req, empresaId, entity: 'TRIP', action: 'CREATE', entityId: trip.id, before: null, after: trip });
  return trip;
}

async function update(id, empresaId, req, data) {
  await verifyTripOwnership(id, empresaId);
  const before = await prisma.trip.findUnique({ where: { id } });
  const after = await prisma.trip.update({
    where: { id },
    data,
    include: { ctes: true, fuels: true, expenses: true },
  });
  await audit.log({ req, empresaId, entity: 'TRIP', action: 'UPDATE', entityId: id, before, after });
  return after;
}

async function remove(id, empresaId, req) {
  await verifyTripOwnership(id, empresaId);
  const before = await prisma.trip.findUnique({ where: { id } });
  const after = await prisma.trip.update({
    where: { id },
    data: { deleted_at: new Date() },
  });
  await audit.log({ req, empresaId, entity: 'TRIP', action: 'DELETE', entityId: id, before, after });
  return after;
}
```

- [ ] **Step 2: Modificar `trips.controller.js` para passar `req`**

Em cada handler que chama o service, passar `req`:
```js
// create:
const trip = await tripsService.create(truckId, req.user.empresa_id, req, req.body);
// update:
const trip = await tripsService.update(req.params.id, req.user.empresa_id, req, req.body);
// remove:
await tripsService.remove(req.params.id, req.user.empresa_id, req);
```

- [ ] **Step 3: Repetir para `ctes.service.js` + controller**

Ler o service atual e replicar o pattern: cada `create/update/remove` recebe `req` após `empresaId`, faz `findUnique` para `before`, executa a operação, chama `audit.log({entity: 'CTE', ...})`. Controller passa `req`.

- [ ] **Step 4: Repetir para `fuels.service.js` + controller**

Idem com `entity: 'FUEL'`.

- [ ] **Step 5: Repetir para `expenses.service.js` + controller**

Idem com `entity: 'EXPENSE'`. **Atenção**: o service tem `upsert` (PATCH `/expenses/trip/:tripId/:categoria`). Tratar como UPDATE se já existia; CREATE se não existia. Padrão:
```js
async function upsert(tripId, empresaId, req, categoria, valor) {
  await verifyTripOwnership(tripId, empresaId);
  const before = await prisma.expense.findUnique({
    where: { trip_id_categoria: { trip_id: tripId, categoria } },
  });
  const after = await prisma.expense.upsert({
    where: { trip_id_categoria: { trip_id: tripId, categoria } },
    create: { trip_id: tripId, categoria, valor },
    update: { valor },
  });
  await audit.log({
    req, empresaId, entity: 'EXPENSE',
    action: before ? 'UPDATE' : 'CREATE',
    entityId: after.id,
    before, after,
  });
  return after;
}
```

- [ ] **Step 6: Repetir para `trucks.service.js` + controller**

Idem com `entity: 'TRUCK'`.

- [ ] **Step 7: Smoke test — criar e editar uma viagem**

Subir o servidor (`npm run dev`), logar pela UI, criar 1 caminhão (deve aparecer audit `TRUCK CREATE`), criar 1 viagem (audit `TRIP CREATE`), editar uma despesa (audit `EXPENSE CREATE` ou `UPDATE`).

Verificar no Prisma Studio que a tabela `audit_logs` tem 3+ entradas, com `actor_email` preenchido e `before`/`after` corretos.

- [ ] **Step 8: Commit**

```bash
git add src/services/{trips,ctes,fuels,expenses,trucks}.service.js src/controllers/{trips,ctes,fuels,expenses,trucks}.controller.js
git commit -m "feat: instrument mutation services with audit.log calls"
```

---

### Task 6: Extrair `users.service.js` + audit em ações de usuário

**Files:**
- Create: `src/services/users.service.js`
- Modify: `src/controllers/users.controller.js`

- [ ] **Step 1: Criar `src/services/users.service.js`**

```js
const prisma = require('../config/database');
const ApiError = require('../utils/ApiError');
const { hashPassword } = require('./auth.service');
const audit = require('./audit.service');

async function list(empresaId) {
  return prisma.user.findMany({
    where: { empresa_id: empresaId },
    select: { id: true, nome: true, email: true, role: true, ativo: true, created_at: true },
    orderBy: { nome: 'asc' },
  });
}

async function create(empresaId, req, { nome, email, senha, role }) {
  const senha_hash = await hashPassword(senha);
  const user = await prisma.user.create({
    data: {
      nome,
      email,
      senha_hash,
      role: role || 'GESTOR',
      empresa_id: empresaId,
    },
    select: { id: true, nome: true, email: true, role: true, ativo: true, created_at: true },
  });
  await audit.log({
    req, empresaId, entity: 'USER', action: 'CREATE',
    entityId: user.id,
    before: null,
    after: user,
  });
  return user;
}

async function update(id, empresaId, req, { nome, role, ativo }) {
  if (req.user.id === id) {
    throw ApiError.forbidden('Voce nao pode alterar a propria conta por aqui.');
  }
  const before = await prisma.user.findFirst({
    where: { id, empresa_id: empresaId },
    select: { id: true, nome: true, email: true, role: true, ativo: true, created_at: true },
  });
  if (!before) throw ApiError.notFound('Usuario nao encontrado.');

  const data = {};
  if (nome !== undefined) data.nome = nome;
  if (role !== undefined) data.role = role;
  if (ativo !== undefined) data.ativo = ativo;

  const after = await prisma.user.update({
    where: { id },
    data,
    select: { id: true, nome: true, email: true, role: true, ativo: true, created_at: true },
  });
  await audit.log({
    req, empresaId, entity: 'USER', action: 'UPDATE',
    entityId: id, before, after,
  });
  return after;
}

async function deactivate(id, empresaId, req) {
  if (req.user.id === id) {
    throw ApiError.forbidden('Voce nao pode desativar a propria conta.');
  }
  return update(id, empresaId, req, { ativo: false });
}

async function resetPassword(id, empresaId, req, novaSenha) {
  if (req.user.id === id) {
    throw ApiError.forbidden('Voce nao pode resetar a propria senha por aqui.');
  }
  const target = await prisma.user.findFirst({
    where: { id, empresa_id: empresaId },
    select: { id: true, nome: true, email: true },
  });
  if (!target) throw ApiError.notFound('Usuario nao encontrado.');

  const senha_hash = await hashPassword(novaSenha);

  const result = await prisma.$transaction(async (tx) => {
    await tx.user.update({ where: { id }, data: { senha_hash } });
    const revoked = await tx.refreshToken.deleteMany({ where: { user_id: id } });
    return revoked.count;
  });

  await audit.log({
    req, empresaId, entity: 'USER', action: 'UPDATE',
    entityId: id,
    before: target,
    after: { ...target, password_reset: true, sessions_revoked: result },
  });

  return { sessions_revoked: result };
}

async function revokeSessions(id, empresaId, req) {
  if (req.user.id === id) {
    throw ApiError.forbidden('Voce nao pode encerrar suas proprias sessoes por aqui.');
  }
  const target = await prisma.user.findFirst({
    where: { id, empresa_id: empresaId },
    select: { id: true, nome: true, email: true },
  });
  if (!target) throw ApiError.notFound('Usuario nao encontrado.');

  const { count } = await prisma.refreshToken.deleteMany({ where: { user_id: id } });

  await audit.log({
    req, empresaId, entity: 'USER', action: 'UPDATE',
    entityId: id,
    before: target,
    after: { ...target, sessions_revoked: count },
  });

  return { revoked: count };
}

module.exports = { list, create, update, deactivate, resetPassword, revokeSessions };
```

- [ ] **Step 2: Refatorar `users.controller.js` para usar o service**

```js
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
  res.json({ message: 'Usuario desativado.' });
});

const resetPassword = asyncHandler(async (req, res) => {
  const { senha } = req.body;
  const result = await usersService.resetPassword(req.params.id, req.user.empresa_id, req, senha);
  res.json({ message: 'Senha redefinida e sessoes encerradas.', ...result });
});

const revokeSessions = asyncHandler(async (req, res) => {
  const result = await usersService.revokeSessions(req.params.id, req.user.empresa_id, req);
  res.json({ message: 'Sessoes encerradas.', ...result });
});

module.exports = { list, create, update, remove, resetPassword, revokeSessions };
```

- [ ] **Step 3: Smoke test (criar usuário via curl)**

Logado como admin (use o accessToken da Task 4 step 5):
```bash
curl -X POST http://localhost:3000/api/users -H "Content-Type: application/json" -H "Authorization: Bearer <token>" -d "{\"nome\":\"Teste\",\"email\":\"teste@x.com\",\"senha\":\"teste1234\",\"role\":\"GESTOR\"}"
```
Expected: 201 com `{id, nome, email, role: "GESTOR", ativo: true, ...}`. Verificar `audit_logs` no Studio: 1 entrada `USER CREATE`.

- [ ] **Step 4: Commit**

```bash
git add src/services/users.service.js src/controllers/users.controller.js
git commit -m "feat: extract users.service with reset-password and revoke-sessions"
```

---

## Phase 4 — Read endpoints + admin user actions

### Task 7: `GET /api/audit` (controller, route, registro)

**Files:**
- Create: `src/controllers/audit.controller.js`
- Create: `src/routes/audit.routes.js`
- Modify: `src/routes/index.js`

- [ ] **Step 1: Criar `src/controllers/audit.controller.js`**

```js
const auditService = require('../services/audit.service');
const asyncHandler = require('../utils/asyncHandler');

const list = asyncHandler(async (req, res) => {
  const result = await auditService.list(req.user.empresa_id, req.query);
  res.json(result);
});

const byEntity = asyncHandler(async (req, res) => {
  const { entityType, entityId } = req.params;
  const items = await auditService.listByEntity(req.user.empresa_id, entityType.toUpperCase(), entityId);
  res.json({ items });
});

module.exports = { list, byEntity };
```

- [ ] **Step 2: Criar `src/routes/audit.routes.js`**

```js
const { Router } = require('express');
const controller = require('../controllers/audit.controller');
const auth = require('../middleware/auth');
const rbac = require('../middleware/rbac');

const router = Router();

router.get('/', auth, rbac('ADMIN'), controller.list);
router.get('/:entityType/:entityId', auth, rbac('ADMIN'), controller.byEntity);

module.exports = router;
```

- [ ] **Step 3: Registrar em `src/routes/index.js`**

Adicionar a linha:
```js
router.use('/audit', require('./audit.routes'));
```

- [ ] **Step 4: Smoke test**

```bash
curl -H "Authorization: Bearer <token>" "http://localhost:3000/api/audit?limit=5"
```
Expected: JSON `{items: [...], total, page, limit, totalPages}` com pelo menos 1 item (do criar de usuário acima).

Tentar como GESTOR:
```bash
curl -i -H "Authorization: Bearer <token-gestor>" "http://localhost:3000/api/audit"
```
Expected: 403.

- [ ] **Step 5: Commit**

```bash
git add src/controllers/audit.controller.js src/routes/audit.routes.js src/routes/index.js
git commit -m "feat: GET /api/audit endpoint (paginated, ADMIN-only)"
```

---

### Task 8: `GET /api/login-events`

**Files:**
- Create: `src/controllers/loginEvents.controller.js`
- Create: `src/routes/loginEvents.routes.js`
- Modify: `src/routes/index.js`

- [ ] **Step 1: Criar `src/controllers/loginEvents.controller.js`**

```js
const loginEventsService = require('../services/loginEvents.service');
const asyncHandler = require('../utils/asyncHandler');

const list = asyncHandler(async (req, res) => {
  const result = await loginEventsService.list(req.user.empresa_id, req.query);
  res.json(result);
});

module.exports = { list };
```

- [ ] **Step 2: Criar `src/routes/loginEvents.routes.js`**

```js
const { Router } = require('express');
const controller = require('../controllers/loginEvents.controller');
const auth = require('../middleware/auth');
const rbac = require('../middleware/rbac');

const router = Router();

router.get('/', auth, rbac('ADMIN'), controller.list);

module.exports = router;
```

- [ ] **Step 3: Registrar em `src/routes/index.js`**

```js
router.use('/login-events', require('./loginEvents.routes'));
```

- [ ] **Step 4: Smoke test**

```bash
curl -H "Authorization: Bearer <token>" "http://localhost:3000/api/login-events"
```
Expected: JSON com pelo menos 2 itens (LOGIN_FAILED + LOGIN_SUCCESS gerados na Task 4).

- [ ] **Step 5: Commit**

```bash
git add src/controllers/loginEvents.controller.js src/routes/loginEvents.routes.js src/routes/index.js
git commit -m "feat: GET /api/login-events endpoint (48h window, ADMIN-only)"
```

---

### Task 9: `POST /api/users/:id/reset-password` + `DELETE /api/users/:id/sessions`

**Files:**
- Create: `src/validators/admin.validator.js`
- Modify: `src/routes/users.routes.js`

- [ ] **Step 1: Criar `src/validators/admin.validator.js`**

```js
const { body } = require('express-validator');

const resetPasswordValidator = [
  body('senha')
    .isString()
    .isLength({ min: 8 }).withMessage('Senha deve ter no minimo 8 caracteres.')
    .matches(/[a-zA-Z]/).withMessage('Senha deve conter pelo menos 1 letra.')
    .matches(/\d/).withMessage('Senha deve conter pelo menos 1 digito.'),
];

module.exports = { resetPasswordValidator };
```

- [ ] **Step 2: Atualizar `src/routes/users.routes.js`**

```js
const { Router } = require('express');
const controller = require('../controllers/users.controller');
const { registerValidator } = require('../validators/auth.validator');
const { resetPasswordValidator } = require('../validators/admin.validator');
const validate = require('../middleware/validate');
const auth = require('../middleware/auth');
const rbac = require('../middleware/rbac');

const router = Router();

router.get('/', auth, rbac('ADMIN'), controller.list);
router.post('/', auth, rbac('ADMIN'), registerValidator, validate, controller.create);
router.patch('/:id', auth, rbac('ADMIN'), controller.update);
router.delete('/:id', auth, rbac('ADMIN'), controller.remove);
router.post('/:id/reset-password', auth, rbac('ADMIN'), resetPasswordValidator, validate, controller.resetPassword);
router.delete('/:id/sessions', auth, rbac('ADMIN'), controller.revokeSessions);

module.exports = router;
```

- [ ] **Step 3: Smoke test — reset password**

```bash
# pegar id do usuario teste:
curl -H "Authorization: Bearer <admin-token>" http://localhost:3000/api/users
# resetar:
curl -X POST -H "Authorization: Bearer <admin-token>" -H "Content-Type: application/json" -d "{\"senha\":\"novaSenha123\"}" http://localhost:3000/api/users/<id-teste>/reset-password
```
Expected: `{message: "Senha redefinida e sessoes encerradas.", sessions_revoked: 0}`. Em `audit_logs` aparece 1 entrada com `after.password_reset = true`.

- [ ] **Step 4: Smoke test — senha curta rejeitada**

```bash
curl -i -X POST -H "Authorization: Bearer <admin-token>" -H "Content-Type: application/json" -d "{\"senha\":\"x\"}" http://localhost:3000/api/users/<id>/reset-password
```
Expected: 400 com mensagem clara.

- [ ] **Step 5: Smoke test — admin nao pode resetar a propria senha**

```bash
curl -i -X POST -H "Authorization: Bearer <admin-token>" -H "Content-Type: application/json" -d "{\"senha\":\"novaSenha123\"}" http://localhost:3000/api/users/<seu-id-admin>/reset-password
```
Expected: 403.

- [ ] **Step 6: Smoke test — revoke sessions**

```bash
curl -X DELETE -H "Authorization: Bearer <admin-token>" http://localhost:3000/api/users/<id-teste>/sessions
```
Expected: `{message: "Sessoes encerradas.", revoked: <n>}`.

- [ ] **Step 7: Commit**

```bash
git add src/validators/admin.validator.js src/routes/users.routes.js
git commit -m "feat: POST /users/:id/reset-password and DELETE /users/:id/sessions"
```

---

## Phase 5 — Frontend foundation

### Task 10: Botão Admin + view toggle + estado

**Files:**
- Modify: `public/index.html`
- Create: `public/css/admin.css`
- Modify: `public/js/state.js`
- Modify: `public/js/app.js`
- Create: `public/js/admin/index.js`

- [ ] **Step 1: Adicionar `admin.css` ao `<head>` de `public/index.html`**

```html
<link rel="stylesheet" href="/css/admin.css">
```

- [ ] **Step 2: Adicionar botão `⚙️ Admin` no header de `public/index.html`**

Em `<div class="header-actions">`, antes do botão Sair:
```html
<button class="btn btn-ghost btn-sm" id="adminBtn" onclick="toggleAdmin()" style="display:none">⚙️ Admin</button>
```

- [ ] **Step 3: Adicionar container `#adminView` em `public/index.html`**

Após `</div>` do `<div class="container">` que tem `<aside>` e `<main>`:
```html
<div id="adminView" style="display:none;padding:1rem">
  <div class="admin-header">
    <button class="btn btn-ghost btn-sm" onclick="toggleAdmin()">&larr; Voltar a Frota</button>
    <div class="admin-tabs">
      <button class="admin-tab active" data-tab="users" onclick="switchAdminTab('users')">Usuarios</button>
      <button class="admin-tab" data-tab="audit" onclick="switchAdminTab('audit')">Auditoria</button>
      <button class="admin-tab" data-tab="logins" onclick="switchAdminTab('logins')">Logins (48h)</button>
    </div>
  </div>
  <div id="adminContent"></div>
</div>
```

- [ ] **Step 4: Criar `public/css/admin.css`**

```css
.admin-header {
  display: flex;
  align-items: center;
  gap: 1.5rem;
  padding-bottom: .8rem;
  border-bottom: 1px solid var(--border);
  margin-bottom: 1rem;
}

.admin-tabs {
  display: flex;
  gap: .25rem;
  margin-left: auto;
}

.admin-tab {
  background: transparent;
  border: 1px solid transparent;
  color: var(--muted);
  padding: .5rem 1rem;
  font-size: .8rem;
  font-weight: 600;
  letter-spacing: 1px;
  text-transform: uppercase;
  cursor: pointer;
  border-radius: 6px;
  transition: all .15s ease;
}

.admin-tab:hover { background: rgba(255,255,255,.04); color: var(--text); }
.admin-tab.active { background: var(--surface); border-color: var(--border); color: var(--accent); }

.admin-table {
  width: 100%;
  border-collapse: collapse;
  font-size: .8rem;
  margin-top: .5rem;
}
.admin-table th, .admin-table td {
  padding: .55rem .7rem;
  border-bottom: 1px solid var(--border);
  text-align: left;
}
.admin-table th { color: var(--muted); font-size: .7rem; text-transform: uppercase; letter-spacing: 1px; }
.admin-table tr:hover td { background: rgba(255,255,255,.02); }

.admin-filters {
  display: flex;
  gap: .5rem;
  flex-wrap: wrap;
  align-items: end;
  margin-bottom: .8rem;
  padding: .6rem .75rem;
  background: rgba(255,255,255,.02);
  border: 1px solid var(--border);
  border-radius: 6px;
}
.admin-filters .form-group { margin: 0; }

.pagination {
  display: flex;
  gap: .35rem;
  justify-content: center;
  align-items: center;
  margin-top: 1rem;
  font-size: .75rem;
  color: var(--muted);
}
.pagination button {
  background: var(--surface);
  border: 1px solid var(--border);
  color: var(--text);
  padding: .3rem .6rem;
  border-radius: 4px;
  cursor: pointer;
}
.pagination button:disabled { opacity: .4; cursor: not-allowed; }

.action-badge {
  display: inline-block;
  padding: .15rem .4rem;
  border-radius: 3px;
  font-size: .68rem;
  font-weight: 600;
  letter-spacing: .5px;
}
.action-CREATE { background: rgba(34,197,94,.12); color: #22c55e; }
.action-UPDATE { background: rgba(56,189,248,.12); color: #38bdf8; }
.action-DELETE { background: rgba(227,6,19,.15); color: var(--danger); }
.action-LOGIN_SUCCESS { background: rgba(34,197,94,.12); color: #22c55e; }
.action-LOGIN_FAILED { background: rgba(227,6,19,.15); color: var(--danger); }
.action-LOGOUT { background: rgba(148,163,184,.12); color: #94a3b8; }
.action-REFRESH_FAILED { background: rgba(234,179,8,.12); color: #eab308; }

.diff-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 1rem; }
.diff-col { background: rgba(255,255,255,.02); padding: .75rem; border-radius: 6px; font-family: 'IBM Plex Mono', monospace; font-size: .75rem; }
.diff-col h4 { margin: 0 0 .5rem 0; color: var(--muted); font-size: .7rem; text-transform: uppercase; letter-spacing: 1px; }
.diff-line.changed { background: rgba(234,179,8,.1); padding: 2px 4px; border-radius: 3px; }
```

- [ ] **Step 5: Adicionar estado em `public/js/state.js`**

No final do objeto exportado:
```js
adminView: false,
adminTab: 'users',
adminFilters: {
  audit:  { entity: '', entity_id: '', actor_id: '', action: '', from: '', to: '', page: 1, limit: 50 },
  logins: { user_id: '', action: '', page: 1, limit: 50 },
},
adminUsers: [],
adminAuditPage:  { items: [], total: 0, page: 1, totalPages: 1 },
adminLoginsPage: { items: [], total: 0, page: 1, totalPages: 1 },
```

- [ ] **Step 6: Criar `public/js/admin/index.js`**

```js
import { state } from '../state.js';
import { getCurrentUser } from '../auth.js';
import { renderUsers } from './users.js';
import { renderAudit } from './audit.js';
import { renderLogins } from './logins.js';

export function initAdmin() {
  const user = getCurrentUser();
  const btn = document.getElementById('adminBtn');
  if (!btn) return;
  btn.style.display = user?.role === 'ADMIN' ? 'inline-flex' : 'none';
}

window.toggleAdmin = function () {
  state.adminView = !state.adminView;
  document.querySelector('.container').style.display = state.adminView ? 'none' : '';
  document.getElementById('adminView').style.display = state.adminView ? 'block' : 'none';
  document.querySelector('.header-actions').querySelectorAll('button').forEach(b => {
    if (b.id === 'adminBtn' || b.textContent.trim() === 'Sair') return;
    b.style.display = state.adminView ? 'none' : '';
  });
  if (state.adminView) renderCurrentTab();
};

window.switchAdminTab = function (tab) {
  state.adminTab = tab;
  document.querySelectorAll('.admin-tab').forEach(el => {
    el.classList.toggle('active', el.dataset.tab === tab);
  });
  renderCurrentTab();
};

function renderCurrentTab() {
  const container = document.getElementById('adminContent');
  if (!container) return;
  container.innerHTML = '<div style="padding:2rem;text-align:center;color:var(--muted)">Carregando...</div>';
  if (state.adminTab === 'users') renderUsers(container);
  else if (state.adminTab === 'audit') renderAudit(container);
  else if (state.adminTab === 'logins') renderLogins(container);
}
```

- [ ] **Step 7: Criar stubs vazios para `users.js`, `audit.js`, `logins.js`**

```js
// public/js/admin/users.js
export async function renderUsers(container) {
  container.innerHTML = '<div style="padding:2rem;text-align:center">Tab Usuarios — em construcao</div>';
}
```
Idem para `audit.js` (`renderAudit`) e `logins.js` (`renderLogins`).

- [ ] **Step 8: Wire em `public/js/app.js`**

Importar e chamar `initAdmin()` após login bem-sucedido. Encontrar o ponto onde `showApp()` é chamado e adicionar:
```js
import { initAdmin } from './admin/index.js';
// ... no fim do success do login:
initAdmin();
```

- [ ] **Step 9: Smoke test (UI)**

Recarregar a página, logar como admin. Botão "⚙️ Admin" deve aparecer no header. Clicar — deve esconder a sidebar/main, mostrar a aba com 3 tabs e mensagem "em construcao". Clicar entre tabs — texto muda. Clicar "← Voltar à Frota" — volta. Logar como GESTOR (criar 1 se preciso) — botão **NÃO** aparece.

- [ ] **Step 10: Commit**

```bash
git add public/index.html public/css/admin.css public/js/state.js public/js/app.js public/js/admin/
git commit -m "feat(ui): admin view toggle with 3 tab stubs (visible to ADMIN only)"
```

---

## Phase 6 — Frontend tabs

### Task 11: Tab Usuários — listar, criar, editar, ativar/desativar

**Files:**
- Modify: `public/js/admin/users.js`

- [ ] **Step 1: Implementar `renderUsers` em `public/js/admin/users.js`**

```js
import { api } from '../api.js';
import { state } from '../state.js';
import { esc } from '../utils.js';

export async function renderUsers(container) {
  try {
    state.adminUsers = await api.get('/api/users');
  } catch (e) {
    container.innerHTML = `<div style="color:var(--danger);padding:1rem">Erro: ${esc(e.message)}</div>`;
    return;
  }
  draw(container, '');
}

function draw(container, search) {
  const filtered = state.adminUsers.filter(u =>
    !search ||
    u.nome.toLowerCase().includes(search.toLowerCase()) ||
    u.email.toLowerCase().includes(search.toLowerCase())
  );

  container.innerHTML = `
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:.5rem">
      <button class="btn btn-accent btn-sm" onclick="adminUserNew()">+ Novo Usuario</button>
      <input class="inline-input" placeholder="Buscar nome/email..." style="width:250px" oninput="adminUserFilter(this.value)" value="${esc(search)}">
    </div>
    <table class="admin-table">
      <thead>
        <tr><th>Nome</th><th>Email</th><th>Role</th><th>Status</th><th>Criado</th><th style="text-align:right">Acoes</th></tr>
      </thead>
      <tbody>
        ${filtered.map(u => `
          <tr>
            <td>${esc(u.nome)}</td>
            <td><code style="font-size:.7rem;color:var(--muted)">${esc(u.email)}</code></td>
            <td><span class="action-badge action-${u.role === 'ADMIN' ? 'DELETE' : 'UPDATE'}">${u.role}</span></td>
            <td>${u.ativo ? '<span style="color:var(--success)">Ativo</span>' : '<span style="color:var(--muted)">Inativo</span>'}</td>
            <td style="font-size:.7rem;color:var(--muted)">${new Date(u.created_at).toLocaleDateString('pt-BR')}</td>
            <td style="text-align:right;white-space:nowrap">
              <button class="btn btn-ghost btn-sm" onclick="adminUserEdit('${esc(u.id)}')">Editar</button>
              <button class="btn btn-ghost btn-sm" onclick="adminUserResetPwd('${esc(u.id)}')" title="Resetar senha">&#x21bb; Senha</button>
              <button class="btn btn-ghost btn-sm" onclick="adminUserRevoke('${esc(u.id)}')" title="Encerrar sessoes">Sair</button>
              <button class="btn btn-ghost btn-sm" onclick="adminUserToggle('${esc(u.id)}', ${!u.ativo})">${u.ativo ? 'Desativar' : 'Ativar'}</button>
            </td>
          </tr>
        `).join('') || `<tr><td colspan="6" style="text-align:center;color:var(--muted);padding:2rem">Nenhum usuario</td></tr>`}
      </tbody>
    </table>
  `;
}

window.adminUserFilter = function (val) {
  draw(document.getElementById('adminContent'), val);
};

window.adminUserNew = function () {
  showUserModal({ id: '', nome: '', email: '', role: 'GESTOR', ativo: true });
};

window.adminUserEdit = function (id) {
  const u = state.adminUsers.find(x => x.id === id);
  if (u) showUserModal(u);
};

window.adminUserToggle = async function (id, ativo) {
  if (!confirm(ativo ? 'Reativar este usuario?' : 'Desativar este usuario? Ele perde acesso imediatamente.')) return;
  try {
    await api.patch('/api/users/' + id, { ativo });
    await renderUsers(document.getElementById('adminContent'));
  } catch (e) { alert('Erro: ' + e.message); }
};

function showUserModal(u) {
  const isNew = !u.id;
  const html = `
    <div class="modal-overlay" id="userModal" style="display:flex">
      <div class="modal" style="width:480px">
        <div class="modal-title">${isNew ? '+ Novo Usuario' : 'Editar Usuario'}</div>
        <div class="form-row"><div class="form-group">
          <label>Nome *</label><input id="uNome" value="${esc(u.nome)}">
        </div></div>
        <div class="form-row"><div class="form-group">
          <label>Email *</label><input id="uEmail" type="email" value="${esc(u.email)}" ${isNew ? '' : 'disabled'}>
        </div></div>
        ${isNew ? `<div class="form-row"><div class="form-group">
          <label>Senha *</label><input id="uSenha" type="password" placeholder="Min 8 chars, 1 letra + 1 digito">
        </div></div>` : ''}
        <div class="form-row"><div class="form-group">
          <label>Role</label>
          <select id="uRole">
            <option value="GESTOR" ${u.role === 'GESTOR' ? 'selected' : ''}>GESTOR</option>
            <option value="ADMIN" ${u.role === 'ADMIN' ? 'selected' : ''}>ADMIN</option>
          </select>
        </div></div>
        ${isNew ? '' : `<div class="form-row"><div class="form-group">
          <label><input id="uAtivo" type="checkbox" ${u.ativo ? 'checked' : ''}> Ativo</label>
        </div></div>`}
        <div class="modal-actions">
          <button class="btn btn-ghost" onclick="document.getElementById('userModal').remove()">Cancelar</button>
          <button class="btn btn-accent" onclick="adminUserSave('${esc(u.id)}', ${isNew})">Salvar</button>
        </div>
      </div>
    </div>`;
  document.body.insertAdjacentHTML('beforeend', html);
}

window.adminUserSave = async function (id, isNew) {
  const nome = document.getElementById('uNome').value.trim();
  const email = isNew ? document.getElementById('uEmail').value.trim() : null;
  const senha = isNew ? document.getElementById('uSenha').value : null;
  const role = document.getElementById('uRole').value;
  const ativo = isNew ? true : document.getElementById('uAtivo').checked;
  if (!nome) return alert('Nome obrigatorio.');
  if (isNew && (!email || !senha)) return alert('Email e senha obrigatorios.');
  try {
    if (isNew) await api.post('/api/users', { nome, email, senha, role });
    else await api.patch('/api/users/' + id, { nome, role, ativo });
    document.getElementById('userModal').remove();
    await renderUsers(document.getElementById('adminContent'));
  } catch (e) { alert('Erro: ' + e.message); }
};
```

- [ ] **Step 2: Smoke test**

Recarregar página, ir em Admin → Usuários. Lista deve mostrar pelo menos `lucasprimaveratransportadora@...` (ADMIN). Filtro de busca funciona. Clicar `+ Novo Usuário` → preencher → salvar → tabela atualiza com o novo usuário. Clicar `Editar` → mudar nome → salvar. Clicar `Desativar` → confirmar → linha mostra "Inativo".

- [ ] **Step 3: Commit**

```bash
git add public/js/admin/users.js
git commit -m "feat(ui): admin tab Usuarios with list, create, edit, activate/deactivate"
```

---

### Task 12: Tab Usuários — Reset senha + Force logout (modais)

**Files:**
- Modify: `public/js/admin/users.js`

- [ ] **Step 1: Adicionar handlers `adminUserResetPwd` e `adminUserRevoke`**

No final de `users.js`:
```js
window.adminUserResetPwd = function (id) {
  const u = state.adminUsers.find(x => x.id === id);
  if (!u) return;
  document.body.insertAdjacentHTML('beforeend', `
    <div class="modal-overlay" id="resetPwdModal" style="display:flex">
      <div class="modal" style="width:420px">
        <div class="modal-title">&#x21bb; Resetar senha de ${esc(u.nome)}</div>
        <div style="background:rgba(234,179,8,.08);border:1px solid rgba(234,179,8,.3);padding:.6rem;border-radius:5px;font-size:.75rem;color:#eab308;margin-bottom:.7rem">
          &#9888;&#65039; Isso vai encerrar TODAS as sessoes deste usuario e exigir novo login.
        </div>
        <div class="form-row"><div class="form-group">
          <label>Nova senha *</label>
          <input id="rpNova" type="password" placeholder="Min 8 chars, 1 letra + 1 digito">
        </div></div>
        <div class="form-row"><div class="form-group">
          <label>Confirmar senha *</label>
          <input id="rpConf" type="password">
        </div></div>
        <div class="modal-actions">
          <button class="btn btn-ghost" onclick="document.getElementById('resetPwdModal').remove()">Cancelar</button>
          <button class="btn btn-danger" onclick="adminUserResetPwdSubmit('${esc(id)}')">Resetar</button>
        </div>
      </div>
    </div>`);
};

window.adminUserResetPwdSubmit = async function (id) {
  const nova = document.getElementById('rpNova').value;
  const conf = document.getElementById('rpConf').value;
  if (nova.length < 8) return alert('Senha deve ter no minimo 8 caracteres.');
  if (!/[a-zA-Z]/.test(nova) || !/\d/.test(nova)) return alert('Senha deve conter letras e numeros.');
  if (nova !== conf) return alert('Senhas nao coincidem.');
  try {
    const r = await api.post('/api/users/' + id + '/reset-password', { senha: nova });
    document.getElementById('resetPwdModal').remove();
    alert(`Senha redefinida. ${r.sessions_revoked} sessao(oes) encerrada(s).`);
  } catch (e) { alert('Erro: ' + e.message); }
};

window.adminUserRevoke = async function (id) {
  const u = state.adminUsers.find(x => x.id === id);
  if (!u) return;
  if (!confirm(`Encerrar todas as sessoes ativas de ${u.nome}? Ele cai do sistema imediatamente.`)) return;
  try {
    const r = await api.delete('/api/users/' + id + '/sessions');
    alert(`${r.revoked} sessao(oes) encerrada(s).`);
  } catch (e) { alert('Erro: ' + e.message); }
};
```

- [ ] **Step 2: Smoke test — reset password e force logout**

1. Criar usuário teste se ainda não existe.
2. Logar com ele em outra aba/janela anônima.
3. Como admin: clicar `↻ Senha` → digitar nova senha → confirmar. Esperar alert "Senha redefinida...". Tentar usar a aba do user — qualquer ação deve cair para tela de login.
4. Logar de novo com a NOVA senha → funciona.
5. Como admin: clicar `Sair` (revoke). Confirmar. A aba do user (após login) deve cair de novo na próxima request.

- [ ] **Step 3: Commit**

```bash
git add public/js/admin/users.js
git commit -m "feat(ui): admin reset-password and force-logout modals"
```

---

### Task 13: Tab Auditoria — lista + filtros + paginação

**Files:**
- Modify: `public/js/admin/audit.js`
- Create: `public/js/admin/diff-renderer.js`

- [ ] **Step 1: Criar `public/js/admin/diff-renderer.js`**

```js
import { esc } from '../utils.js';

const FIELD_LABELS = {
  valor: 'Valor', categoria: 'Categoria', nome: 'Nome', email: 'Email',
  role: 'Role', ativo: 'Ativo', placa: 'Placa', modelo: 'Modelo',
  motorista: 'Motorista', numero: 'CTE', origem: 'Origem', destino: 'Destino',
  litros: 'Litros', preco_litro: 'R$/L', valor_total: 'Total', km: 'KM',
  posto_cnpj: 'Posto', nota_fiscal: 'NF', adiantamento: 'Adiant.',
  status: 'Status', data_inicio: 'Inicio', data_fim: 'Fim', km_total: 'KM Total',
  carga: 'Carga', observacoes: 'Obs', km_inicial: 'KM Ini', km_final: 'KM Fim',
};

function fmt(v) {
  if (v === null || v === undefined) return '-';
  if (typeof v === 'number') return v.toLocaleString('pt-BR');
  if (typeof v === 'boolean') return v ? 'sim' : 'nao';
  return String(v);
}

export function summarize(entry) {
  const { action, before, after, entity_type } = entry;
  if (action === 'CREATE' && after) {
    const main = after.numero || after.placa || after.email || after.categoria || after.nome;
    const val = after.valor || after.valor_total;
    return `${entity_type}: ${main || ''}${val ? ' R$ ' + Number(val).toFixed(2) : ''}`;
  }
  if (action === 'DELETE' && before) {
    const main = before.numero || before.placa || before.email || before.categoria || before.nome;
    return `Removido: ${main || entity_type}`;
  }
  if (action === 'UPDATE' && before && after) {
    const changes = [];
    for (const k of Object.keys(after)) {
      if (k === 'updated_at' || k === 'created_at') continue;
      const a = JSON.stringify(after[k]);
      const b = JSON.stringify(before[k]);
      if (a !== b) {
        const label = FIELD_LABELS[k] || k;
        changes.push(`${label}: ${fmt(before[k])} -> ${fmt(after[k])}`);
        if (changes.length >= 3) break;
      }
    }
    return changes.join(' | ') || 'sem mudanca visivel';
  }
  return '-';
}

export function renderDiff(entry) {
  const { before, after } = entry;
  const allKeys = new Set([
    ...Object.keys(before || {}),
    ...Object.keys(after || {}),
  ]);
  const lines = [];
  for (const k of allKeys) {
    if (k === 'updated_at' || k === 'created_at' || k === 'id' || k === 'truck_id' || k === 'trip_id' || k === 'empresa_id' || k === 'deleted_at') continue;
    const b = before?.[k];
    const a = after?.[k];
    const changed = JSON.stringify(b) !== JSON.stringify(a);
    const label = FIELD_LABELS[k] || k;
    lines.push({ label, b, a, changed });
  }
  return `
    <div class="diff-grid">
      <div class="diff-col">
        <h4>ANTES</h4>
        ${(before === null || before === undefined) ? '<em style="color:var(--muted)">(criacao)</em>' :
          lines.map(l => `<div class="diff-line${l.changed ? ' changed' : ''}">${esc(l.label)}: ${esc(fmt(l.b))}</div>`).join('')}
      </div>
      <div class="diff-col">
        <h4>DEPOIS</h4>
        ${(after === null || after === undefined) ? '<em style="color:var(--muted)">(remocao)</em>' :
          lines.map(l => `<div class="diff-line${l.changed ? ' changed' : ''}">${esc(l.label)}: ${esc(fmt(l.a))}</div>`).join('')}
      </div>
    </div>
  `;
}
```

- [ ] **Step 2: Implementar `renderAudit` em `public/js/admin/audit.js`**

```js
import { api } from '../api.js';
import { state } from '../state.js';
import { esc } from '../utils.js';
import { summarize, renderDiff } from './diff-renderer.js';

const ENTITIES = ['', 'TRIP', 'CTE', 'FUEL', 'EXPENSE', 'USER', 'TRUCK'];
const ACTIONS = ['', 'CREATE', 'UPDATE', 'DELETE'];

export async function renderAudit(container) {
  await load(container);
}

async function load(container) {
  const f = state.adminFilters.audit;
  const qs = new URLSearchParams();
  qs.set('page', f.page);
  qs.set('limit', f.limit);
  if (f.entity)    qs.set('entity', f.entity);
  if (f.entity_id) qs.set('entity_id', f.entity_id);
  if (f.actor_id)  qs.set('actor_id', f.actor_id);
  if (f.action)    qs.set('action', f.action);
  if (f.from)      qs.set('from', f.from);
  if (f.to)        qs.set('to', f.to);
  try {
    state.adminAuditPage = await api.get('/api/audit?' + qs.toString());
  } catch (e) {
    container.innerHTML = `<div style="color:var(--danger)">Erro: ${esc(e.message)}</div>`;
    return;
  }
  draw(container);
}

function draw(container) {
  const { items, total, page, totalPages } = state.adminAuditPage;
  const f = state.adminFilters.audit;
  container.innerHTML = `
    <div class="admin-filters">
      <div class="form-group" style="width:120px">
        <label>Entidade</label>
        <select onchange="auditFilterChange('entity', this.value)">
          ${ENTITIES.map(e => `<option value="${e}" ${f.entity === e ? 'selected' : ''}>${e || '(todas)'}</option>`).join('')}
        </select>
      </div>
      <div class="form-group" style="width:120px">
        <label>Acao</label>
        <select onchange="auditFilterChange('action', this.value)">
          ${ACTIONS.map(a => `<option value="${a}" ${f.action === a ? 'selected' : ''}>${a || '(todas)'}</option>`).join('')}
        </select>
      </div>
      <div class="form-group" style="width:140px">
        <label>De</label><input type="date" value="${esc(f.from)}" onchange="auditFilterChange('from', this.value)">
      </div>
      <div class="form-group" style="width:140px">
        <label>Ate</label><input type="date" value="${esc(f.to)}" onchange="auditFilterChange('to', this.value)">
      </div>
      <div class="form-group" style="width:200px">
        <label>Usuario (id)</label><input value="${esc(f.actor_id)}" onchange="auditFilterChange('actor_id', this.value)">
      </div>
      <button class="btn btn-ghost btn-sm" onclick="auditClearFilters()">Limpar</button>
    </div>
    <table class="admin-table">
      <thead><tr><th>Data</th><th>Usuario</th><th>Acao</th><th>Entidade</th><th>Resumo</th><th></th></tr></thead>
      <tbody>
        ${items.map((it, idx) => `
          <tr>
            <td style="font-family:'IBM Plex Mono',monospace;font-size:.7rem">${new Date(it.created_at).toLocaleString('pt-BR')}</td>
            <td>${esc(it.actor?.nome || it.actor_email || '-')}</td>
            <td><span class="action-badge action-${it.action}">${it.action}</span></td>
            <td><code style="font-size:.7rem">${it.entity_type}</code></td>
            <td style="font-size:.75rem;color:var(--muted)">${esc(summarize(it))}</td>
            <td><button class="btn btn-ghost btn-sm" onclick="auditShowDetail(${idx})">Ver</button></td>
          </tr>
        `).join('') || `<tr><td colspan="6" style="text-align:center;color:var(--muted);padding:2rem">Nenhum evento</td></tr>`}
      </tbody>
    </table>
    <div class="pagination">
      <button onclick="auditGoToPage(1)" ${page === 1 ? 'disabled' : ''}>&laquo;</button>
      <button onclick="auditGoToPage(${page - 1})" ${page === 1 ? 'disabled' : ''}>&lsaquo;</button>
      <span>Pag ${page} de ${totalPages} &middot; ${total} reg</span>
      <button onclick="auditGoToPage(${page + 1})" ${page >= totalPages ? 'disabled' : ''}>&rsaquo;</button>
      <button onclick="auditGoToPage(${totalPages})" ${page >= totalPages ? 'disabled' : ''}>&raquo;</button>
    </div>
  `;
}

window.auditFilterChange = function (key, val) {
  state.adminFilters.audit[key] = val;
  state.adminFilters.audit.page = 1;
  load(document.getElementById('adminContent'));
};

window.auditClearFilters = function () {
  state.adminFilters.audit = { entity: '', entity_id: '', actor_id: '', action: '', from: '', to: '', page: 1, limit: 50 };
  load(document.getElementById('adminContent'));
};

window.auditGoToPage = function (p) {
  state.adminFilters.audit.page = p;
  load(document.getElementById('adminContent'));
};

window.auditShowDetail = function (idx) {
  const it = state.adminAuditPage.items[idx];
  if (!it) return;
  const html = `
    <div class="modal-overlay" id="auditDetailModal" style="display:flex">
      <div class="modal" style="width:780px;max-width:95vw">
        <div class="modal-title">${it.entity_type} ${it.action} &middot; ${new Date(it.created_at).toLocaleString('pt-BR')}</div>
        <div style="font-size:.75rem;color:var(--muted);margin-bottom:.6rem">
          Por <strong>${esc(it.actor?.nome || it.actor_email)}</strong>
          ${it.ip ? ` &middot; IP ${esc(it.ip)}` : ''}
          ${it.user_agent ? ` &middot; ${esc((it.user_agent || '').slice(0,80))}` : ''}
        </div>
        ${renderDiff(it)}
        <div class="modal-actions">
          <button class="btn btn-accent" onclick="document.getElementById('auditDetailModal').remove()">Fechar</button>
        </div>
      </div>
    </div>`;
  document.body.insertAdjacentHTML('beforeend', html);
};
```

- [ ] **Step 3: Smoke test**

Tab Auditoria deve listar todas as ações geradas até aqui (criar usuário teste, criar viagem, etc). Filtros funcionam: filtrar por entidade `USER` reduz a lista. Filtrar por data. Clicar `Ver` em uma ação UPDATE — modal abre com diff colorido. Paginação funciona se houver > 50 registros (criar mais entradas se preciso).

- [ ] **Step 4: Commit**

```bash
git add public/js/admin/audit.js public/js/admin/diff-renderer.js
git commit -m "feat(ui): admin tab Auditoria with filters, pagination and diff modal"
```

---

### Task 14: Tab Logins (48h)

**Files:**
- Modify: `public/js/admin/logins.js`

- [ ] **Step 1: Implementar `renderLogins`**

```js
import { api } from '../api.js';
import { state } from '../state.js';
import { esc } from '../utils.js';

const ACTIONS = ['', 'LOGIN_SUCCESS', 'LOGIN_FAILED', 'LOGOUT', 'REFRESH_FAILED'];
const ACTION_ICONS = {
  LOGIN_SUCCESS: '&#x2705;', LOGIN_FAILED: '&#x274C;',
  LOGOUT: '&#x1F6AA;', REFRESH_FAILED: '&#x26A0;&#xFE0F;',
};

export async function renderLogins(container) {
  await load(container);
}

async function load(container) {
  const f = state.adminFilters.logins;
  const qs = new URLSearchParams();
  qs.set('page', f.page);
  qs.set('limit', f.limit);
  if (f.user_id) qs.set('user_id', f.user_id);
  if (f.action)  qs.set('action', f.action);
  try {
    state.adminLoginsPage = await api.get('/api/login-events?' + qs.toString());
  } catch (e) {
    container.innerHTML = `<div style="color:var(--danger)">Erro: ${esc(e.message)}</div>`;
    return;
  }
  draw(container);
}

function draw(container) {
  const { items, total, page, totalPages } = state.adminLoginsPage;
  const f = state.adminFilters.logins;
  container.innerHTML = `
    <div style="background:rgba(56,189,248,.06);border:1px solid rgba(56,189,248,.2);padding:.5rem .75rem;border-radius:5px;font-size:.75rem;color:var(--info);margin-bottom:.6rem">
      Mostrando eventos das ultimas 48 horas. Eventos mais antigos sao removidos automaticamente.
    </div>
    <div class="admin-filters">
      <div class="form-group" style="width:160px">
        <label>Acao</label>
        <select onchange="loginsFilterChange('action', this.value)">
          ${ACTIONS.map(a => `<option value="${a}" ${f.action === a ? 'selected' : ''}>${a || '(todas)'}</option>`).join('')}
        </select>
      </div>
      <div class="form-group" style="width:200px">
        <label>Usuario (id)</label><input value="${esc(f.user_id)}" onchange="loginsFilterChange('user_id', this.value)">
      </div>
      <button class="btn btn-ghost btn-sm" onclick="loginsClear()">Limpar</button>
    </div>
    <table class="admin-table">
      <thead><tr><th>Data</th><th>Email</th><th>Acao</th><th>IP</th><th>Navegador</th></tr></thead>
      <tbody>
        ${items.map(it => `
          <tr>
            <td style="font-family:'IBM Plex Mono',monospace;font-size:.7rem">${new Date(it.created_at).toLocaleString('pt-BR')}</td>
            <td>${esc(it.email_attempt)}</td>
            <td>${ACTION_ICONS[it.action] || ''} <span class="action-badge action-${it.action}">${it.action}</span></td>
            <td style="font-family:'IBM Plex Mono',monospace;font-size:.7rem;color:var(--muted)">${esc(it.ip || '-')}</td>
            <td style="font-size:.7rem;color:var(--muted)">${esc((it.user_agent || '').slice(0, 60))}</td>
          </tr>
        `).join('') || `<tr><td colspan="5" style="text-align:center;color:var(--muted);padding:2rem">Nenhum evento</td></tr>`}
      </tbody>
    </table>
    <div class="pagination">
      <button onclick="loginsGoToPage(1)" ${page === 1 ? 'disabled' : ''}>&laquo;</button>
      <button onclick="loginsGoToPage(${page - 1})" ${page === 1 ? 'disabled' : ''}>&lsaquo;</button>
      <span>Pag ${page} de ${totalPages} &middot; ${total} reg</span>
      <button onclick="loginsGoToPage(${page + 1})" ${page >= totalPages ? 'disabled' : ''}>&rsaquo;</button>
      <button onclick="loginsGoToPage(${totalPages})" ${page >= totalPages ? 'disabled' : ''}>&raquo;</button>
    </div>
  `;
}

window.loginsFilterChange = function (key, val) {
  state.adminFilters.logins[key] = val;
  state.adminFilters.logins.page = 1;
  load(document.getElementById('adminContent'));
};
window.loginsClear = function () {
  state.adminFilters.logins = { user_id: '', action: '', page: 1, limit: 50 };
  load(document.getElementById('adminContent'));
};
window.loginsGoToPage = function (p) {
  state.adminFilters.logins.page = p;
  load(document.getElementById('adminContent'));
};
```

- [ ] **Step 2: Smoke test**

Tab Logins deve listar pelo menos: 1 LOGIN_SUCCESS (seu login atual) + 1 LOGIN_FAILED (do teste anterior) + outros logins/logouts feitos. Aviso 48h aparece no topo. Filtro por ação `LOGIN_FAILED` filtra. Paginação aparece (se > 50).

- [ ] **Step 3: Commit**

```bash
git add public/js/admin/logins.js
git commit -m "feat(ui): admin tab Logins (48h window with filters and pagination)"
```

---

## Phase 7 — Verificação

### Task 15: Checklist manual + execução

**Files:**
- Create: `docs/superpowers/testing/admin-panel-checklist.md`

- [ ] **Step 1: Criar arquivo do checklist**

```bash
mkdir -p docs/superpowers/testing
```

Conteúdo de `docs/superpowers/testing/admin-panel-checklist.md` (replicar o conteúdo da spec §11 — Testes Manuais):

```markdown
# Admin Panel — Checklist de Aceitação Manual

> Executar em ambiente de produção (Railway) ou dev local após o deploy do branch.
> Marcar `[x]` em cada item que passar.

## Usuários
- [ ] Admin ve botao "⚙️ Admin" no header; gestor nao ve
- [ ] Listar usuarios da empresa
- [ ] Criar usuario GESTOR — login com a senha definida funciona
- [ ] Criar usuario ADMIN — tambem consegue acessar o painel Admin
- [ ] Editar nome / role / ativo
- [ ] Desativar usuario — login dele para de funcionar imediatamente
- [ ] Reativar usuario — volta a funcionar
- [ ] Resetar senha — usuario cai do sistema, login com nova senha funciona
- [ ] Forcar logout — usuario cai do sistema imediatamente
- [ ] Admin nao consegue desativar/resetar a propria conta (recebe 403)
- [ ] Filtro de busca por nome/email funciona

## Auditoria
- [ ] Criar viagem -> aparece em audit como CREATE
- [ ] Editar despesa -> aparece como UPDATE com before/after corretos
- [ ] Excluir CTE -> aparece como DELETE
- [ ] Filtrar por entidade
- [ ] Filtrar por usuario
- [ ] Filtrar por periodo
- [ ] Modal de detalhe mostra diff colorido corretamente
- [ ] Resumo automatico correto para CREATE/UPDATE/DELETE
- [ ] Paginacao avanca e volta
- [ ] Mudar pagina pelos botoes &laquo; &lsaquo; &rsaquo; &raquo;

## Logins
- [ ] Login OK aparece como LOGIN_SUCCESS
- [ ] Login com email errado aparece como LOGIN_FAILED
- [ ] Logout aparece como LOGOUT
- [ ] Eventos > 48h nao aparecem (testar criando registro com created_at antigo via Studio)
- [ ] IP exibido e o IP real (nao 127.0.0.1 no Railway)
- [ ] User-Agent e truncado se muito longo

## Seguranca
- [ ] Gestor batendo direto em GET /api/audit recebe 403
- [ ] Gestor batendo em POST /api/users recebe 403
- [ ] Tentar resetar senha sem ser admin: 403
- [ ] Senha curta (< 8 chars) e rejeitada com mensagem clara
- [ ] Audit log de uma empresa nao vaza para usuario de outra empresa (criar 2a empresa via seed/SQL para testar)
- [ ] Senha hash NAO aparece em nenhum entry de audit_logs (verificar campo `before` e `after` no Studio)
```

- [ ] **Step 2: Executar o checklist**

Subir o app local (`npm run dev`) — executar todos os itens. Marcar `[x]` em cada um que passar e abrir issue/anotar para os que falharem.

- [ ] **Step 3: Corrigir falhas encontradas (se houver)**

Para cada item não-marcado, criar commits específicos com fix.

- [ ] **Step 4: Commit final**

```bash
git add docs/superpowers/testing/admin-panel-checklist.md
git commit -m "docs: admin panel manual acceptance checklist (executed and passing)"
```

- [ ] **Step 5: Push para Railway redeployar**

```bash
git push origin main
```

Após deploy, repetir os itens críticos do checklist em produção (ao menos: login, criar user, audit list, logins list).

---

## Self-review

**Cobertura do spec:**
- ✅ Schema (spec §5) → Task 1
- ✅ Helper audit + sanitização (spec §6.5) → Task 2
- ✅ Helper login events (spec §6.4) → Task 2
- ✅ Cleanup job 48h (spec §8) → Task 3
- ✅ Captura login/logout/refresh (spec §6.4) → Task 4
- ✅ Audit instrumentation (spec §6.6) → Tasks 5, 6
- ✅ Endpoints audit (spec §6.1) → Task 7
- ✅ Endpoints login events (spec §6.2) → Task 8
- ✅ Reset password + revoke sessions (spec §6.3) → Tasks 6, 9
- ✅ Frontend foundation (spec §7.1) → Task 10
- ✅ Tab Usuários (spec §7.2.1) → Tasks 11, 12
- ✅ Tab Auditoria (spec §7.2.2) → Task 13
- ✅ Tab Logins (spec §7.2.3) → Task 14
- ✅ Segurança (spec §9) → coberta nos validators e checks de propriedade
- ✅ Checklist manual (spec §11) → Task 15

**Type/method consistency:**
- `audit.log({req, empresaId, entity, action, entityId, before, after})` — assinatura usada em todas as tasks (2, 5, 6)
- `loginEvents.log({req, action, user, emailAttempt})` — consistente nas tasks 2 e 4
- Pattern de service: `funcao(id, empresaId, req, data)` para mutações — usado nas tasks 5 e 6

**Sem placeholders:** todos os blocos de código estão completos. Comandos têm output esperado declarado.

---

## Execution Handoff

**Plan complete and saved to `docs/superpowers/plans/2026-05-06-admin-panel.md`. Two execution options:**

**1. Subagent-Driven (recommended)** — Eu despacho um subagent fresco por task, revisamos juntos entre tasks, iteração rápida e contexto da main session preservado.

**2. Inline Execution** — Executo as tasks nesta sessão usando executing-plans, com checkpoints para você revisar em lote (mais rápido, mas o contexto da sessão fica grande).

**Which approach?**
