# Controle de Viagens — Painel Kanban — Plano de Implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Spec:** [docs/superpowers/specs/2026-05-27-controle-viagens-kanban-design.md](../specs/2026-05-27-controle-viagens-kanban-design.md)

**Goal:** Construir um novo módulo no Hub chamado "Controle de Viagens" — um quadro Kanban com 6 colunas onde cada caminhão da frota é um card arrastável; cada card tem campos contextuais por status (data coleta, agendamento, carga, local, fábrica, cliente, descrição de manutenção) e uma timeline de comentários com autor e data.

**Architecture:** Backend Express/Prisma adiciona 2 tabelas isoladas (`truck_operational_states`, `truck_operational_comments`) e 1 enum, sem mexer em `Trip`/`Truck`. Endpoints REST sob `/api/controle-viagens` com middleware novo `requirePermission`. Frontend vanilla JS modular lazy-loaded pelo `hub.js`, polling de 20s, drag-and-drop nativo (HTML5 DragEvent) no desktop e long-press no mobile.

**Tech Stack:** Node 20, Express 4, Prisma 5.22, PostgreSQL, express-validator, vanilla JS (módulos ES6), CSS variables.

**Convenção de verificação:** O projeto não tem framework de testes automatizado. Cada task tem **passos de verificação manual** (curl, console do browser, smoke visual) que confirmam que o comportamento esperado funciona antes do commit.

---

## File Structure

**Backend novo:**
```
prisma/migrations/20260527120000_controle_viagens/migration.sql  -- schema
src/middleware/permission.js                                      -- requirePermission factory
src/services/controleViagens.service.js                           -- domínio
src/validators/controleViagens.validator.js                       -- express-validator
src/controllers/controleViagens.controller.js                     -- HTTP thin layer
src/routes/controleViagens.routes.js                              -- mounting + middlewares
```

**Backend modificado:**
```
prisma/schema.prisma                  -- + enum, + 2 models, + relations em Truck/User
src/services/users.service.js         -- + 'controle-viagens' em VALID_MODULES e DEFAULT_PERMISSOES
src/routes/index.js                   -- registrar rota
```

**Frontend novo:**
```
public/js/controle-viagens.js         -- init, board render, search, polling
public/js/controle-viagens.modal.js   -- detail modal (status + comments)
public/css/controle-viagens.css       -- estilos
```

**Frontend modificado:**
```
public/index.html                     -- hub-card #05, module-tab em 4 headers, view #controleViagensView
public/js/hub.js                      -- goToControleViagens, ALL_MODULES, lazy import
public/js/admin/users.js              -- ALL_MODULES (checkbox de permissão)
```

---

## Task 1: Schema do banco — migração + Prisma

**Files:**
- Create: `prisma/migrations/20260527120000_controle_viagens/migration.sql`
- Modify: `prisma/schema.prisma`

- [ ] **Step 1: Criar a migração SQL**

Conteúdo de `prisma/migrations/20260527120000_controle_viagens/migration.sql`:

```sql
-- Painel Kanban operacional. Independente de Trip/Truck — apenas
-- referencia truck_id e snapshot de user.

-- CreateEnum
CREATE TYPE "TruckOperationalStatus" AS ENUM (
  'VAZIO_AGUARDANDO_CARGA',
  'INDO_CARREGAR',
  'NA_FABRICA',
  'CARREGADO_EM_VIAGEM',
  'EM_DESCARGA_NO_CLIENTE',
  'EM_MANUTENCAO'
);

-- CreateTable
CREATE TABLE "truck_operational_states" (
  "id"                          TEXT NOT NULL,
  "truck_id"                    TEXT NOT NULL,
  "status"                      "TruckOperationalStatus" NOT NULL DEFAULT 'VAZIO_AGUARDANDO_CARGA',
  "contexto_atual"              TEXT,
  "data_coleta"                 DATE,
  "data_agendamento_entrega"    DATE,
  "carga_descricao"             TEXT,
  "descricao"                   TEXT,
  "updated_at"                  TIMESTAMP(3) NOT NULL,
  "updated_by_id"               TEXT,

  CONSTRAINT "truck_operational_states_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "truck_operational_comments" (
  "id"             TEXT NOT NULL,
  "truck_id"      TEXT NOT NULL,
  "author_id"     TEXT,
  "author_email"  TEXT NOT NULL,
  "author_nome"   TEXT NOT NULL,
  "texto"         TEXT NOT NULL,
  "created_at"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "deleted_at"    TIMESTAMP(3),
  "deleted_by_id" TEXT,

  CONSTRAINT "truck_operational_comments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "truck_operational_states_truck_id_key" ON "truck_operational_states"("truck_id");
CREATE INDEX "truck_operational_states_status_idx" ON "truck_operational_states"("status");
CREATE INDEX "truck_operational_comments_truck_id_created_at_idx"
  ON "truck_operational_comments"("truck_id", "created_at" DESC);

-- AddForeignKey
ALTER TABLE "truck_operational_states" ADD CONSTRAINT "truck_operational_states_truck_id_fkey"
  FOREIGN KEY ("truck_id") REFERENCES "trucks"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "truck_operational_states" ADD CONSTRAINT "truck_operational_states_updated_by_id_fkey"
  FOREIGN KEY ("updated_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "truck_operational_comments" ADD CONSTRAINT "truck_operational_comments_truck_id_fkey"
  FOREIGN KEY ("truck_id") REFERENCES "trucks"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "truck_operational_comments" ADD CONSTRAINT "truck_operational_comments_author_id_fkey"
  FOREIGN KEY ("author_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Adiciona 'controle-viagens' ao default das permissões e a todos os usuários atuais.
ALTER TABLE "users"
  ALTER COLUMN "permissoes" SET DEFAULT
  ARRAY['frota','frete-terceiro','veiculos','rentabilidade','controle-viagens']::TEXT[];

UPDATE "users"
SET "permissoes" = array_append("permissoes", 'controle-viagens')
WHERE NOT ('controle-viagens' = ANY("permissoes"));
```

- [ ] **Step 2: Atualizar `prisma/schema.prisma` — adicionar enum**

Adicionar logo após o último `enum` existente (após `enum LoginAction`):

```prisma
enum TruckOperationalStatus {
  VAZIO_AGUARDANDO_CARGA
  INDO_CARREGAR
  NA_FABRICA
  CARREGADO_EM_VIAGEM
  EM_DESCARGA_NO_CLIENTE
  EM_MANUTENCAO
}
```

- [ ] **Step 3: Adicionar os 2 novos models ao schema**

Adicionar ao final do arquivo (depois de `LoginEvent`):

```prisma
model TruckOperationalState {
  id                          String                 @id @default(uuid())
  truck_id                    String                 @unique
  truck                       Truck                  @relation(fields: [truck_id], references: [id], onDelete: Cascade)
  status                      TruckOperationalStatus @default(VAZIO_AGUARDANDO_CARGA)
  contexto_atual              String?
  data_coleta                 DateTime?              @db.Date
  data_agendamento_entrega    DateTime?              @db.Date
  carga_descricao             String?
  descricao                   String?
  updated_at                  DateTime               @updatedAt
  updated_by_id               String?
  updated_by                  User?                  @relation("OperationalStateUpdatedBy", fields: [updated_by_id], references: [id])

  @@index([status])
  @@map("truck_operational_states")
}

model TruckOperationalComment {
  id            String   @id @default(uuid())
  truck_id      String
  truck         Truck    @relation(fields: [truck_id], references: [id], onDelete: Cascade)
  author_id     String?
  author        User?    @relation("OperationalCommentAuthor", fields: [author_id], references: [id])
  author_email  String
  author_nome   String
  texto         String
  created_at    DateTime @default(now())
  deleted_at    DateTime?
  deleted_by_id String?

  @@index([truck_id, created_at(sort: Desc)])
  @@map("truck_operational_comments")
}
```

- [ ] **Step 4: Adicionar relações inversas em `Truck`**

No bloco `model Truck` em `prisma/schema.prisma`, adicionar logo após a linha `truck_ledger    TruckLedgerEntry[]`:

```prisma
  operational_state    TruckOperationalState?
  operational_comments TruckOperationalComment[]
```

- [ ] **Step 5: Adicionar relações inversas em `User`**

No bloco `model User`, adicionar logo após a linha `fretes_pagos      FreteTerceiro[] @relation("FreteTerceiroPaid")`:

```prisma
  operational_state_updates     TruckOperationalState[]   @relation("OperationalStateUpdatedBy")
  operational_comments_authored TruckOperationalComment[] @relation("OperationalCommentAuthor")
```

- [ ] **Step 6: Aplicar a migration localmente**

Rodar:
```bash
npx prisma migrate dev --name controle_viagens
```

Esperado: Prisma detecta a migration SQL existente (não regenera), aplica no banco local, regenera client. Mensagem final: "Already in sync, your schema and database are in sync".

- [ ] **Step 7: Verificar geração do client**

Rodar:
```bash
npx prisma generate
node -e "const p = require('./src/config/database'); console.log(Object.keys(p).filter(k => k.startsWith('truckOperational')))"
```

Esperado: imprime `[ 'truckOperationalState', 'truckOperationalComment' ]`.

- [ ] **Step 8: Commit**

```bash
git add prisma/schema.prisma prisma/migrations/20260527120000_controle_viagens
git commit -m "feat(controle-viagens): schema das tabelas operacionais e permissao"
```

---

## Task 2: Permissão `controle-viagens` no domínio de usuários

**Files:**
- Modify: `src/services/users.service.js`

- [ ] **Step 1: Atualizar as constantes**

Em `src/services/users.service.js` linhas 6-7, substituir:

```js
const VALID_MODULES = ['frota', 'frete-terceiro', 'veiculos', 'rentabilidade'];
const DEFAULT_PERMISSOES = ['frota', 'frete-terceiro', 'veiculos', 'rentabilidade'];
```

por:

```js
const VALID_MODULES = ['frota', 'frete-terceiro', 'veiculos', 'rentabilidade', 'controle-viagens'];
const DEFAULT_PERMISSOES = ['frota', 'frete-terceiro', 'veiculos', 'rentabilidade', 'controle-viagens'];
```

- [ ] **Step 2: Verificar que módulo passa no sanitize**

Rodar:
```bash
node -e "const s = require('./src/services/users.service'); console.log(s.VALID_MODULES)"
```

Esperado: array com 5 elementos incluindo `'controle-viagens'`.

- [ ] **Step 3: Commit**

```bash
git add src/services/users.service.js
git commit -m "feat(users): aceita permissao 'controle-viagens'"
```

---

## Task 3: Middleware `requirePermission`

**Files:**
- Create: `src/middleware/permission.js`

- [ ] **Step 1: Criar o middleware**

Conteúdo de `src/middleware/permission.js`:

```js
// requirePermission — gate para módulos liberados via User.permissoes.
// ADMIN passa sempre. Para GESTOR, exige a string na lista.
// Frontend já oculta UI, mas backend também precisa proteger pra
// evitar bypass por curl/Postman.

function requirePermission(moduleName) {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ error: 'Não autenticado.' });
    }
    if (req.user.role === 'ADMIN') return next();
    const perms = Array.isArray(req.user.permissoes) ? req.user.permissoes : [];
    if (!perms.includes(moduleName)) {
      return res.status(403).json({ error: `Acesso negado ao módulo '${moduleName}'.` });
    }
    next();
  };
}

module.exports = requirePermission;
```

- [ ] **Step 2: Smoke do import**

Rodar:
```bash
node -e "const r = require('./src/middleware/permission'); console.log(typeof r('controle-viagens'))"
```

Esperado: `function`.

- [ ] **Step 3: Commit**

```bash
git add src/middleware/permission.js
git commit -m "feat(middleware): requirePermission factory para gating de modulos"
```

---

## Task 4: Service — `getBoard` (lista para o quadro)

**Files:**
- Create: `src/services/controleViagens.service.js`

- [ ] **Step 1: Criar o arquivo com a função `getBoard`**

Conteúdo inicial de `src/services/controleViagens.service.js`:

```js
const prisma = require('../config/database');
const ApiError = require('../utils/ApiError');
const audit = require('./audit.service');

const VALID_STATUS = [
  'VAZIO_AGUARDANDO_CARGA',
  'INDO_CARREGAR',
  'NA_FABRICA',
  'CARREGADO_EM_VIAGEM',
  'EM_DESCARGA_NO_CLIENTE',
  'EM_MANUTENCAO',
];
const DEFAULT_STATUS = 'VAZIO_AGUARDANDO_CARGA';

// Devolve um state "virtual" se o caminhão ainda não tem registro.
// Só persiste no primeiro PATCH/edição.
function virtualState(truckId) {
  return {
    id: null,
    truck_id: truckId,
    status: DEFAULT_STATUS,
    contexto_atual: null,
    data_coleta: null,
    data_agendamento_entrega: null,
    carga_descricao: null,
    descricao: null,
    updated_at: null,
    updated_by_id: null,
    updated_by: null,
  };
}

async function getBoard(empresaId) {
  const trucks = await prisma.truck.findMany({
    where: { empresa_id: empresaId, deleted_at: null },
    select: {
      id: true, placa: true, modelo: true, motorista: true,
      carreta_placa: true, carreta_modelo: true,
      operational_state: {
        include: {
          updated_by: { select: { id: true, nome: true, email: true } },
        },
      },
    },
    orderBy: [{ placa: 'asc' }],
  });

  // Contagem de comentários ativos por truck — uma única query agrupada
  const counts = await prisma.truckOperationalComment.groupBy({
    by: ['truck_id'],
    where: { truck_id: { in: trucks.map(t => t.id) }, deleted_at: null },
    _count: { _all: true },
    _max:   { created_at: true },
  });
  const byTruck = Object.fromEntries(counts.map(c => [c.truck_id, c]));

  return trucks.map(t => ({
    truck: {
      id: t.id, placa: t.placa, modelo: t.modelo, motorista: t.motorista,
      carreta_placa: t.carreta_placa, carreta_modelo: t.carreta_modelo,
    },
    state: t.operational_state || virtualState(t.id),
    comments_count: byTruck[t.id]?._count?._all || 0,
    last_comment_at: byTruck[t.id]?._max?.created_at || null,
  }));
}

module.exports = { getBoard, VALID_STATUS, DEFAULT_STATUS };
```

- [ ] **Step 2: Smoke direto via node REPL**

Rodar (assumindo que existe ao menos uma empresa com caminhões):
```bash
node -e "(async () => { const s = require('./src/services/controleViagens.service'); const empresa = await require('./src/config/database').empresa.findFirst(); const board = await s.getBoard(empresa.id); console.log('trucks:', board.length, 'primeiro:', JSON.stringify(board[0], null, 2)); process.exit(0); })()"
```

Esperado: imprime contagem de caminhões e o primeiro card com truck + state default (status `VAZIO_AGUARDANDO_CARGA`, comments_count 0).

- [ ] **Step 3: Commit**

```bash
git add src/services/controleViagens.service.js
git commit -m "feat(controle-viagens): service.getBoard com state lazy default"
```

---

## Task 5: Service — `getDetail` e `upsertState`

**Files:**
- Modify: `src/services/controleViagens.service.js`

- [ ] **Step 1: Adicionar `getDetail` (caminhão + comentários paginados)**

Em `src/services/controleViagens.service.js`, antes do `module.exports`, adicionar:

```js
async function getDetail(truckId, empresaId, { commentsLimit = 50 } = {}) {
  const truck = await prisma.truck.findFirst({
    where: { id: truckId, empresa_id: empresaId, deleted_at: null },
    select: {
      id: true, placa: true, modelo: true, motorista: true,
      carreta_placa: true, carreta_modelo: true,
      operational_state: {
        include: {
          updated_by: { select: { id: true, nome: true, email: true } },
        },
      },
    },
  });
  if (!truck) throw ApiError.notFound('Caminhão não encontrado.');

  const comments = await prisma.truckOperationalComment.findMany({
    where: { truck_id: truckId, deleted_at: null },
    orderBy: { created_at: 'desc' },
    take: Math.min(commentsLimit, 200),
  });

  return {
    truck: {
      id: truck.id, placa: truck.placa, modelo: truck.modelo,
      motorista: truck.motorista,
      carreta_placa: truck.carreta_placa, carreta_modelo: truck.carreta_modelo,
    },
    state: truck.operational_state || virtualState(truck.id),
    comments,
  };
}
```

- [ ] **Step 2: Adicionar `upsertState`**

Logo após `getDetail`:

```js
async function upsertState(truckId, empresaId, req, payload) {
  const truck = await prisma.truck.findFirst({
    where: { id: truckId, empresa_id: empresaId, deleted_at: null },
    select: { id: true },
  });
  if (!truck) throw ApiError.notFound('Caminhão não encontrado.');

  if (payload.status && !VALID_STATUS.includes(payload.status)) {
    throw ApiError.badRequest('Status inválido.');
  }

  const before = await prisma.truckOperationalState.findUnique({ where: { truck_id: truckId } });

  // Whitelist + normalização de datas. Campos não enviados ficam intactos
  // (preservação histórica entre mudanças de status, ver spec §4).
  const data = { updated_by_id: req.user.id };
  if (payload.status !== undefined) data.status = payload.status;
  if (payload.contexto_atual !== undefined) data.contexto_atual = payload.contexto_atual || null;
  if (payload.carga_descricao !== undefined) data.carga_descricao = payload.carga_descricao || null;
  if (payload.descricao !== undefined) data.descricao = payload.descricao || null;
  if (payload.data_coleta !== undefined) {
    data.data_coleta = payload.data_coleta ? new Date(payload.data_coleta) : null;
  }
  if (payload.data_agendamento_entrega !== undefined) {
    data.data_agendamento_entrega = payload.data_agendamento_entrega ? new Date(payload.data_agendamento_entrega) : null;
  }

  const after = await prisma.truckOperationalState.upsert({
    where: { truck_id: truckId },
    create: { truck_id: truckId, status: payload.status || DEFAULT_STATUS, ...data },
    update: data,
    include: { updated_by: { select: { id: true, nome: true, email: true } } },
  });

  await audit.log({
    req, empresaId, entity: 'TRUCK', action: 'UPDATE',
    entityId: truckId,
    before: before ? { operational_state: before } : null,
    after:  { operational_state: after },
  });

  return after;
}
```

- [ ] **Step 3: Exportar as funções novas**

Substituir o `module.exports` no final do arquivo por:

```js
module.exports = { getBoard, getDetail, upsertState, VALID_STATUS, DEFAULT_STATUS };
```

- [ ] **Step 4: Smoke da `upsertState`**

```bash
node -e "(async () => { const db = require('./src/config/database'); const s = require('./src/services/controleViagens.service'); const empresa = await db.empresa.findFirst(); const truck = await db.truck.findFirst({ where: { empresa_id: empresa.id, deleted_at: null } }); const user = await db.user.findFirst({ where: { empresa_id: empresa.id } }); const fakeReq = { user, ip: '127.0.0.1', headers: {} }; const after = await s.upsertState(truck.id, empresa.id, fakeReq, { status: 'INDO_CARREGAR', carga_descricao: 'Teste de smoke' }); console.log('status:', after.status, 'carga:', after.carga_descricao); process.exit(0); })()"
```

Esperado: imprime `status: INDO_CARREGAR carga: Teste de smoke`.

- [ ] **Step 5: Commit**

```bash
git add src/services/controleViagens.service.js
git commit -m "feat(controle-viagens): service.getDetail e upsertState com audit"
```

---

## Task 6: Service — Comentários (list / add / delete)

**Files:**
- Modify: `src/services/controleViagens.service.js`

- [ ] **Step 1: Adicionar `listComments`**

Antes do `module.exports`:

```js
async function listComments(truckId, empresaId, { limit = 50, before } = {}) {
  const truck = await prisma.truck.findFirst({
    where: { id: truckId, empresa_id: empresaId, deleted_at: null },
    select: { id: true },
  });
  if (!truck) throw ApiError.notFound('Caminhão não encontrado.');

  const where = { truck_id: truckId, deleted_at: null };
  if (before) where.created_at = { lt: new Date(before) };

  return prisma.truckOperationalComment.findMany({
    where,
    orderBy: { created_at: 'desc' },
    take: Math.min(Math.max(parseInt(limit, 10) || 50, 1), 200),
  });
}
```

- [ ] **Step 2: Adicionar `addComment`**

```js
async function addComment(truckId, empresaId, req, { texto }) {
  const truck = await prisma.truck.findFirst({
    where: { id: truckId, empresa_id: empresaId, deleted_at: null },
    select: { id: true },
  });
  if (!truck) throw ApiError.notFound('Caminhão não encontrado.');

  const t = (texto || '').trim();
  if (!t) throw ApiError.badRequest('Texto do comentário não pode ser vazio.');
  if (t.length > 4000) throw ApiError.badRequest('Comentário muito longo (máx 4000).');

  return prisma.truckOperationalComment.create({
    data: {
      truck_id:     truckId,
      author_id:    req.user.id,
      author_email: req.user.email,
      author_nome:  req.user.nome,
      texto:        t,
    },
  });
}
```

- [ ] **Step 3: Adicionar `deleteComment`**

```js
async function deleteComment(truckId, commentId, empresaId, req) {
  const truck = await prisma.truck.findFirst({
    where: { id: truckId, empresa_id: empresaId, deleted_at: null },
    select: { id: true },
  });
  if (!truck) throw ApiError.notFound('Caminhão não encontrado.');

  const c = await prisma.truckOperationalComment.findFirst({
    where: { id: commentId, truck_id: truckId, deleted_at: null },
  });
  if (!c) throw ApiError.notFound('Comentário não encontrado.');

  const isAuthor = c.author_id && c.author_id === req.user.id;
  const isAdmin  = req.user.role === 'ADMIN';
  if (!isAuthor && !isAdmin) {
    throw ApiError.forbidden('Só o autor ou um ADMIN pode apagar este comentário.');
  }

  await prisma.truckOperationalComment.update({
    where: { id: commentId },
    data: { deleted_at: new Date(), deleted_by_id: req.user.id },
  });
  return { ok: true };
}
```

- [ ] **Step 4: Atualizar `module.exports`**

Substituir pelo bloco completo:

```js
module.exports = {
  getBoard, getDetail, upsertState,
  listComments, addComment, deleteComment,
  VALID_STATUS, DEFAULT_STATUS,
};
```

- [ ] **Step 5: Smoke dos comentários**

```bash
node -e "(async () => { const db = require('./src/config/database'); const s = require('./src/services/controleViagens.service'); const empresa = await db.empresa.findFirst(); const truck = await db.truck.findFirst({ where: { empresa_id: empresa.id, deleted_at: null } }); const user = await db.user.findFirst({ where: { empresa_id: empresa.id } }); const fakeReq = { user, ip: '127.0.0.1', headers: {} }; const c1 = await s.addComment(truck.id, empresa.id, fakeReq, { texto: 'Comentário de smoke' }); console.log('criado:', c1.id, c1.author_nome); const list = await s.listComments(truck.id, empresa.id); console.log('total:', list.length); const d = await s.deleteComment(truck.id, c1.id, empresa.id, fakeReq); console.log('apagado:', d.ok); process.exit(0); })()"
```

Esperado: imprime `criado: <uuid> <nome>`, `total: N` (>= 1), `apagado: true`.

- [ ] **Step 6: Commit**

```bash
git add src/services/controleViagens.service.js
git commit -m "feat(controle-viagens): service de comentarios com soft-delete"
```

---

## Task 7: Validators (express-validator) + Controller + Routes + registrar

**Files:**
- Create: `src/validators/controleViagens.validator.js`
- Create: `src/controllers/controleViagens.controller.js`
- Create: `src/routes/controleViagens.routes.js`
- Modify: `src/routes/index.js`

- [ ] **Step 1: Criar validators**

Conteúdo de `src/validators/controleViagens.validator.js`:

```js
const { body } = require('express-validator');

const VALID_STATUS = [
  'VAZIO_AGUARDANDO_CARGA',
  'INDO_CARREGAR',
  'NA_FABRICA',
  'CARREGADO_EM_VIAGEM',
  'EM_DESCARGA_NO_CLIENTE',
  'EM_MANUTENCAO',
];

const upsertState = [
  body('status').optional().isIn(VALID_STATUS).withMessage('Status inválido.'),
  body('contexto_atual').optional({ nullable: true }).isLength({ max: 500 }),
  body('data_coleta').optional({ nullable: true, checkFalsy: true }).isISO8601().withMessage('Data de coleta inválida.'),
  body('data_agendamento_entrega').optional({ nullable: true, checkFalsy: true }).isISO8601().withMessage('Data de agendamento inválida.'),
  body('carga_descricao').optional({ nullable: true }).isLength({ max: 500 }),
  body('descricao').optional({ nullable: true }).isLength({ max: 4000 }),
];

const addComment = [
  body('texto').notEmpty().withMessage('Texto obrigatório.').isLength({ max: 4000 }).withMessage('Comentário muito longo (máx 4000).'),
];

module.exports = { upsertState, addComment, VALID_STATUS };
```

- [ ] **Step 2: Criar controller**

Conteúdo de `src/controllers/controleViagens.controller.js`:

```js
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
```

- [ ] **Step 3: Criar routes**

Conteúdo de `src/routes/controleViagens.routes.js`:

```js
const { Router } = require('express');
const controller = require('../controllers/controleViagens.controller');
const { upsertState, addComment } = require('../validators/controleViagens.validator');
const validate = require('../middleware/validate');
const { uuidParams } = require('../middleware/paramValidators');
const auth = require('../middleware/auth');
const tenant = require('../middleware/tenant');
const requirePermission = require('../middleware/permission');

const router = Router();
const requireModule = requirePermission('controle-viagens');

router.get   ('/board',                            auth, tenant, requireModule, controller.getBoard);
router.get   ('/:truckId',                         auth, tenant, requireModule, uuidParams('truckId'), controller.getDetail);
router.patch ('/:truckId/state',                   auth, tenant, requireModule, uuidParams('truckId'), upsertState, validate, controller.upsertState);
router.get   ('/:truckId/comments',                auth, tenant, requireModule, uuidParams('truckId'), controller.listComments);
router.post  ('/:truckId/comments',                auth, tenant, requireModule, uuidParams('truckId'), addComment, validate, controller.addComment);
router.delete('/:truckId/comments/:id',            auth, tenant, requireModule, uuidParams('truckId', 'id'), controller.deleteComment);

module.exports = router;
```

- [ ] **Step 4: Registrar a rota em `src/routes/index.js`**

Em `src/routes/index.js`, depois da linha `router.use('/truck-ledger', require('./truckLedger.routes'));`, adicionar:

```js
router.use('/controle-viagens', require('./controleViagens.routes'));
```

- [ ] **Step 5: Subir servidor e testar endpoint via curl**

Em um terminal, rodar `npm run dev`. Em outro, autenticar:

```bash
TOKEN=$(curl -s -X POST http://localhost:3000/api/auth/login -H "Content-Type: application/json" -d '{"email":"<seu_email>","senha":"<sua_senha>"}' | node -e "let d=''; process.stdin.on('data', c => d+=c); process.stdin.on('end', () => console.log(JSON.parse(d).accessToken))")
```

Em PowerShell, equivalente:
```powershell
$resp = Invoke-RestMethod -Uri http://localhost:3000/api/auth/login -Method Post -ContentType 'application/json' -Body '{"email":"<seu_email>","senha":"<sua_senha>"}'
$TOKEN = $resp.accessToken
```

Testar o board:
```bash
curl -s http://localhost:3000/api/controle-viagens/board -H "Authorization: Bearer $TOKEN" | head -c 500
```

Esperado: JSON com `board: [...]` e `fingerprint: "N-<num>-<num>"`. Cada item tem `truck`, `state`, `comments_count`, `last_comment_at`.

- [ ] **Step 6: Testar 403 com usuário sem permissão (opcional, se houver)**

Logar com um usuário GESTOR cuja `permissoes` não contenha `controle-viagens`, repetir o curl. Esperado: `{"error":"Acesso negado ao módulo 'controle-viagens'."}` com HTTP 403.

- [ ] **Step 7: Commit**

```bash
git add src/validators/controleViagens.validator.js src/controllers/controleViagens.controller.js src/routes/controleViagens.routes.js src/routes/index.js
git commit -m "feat(controle-viagens): rotas REST autenticadas e validadas"
```

---

## Task 8: HTML — view, hub-card, module-tabs

**Files:**
- Modify: `public/index.html`

- [ ] **Step 1: Adicionar o link do CSS no `<head>`**

Em `public/index.html`, após a linha `<link rel="stylesheet" href="/css/rentabilidade.css">` (linha 29), inserir:

```html
<link rel="stylesheet" href="/css/controle-viagens.css">
```

- [ ] **Step 2: Adicionar o 5º hub-card (após o card 04 — Rentabilidade)**

Em `public/index.html`, logo após o fechamento do card 04 (`</a>` na linha ~256, antes do fechamento `</div>` do `.hub-cards`), adicionar:

```html
          <!-- CARD 05 — Controle de Viagens -->
          <a class="hub-card" data-module="controle-viagens" onclick="goToControleViagens()" role="button" tabindex="0"
             onkeydown="if(event.key==='Enter'||event.key===' ')goToControleViagens()">
            <span class="tick tl"></span>
            <span class="tick tr"></span>
            <span class="tick bl"></span>
            <span class="tick br"></span>

            <div class="hub-card-index">05</div>
            <div class="hub-card-icon" aria-hidden="true">
              <!-- kanban board icon -->
              <svg viewBox="0 0 32 32" xmlns="http://www.w3.org/2000/svg">
                <path d="M4 4h7v24H4zM12 4h8v16h-8zM21 4h7v20h-7z"/>
              </svg>
            </div>
            <div class="hub-card-label">Operação · Tempo real</div>
            <h2 class="hub-card-title">Controle de Viagens</h2>
            <p class="hub-card-desc">
              Painel Kanban com o status atual de cada caminhão da
              frota. Movimente os cards entre colunas para acompanhar
              coleta, viagem, descarga e manutenção, com comentários
              em tempo real.
            </p>
            <div class="hub-card-cta">
              <span>Entrar no módulo</span>
              <span class="arrow"></span>
            </div>
            <div class="hub-card-bar"></div>
          </a>
```

Atualizar também a linha `<div class="hub-access-meta">04 módulos · Acesso restrito</div>` (linha ~131) para `05 módulos · Acesso restrito`.

- [ ] **Step 3: Adicionar o module-tab em todos os headers de módulos existentes**

`public/index.html` tem 4 headers com a barra de `.module-tabs` (linhas ~287, ~289, ~290, etc., para frota/frete-terceiro/veiculos/rentabilidade — uma vez em cada `<header>` desses módulos). Para CADA `.module-tabs` no arquivo, adicionar uma nova linha após o último `<button>` da barra:

```html
          <button class="module-tab"        data-mod-tab="controle-viagens" onclick="goToControleViagens()">📋 Controle</button>
```

Usar Grep pra achar todas as ocorrências e atualizar cada `<div class="module-tabs">` (devem ser 4 — uma em cada header de módulo).

- [ ] **Step 4: Adicionar a view container**

Em `public/index.html`, antes do fechamento `</div>` da `#appContainer` (perto do final do arquivo, depois de `#rentabilidadeView` e antes de `#adminView`), adicionar:

```html
  <!-- ============================================================
       CONTROLE DE VIAGENS — Painel Kanban operacional
       ============================================================ -->
  <div id="controleViagensView" style="display:none">

    <header class="cv-header">
      <div class="logo" style="display:flex;align-items:center;gap:12px">
        <button class="hub-back-btn" onclick="goToHub()" title="Voltar ao hub">
          <span class="arrow-l"></span>Início
        </button>
        <img class="logo-img" src="/assets/images/logo-full.png" alt="Prima" style="height:36px">
        <div class="module-tabs">
          <button class="module-tab"        data-mod-tab="frota"            onclick="goToFrota()">🚚 Acerto de Viagem</button>
          <button class="module-tab"        data-mod-tab="frete-terceiro"  onclick="goToFreteTerceiro()">🔁 Frete Terceiro</button>
          <button class="module-tab"        data-mod-tab="veiculos"        onclick="goToVeiculos()">🛡️ Veículos</button>
          <button class="module-tab"        data-mod-tab="rentabilidade"   onclick="goToRentabilidade()">💰 Rentabilidade</button>
          <button class="module-tab active" data-mod-tab="controle-viagens" onclick="goToControleViagens()">📋 Controle</button>
        </div>
      </div>
      <div style="display:flex;align-items:center;gap:10px">
        <button class="btn btn-ghost btn-sm" id="cvRefreshBtn" onclick="cv.manualRefresh()" title="Atualizar agora">↻ Atualizar</button>
        <span class="cv-refresh-info" id="cvRefreshInfo" title="Polling de atualização">—</span>
        <button class="btn btn-ghost btn-sm admin-trigger" onclick="goToAdmin()" style="display:none">⚙️ Admin</button>
        <button class="btn btn-ghost btn-sm" data-theme-toggle onclick="toggleTheme()" title="Alternar tema">🌙</button>
        <button class="btn btn-ghost btn-sm" onclick="doLogout()" style="color:var(--danger)">Sair</button>
      </div>
    </header>

    <div class="cv-main">
      <div class="cv-toolbar">
        <div class="form-group" style="flex:1;min-width:200px;max-width:400px">
          <label>Buscar caminhão</label>
          <input type="text" id="cvSearch" placeholder="placa, motorista, modelo, carga…">
        </div>
        <div class="cv-total" id="cvTotal">—</div>
      </div>
      <div class="cv-board" id="cvBoard">
        <div class="cv-loading">Carregando…</div>
      </div>
    </div>

    <!-- Modal de detalhe do caminhão -->
    <div class="cv-modal" id="cvDetailModal">
      <div class="cv-modal-content">
        <header class="cv-modal-hdr">
          <select id="cvDetStatus" class="cv-status-select"></select>
          <div class="cv-modal-actions">
            <button class="cv-modal-close" onclick="cv.closeDetail()" aria-label="Fechar">✕</button>
          </div>
        </header>
        <div class="cv-modal-tabs" id="cvModalTabs" style="display:none">
          <button class="cv-tab active" data-cv-tab="detail" onclick="cv.switchModalTab('detail')">Detalhes</button>
          <button class="cv-tab"        data-cv-tab="comments" onclick="cv.switchModalTab('comments')">Comentários</button>
        </div>
        <div class="cv-modal-body">
          <section class="cv-detail-pane" id="cvDetailPane">
            <h2 id="cvDetTitle" class="cv-modal-title"></h2>
            <div class="cv-modal-subtitle" id="cvDetSubtitle"></div>

            <div class="cv-fields" id="cvDetFields"></div>

            <div class="cv-section">
              <div class="cv-section-hdr"><span>Descrição</span></div>
              <textarea id="cvDetDescricao" rows="3" placeholder="observações gerais do caminhão (persiste entre status)"></textarea>
            </div>

            <div class="cv-modal-foot">
              <span id="cvDetUpdated" class="cv-muted"></span>
              <button class="btn btn-accent" id="cvDetSaveBtn" onclick="cv.saveDetailFields()">Salvar</button>
            </div>
          </section>

          <aside class="cv-comments-pane" id="cvCommentsPane">
            <div class="cv-comments-hdr">💬 Comentários e atividade</div>
            <form class="cv-comment-form" onsubmit="event.preventDefault(); cv.submitComment()">
              <textarea id="cvCommentInput" rows="2" placeholder="Escrever um comentário..."></textarea>
              <button type="submit" class="btn btn-accent btn-sm">Enviar</button>
            </form>
            <div class="cv-comments-list" id="cvCommentsList"></div>
          </aside>
        </div>
      </div>
    </div>

  </div>
```

- [ ] **Step 4 (continuação): Atualizar tab "active" nos outros headers**

Como o novo módulo tem sua tab, certifique-se que cada um dos 4 headers existentes (frota, frete-terceiro, veiculos, rentabilidade) NÃO tem `active` na nova tab — apenas na sua própria. O bloco que você adicionou no Step 3 deixou a nova tab como **não-active** nesses headers; perfeito.

- [ ] **Step 5: Verificação visual mínima**

Abrir o navegador em `http://localhost:3000`, logar. Ao chegar no Hub:
- Esperado: 5 cards (o 5º sendo "Controle de Viagens" com ícone Kanban). Contador "05 módulos".
- Clique no card → navega para `#controleViagensView` (mostra header, busca vazia, "Carregando…" no board — ainda sem JS).

- [ ] **Step 6: Commit**

```bash
git add public/index.html
git commit -m "feat(controle-viagens): adiciona view, hub-card e module-tabs no HTML"
```

---

## Task 9: CSS — variáveis, board, card, modal

**Files:**
- Create: `public/css/controle-viagens.css`

- [ ] **Step 1: Criar o CSS**

Conteúdo de `public/css/controle-viagens.css`:

```css
/* ==========================================================================
   CONTROLE DE VIAGENS — Kanban operacional
   Usa as variáveis já definidas em variables.css (--bg, --surface, --border,
   --accent, --info, --success, --danger, --muted, --text).
   ========================================================================== */

:root {
  --cv-col-vazio:        #6b7280;
  --cv-col-indo:         #38bdf8;
  --cv-col-fabrica:      #f59e0b;
  --cv-col-carregado:    #0ea5e9;
  --cv-col-descarga:     #facc15;
  --cv-col-manutencao:   #ef4444;
}

.cv-header {
  display:flex; justify-content:space-between; align-items:center;
  padding:.85rem 1.4rem;
  background:var(--surface);
  border-bottom:1px solid var(--border);
  position:sticky; top:0; z-index:20;
}
.cv-refresh-info {
  font-family:'IBM Plex Mono', monospace;
  font-size:.7rem; color:var(--muted);
  padding:.3rem .6rem; border:1px solid var(--border); border-radius:6px;
}
.cv-refresh-info.paused { color:var(--danger); border-color:var(--danger); }

.cv-main {
  display:flex; flex-direction:column;
  height:calc(100vh - 60px);
  background:var(--bg);
}

.cv-toolbar {
  display:flex; gap:1rem; align-items:flex-end;
  padding:1rem 1.4rem;
  border-bottom:1px solid var(--border);
}
.cv-total {
  font-family:'IBM Plex Mono', monospace;
  font-size:.75rem; color:var(--muted);
  letter-spacing:2px; text-transform:uppercase;
}

.cv-board {
  flex:1; min-height:0;
  display:flex; gap:.75rem;
  padding:1rem 1.4rem 1.4rem;
  overflow-x:auto;
}

.cv-loading {
  margin:auto; color:var(--muted); font-size:.85rem;
  font-family:'IBM Plex Mono', monospace; letter-spacing:2px; text-transform:uppercase;
}

/* ---------- COLUMN ---------- */
.cv-col {
  flex:1 1 0; min-width:260px; max-width:340px;
  display:flex; flex-direction:column;
  background:var(--surface);
  border:1px solid var(--border);
  border-radius:8px;
  overflow:hidden;
}
.cv-col-hdr {
  padding:.6rem .8rem;
  border-bottom:1px solid var(--border);
  background:var(--surface2);
  border-top:3px solid var(--col-color, var(--muted));
  display:flex; justify-content:space-between; align-items:center;
}
.cv-col-title {
  font-family:'Bebas Neue', sans-serif;
  font-size:1rem; letter-spacing:1.5px;
  color:var(--text);
}
.cv-col-count {
  font-family:'IBM Plex Mono', monospace;
  font-size:.7rem; color:var(--muted);
  background:var(--surface3);
  padding:.15rem .5rem; border-radius:10px;
}
.cv-col-body {
  flex:1; min-height:0;
  overflow-y:auto;
  padding:.55rem;
  display:flex; flex-direction:column; gap:.55rem;
}
.cv-col.drag-over {
  background:rgba(227,6,19,.04);
}
.cv-col.drag-over .cv-col-body {
  outline:2px dashed var(--accent);
  outline-offset:-4px;
  border-radius:6px;
}

/* ---------- CARD ---------- */
.cv-card {
  background:var(--surface2);
  border:1px solid var(--border);
  border-left:3px solid var(--card-color, var(--muted));
  border-radius:6px;
  padding:.6rem .7rem;
  cursor:grab;
  transition:transform .12s ease, box-shadow .12s ease;
}
.cv-card:hover {
  transform:translateY(-1px);
  box-shadow:0 6px 14px rgba(0,0,0,.18);
  border-top:1px solid var(--accent);
}
.cv-card.dragging {
  opacity:.55; transform:rotate(2deg);
  box-shadow:0 14px 30px rgba(0,0,0,.35);
}
.cv-card .cv-plate {
  font-family:'Bebas Neue', sans-serif;
  font-size:1.15rem; letter-spacing:1.5px;
  color:var(--text);
}
.cv-card .cv-driver  { font-size:.78rem; color:var(--text); margin-top:.1rem; }
.cv-card .cv-model   { font-size:.7rem;  color:var(--muted); }
.cv-card .cv-divider { border-top:1px dashed var(--border); margin:.4rem 0; }
.cv-card .cv-fields-mini {
  font-size:.72rem; color:var(--muted);
  display:flex; flex-wrap:wrap; gap:.5rem;
}
.cv-card .cv-fields-mini b { color:var(--text); font-weight:500; }
.cv-card .cv-foot {
  display:flex; justify-content:space-between; align-items:center;
  margin-top:.45rem; font-size:.7rem; color:var(--muted);
  font-family:'IBM Plex Mono', monospace;
}
.cv-card .cv-comment-pill {
  display:inline-flex; align-items:center; gap:.25rem;
  padding:.1rem .4rem; border-radius:10px;
  background:var(--surface3);
}
.cv-card .cv-comment-pill.unread { background:var(--accent); color:#fff; }

/* ---------- MODAL (Trello-like) ---------- */
.cv-modal {
  display:none;
  position:fixed; inset:0;
  background:rgba(0,0,0,.55); z-index:80;
  align-items:flex-start; justify-content:center;
  padding:2.5rem 1rem 1rem;
  overflow-y:auto;
}
.cv-modal.open { display:flex; }
.cv-modal-content {
  width:min(900px, 100%);
  background:var(--surface);
  border:1px solid var(--border);
  border-top:3px solid var(--accent);
  border-radius:10px;
  overflow:hidden;
  display:flex; flex-direction:column;
}
.cv-modal-hdr {
  display:flex; justify-content:space-between; align-items:center;
  padding:.6rem .8rem;
  border-bottom:1px solid var(--border);
  background:var(--surface2);
}
.cv-status-select {
  font-family:'IBM Plex Mono', monospace;
  font-size:.75rem;
  background:var(--surface); color:var(--text);
  border:1px solid var(--border); border-radius:6px;
  padding:.35rem .55rem;
  font-weight:600;
}
.cv-modal-close {
  background:transparent; color:var(--muted);
  border:none; cursor:pointer;
  font-size:1.1rem; padding:.2rem .5rem;
}
.cv-modal-close:hover { color:var(--text); }

.cv-modal-tabs {
  display:flex; border-bottom:1px solid var(--border);
}
.cv-tab {
  flex:1; padding:.6rem; background:transparent;
  border:none; color:var(--muted); cursor:pointer;
  font-size:.8rem; letter-spacing:1px; text-transform:uppercase;
}
.cv-tab.active { color:var(--text); border-bottom:2px solid var(--accent); }

.cv-modal-body {
  display:grid;
  grid-template-columns:minmax(0, 1fr) 320px;
  min-height:380px;
  max-height:calc(100vh - 200px);
}
.cv-detail-pane {
  padding:1rem 1.2rem;
  border-right:1px solid var(--border);
  overflow-y:auto;
}
.cv-comments-pane {
  display:flex; flex-direction:column;
  background:var(--surface2);
  overflow:hidden;
}
.cv-modal-title {
  font-family:'Bebas Neue', sans-serif;
  font-size:1.6rem; letter-spacing:1.5px;
  color:var(--text);
}
.cv-modal-subtitle { color:var(--muted); font-size:.8rem; margin-bottom:1rem; }

.cv-fields { display:flex; flex-direction:column; gap:.6rem; }
.cv-fields .form-group label {
  font-size:.7rem; letter-spacing:1.5px; text-transform:uppercase;
  color:var(--muted);
}

.cv-section { margin-top:1rem; }
.cv-section-hdr {
  font-size:.7rem; letter-spacing:1.5px; text-transform:uppercase;
  color:var(--muted); margin-bottom:.3rem;
}
.cv-section textarea {
  width:100%; background:var(--surface2); color:var(--text);
  border:1px solid var(--border); border-radius:6px; padding:.5rem;
  font-family:inherit; font-size:.85rem; resize:vertical;
}

.cv-modal-foot {
  display:flex; justify-content:space-between; align-items:center;
  margin-top:1rem; padding-top:.8rem; border-top:1px solid var(--border);
}
.cv-muted { color:var(--muted); font-size:.75rem; font-family:'IBM Plex Mono', monospace; }

/* ---------- COMMENTS ---------- */
.cv-comments-hdr {
  padding:.6rem .9rem; border-bottom:1px solid var(--border);
  font-size:.75rem; letter-spacing:1.5px; text-transform:uppercase;
  color:var(--muted);
}
.cv-comment-form {
  padding:.7rem .9rem; border-bottom:1px solid var(--border);
  display:flex; flex-direction:column; gap:.4rem;
  background:var(--surface);
}
.cv-comment-form textarea {
  background:var(--surface2); color:var(--text);
  border:1px solid var(--border); border-radius:6px; padding:.5rem;
  font-family:inherit; font-size:.85rem; resize:vertical;
}
.cv-comments-list {
  flex:1; overflow-y:auto; padding:.7rem .9rem;
  display:flex; flex-direction:column; gap:.7rem;
}
.cv-comment {
  display:flex; gap:.6rem;
}
.cv-comment-avatar {
  width:28px; height:28px; flex-shrink:0;
  border-radius:50%; background:var(--accent);
  color:#fff; font-size:.75rem; font-weight:700;
  display:flex; align-items:center; justify-content:center;
}
.cv-comment-body { flex:1; min-width:0; }
.cv-comment-head {
  font-size:.7rem; color:var(--muted);
  font-family:'IBM Plex Mono', monospace; letter-spacing:.5px;
}
.cv-comment-head b { color:var(--text); font-weight:600; }
.cv-comment-text { font-size:.85rem; color:var(--text); white-space:pre-wrap; word-wrap:break-word; }
.cv-comment-delete {
  background:transparent; border:none; cursor:pointer;
  color:var(--muted); font-size:.7rem;
  margin-left:.5rem; opacity:0; transition:opacity .15s;
}
.cv-comment:hover .cv-comment-delete { opacity:1; }
.cv-comment-delete:hover { color:var(--danger); }

/* ---------- MOBILE ---------- */
@media (max-width: 768px) {
  .cv-toolbar { flex-direction:column; align-items:stretch; }
  .cv-board {
    scroll-snap-type:x mandatory;
    padding:.8rem;
  }
  .cv-col {
    flex:0 0 85%;
    scroll-snap-align:start;
  }
  .cv-modal-content {
    border-radius:8px;
    height:calc(100vh - 60px);
  }
  .cv-modal-tabs { display:flex !important; }
  .cv-modal-body {
    grid-template-columns:1fr;
    max-height:none;
  }
  .cv-detail-pane,
  .cv-comments-pane { display:none; }
  .cv-detail-pane.active,
  .cv-comments-pane.active { display:flex; flex-direction:column; }
  .cv-detail-pane.active { display:block; }
  .cv-comment-form { position:sticky; bottom:0; }
}
```

- [ ] **Step 2: Refresh do navegador, visual check do board vazio**

Abrir DevTools (modo dark, 1280px largura), navegar para Controle de Viagens. Esperado:
- Toolbar com busca e contador "—".
- Board com texto "Carregando…" centralizado.
- Header tem botão "↻ Atualizar" e indicador de polling.

Toggle pra light/dark: cores devem alternar via variáveis CSS sem quebrar.

- [ ] **Step 3: Commit**

```bash
git add public/css/controle-viagens.css
git commit -m "feat(controle-viagens): estilos do board, card e modal Trello-like"
```

---

## Task 10: JS — Hub wiring (goToControleViagens, ALL_MODULES, lazy-load)

**Files:**
- Modify: `public/js/hub.js`
- Modify: `public/js/admin/users.js`

- [ ] **Step 1: Adicionar flag de carregado em `hub.js`**

Em `public/js/hub.js`, na seção de flags (linhas 8-12), adicionar:

```js
let controleViagensLoaded = false;
```

- [ ] **Step 2: Adicionar `controleViagensView` em `hideAll`**

Substituir a linha 17 de `public/js/hub.js`:

```js
  ['hubView','moduleContainer','freteTerceiroView','veiculosView','rentabilidadeView','adminView'].forEach(id => {
```

por:

```js
  ['hubView','moduleContainer','freteTerceiroView','veiculosView','rentabilidadeView','controleViagensView','adminView'].forEach(id => {
```

- [ ] **Step 3: Adicionar a função `goToControleViagens`**

Logo após `goToRentabilidade` (após linha ~146 de `hub.js`), inserir:

```js
export async function goToControleViagens() {
  if (!hasModuleAccess('controle-viagens')) {
    alert('Você não tem permissão para acessar Controle de Viagens.');
    return showHub();
  }
  hideAll();
  const v = document.getElementById('controleViagensView');
  if (v) v.style.display = '';
  document.body.dataset.view = 'controle-viagens';
  setActiveTab('controle-viagens');
  saveLastTab('controle-viagens');
  refreshAdminVisibility();
  try {
    const mod = await import('./controle-viagens.js');
    await mod.initControleViagens();
    controleViagensLoaded = true;
  } catch (e) {
    console.error('Erro ao carregar módulo Controle de Viagens:', e);
  }
}
```

- [ ] **Step 4: Atualizar `ALL_MODULES`**

Em `public/js/hub.js`, substituir a linha:

```js
const ALL_MODULES = ['frota', 'frete-terceiro', 'veiculos', 'rentabilidade'];
```

por:

```js
const ALL_MODULES = ['frota', 'frete-terceiro', 'veiculos', 'rentabilidade', 'controle-viagens'];
```

- [ ] **Step 5: Restaurar a aba salva**

Em `routeAfterLogin` (linhas ~272-275), adicionar uma linha após a verificação de `rentabilidade`:

```js
    if (last === 'controle-viagens' && hasModuleAccess('controle-viagens')) return await goToControleViagens();
```

- [ ] **Step 6: Expor globalmente**

No final de `public/js/hub.js`, depois de `window.goToAdmin = goToAdmin;`, adicionar:

```js
window.goToControleViagens = goToControleViagens;
```

- [ ] **Step 7: Atualizar `ALL_MODULES` em admin/users.js**

Em `public/js/admin/users.js` linhas 67-70 (declaração `const ALL_MODULES`), substituir o array atual por:

```js
const ALL_MODULES = [
  { key: 'frota',            label: '🚚 Acerto de Viagem' },
  { key: 'frete-terceiro',   label: '🔁 Frete Terceiro' },
  { key: 'veiculos',         label: '🛡️ Veículos' },
  { key: 'rentabilidade',    label: '💰 Rentabilidade' },
  { key: 'controle-viagens', label: '📋 Controle de Viagens' },
];
```

E no mapa de ícones (linha ~37), adicionar a nova chave:

```js
const icons = { 'frota':'🚚', 'frete-terceiro':'🔁', 'veiculos':'🛡️', 'rentabilidade':'💰', 'controle-viagens':'📋' };
```

- [ ] **Step 8: Verificação no navegador**

Recarregar a aplicação. No Hub, clicar em "Controle de Viagens". Esperado:
- URL fica em hash (se houver) ou `document.body.dataset.view` muda para `controle-viagens` (verificar via console: `document.body.dataset.view`).
- Console: erro `cv is not defined` (ou similar) ao tentar carregar `controle-viagens.js` — esperado porque o módulo ainda não existe (Task 11). Aceitável neste passo.

No Admin → Usuários → editar um GESTOR: o painel de permissões deve mostrar 5 checkboxes incluindo "📋 Controle de Viagens".

- [ ] **Step 9: Commit**

```bash
git add public/js/hub.js public/js/admin/users.js
git commit -m "feat(hub): roteamento e permissao do modulo Controle de Viagens"
```

---

## Task 11: JS — Board (render, busca, contadores, polling)

**Files:**
- Create: `public/js/controle-viagens.js`

- [ ] **Step 1: Criar o esqueleto do módulo**

Conteúdo inicial de `public/js/controle-viagens.js`:

```js
// controle-viagens.js — Painel Kanban operacional.
//
// Cada caminhão da frota é um card. Movimentar entre colunas atualiza
// o status no backend. Polling a cada 20s; pausado quando aba fora de
// foco. Identidade visual idêntica ao restante do sistema (vide
// public/css/controle-viagens.css).

import { api } from './api.js';
import { esc } from './utils.js';

const COLUMNS = [
  { key: 'VAZIO_AGUARDANDO_CARGA',   label: 'Vazio aguardando carga',  color: 'var(--cv-col-vazio)' },
  { key: 'INDO_CARREGAR',            label: 'Indo carregar',           color: 'var(--cv-col-indo)' },
  { key: 'NA_FABRICA',               label: 'Na fábrica',              color: 'var(--cv-col-fabrica)' },
  { key: 'CARREGADO_EM_VIAGEM',      label: 'Carregado em viagem',     color: 'var(--cv-col-carregado)' },
  { key: 'EM_DESCARGA_NO_CLIENTE',   label: 'Em descarga no cliente',  color: 'var(--cv-col-descarga)' },
  { key: 'EM_MANUTENCAO',            label: 'Em manutenção',           color: 'var(--cv-col-manutencao)' },
];

const STATUS_LABEL = Object.fromEntries(COLUMNS.map(c => [c.key, c.label]));

const POLL_INTERVAL_MS = 20_000;

const state = {
  rows: [],           // [{ truck, state, comments_count, last_comment_at }]
  fingerprint: null,
  query: '',
  pollTimer: null,
  detailTruckId: null,
  lastSeen: loadLastSeen(),
  initialized: false,
};

/* ============================================================
   LOCALSTORAGE — última visita por caminhão (badge "novo")
   ============================================================ */
function loadLastSeen() {
  try {
    const raw = localStorage.getItem('cv_last_seen');
    return raw ? JSON.parse(raw) : {};
  } catch { return {}; }
}
function saveLastSeen() {
  try { localStorage.setItem('cv_last_seen', JSON.stringify(state.lastSeen)); } catch { /* */ }
}
function markSeen(truckId) {
  state.lastSeen[truckId] = new Date().toISOString();
  saveLastSeen();
}

/* ============================================================
   FORMATAÇÃO
   ============================================================ */
function fmtDate(s) {
  if (!s) return '';
  const d = new Date(s);
  if (isNaN(d)) return '';
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  return `${dd}/${mm}`;
}
function fmtTime(s) {
  if (!s) return '';
  const d = new Date(s);
  if (isNaN(d)) return '';
  const hh = String(d.getHours()).padStart(2, '0');
  const mi = String(d.getMinutes()).padStart(2, '0');
  return `${hh}:${mi}`;
}

/* ============================================================
   FETCH + POLLING
   ============================================================ */
async function fetchBoard() {
  try {
    const resp = await api.get('/api/controle-viagens/board');
    if (state.fingerprint === resp.fingerprint) {
      updateRefreshInfo(); // só atualiza horário
      return;
    }
    state.rows = resp.board;
    state.fingerprint = resp.fingerprint;
    renderBoard();
    updateRefreshInfo();
  } catch (e) {
    console.error('[cv] falha ao carregar board:', e);
    document.getElementById('cvBoard').innerHTML =
      `<div class="cv-loading" style="color:var(--danger)">Erro: ${esc(e.message)}</div>`;
  }
}

function startPolling() {
  stopPolling();
  state.pollTimer = setInterval(() => {
    if (!document.hidden) fetchBoard();
  }, POLL_INTERVAL_MS);
}
function stopPolling() {
  if (state.pollTimer) { clearInterval(state.pollTimer); state.pollTimer = null; }
}

function updateRefreshInfo() {
  const el = document.getElementById('cvRefreshInfo');
  if (!el) return;
  const now = new Date();
  el.textContent = `última ${String(now.getHours()).padStart(2,'0')}:${String(now.getMinutes()).padStart(2,'0')}:${String(now.getSeconds()).padStart(2,'0')}`;
  el.classList.toggle('paused', document.hidden);
}

/* ============================================================
   RENDER
   ============================================================ */
function filteredRows() {
  const q = state.query.trim().toLowerCase();
  if (!q) return state.rows;
  return state.rows.filter(r => {
    const t = r.truck;
    const s = r.state || {};
    return (t.placa || '').toLowerCase().includes(q)
        || (t.motorista || '').toLowerCase().includes(q)
        || (t.modelo || '').toLowerCase().includes(q)
        || (s.carga_descricao || '').toLowerCase().includes(q)
        || (s.contexto_atual || '').toLowerCase().includes(q);
  });
}

function renderBoard() {
  const board = document.getElementById('cvBoard');
  const rows = filteredRows();

  document.getElementById('cvTotal').textContent =
    `${rows.length} de ${state.rows.length} caminhões`;

  board.innerHTML = COLUMNS.map(col => {
    const cards = rows.filter(r => (r.state?.status || 'VAZIO_AGUARDANDO_CARGA') === col.key);
    return `
      <div class="cv-col" data-col-status="${col.key}" style="--col-color:${col.color}">
        <div class="cv-col-hdr">
          <span class="cv-col-title">${esc(col.label)}</span>
          <span class="cv-col-count">${cards.length}</span>
        </div>
        <div class="cv-col-body" data-col-body="${col.key}">
          ${cards.map(renderCard).join('') || '<div class="cv-muted" style="text-align:center;padding:.5rem">—</div>'}
        </div>
      </div>`;
  }).join('');

  wireDragAndDrop();
}

function renderCard(row) {
  const t = row.truck;
  const s = row.state || {};
  const status = s.status || 'VAZIO_AGUARDANDO_CARGA';
  const col = COLUMNS.find(c => c.key === status);
  const fields = miniFields(status, s);
  const unread = isUnread(row);
  const updated = s.updated_at ? fmtTime(s.updated_at) : '';
  return `
    <div class="cv-card" draggable="true"
         data-truck-id="${esc(t.id)}"
         style="--card-color:${col?.color || 'var(--muted)'}"
         onclick="cv.openDetail('${esc(t.id)}')">
      <div class="cv-plate">${esc(t.placa)}</div>
      <div class="cv-driver">${esc(t.motorista || '—')}</div>
      <div class="cv-model">${esc(t.modelo || '')}</div>
      ${fields ? `<div class="cv-divider"></div><div class="cv-fields-mini">${fields}</div>` : ''}
      <div class="cv-foot">
        <span class="cv-comment-pill ${unread ? 'unread' : ''}">💬 ${row.comments_count || 0}</span>
        <span>${updated ? '⏱ ' + updated : ''}</span>
      </div>
    </div>`;
}

function miniFields(status, s) {
  const parts = [];
  if (status === 'INDO_CARREGAR') {
    if (s.data_coleta)              parts.push(`🚚 <b>${fmtDate(s.data_coleta)}</b>`);
    if (s.data_agendamento_entrega) parts.push(`📅 <b>${fmtDate(s.data_agendamento_entrega)}</b>`);
    if (s.carga_descricao)          parts.push(esc(s.carga_descricao));
  } else if (status === 'CARREGADO_EM_VIAGEM') {
    if (s.data_agendamento_entrega) parts.push(`📅 <b>${fmtDate(s.data_agendamento_entrega)}</b>`);
    if (s.carga_descricao)          parts.push(esc(s.carga_descricao));
  } else if (s.contexto_atual) {
    parts.push(`📍 ${esc(s.contexto_atual)}`);
  }
  return parts.join(' · ');
}

function isUnread(row) {
  if (!row.last_comment_at || (row.comments_count || 0) === 0) return false;
  const seen = state.lastSeen[row.truck.id];
  if (!seen) return true;
  return new Date(row.last_comment_at) > new Date(seen);
}

/* ============================================================
   SEARCH
   ============================================================ */
function applySearch() {
  state.query = document.getElementById('cvSearch').value;
  renderBoard();
}

/* ============================================================
   DRAG AND DROP — wire-up placeholder (Task 13 implementa)
   ============================================================ */
function wireDragAndDrop() {
  // Implementação real em Task 14.
}

/* ============================================================
   INIT
   ============================================================ */
async function manualRefresh() {
  state.fingerprint = null;
  await fetchBoard();
}

export async function initControleViagens() {
  if (state.initialized) {
    if (!state.pollTimer) startPolling();
    return;
  }
  state.initialized = true;

  document.getElementById('cvSearch').addEventListener('input', applySearch);

  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) fetchBoard();
    updateRefreshInfo();
  });

  await fetchBoard();
  startPolling();
}

/* Exposto pro HTML inline (onclick) */
const cv = {
  manualRefresh,
  applySearch,
  openDetail: () => alert('Detalhe será implementado na próxima task'),
  closeDetail: () => {},
  saveDetailFields: () => {},
  submitComment: () => {},
  switchModalTab: () => {},
};
window.cv = cv;
export { cv };
```

- [ ] **Step 2: Verificação visual**

Recarregar a app, ir em Controle de Viagens. Esperado:
- Board renderiza 6 colunas com cores distintas no topo.
- Todos os caminhões aparecem na primeira coluna ("Vazio aguardando carga"), com placa em destaque, motorista, modelo.
- Contador no header de cada coluna corresponde à quantidade de cards.
- Toolbar mostra "N de N caminhões".
- Indicador de polling no header atualiza horário.
- Buscar por placa filtra (testar digitando parte de uma placa existente).
- Após 20s sem interação, polling refaz a chamada (verificar no DevTools → Network).

- [ ] **Step 3: Commit**

```bash
git add public/js/controle-viagens.js
git commit -m "feat(controle-viagens): board com cards, busca, contadores e polling"
```

---

## Task 12: JS — Detail modal (status, campos, descrição, save)

**Files:**
- Create: `public/js/controle-viagens.modal.js`
- Modify: `public/js/controle-viagens.js`

- [ ] **Step 1: Criar o módulo do modal**

Conteúdo de `public/js/controle-viagens.modal.js`:

```js
// controle-viagens.modal.js — Modal de detalhe do caminhão:
// status (dropdown), campos contextuais e bloco de descrição.
// A timeline de comentários é tratada no mesmo modal mas em outro
// arquivo (próxima task).

import { api } from './api.js';
import { esc } from './utils.js';

const COLUMNS_INFO = {
  VAZIO_AGUARDANDO_CARGA: { label: 'Vazio aguardando carga', color: 'var(--cv-col-vazio)',     fields: ['contexto_atual'], contextoLabel: 'Local atual' },
  INDO_CARREGAR:          { label: 'Indo carregar',          color: 'var(--cv-col-indo)',      fields: ['data_coleta','data_agendamento_entrega','carga_descricao'] },
  NA_FABRICA:             { label: 'Na fábrica',             color: 'var(--cv-col-fabrica)',   fields: ['contexto_atual'], contextoLabel: 'Fábrica' },
  CARREGADO_EM_VIAGEM:    { label: 'Carregado em viagem',    color: 'var(--cv-col-carregado)', fields: ['data_agendamento_entrega','carga_descricao'] },
  EM_DESCARGA_NO_CLIENTE: { label: 'Em descarga no cliente', color: 'var(--cv-col-descarga)',  fields: ['contexto_atual'], contextoLabel: 'Cliente' },
  EM_MANUTENCAO:          { label: 'Em manutenção',          color: 'var(--cv-col-manutencao)',fields: ['contexto_atual'], contextoLabel: 'Descrição da manutenção' },
};

const state = {
  truckId: null,
  data: null,
  modalTab: 'detail',
};

function toDateInput(s) {
  if (!s) return '';
  const d = new Date(s);
  if (isNaN(d)) return '';
  const yy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yy}-${mm}-${dd}`;
}

function fmtPtBR(s) {
  if (!s) return '';
  const d = new Date(s);
  if (isNaN(d)) return '';
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const hh = String(d.getHours()).padStart(2, '0');
  const mi = String(d.getMinutes()).padStart(2, '0');
  return `${dd}/${mm} ${hh}:${mi}`;
}

function populateStatusSelect() {
  const sel = document.getElementById('cvDetStatus');
  sel.innerHTML = Object.entries(COLUMNS_INFO)
    .map(([k, v]) => `<option value="${k}">${v.label}</option>`).join('');
  sel.onchange = renderFields;
  // Recolora a borda do select conforme status atual
  sel.addEventListener('change', () => {
    const info = COLUMNS_INFO[sel.value];
    sel.style.borderColor = info?.color || 'var(--border)';
  });
}

function renderFields() {
  const sel = document.getElementById('cvDetStatus');
  const status = sel.value;
  const info = COLUMNS_INFO[status];
  const s = state.data?.state || {};

  const fieldsEl = document.getElementById('cvDetFields');
  const partsHtml = [];

  for (const f of info.fields) {
    if (f === 'contexto_atual') {
      partsHtml.push(`
        <div class="form-group">
          <label>${esc(info.contextoLabel || 'Local')}</label>
          <input type="text" id="cvDetCtx" value="${esc(s.contexto_atual || '')}" maxlength="500">
        </div>`);
    } else if (f === 'data_coleta') {
      partsHtml.push(`
        <div class="form-group">
          <label>Data da coleta</label>
          <input type="date" id="cvDetColeta" value="${toDateInput(s.data_coleta)}">
        </div>`);
    } else if (f === 'data_agendamento_entrega') {
      partsHtml.push(`
        <div class="form-group">
          <label>Agendamento da entrega</label>
          <input type="date" id="cvDetAgend" value="${toDateInput(s.data_agendamento_entrega)}">
        </div>`);
    } else if (f === 'carga_descricao') {
      partsHtml.push(`
        <div class="form-group">
          <label>Carga</label>
          <input type="text" id="cvDetCarga" value="${esc(s.carga_descricao || '')}" maxlength="500" placeholder="ex.: Soja - Faz. Boa Vista">
        </div>`);
    }
  }
  fieldsEl.innerHTML = partsHtml.join('');

  // Borda colorida do status
  sel.style.borderColor = info?.color || 'var(--border)';
}

function readFieldsPayload() {
  const status = document.getElementById('cvDetStatus').value;
  const payload = { status, descricao: document.getElementById('cvDetDescricao').value || null };
  const info = COLUMNS_INFO[status];
  if (info.fields.includes('contexto_atual')) {
    payload.contexto_atual = (document.getElementById('cvDetCtx')?.value || '').trim() || null;
  } else {
    payload.contexto_atual = null;
  }
  if (info.fields.includes('data_coleta')) {
    payload.data_coleta = document.getElementById('cvDetColeta')?.value || null;
  }
  if (info.fields.includes('data_agendamento_entrega')) {
    payload.data_agendamento_entrega = document.getElementById('cvDetAgend')?.value || null;
  }
  if (info.fields.includes('carga_descricao')) {
    payload.carga_descricao = (document.getElementById('cvDetCarga')?.value || '').trim() || null;
  }
  return payload;
}

export async function openDetail(truckId) {
  state.truckId = truckId;
  state.modalTab = 'detail';

  // Carrega dados
  try {
    state.data = await api.get(`/api/controle-viagens/${truckId}`);
  } catch (e) {
    alert('Erro ao carregar caminhão: ' + e.message);
    return;
  }

  // Header
  const t = state.data.truck;
  const s = state.data.state || {};
  document.getElementById('cvDetTitle').textContent = `${t.placa} — ${t.motorista || 'sem motorista'}`;
  document.getElementById('cvDetSubtitle').textContent =
    [t.modelo, t.carreta_placa ? `+ ${t.carreta_placa}${t.carreta_modelo ? ' (' + t.carreta_modelo + ')' : ''}` : '']
      .filter(Boolean).join(' ');

  populateStatusSelect();
  document.getElementById('cvDetStatus').value = s.status || 'VAZIO_AGUARDANDO_CARGA';
  document.getElementById('cvDetDescricao').value = s.descricao || '';
  renderFields();

  document.getElementById('cvDetUpdated').textContent =
    s.updated_by ? `Última: ${s.updated_by.nome} · ${fmtPtBR(s.updated_at)}` : '';

  document.getElementById('cvDetailModal').classList.add('open');
  switchModalTab('detail');

  // Hook pra módulo de comentários (Task 13) carregar a lista
  if (window.cvComments?.loadFor) await window.cvComments.loadFor(truckId);
}

export function closeDetail() {
  document.getElementById('cvDetailModal').classList.remove('open');
  // Marca como visto ANTES de limpar o id (badge "novo" some no próximo refresh)
  if (window.cv?.markSeen && state.truckId) window.cv.markSeen(state.truckId);
  state.truckId = null;
  state.data = null;
}

export async function saveDetailFields() {
  const btn = document.getElementById('cvDetSaveBtn');
  const originalLabel = btn.textContent;
  btn.disabled = true; btn.textContent = 'Salvando...';
  try {
    const payload = readFieldsPayload();
    await api.patch(`/api/controle-viagens/${state.truckId}/state`, payload);
    // Recarrega o board (pega novo fingerprint + status visível)
    if (window.cv?.manualRefresh) await window.cv.manualRefresh();
    closeDetail();
  } catch (e) {
    alert('Erro ao salvar: ' + e.message);
  } finally {
    btn.disabled = false; btn.textContent = originalLabel;
  }
}

export function switchModalTab(tab) {
  state.modalTab = tab;
  document.querySelectorAll('#cvModalTabs .cv-tab').forEach(b => {
    b.classList.toggle('active', b.dataset.cvTab === tab);
  });
  document.getElementById('cvDetailPane').classList.toggle('active', tab === 'detail');
  document.getElementById('cvCommentsPane').classList.toggle('active', tab === 'comments');
}
```

- [ ] **Step 2: Integrar o modal em `controle-viagens.js`**

Em `public/js/controle-viagens.js`, no bloco que cria o objeto `cv` no final, substituir o objeto inteiro por:

```js
import * as modal from './controle-viagens.modal.js';

const cv = {
  manualRefresh,
  applySearch,
  openDetail: modal.openDetail,
  closeDetail: modal.closeDetail,
  saveDetailFields: modal.saveDetailFields,
  switchModalTab: modal.switchModalTab,
  submitComment: () => alert('Comentários: próxima task'),
  markSeen,
};
window.cv = cv;
export { cv };
```

(O `import` deve ir no topo do arquivo junto com os outros imports. Mover lá.)

- [ ] **Step 3: Verificação no navegador**

Recarregar, ir em Controle de Viagens. Clicar num card. Esperado:
- Modal abre em 2 colunas (em viewport ≥ 769px).
- Header tem dropdown de status com a cor da coluna atual.
- Coluna central mostra placa em Bebas Neue, motorista, modelo + carreta.
- Bloco "Status atual": para o status default (VAZIO), aparece campo "Local atual" vazio.
- Trocar status no dropdown → campos somem/aparecem. Trocar pra INDO CARREGAR → 3 campos (coleta, agendamento, carga).
- Coluna direita ainda em "Próxima task" (comentários ainda não implementados).
- Editar campos, clicar "Salvar" → modal fecha, board atualiza, card aparece na nova coluna.

Em viewport ≤ 768px (DevTools 375px):
- Header do modal mostra abas "Detalhes | Comentários".
- Aba "Detalhes" mostra o conteúdo central; aba "Comentários" mostra a lateral (ainda vazia).
- Trocar status e salvar funciona igual.

- [ ] **Step 4: Commit**

```bash
git add public/js/controle-viagens.modal.js public/js/controle-viagens.js
git commit -m "feat(controle-viagens): modal de detalhe com status, campos contextuais e save"
```

---

## Task 13: JS — Timeline de comentários

**Files:**
- Modify: `public/js/controle-viagens.modal.js`
- Modify: `public/js/controle-viagens.js`

- [ ] **Step 1: Adicionar funções de comentários ao `controle-viagens.modal.js`**

No final de `public/js/controle-viagens.modal.js`, antes de exports finais, adicionar:

```js
/* ============================================================
   COMMENTS
   ============================================================ */
const commentsState = { truckId: null, items: [] };

async function loadComments(truckId) {
  commentsState.truckId = truckId;
  try {
    commentsState.items = await api.get(`/api/controle-viagens/${truckId}/comments?limit=200`);
  } catch (e) {
    commentsState.items = [];
    console.error('[cv comments] load failed:', e);
  }
  renderComments();
}

function initial(name) {
  return (name || '?').trim().charAt(0).toUpperCase();
}

function fmtPtBRFull(s) {
  if (!s) return '';
  const d = new Date(s);
  if (isNaN(d)) return '';
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const yy = String(d.getFullYear()).slice(-2);
  const hh = String(d.getHours()).padStart(2, '0');
  const mi = String(d.getMinutes()).padStart(2, '0');
  return `${dd}/${mm}/${yy} ${hh}:${mi}`;
}

function renderComments() {
  const list = document.getElementById('cvCommentsList');
  if (!commentsState.items.length) {
    list.innerHTML = '<div class="cv-muted" style="text-align:center;padding:1rem">Nenhum comentário ainda. Seja o primeiro 💬</div>';
    return;
  }
  const me = window.__currentUser || null;
  const meId = me?.id || null;
  const isAdmin = me?.role === 'ADMIN';

  list.innerHTML = commentsState.items.map(c => {
    const canDelete = isAdmin || (c.author_id && c.author_id === meId);
    return `
      <div class="cv-comment" data-comment-id="${esc(c.id)}">
        <div class="cv-comment-avatar">${esc(initial(c.author_nome))}</div>
        <div class="cv-comment-body">
          <div class="cv-comment-head">
            <b>${esc(c.author_nome)}</b> · ${fmtPtBRFull(c.created_at)}
            ${canDelete ? `<button class="cv-comment-delete" onclick="cv.deleteComment('${esc(c.id)}')" title="Apagar">apagar</button>` : ''}
          </div>
          <div class="cv-comment-text">${esc(c.texto)}</div>
        </div>
      </div>`;
  }).join('');
}

export async function submitComment() {
  if (!commentsState.truckId) return;
  const input = document.getElementById('cvCommentInput');
  const texto = (input.value || '').trim();
  if (!texto) return;
  try {
    const c = await api.post(`/api/controle-viagens/${commentsState.truckId}/comments`, { texto });
    commentsState.items = [c, ...commentsState.items];
    input.value = '';
    renderComments();
    // Atualiza board pra incrementar contador 💬 + last_comment_at
    if (window.cv?.manualRefresh) await window.cv.manualRefresh();
  } catch (e) {
    alert('Erro ao enviar comentário: ' + e.message);
  }
}

export async function deleteComment(id) {
  if (!commentsState.truckId) return;
  if (!confirm('Apagar este comentário?')) return;
  try {
    await api.delete(`/api/controle-viagens/${commentsState.truckId}/comments/${id}`);
    commentsState.items = commentsState.items.filter(c => c.id !== id);
    renderComments();
    if (window.cv?.manualRefresh) await window.cv.manualRefresh();
  } catch (e) {
    alert('Erro ao apagar: ' + e.message);
  }
}

// Wire pro openDetail chamar quando abrir o modal
window.cvComments = { loadFor: loadComments };
```

- [ ] **Step 2: Expor as funções globalmente via `cv`**

Em `public/js/controle-viagens.js`, atualizar o objeto `cv` (substituindo a versão da Task 12):

```js
const cv = {
  manualRefresh,
  applySearch,
  openDetail: modal.openDetail,
  closeDetail: modal.closeDetail,
  saveDetailFields: modal.saveDetailFields,
  switchModalTab: modal.switchModalTab,
  submitComment: modal.submitComment,
  deleteComment: modal.deleteComment,
  markSeen,
};
window.cv = cv;
```

- [ ] **Step 3: Expor o usuário corrente como `window.__currentUser`**

Em `public/js/auth.js`, na função que finaliza o login (procure por onde `getCurrentUser` é populado, ou no `app.js`), garantir que `window.__currentUser = user;` é setado após o login bem-sucedido.

Se não houver um lugar óbvio, pode-se adicionar na inicialização do hub: em `public/js/hub.js`, na função `renderHubUser`, depois de `const u = getCurrentUser();`, adicionar `window.__currentUser = u;`.

Localizar usando Grep:
```
Grep "getCurrentUser" public/js
```

Adicionar `window.__currentUser = u;` no primeiro lugar onde o user é obtido após login. O caminho mais seguro é em `hub.js` linha ~217:

```js
function renderHubUser() {
  const u = getCurrentUser();
  window.__currentUser = u;   // <<< adicionar esta linha
  const el = document.getElementById('hubUserInfo');
  if (el && u) el.textContent = `${u.nome} · ${u.role}`;
}
```

- [ ] **Step 4: Verificação no navegador**

Abrir um card pelo board, clicar na aba "Comentários" (mobile) ou ver a lateral (desktop). Esperado:
- Lista vazia mostra "Nenhum comentário ainda".
- Digitar texto e clicar "Enviar" → comentário aparece no topo, contador 💬 do card no board incrementa.
- Reabrir o modal, comentário continua lá (persistido).
- Botão "apagar" aparece no hover do próprio comentário; ao clicar e confirmar, some.
- Outro usuário (criar outro account de teste) não vê o botão apagar nos comentários alheios.

- [ ] **Step 5: Commit**

```bash
git add public/js/controle-viagens.modal.js public/js/controle-viagens.js public/js/hub.js
git commit -m "feat(controle-viagens): timeline de comentarios com autor e soft-delete"
```

---

## Task 14: JS — Drag-and-drop (desktop) + mobile gestures

**Files:**
- Modify: `public/js/controle-viagens.js`

- [ ] **Step 1: Implementar `wireDragAndDrop`**

Em `public/js/controle-viagens.js`, substituir a função `wireDragAndDrop` (placeholder vazio) por:

```js
function wireDragAndDrop() {
  const cards = document.querySelectorAll('.cv-card');
  const cols  = document.querySelectorAll('.cv-col');

  cards.forEach(card => {
    card.addEventListener('dragstart', onDragStart);
    card.addEventListener('dragend',   onDragEnd);
    // Mobile: long-press habilita arrasto (350ms)
    let lpTimer = null;
    card.addEventListener('touchstart', (e) => {
      lpTimer = setTimeout(() => {
        card.classList.add('long-pressing');
        card.setAttribute('data-lp', '1');
        if (navigator.vibrate) try { navigator.vibrate(20); } catch { /* */ }
      }, 350);
    }, { passive: true });
    card.addEventListener('touchend',   () => { clearTimeout(lpTimer); card.removeAttribute('data-lp'); });
    card.addEventListener('touchmove',  () => { clearTimeout(lpTimer); });
  });

  cols.forEach(col => {
    col.addEventListener('dragover',  onDragOver);
    col.addEventListener('dragleave', onDragLeave);
    col.addEventListener('drop',      onDrop);
  });
}

function onDragStart(e) {
  const card = e.currentTarget;
  card.classList.add('dragging');
  e.dataTransfer.effectAllowed = 'move';
  e.dataTransfer.setData('text/plain', card.dataset.truckId);
}
function onDragEnd(e) {
  e.currentTarget.classList.remove('dragging');
  document.querySelectorAll('.cv-col.drag-over').forEach(c => c.classList.remove('drag-over'));
}
function onDragOver(e) {
  e.preventDefault();
  e.dataTransfer.dropEffect = 'move';
  e.currentTarget.classList.add('drag-over');
}
function onDragLeave(e) {
  // Só remove se realmente saiu (relatedTarget fora da coluna)
  if (!e.currentTarget.contains(e.relatedTarget)) {
    e.currentTarget.classList.remove('drag-over');
  }
}
async function onDrop(e) {
  e.preventDefault();
  const col = e.currentTarget;
  col.classList.remove('drag-over');
  const newStatus = col.dataset.colStatus;
  const truckId   = e.dataTransfer.getData('text/plain');
  if (!newStatus || !truckId) return;

  const row = state.rows.find(r => r.truck.id === truckId);
  if (!row) return;
  const oldStatus = row.state?.status || 'VAZIO_AGUARDANDO_CARGA';
  if (oldStatus === newStatus) return;

  // Otimista: move localmente
  row.state = { ...(row.state || {}), status: newStatus };
  renderBoard();

  try {
    await api.patch(`/api/controle-viagens/${truckId}/state`, { status: newStatus });
    await fetchBoard(); // refresca contador, updated_by, etc.
  } catch (err) {
    alert('Erro ao mover: ' + err.message);
    // Rollback
    row.state.status = oldStatus;
    renderBoard();
  }
}
```

- [ ] **Step 2: Confirmar `api.patch` existe**

Verificar em `public/js/api.js` se há um método `patch`. Se não houver, abrir `api.js` e adicionar (procurando por onde `get`, `post`, `delete` são exportados):

```js
export const api = {
  get:    (url)       => request('GET', url),
  post:   (url, body) => request('POST', url, body),
  patch:  (url, body) => request('PATCH', url, body),
  delete: (url)       => request('DELETE', url),
};
```

(Provavelmente já existe; só conferir.)

- [ ] **Step 3: Mobile — habilitar drag em touch via long-press**

O HTML5 drag-and-drop nativo funciona em mobile via `touch-action: none` nos cards quando "armados". Adicionar ao CSS em `public/css/controle-viagens.css`:

```css
.cv-card[data-lp="1"] {
  touch-action: none;
  outline: 2px solid var(--accent);
}
```

Adicionar no final do arquivo CSS.

- [ ] **Step 4: Verificação desktop**

Recarregar a app. No board:
- Arrastar um card de "Vazio" para "Indo carregar".
  - Esperado: card move otimisticamente, requisição PATCH dispara, board re-renderiza com o card já na nova coluna.
- Arrastar e largar fora de qualquer coluna → card volta pro lugar (nada acontece).
- Tentar arrastar pra mesma coluna onde já está → nada muda (early-return).

- [ ] **Step 5: Verificação mobile (DevTools touch emulation)**

Em DevTools, ativar "Toggle device toolbar" (Ctrl+Shift+M), escolher iPhone SE (375x667).
- Tocar e segurar (~350ms) num card → outline accent aparece (`data-lp=1`).
- Arrastar para outra coluna.
  - Em DevTools, drag-touch nem sempre dispara o `drop` HTML5 nativo. Aceitar como limitação conhecida; testar no celular real depois.
- Como alternativa garantida, tap simples ainda abre o modal → trocar status pelo dropdown → "Salvar" move o card.

- [ ] **Step 6: Commit**

```bash
git add public/js/controle-viagens.js public/css/controle-viagens.css
git commit -m "feat(controle-viagens): drag-and-drop com rollback otimista e long-press mobile"
```

---

## Task 15: Verificação ponta-a-ponta + ajustes finais

**Files:**
- (somente verificação manual + eventuais correções pontuais)

- [ ] **Step 1: Checklist de verificação completa**

Subir o servidor (`npm run dev`), logar com um usuário ADMIN e abrir `http://localhost:3000`.

Checklist:
- [ ] Hub mostra 5 cards.
- [ ] Card "Controle de Viagens" navega corretamente.
- [ ] Board carrega com todos os caminhões ativos.
- [ ] Search filtra cards em tempo real.
- [ ] Drag-and-drop funciona entre todas as 6 colunas.
- [ ] Modal abre ao clicar num card.
- [ ] Dropdown de status no modal mostra os 6 valores e os campos visíveis variam corretamente:
  - VAZIO → Local atual
  - INDO CARREGAR → 3 campos (coleta, agend., carga)
  - NA FÁBRICA → Fábrica
  - CARREGADO → 2 campos (agend., carga)
  - EM DESCARGA → Cliente
  - EM MANUTENÇÃO → Descrição da manutenção
- [ ] Bloco "Descrição" persiste entre status (testar: editar, salvar, trocar status, salvar — texto continua lá).
- [ ] Salvar do modal atualiza o board.
- [ ] Comentários: criar, listar com autor + horário, apagar (próprio) — funciona.
- [ ] Auto-refresh a cada 20s atualiza o board (abrir em 2 abas, mover na aba A, ver atualizar na aba B em até 20s).
- [ ] Aba fora de foco: indicador no header muda pra "paused" (visualmente: pode usar console pra forçar `document.hidden = true` ou minimizar a janela).
- [ ] Tema light/dark: alternar e conferir que todas as cores se adaptam.
- [ ] Mobile (DevTools 375px): scroll horizontal entre colunas com snap, modal vira abas.

- [ ] **Step 2: Testar GESTOR sem permissão**

No Admin → Usuários, editar um usuário GESTOR e desmarcar "📋 Controle de Viagens". Salvar. Sair, logar como esse GESTOR.

Esperado:
- Hub: card "Controle de Viagens" não aparece.
- Tabs nos outros módulos: tab "📋 Controle" não aparece.
- Tentar curl direto:
  ```bash
  curl -s http://localhost:3000/api/controle-viagens/board -H "Authorization: Bearer $TOKEN_GESTOR"
  ```
  Esperado: HTTP 403 `{"error":"Acesso negado ao módulo 'controle-viagens'."}`.

- [ ] **Step 3: Testar isolamento por empresa (multi-tenant)**

Se houver mais de uma empresa cadastrada, logar como usuário da empresa A, abrir o board. Esperado: só caminhões da empresa A aparecem. Tentar curl pra um truckId de outra empresa:
```bash
curl -s http://localhost:3000/api/controle-viagens/<UUID_DE_OUTRA_EMPRESA>/state -X PATCH -H "Authorization: Bearer $TOKEN_A" -H "Content-Type: application/json" -d '{"status":"INDO_CARREGAR"}'
```
Esperado: HTTP 404 "Caminhão não encontrado." (não vaza existência do caminhão da empresa B).

- [ ] **Step 4: Smoke do AuditLog**

No banco (Prisma Studio ou psql), conferir que houve registros em `audit_logs` com `entity_type = 'TRUCK'` e `action = 'UPDATE'` após cada mudança de status. Eles servem como histórico técnico das movimentações.

- [ ] **Step 5: Se algum dos checks falhou, ajustar e commit**

Para cada item não-OK, fazer correção pontual e commit dedicado:

```bash
git add <arquivos>
git commit -m "fix(controle-viagens): <descricao do problema corrigido>"
```

- [ ] **Step 6: Commit final (se nada ficou pendente)**

Se a etapa 5 não rendeu commits, registrar o marco da verificação:

```bash
git commit --allow-empty -m "chore(controle-viagens): verificacao ponta-a-ponta concluida"
```

---

## Notas finais

- **Sobre testes automatizados:** o projeto não usa framework de testes. Quando vocês decidirem adotar (vitest/jest), os 3 alvos prioritários para o módulo são: (a) `controleViagens.service.upsertState` (status válido + audit gerado), (b) `controleViagens.service.deleteComment` (rejeita não-autor não-admin), (c) `requirePermission` middleware (403 sem permissão, 200 com).

- **Sobre histórico de movimentações:** o AuditLog já registra cada PATCH state. Se no futuro quiserem expor isso na UI, é só uma listagem de `prisma.auditLog.findMany({ where: { entity_type: 'TRUCK', entity_id: truckId } })` — não está no escopo deste plano.

- **Sobre permissões dos usuários existentes:** a migration faz `array_append` para incluir `'controle-viagens'` em todos os usuários atuais. Se algum usuário foi criado entre a migration e o deploy do código, o `sanitizePermissoes` já considera a string válida.
