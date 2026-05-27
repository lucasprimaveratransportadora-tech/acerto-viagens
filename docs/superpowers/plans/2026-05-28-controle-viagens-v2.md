# Controle de Viagens v2 — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Refatora o módulo Controle de Viagens introduzindo Viagens como entidade própria (PLANEJADA/EM_CURSO/FINALIZADA/CANCELADA), Activity Log auditável e visível na UI, e modal Trello-like com toggle "Mostrar/Ocultar detalhes".

**Architecture:** 3 tabelas novas (`truck_columns` 1-1, `truck_viagens` N-1, `truck_activity_events` N-1) substituem as 2 da v1 (que nunca chegou em produção). Backend reescrito sob o mesmo prefixo de rota `/api/controle-viagens`. Frontend reescrito com painel lateral de viagens + activity log inline. Mantém permissão `controle-viagens` da v1.

**Tech Stack:** Node 20, Express 4, Prisma 5.22, PostgreSQL, vanilla JS modular no frontend, CSS variables, IBM Plex Sans/Mono, Bebas Neue, accent #E30613.

**Spec:** `docs/superpowers/specs/2026-05-28-controle-viagens-v2-design.md`

**Branch base:** `feat/controle-viagens-kanban` (a v1 está aqui; v2 substitui).

**Working tree caveat:** existem arquivos não relacionados ao módulo no working tree (PDFs, `preview-server.js`, `PR-BODY-controle-viagens.md`). Cada task deve commitar APENAS os paths listados via `git commit -- <pathspecs>`.

---

## File Structure

### Backend
```
prisma/schema.prisma                              -- enums + 3 models novos, remove os 2 da v1
prisma/migrations/20260527120000_controle_viagens/migration.sql  -- DELETAR (substituída)
prisma/migrations/20260528120000_controle_viagens_v2/migration.sql  -- NOVA

src/services/controleViagens.service.js           -- service principal (column + truck-level)
src/services/controleViagensViagens.service.js    -- service de viagens (CRUD + transições)
src/services/controleViagensActivity.service.js   -- registro + listagem do activity log
src/controllers/controleViagens.controller.js     -- handlers HTTP (todos os endpoints)
src/routes/controleViagens.routes.js              -- montagem das 13 rotas
src/validators/controleViagens.validator.js       -- validators express-validator pra todos os endpoints
```

### Frontend
```
public/js/controle-viagens.js          -- board, sort por coluna, polling, busca global, drag-and-drop
public/js/controle-viagens.modal.js    -- modal principal: status fields + descrição + toggle ocultar
public/js/controle-viagens.viagens.js  -- painel direito: lista viagens, criar/editar/start/finalize
public/js/controle-viagens.activity.js -- activity log: render eventos + criar/apagar comentários
public/css/controle-viagens.css        -- estilos atualizados pros novos blocos

public/index.html                      -- ajustes no #controleViagensView (sem mexer hub-card)
```

Cada arquivo tem uma responsabilidade clara. `controle-viagens.js` orquestra (loads + delega). Modal, viagens e activity são módulos próprios importados sob demanda.

---

## Task 1: Schema Prisma + Migration

**Files:**
- Modify: `prisma/schema.prisma`
- Delete: `prisma/migrations/20260527120000_controle_viagens/` (toda a pasta)
- Create: `prisma/migrations/20260528120000_controle_viagens_v2/migration.sql`

- [ ] **Step 1: Remover models e enum da v1 do schema.prisma**

Em `prisma/schema.prisma`, REMOVER:
- O enum `TruckOperationalStatus` (perto da linha 139, com 6 valores)
- O model `TruckOperationalState` (linhas ~534-550)
- O model `TruckOperationalComment` (linhas ~552-567)
- As relações inversas em `model Truck`:
  - `operational_state TruckOperationalState?`
  - `operational_comments TruckOperationalComment[]`
- As relações inversas em `model User`:
  - `operational_state_updates TruckOperationalState[] @relation("OperationalStateUpdatedBy")`
  - `operational_comments_authored TruckOperationalComment[] @relation("OperationalCommentAuthor")`

- [ ] **Step 2: Adicionar enums novos**

Adicionar no schema (perto da posição onde os enums vivem, antes do model Empresa):

```prisma
enum TruckKanbanColumn {
  VAZIO_AGUARDANDO_CARGA
  INDO_CARREGAR
  NA_FABRICA
  CARREGADO_EM_VIAGEM
  EM_DESCARGA_NO_CLIENTE
  EM_MANUTENCAO
}

enum TruckViagemStatus {
  PLANEJADA
  EM_CURSO
  FINALIZADA
  CANCELADA
}

enum TruckActivityType {
  COLUMN_MOVED
  VIAGEM_CREATED
  VIAGEM_FIELD_EDITED
  VIAGEM_STARTED
  VIAGEM_FINALIZED
  VIAGEM_CANCELLED
  VIAGEM_DELETED
  COMMENT
  COLUMN_FIELD_EDITED
}
```

- [ ] **Step 3: Adicionar os 3 models novos**

No final do schema (depois de `model LoginEvent`):

```prisma
model TruckColumn {
  id                       String             @id @default(uuid())
  truck_id                 String             @unique
  truck                    Truck              @relation(fields: [truck_id], references: [id], onDelete: Cascade)
  coluna                   TruckKanbanColumn  @default(VAZIO_AGUARDANDO_CARGA)
  manutencao_descricao     String?
  descricao_geral          String?
  updated_at               DateTime           @updatedAt
  updated_by_id            String?
  updated_by               User?              @relation("TruckColumnUpdatedBy", fields: [updated_by_id], references: [id], onDelete: SetNull)

  @@index([coluna])
  @@map("truck_columns")
}

model TruckViagem {
  id                          String              @id @default(uuid())
  truck_id                    String
  truck                       Truck               @relation(fields: [truck_id], references: [id], onDelete: Cascade)

  status_viagem               TruckViagemStatus   @default(PLANEJADA)
  origem                      String?
  destino                     String?
  carga_descricao             String?
  fabrica                     String?
  cliente_descarga            String?
  valor_frete                 Decimal?            @db.Decimal(12, 2)
  data_coleta                 DateTime?           @db.Date
  data_carregamento           DateTime?           @db.Date
  data_agendamento_entrega    DateTime?           @db.Date
  data_entrega_realizada      DateTime?           @db.Date

  observacoes                 String?

  finalized_at                DateTime?
  cancelled_at                DateTime?
  cancel_motivo               String?

  created_at                  DateTime            @default(now())
  updated_at                  DateTime            @updatedAt
  deleted_at                  DateTime?
  created_by_id               String?
  created_by                  User?               @relation("TruckViagemCreatedBy", fields: [created_by_id], references: [id], onDelete: SetNull)

  activity_events             TruckActivityEvent[]

  @@index([truck_id, status_viagem])
  @@index([truck_id, created_at(sort: Desc)])
  @@index([data_coleta])
  @@index([data_agendamento_entrega])
  @@map("truck_viagens")
}

model TruckActivityEvent {
  id            String              @id @default(uuid())
  truck_id      String
  truck         Truck               @relation(fields: [truck_id], references: [id], onDelete: Cascade)
  viagem_id     String?
  viagem        TruckViagem?        @relation(fields: [viagem_id], references: [id], onDelete: SetNull)

  tipo          TruckActivityType
  payload       Json

  author_id     String?
  author        User?               @relation("TruckActivityAuthor", fields: [author_id], references: [id], onDelete: SetNull)
  author_email  String
  author_nome   String

  created_at    DateTime            @default(now())
  deleted_at    DateTime?
  deleted_by_id String?

  @@index([truck_id, created_at(sort: Desc)])
  @@index([viagem_id, created_at(sort: Desc)])
  @@index([tipo])
  @@map("truck_activity_events")
}
```

- [ ] **Step 4: Adicionar relações inversas em Truck e User**

Em `model Truck`, depois da linha `truck_ledger TruckLedgerEntry[]`:

```prisma
  column              TruckColumn?
  viagens             TruckViagem[]
  activity_events     TruckActivityEvent[]
```

Em `model User`, depois da linha `fretes_pagos FreteTerceiro[] @relation("FreteTerceiroPaid")`:

```prisma
  truck_column_updates    TruckColumn[]         @relation("TruckColumnUpdatedBy")
  truck_viagens_created   TruckViagem[]         @relation("TruckViagemCreatedBy")
  truck_activity_authored TruckActivityEvent[]  @relation("TruckActivityAuthor")
```

- [ ] **Step 5: Deletar pasta de migration v1**

Rodar:
```
rm -r prisma/migrations/20260527120000_controle_viagens
```

(ou PowerShell: `Remove-Item -Recurse -Force prisma\migrations\20260527120000_controle_viagens`)

- [ ] **Step 6: Criar migration SQL v2**

Criar `prisma/migrations/20260528120000_controle_viagens_v2/migration.sql`:

```sql
-- Controle de Viagens v2: viagens como entidade + activity log unificado.
-- Substitui o schema da v1 que nunca chegou em produção.

-- CreateEnum
CREATE TYPE "TruckKanbanColumn" AS ENUM (
  'VAZIO_AGUARDANDO_CARGA',
  'INDO_CARREGAR',
  'NA_FABRICA',
  'CARREGADO_EM_VIAGEM',
  'EM_DESCARGA_NO_CLIENTE',
  'EM_MANUTENCAO'
);

CREATE TYPE "TruckViagemStatus" AS ENUM (
  'PLANEJADA',
  'EM_CURSO',
  'FINALIZADA',
  'CANCELADA'
);

CREATE TYPE "TruckActivityType" AS ENUM (
  'COLUMN_MOVED',
  'VIAGEM_CREATED',
  'VIAGEM_FIELD_EDITED',
  'VIAGEM_STARTED',
  'VIAGEM_FINALIZED',
  'VIAGEM_CANCELLED',
  'VIAGEM_DELETED',
  'COMMENT',
  'COLUMN_FIELD_EDITED'
);

-- CreateTable
CREATE TABLE "truck_columns" (
  "id"                       TEXT NOT NULL,
  "truck_id"                 TEXT NOT NULL,
  "coluna"                   "TruckKanbanColumn" NOT NULL DEFAULT 'VAZIO_AGUARDANDO_CARGA',
  "manutencao_descricao"     TEXT,
  "descricao_geral"          TEXT,
  "updated_at"               TIMESTAMP(3) NOT NULL,
  "updated_by_id"            TEXT,

  CONSTRAINT "truck_columns_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "truck_viagens" (
  "id"                          TEXT NOT NULL,
  "truck_id"                    TEXT NOT NULL,
  "status_viagem"               "TruckViagemStatus" NOT NULL DEFAULT 'PLANEJADA',
  "origem"                      TEXT,
  "destino"                     TEXT,
  "carga_descricao"             TEXT,
  "fabrica"                     TEXT,
  "cliente_descarga"            TEXT,
  "valor_frete"                 DECIMAL(12,2),
  "data_coleta"                 DATE,
  "data_carregamento"           DATE,
  "data_agendamento_entrega"    DATE,
  "data_entrega_realizada"      DATE,
  "observacoes"                 TEXT,
  "finalized_at"                TIMESTAMP(3),
  "cancelled_at"                TIMESTAMP(3),
  "cancel_motivo"               TEXT,
  "created_at"                  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at"                  TIMESTAMP(3) NOT NULL,
  "deleted_at"                  TIMESTAMP(3),
  "created_by_id"               TEXT,

  CONSTRAINT "truck_viagens_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "truck_activity_events" (
  "id"             TEXT NOT NULL,
  "truck_id"       TEXT NOT NULL,
  "viagem_id"      TEXT,
  "tipo"           "TruckActivityType" NOT NULL,
  "payload"        JSONB NOT NULL,
  "author_id"      TEXT,
  "author_email"   TEXT NOT NULL,
  "author_nome"    TEXT NOT NULL,
  "created_at"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "deleted_at"     TIMESTAMP(3),
  "deleted_by_id"  TEXT,

  CONSTRAINT "truck_activity_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "truck_columns_truck_id_key" ON "truck_columns"("truck_id");
CREATE INDEX "truck_columns_coluna_idx" ON "truck_columns"("coluna");

CREATE INDEX "truck_viagens_truck_id_status_viagem_idx" ON "truck_viagens"("truck_id", "status_viagem");
CREATE INDEX "truck_viagens_truck_id_created_at_idx" ON "truck_viagens"("truck_id", "created_at" DESC);
CREATE INDEX "truck_viagens_data_coleta_idx" ON "truck_viagens"("data_coleta");
CREATE INDEX "truck_viagens_data_agendamento_entrega_idx" ON "truck_viagens"("data_agendamento_entrega");

CREATE INDEX "truck_activity_events_truck_id_created_at_idx" ON "truck_activity_events"("truck_id", "created_at" DESC);
CREATE INDEX "truck_activity_events_viagem_id_created_at_idx" ON "truck_activity_events"("viagem_id", "created_at" DESC);
CREATE INDEX "truck_activity_events_tipo_idx" ON "truck_activity_events"("tipo");

-- AddForeignKey
ALTER TABLE "truck_columns" ADD CONSTRAINT "truck_columns_truck_id_fkey"
  FOREIGN KEY ("truck_id") REFERENCES "trucks"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "truck_columns" ADD CONSTRAINT "truck_columns_updated_by_id_fkey"
  FOREIGN KEY ("updated_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "truck_viagens" ADD CONSTRAINT "truck_viagens_truck_id_fkey"
  FOREIGN KEY ("truck_id") REFERENCES "trucks"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "truck_viagens" ADD CONSTRAINT "truck_viagens_created_by_id_fkey"
  FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "truck_activity_events" ADD CONSTRAINT "truck_activity_events_truck_id_fkey"
  FOREIGN KEY ("truck_id") REFERENCES "trucks"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "truck_activity_events" ADD CONSTRAINT "truck_activity_events_viagem_id_fkey"
  FOREIGN KEY ("viagem_id") REFERENCES "truck_viagens"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "truck_activity_events" ADD CONSTRAINT "truck_activity_events_author_id_fkey"
  FOREIGN KEY ("author_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
```

- [ ] **Step 7: Static verification do schema**

Rodar:
```
npx prisma format
npx prisma generate
node -e "const p = require('./src/config/database'); console.log(Object.keys(p).filter(k => k.startsWith('truck')))"
```

Esperado output (inclui pelo menos): `truckColumn`, `truckViagem`, `truckActivityEvent`, `truck` (já existente).

NÃO deve ter: `truckOperationalState`, `truckOperationalComment`.

DB está unreachable do dev (Railway). `prisma migrate dev` vai falhar com P1001 — esperado. A migration aplica no Railway no deploy.

- [ ] **Step 8: Commit**

```
git add prisma/schema.prisma prisma/migrations/20260528120000_controle_viagens_v2/migration.sql
git rm -r prisma/migrations/20260527120000_controle_viagens
git commit -m "feat(controle-viagens-v2): schema com 3 tabelas (column, viagens, activity)" -- prisma/schema.prisma prisma/migrations/20260528120000_controle_viagens_v2 prisma/migrations/20260527120000_controle_viagens
```

Verificar `git show --stat HEAD` — deve mostrar arquivos da migration v1 deletados + arquivos do schema/migration v2 criados/modificados.

---

## Task 2: Activity Log Service (helper de registro de eventos)

**Files:**
- Create: `src/services/controleViagensActivity.service.js`

- [ ] **Step 1: Criar o arquivo**

`src/services/controleViagensActivity.service.js`:

```js
const prisma = require('../config/database');

const COMMENT_TYPE = 'COMMENT';

// Registra um evento no activity log. NÃO falha a operação principal se o
// registro do log falhar — apenas loga no console. Esse helper é usado pelos
// outros services dentro de transações; se chamado fora de transação, vira
// uma escrita atômica isolada.
async function record({ tx, truckId, viagemId = null, tipo, payload, author }) {
  const client = tx || prisma;
  try {
    return await client.truckActivityEvent.create({
      data: {
        truck_id:     truckId,
        viagem_id:    viagemId,
        tipo,
        payload:      payload || {},
        author_id:    author?.id || null,
        author_email: author?.email || 'system',
        author_nome:  author?.nome  || 'system',
      },
    });
  } catch (err) {
    console.error('[activity] falha ao gravar:', { tipo, truckId, viagemId, error: err?.message });
    return null;
  }
}

// Lista com paginação por cursor (created_at). Mistura comentários e eventos
// automáticos. Filtra deletados.
async function list({ truckId, empresaId, viagemId, limit = 50, before }) {
  // Garante que o truck pertence à empresa (gating multi-tenant)
  const truck = await prisma.truck.findFirst({
    where: { id: truckId, empresa_id: empresaId, deleted_at: null },
    select: { id: true },
  });
  if (!truck) return [];

  const where = { truck_id: truckId, deleted_at: null };
  if (viagemId) where.viagem_id = viagemId;
  if (before) {
    const d = new Date(before);
    if (!isNaN(d.getTime())) where.created_at = { lt: d };
  }

  return prisma.truckActivityEvent.findMany({
    where,
    orderBy: { created_at: 'desc' },
    take: Math.min(Math.max(parseInt(limit, 10) || 50, 1), 200),
  });
}

// Soft-delete só de eventos COMMENT. Autor ou ADMIN.
async function deleteComment({ eventId, empresaId, req }) {
  const ApiError = require('../utils/ApiError');
  const event = await prisma.truckActivityEvent.findFirst({
    where: { id: eventId, deleted_at: null },
    include: {
      truck: { select: { empresa_id: true } },
    },
  });
  if (!event) throw ApiError.notFound('Evento não encontrado.');
  if (event.truck.empresa_id !== empresaId) throw ApiError.notFound('Evento não encontrado.');
  if (event.tipo !== COMMENT_TYPE) {
    throw ApiError.badRequest('Apenas comentários podem ser apagados.');
  }

  const isAuthor = event.author_id && event.author_id === req.user.id;
  const isAdmin  = req.user.role === 'ADMIN';
  if (!isAuthor && !isAdmin) {
    throw ApiError.forbidden('Só o autor ou um ADMIN pode apagar este comentário.');
  }

  return prisma.truckActivityEvent.update({
    where: { id: eventId },
    data: { deleted_at: new Date(), deleted_by_id: req.user.id },
  });
}

module.exports = { record, list, deleteComment, COMMENT_TYPE };
```

- [ ] **Step 2: Static verification**

```
node -e "const a = require('./src/services/controleViagensActivity.service'); console.log(Object.keys(a))"
```

Esperado: `[ 'record', 'list', 'deleteComment', 'COMMENT_TYPE' ]`.

- [ ] **Step 3: Commit**

```
git add src/services/controleViagensActivity.service.js
git commit -m "feat(controle-viagens-v2): service de activity log unificado" -- src/services/controleViagensActivity.service.js
```

---

## Task 3: Viagens Service (CRUD + transições de status)

**Files:**
- Create: `src/services/controleViagensViagens.service.js`

- [ ] **Step 1: Criar o arquivo**

`src/services/controleViagensViagens.service.js`:

```js
const prisma = require('../config/database');
const ApiError = require('../utils/ApiError');
const activity = require('./controleViagensActivity.service');
const audit = require('./audit.service');

const VALID_STATUS = ['PLANEJADA', 'EM_CURSO', 'FINALIZADA', 'CANCELADA'];

// Campos editáveis numa viagem via PATCH (whitelist).
const EDITABLE_FIELDS = [
  'origem', 'destino', 'carga_descricao', 'fabrica', 'cliente_descarga',
  'valor_frete',
  'data_coleta', 'data_carregamento', 'data_agendamento_entrega',
  'observacoes',
];

const DATE_FIELDS = ['data_coleta', 'data_carregamento', 'data_agendamento_entrega'];

function normalizeField(field, value) {
  if (value === undefined) return undefined;
  if (value === '' || value === null) return null;
  if (DATE_FIELDS.includes(field)) return new Date(value);
  if (field === 'valor_frete') {
    const n = Number(value);
    return isNaN(n) ? null : n;
  }
  return value;
}

async function assertTruckBelongsToEmpresa(truckId, empresaId) {
  const truck = await prisma.truck.findFirst({
    where: { id: truckId, empresa_id: empresaId, deleted_at: null },
    select: { id: true },
  });
  if (!truck) throw ApiError.notFound('Caminhão não encontrado.');
}

async function getById(viagemId, empresaId) {
  const viagem = await prisma.truckViagem.findFirst({
    where: { id: viagemId, deleted_at: null },
    include: {
      truck: { select: { id: true, empresa_id: true, placa: true } },
      created_by: { select: { id: true, nome: true, email: true } },
    },
  });
  if (!viagem) throw ApiError.notFound('Viagem não encontrada.');
  if (viagem.truck.empresa_id !== empresaId) throw ApiError.notFound('Viagem não encontrada.');
  return viagem;
}

async function listByTruck(truckId, empresaId, { status, limit = 100 } = {}) {
  await assertTruckBelongsToEmpresa(truckId, empresaId);
  const where = { truck_id: truckId, deleted_at: null };
  if (status) where.status_viagem = status;
  return prisma.truckViagem.findMany({
    where,
    orderBy: [
      { status_viagem: 'asc' },  // EM_CURSO/PLANEJADA antes de FINALIZADA/CANCELADA
      { created_at: 'desc' },
    ],
    take: Math.min(Math.max(parseInt(limit, 10) || 100, 1), 500),
  });
}

async function create(truckId, empresaId, req, body) {
  await assertTruckBelongsToEmpresa(truckId, empresaId);

  const data = { truck_id: truckId, created_by_id: req.user.id, status_viagem: 'PLANEJADA' };
  for (const field of EDITABLE_FIELDS) {
    if (body[field] !== undefined) {
      data[field] = normalizeField(field, body[field]);
    }
  }

  const created = await prisma.$transaction(async (tx) => {
    const v = await tx.truckViagem.create({ data });
    await activity.record({
      tx, truckId, viagemId: v.id, tipo: 'VIAGEM_CREATED',
      payload: { snapshot: v },
      author: req.user,
    });
    return v;
  });

  await audit.log({ req, empresaId, entity: 'TRUCK', action: 'CREATE', entityId: truckId, before: null, after: { viagem: created } });
  return created;
}

async function update(viagemId, empresaId, req, body) {
  const before = await getById(viagemId, empresaId);

  const patch = {};
  const edits = []; // [{ field, before, after }]
  for (const field of EDITABLE_FIELDS) {
    if (body[field] !== undefined) {
      const newVal = normalizeField(field, body[field]);
      const oldVal = before[field];
      // Comparação por toString (cobre Date, Decimal, null, string)
      const same = (oldVal === null && newVal === null) ||
                   (oldVal != null && newVal != null && String(oldVal) === String(newVal));
      if (!same) {
        patch[field] = newVal;
        edits.push({ field, before: oldVal, after: newVal });
      }
    }
  }

  if (edits.length === 0) return before;

  const after = await prisma.$transaction(async (tx) => {
    const updated = await tx.truckViagem.update({
      where: { id: viagemId },
      data: patch,
    });
    for (const edit of edits) {
      await activity.record({
        tx, truckId: before.truck_id, viagemId,
        tipo: 'VIAGEM_FIELD_EDITED',
        payload: edit,
        author: req.user,
      });
    }
    return updated;
  });

  await audit.log({ req, empresaId, entity: 'TRUCK', action: 'UPDATE', entityId: before.truck_id, before: { viagem: before }, after: { viagem: after } });
  return after;
}

async function start(viagemId, empresaId, req) {
  const v = await getById(viagemId, empresaId);
  if (v.status_viagem !== 'PLANEJADA') {
    throw ApiError.badRequest('Só viagens PLANEJADAS podem ser iniciadas.');
  }
  // Garante que não há outra EM_CURSO no truck
  const existing = await prisma.truckViagem.findFirst({
    where: { truck_id: v.truck_id, status_viagem: 'EM_CURSO', deleted_at: null },
  });
  if (existing) {
    throw ApiError.conflict('Este caminhão já tem uma viagem em curso.');
  }

  const updated = await prisma.$transaction(async (tx) => {
    const u = await tx.truckViagem.update({
      where: { id: viagemId },
      data: { status_viagem: 'EM_CURSO' },
    });
    await activity.record({
      tx, truckId: v.truck_id, viagemId,
      tipo: 'VIAGEM_STARTED',
      payload: {},
      author: req.user,
    });
    return u;
  });
  await audit.log({ req, empresaId, entity: 'TRUCK', action: 'UPDATE', entityId: v.truck_id, before: { viagem: v }, after: { viagem: updated } });
  return updated;
}

async function finalize(viagemId, empresaId, req, body) {
  const v = await getById(viagemId, empresaId);
  if (v.status_viagem === 'FINALIZADA' || v.status_viagem === 'CANCELADA') {
    throw ApiError.badRequest('Viagem já encerrada.');
  }

  const dataEntrega = body?.data_entrega_realizada
    ? new Date(body.data_entrega_realizada)
    : new Date();

  const updated = await prisma.$transaction(async (tx) => {
    const u = await tx.truckViagem.update({
      where: { id: viagemId },
      data: {
        status_viagem: 'FINALIZADA',
        finalized_at: new Date(),
        data_entrega_realizada: dataEntrega,
      },
    });
    await activity.record({
      tx, truckId: v.truck_id, viagemId,
      tipo: 'VIAGEM_FINALIZED',
      payload: { data_entrega_realizada: dataEntrega },
      author: req.user,
    });
    return u;
  });
  await audit.log({ req, empresaId, entity: 'TRUCK', action: 'UPDATE', entityId: v.truck_id, before: { viagem: v }, after: { viagem: updated } });
  return updated;
}

async function cancel(viagemId, empresaId, req, body) {
  const v = await getById(viagemId, empresaId);
  if (v.status_viagem === 'FINALIZADA' || v.status_viagem === 'CANCELADA') {
    throw ApiError.badRequest('Viagem já encerrada.');
  }
  const motivo = (body?.motivo || '').trim() || null;

  const updated = await prisma.$transaction(async (tx) => {
    const u = await tx.truckViagem.update({
      where: { id: viagemId },
      data: {
        status_viagem: 'CANCELADA',
        cancelled_at: new Date(),
        cancel_motivo: motivo,
      },
    });
    await activity.record({
      tx, truckId: v.truck_id, viagemId,
      tipo: 'VIAGEM_CANCELLED',
      payload: { motivo },
      author: req.user,
    });
    return u;
  });
  await audit.log({ req, empresaId, entity: 'TRUCK', action: 'UPDATE', entityId: v.truck_id, before: { viagem: v }, after: { viagem: updated } });
  return updated;
}

async function remove(viagemId, empresaId, req) {
  const v = await getById(viagemId, empresaId);
  if (v.status_viagem !== 'PLANEJADA') {
    throw ApiError.badRequest('Só viagens PLANEJADAS podem ser apagadas. Use cancelar.');
  }

  await prisma.$transaction(async (tx) => {
    await tx.truckViagem.update({
      where: { id: viagemId },
      data: { deleted_at: new Date() },
    });
    await activity.record({
      tx, truckId: v.truck_id, viagemId,
      tipo: 'VIAGEM_DELETED',
      payload: { snapshot: v },
      author: req.user,
    });
  });
  await audit.log({ req, empresaId, entity: 'TRUCK', action: 'DELETE', entityId: v.truck_id, before: { viagem: v }, after: null });
  return { ok: true };
}

module.exports = {
  listByTruck, getById, create, update,
  start, finalize, cancel, remove,
  VALID_STATUS, EDITABLE_FIELDS,
};
```

- [ ] **Step 2: Static verification**

```
node -e "const v = require('./src/services/controleViagensViagens.service'); console.log(Object.keys(v))"
```

Esperado: `[ 'listByTruck', 'getById', 'create', 'update', 'start', 'finalize', 'cancel', 'remove', 'VALID_STATUS', 'EDITABLE_FIELDS' ]`.

- [ ] **Step 3: Verificar ApiError.conflict existe**

```
node -e "const e = require('./src/utils/ApiError'); console.log(typeof e.conflict)"
```

Esperado: `function`. Se `undefined`, abrir `src/utils/ApiError.js` e adicionar:

```js
ApiError.conflict = (msg) => new ApiError(409, msg);
```

(seguir o padrão das outras factory methods no mesmo arquivo).

- [ ] **Step 4: Commit**

```
git add src/services/controleViagensViagens.service.js
git commit -m "feat(controle-viagens-v2): service de viagens com CRUD e transicoes de status" -- src/services/controleViagensViagens.service.js
```

(Se ApiError.conflict precisou ser adicionado, fazer commit separado pra ele primeiro: `git commit -m "fix(api-error): adiciona factory conflict 409" -- src/utils/ApiError.js`)

---

## Task 4: Controle de Viagens Service (board + column + comments)

**Files:**
- Create: `src/services/controleViagens.service.js` (substitui o conteúdo da v1)

- [ ] **Step 1: Substituir conteúdo do arquivo**

`src/services/controleViagens.service.js` (apagar tudo e colocar):

```js
const prisma = require('../config/database');
const ApiError = require('../utils/ApiError');
const activity = require('./controleViagensActivity.service');
const audit = require('./audit.service');

const VALID_COLUMNS = [
  'VAZIO_AGUARDANDO_CARGA',
  'INDO_CARREGAR',
  'NA_FABRICA',
  'CARREGADO_EM_VIAGEM',
  'EM_DESCARGA_NO_CLIENTE',
  'EM_MANUTENCAO',
];
const DEFAULT_COLUMN = 'VAZIO_AGUARDANDO_CARGA';

function virtualColumn(truckId) {
  return {
    id: null,
    truck_id: truckId,
    coluna: DEFAULT_COLUMN,
    manutencao_descricao: null,
    descricao_geral: null,
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
      column: {
        include: { updated_by: { select: { id: true, nome: true, email: true } } },
      },
      viagens: {
        where: { deleted_at: null, status_viagem: { in: ['EM_CURSO', 'PLANEJADA'] } },
        orderBy: { created_at: 'desc' },
      },
    },
    orderBy: [{ placa: 'asc' }],
  });

  // Agrega contadores por truck — 1 query group
  const activityCounts = await prisma.truckActivityEvent.groupBy({
    by: ['truck_id'],
    where: { truck_id: { in: trucks.map(t => t.id) }, deleted_at: null },
    _count: { _all: true },
    _max:   { created_at: true },
  });
  const byTruckActivity = Object.fromEntries(activityCounts.map(c => [c.truck_id, c]));

  let maxColumn = 0;
  let maxActivity = 0;

  const board = trucks.map(t => {
    const col = t.column || virtualColumn(t.id);
    const colTs = col.updated_at ? new Date(col.updated_at).getTime() : 0;
    const actTs = byTruckActivity[t.id]?._max?.created_at
      ? new Date(byTruckActivity[t.id]._max.created_at).getTime() : 0;
    if (colTs > maxColumn) maxColumn = colTs;
    if (actTs > maxActivity) maxActivity = actTs;

    const viagemEmCurso = t.viagens.find(v => v.status_viagem === 'EM_CURSO') || null;
    const planejadasCount = t.viagens.filter(v => v.status_viagem === 'PLANEJADA').length;

    return {
      truck: {
        id: t.id, placa: t.placa, modelo: t.modelo, motorista: t.motorista,
        carreta_placa: t.carreta_placa, carreta_modelo: t.carreta_modelo,
      },
      column: col,
      viagem_em_curso: viagemEmCurso,
      viagens_planejadas_count: planejadasCount,
      activity_count: byTruckActivity[t.id]?._count?._all || 0,
      last_activity_at: byTruckActivity[t.id]?._max?.created_at || null,
    };
  });

  return { board, fingerprint: `${board.length}-${maxColumn}-${maxActivity}` };
}

async function getTruckDetail(truckId, empresaId) {
  const truck = await prisma.truck.findFirst({
    where: { id: truckId, empresa_id: empresaId, deleted_at: null },
    select: {
      id: true, placa: true, modelo: true, motorista: true,
      carreta_placa: true, carreta_modelo: true,
      column: {
        include: { updated_by: { select: { id: true, nome: true, email: true } } },
      },
      viagens: {
        where: { deleted_at: null },
        orderBy: [{ status_viagem: 'asc' }, { created_at: 'desc' }],
      },
    },
  });
  if (!truck) throw ApiError.notFound('Caminhão não encontrado.');

  const events = await activity.list({ truckId, empresaId, limit: 50 });

  return {
    truck: {
      id: truck.id, placa: truck.placa, modelo: truck.modelo,
      motorista: truck.motorista,
      carreta_placa: truck.carreta_placa, carreta_modelo: truck.carreta_modelo,
    },
    column: truck.column || virtualColumn(truck.id),
    viagens: truck.viagens,
    activity: events,
  };
}

async function updateColumn(truckId, empresaId, req, body) {
  const truck = await prisma.truck.findFirst({
    where: { id: truckId, empresa_id: empresaId, deleted_at: null },
    select: { id: true },
  });
  if (!truck) throw ApiError.notFound('Caminhão não encontrado.');

  if (body.coluna && !VALID_COLUMNS.includes(body.coluna)) {
    throw ApiError.badRequest('Coluna inválida.');
  }

  const before = await prisma.truckColumn.findUnique({ where: { truck_id: truckId } });
  const oldColuna = before?.coluna || DEFAULT_COLUMN;
  const oldManut  = before?.manutencao_descricao || null;
  const oldDesc   = before?.descricao_geral || null;

  const data = { updated_by_id: req.user.id };
  if (body.coluna !== undefined) data.coluna = body.coluna;
  if (body.manutencao_descricao !== undefined) {
    data.manutencao_descricao = (body.manutencao_descricao || '').trim() || null;
  }
  if (body.descricao_geral !== undefined) {
    data.descricao_geral = (body.descricao_geral || '').trim() || null;
  }

  const after = await prisma.$transaction(async (tx) => {
    const u = await tx.truckColumn.upsert({
      where: { truck_id: truckId },
      create: { truck_id: truckId, coluna: body.coluna || DEFAULT_COLUMN, ...data },
      update: data,
      include: { updated_by: { select: { id: true, nome: true, email: true } } },
    });

    // Eventos: COLUMN_MOVED se mudou coluna; COLUMN_FIELD_EDITED pros outros campos.
    if (body.coluna && body.coluna !== oldColuna) {
      await activity.record({
        tx, truckId, tipo: 'COLUMN_MOVED',
        payload: { from: oldColuna, to: body.coluna },
        author: req.user,
      });
    }
    if (body.manutencao_descricao !== undefined && (data.manutencao_descricao !== oldManut)) {
      await activity.record({
        tx, truckId, tipo: 'COLUMN_FIELD_EDITED',
        payload: { field: 'manutencao_descricao', before: oldManut, after: data.manutencao_descricao },
        author: req.user,
      });
    }
    if (body.descricao_geral !== undefined && (data.descricao_geral !== oldDesc)) {
      await activity.record({
        tx, truckId, tipo: 'COLUMN_FIELD_EDITED',
        payload: { field: 'descricao_geral', before: oldDesc, after: data.descricao_geral },
        author: req.user,
      });
    }
    return u;
  });

  await audit.log({ req, empresaId, entity: 'TRUCK', action: 'UPDATE', entityId: truckId,
    before: before ? { column: before } : null,
    after:  { column: after } });
  return after;
}

async function addComment(truckId, empresaId, req, body) {
  const truck = await prisma.truck.findFirst({
    where: { id: truckId, empresa_id: empresaId, deleted_at: null },
    select: { id: true },
  });
  if (!truck) throw ApiError.notFound('Caminhão não encontrado.');

  const texto = (body?.texto || '').trim();
  if (!texto) throw ApiError.badRequest('Texto do comentário não pode ser vazio.');
  if (texto.length > 4000) throw ApiError.badRequest('Comentário muito longo (máx 4000).');

  // Se veio viagem_id, valida que pertence ao mesmo truck
  let viagemId = null;
  if (body?.viagem_id) {
    const v = await prisma.truckViagem.findFirst({
      where: { id: body.viagem_id, truck_id: truckId, deleted_at: null },
      select: { id: true },
    });
    if (!v) throw ApiError.notFound('Viagem do comentário não encontrada.');
    viagemId = v.id;
  }

  return activity.record({
    truckId, viagemId, tipo: 'COMMENT',
    payload: { texto },
    author: req.user,
  });
}

module.exports = {
  getBoard, getTruckDetail, updateColumn, addComment,
  VALID_COLUMNS, DEFAULT_COLUMN,
};
```

- [ ] **Step 2: Static verification**

```
node -e "const s = require('./src/services/controleViagens.service'); console.log(Object.keys(s))"
```

Esperado: `[ 'getBoard', 'getTruckDetail', 'updateColumn', 'addComment', 'VALID_COLUMNS', 'DEFAULT_COLUMN' ]`.

- [ ] **Step 3: Commit**

```
git commit -m "feat(controle-viagens-v2): service principal com board, column e comments" -- src/services/controleViagens.service.js
```

---

## Task 5: Validators + Controller + Routes

**Files:**
- Modify: `src/validators/controleViagens.validator.js` (reescreve)
- Modify: `src/controllers/controleViagens.controller.js` (reescreve)
- Modify: `src/routes/controleViagens.routes.js` (reescreve)

- [ ] **Step 1: Reescrever validator**

`src/validators/controleViagens.validator.js` (substitui conteúdo):

```js
const { body } = require('express-validator');

const VALID_COLUMNS = [
  'VAZIO_AGUARDANDO_CARGA',
  'INDO_CARREGAR',
  'NA_FABRICA',
  'CARREGADO_EM_VIAGEM',
  'EM_DESCARGA_NO_CLIENTE',
  'EM_MANUTENCAO',
];

const updateColumn = [
  body('coluna').optional({ checkFalsy: false }).custom((v) => {
    if (v === '' || v === null) throw new Error('Coluna não pode ser vazia.');
    if (!VALID_COLUMNS.includes(v)) throw new Error('Coluna inválida.');
    return true;
  }),
  body('manutencao_descricao').optional({ nullable: true }).isLength({ max: 500 }),
  body('descricao_geral').optional({ nullable: true }).isLength({ max: 4000 }),
];

const createViagem = [
  body('origem').optional({ nullable: true }).isLength({ max: 200 }),
  body('destino').optional({ nullable: true }).isLength({ max: 200 }),
  body('carga_descricao').optional({ nullable: true }).isLength({ max: 500 }),
  body('fabrica').optional({ nullable: true }).isLength({ max: 200 }),
  body('cliente_descarga').optional({ nullable: true }).isLength({ max: 200 }),
  body('valor_frete').optional({ nullable: true, checkFalsy: true }).isFloat({ min: 0 }).withMessage('Valor frete deve ser número.'),
  body('data_coleta').optional({ nullable: true, checkFalsy: true }).isISO8601().withMessage('Data coleta inválida.'),
  body('data_carregamento').optional({ nullable: true, checkFalsy: true }).isISO8601().withMessage('Data carregamento inválida.'),
  body('data_agendamento_entrega').optional({ nullable: true, checkFalsy: true }).isISO8601().withMessage('Data agendamento inválida.'),
  body('observacoes').optional({ nullable: true }).isLength({ max: 4000 }),
];

const updateViagem = createViagem; // mesma whitelist

const finalizeViagem = [
  body('data_entrega_realizada').optional({ nullable: true, checkFalsy: true }).isISO8601().withMessage('Data entrega inválida.'),
];

const cancelViagem = [
  body('motivo').optional({ nullable: true }).isLength({ max: 500 }),
];

const addComment = [
  body('texto').notEmpty().withMessage('Texto obrigatório.').isLength({ max: 4000 }).withMessage('Máx 4000 caracteres.'),
  body('viagem_id').optional({ nullable: true }).isUUID().withMessage('viagem_id deve ser UUID.'),
];

module.exports = {
  updateColumn, createViagem, updateViagem,
  finalizeViagem, cancelViagem, addComment,
  VALID_COLUMNS,
};
```

- [ ] **Step 2: Reescrever controller**

`src/controllers/controleViagens.controller.js` (substitui conteúdo):

```js
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
```

- [ ] **Step 3: Reescrever routes**

`src/routes/controleViagens.routes.js` (substitui conteúdo):

```js
const { Router } = require('express');
const controller = require('../controllers/controleViagens.controller');
const {
  updateColumn, createViagem, updateViagem,
  finalizeViagem, cancelViagem, addComment,
} = require('../validators/controleViagens.validator');
const validate = require('../middleware/validate');
const { uuidParams } = require('../middleware/paramValidators');
const auth = require('../middleware/auth');
const tenant = require('../middleware/tenant');
const requirePermission = require('../middleware/permission');

const router = Router();
const requireModule = requirePermission('controle-viagens');

// Board + truck-level
router.get   ('/board',                                  auth, tenant, requireModule, controller.getBoard);
router.get   ('/truck/:truckId',                         auth, tenant, requireModule, uuidParams('truckId'), controller.getTruckDetail);
router.patch ('/truck/:truckId/column',                  auth, tenant, requireModule, uuidParams('truckId'), updateColumn, validate, controller.updateColumn);

// Viagens
router.get   ('/truck/:truckId/viagens',                 auth, tenant, requireModule, uuidParams('truckId'), controller.listViagens);
router.post  ('/truck/:truckId/viagens',                 auth, tenant, requireModule, uuidParams('truckId'), createViagem, validate, controller.createViagem);
router.patch ('/viagens/:viagemId',                      auth, tenant, requireModule, uuidParams('viagemId'), updateViagem, validate, controller.updateViagem);
router.post  ('/viagens/:viagemId/start',                auth, tenant, requireModule, uuidParams('viagemId'), controller.startViagem);
router.post  ('/viagens/:viagemId/finalize',             auth, tenant, requireModule, uuidParams('viagemId'), finalizeViagem, validate, controller.finalizeViagem);
router.post  ('/viagens/:viagemId/cancel',               auth, tenant, requireModule, uuidParams('viagemId'), cancelViagem, validate, controller.cancelViagem);
router.delete('/viagens/:viagemId',                      auth, tenant, requireModule, uuidParams('viagemId'), controller.removeViagem);

// Activity log + comments
router.get   ('/truck/:truckId/activity',                auth, tenant, requireModule, uuidParams('truckId'), controller.listActivity);
router.post  ('/truck/:truckId/comments',                auth, tenant, requireModule, uuidParams('truckId'), addComment, validate, controller.addComment);
router.delete('/activity/:eventId',                      auth, tenant, requireModule, uuidParams('eventId'), controller.deleteComment);

module.exports = router;
```

- [ ] **Step 4: Static verification**

```
node -e "const r = require('./src/routes/controleViagens.routes'); console.log('routes ok')"
node -e "const c = require('./src/controllers/controleViagens.controller'); console.log(Object.keys(c).length)"
node -e "const v = require('./src/validators/controleViagens.validator'); console.log(Object.keys(v))"
```

Esperado:
- `routes ok`
- `13` (13 handlers no controller)
- `[ 'updateColumn', 'createViagem', 'updateViagem', 'finalizeViagem', 'cancelViagem', 'addComment', 'VALID_COLUMNS' ]`

- [ ] **Step 5: Commit**

```
git commit -m "feat(controle-viagens-v2): rotas REST com 13 endpoints + validators" -- src/validators/controleViagens.validator.js src/controllers/controleViagens.controller.js src/routes/controleViagens.routes.js
```

---

## Task 6: HTML — atualizar #controleViagensView com painel de viagens + toggle

**Files:**
- Modify: `public/index.html`

- [ ] **Step 1: Localizar o `<div id="controleViagensView">` no index.html**

Use Grep para confirmar a posição:
```
grep -n 'id="controleViagensView"' public/index.html
```

- [ ] **Step 2: Substituir o conteúdo do div #controleViagensView**

Apagar TUDO entre `<div id="controleViagensView" style="display:none">` e o fechamento da div correspondente. Substituir por:

```html
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
          <input type="text" id="cvSearch" placeholder="placa, motorista, modelo, carga, fábrica, cliente…">
        </div>
        <div class="cv-total" id="cvTotal">—</div>
      </div>
      <div class="cv-board" id="cvBoard">
        <div class="cv-loading">Carregando…</div>
      </div>
    </div>

    <!-- Modal de detalhe -->
    <div class="cv-modal" id="cvDetailModal">
      <div class="cv-modal-content cv-show-details">
        <header class="cv-modal-hdr">
          <select id="cvDetStatus" class="cv-status-select"></select>
          <div class="cv-modal-actions">
            <button class="btn btn-ghost btn-sm" id="cvToggleDetails" onclick="cv.toggleDetails()" title="Mostrar/Ocultar detalhes">Ocultar detalhes</button>
            <button class="cv-modal-close" onclick="cv.closeDetail()" aria-label="Fechar">✕</button>
          </div>
        </header>
        <div class="cv-modal-tabs" id="cvModalTabs" style="display:none">
          <button class="cv-tab active" data-cv-tab="detail"   onclick="cv.switchModalTab('detail')">Detalhes</button>
          <button class="cv-tab"        data-cv-tab="activity" onclick="cv.switchModalTab('activity')">Atividade</button>
          <button class="cv-tab"        data-cv-tab="viagens"  onclick="cv.switchModalTab('viagens')">Viagens</button>
        </div>

        <div class="cv-modal-body">

          <!-- COLUNA ESQUERDA: detalhes da coluna + descrição + atividade -->
          <section class="cv-left-pane">
            <header class="cv-left-hdr">
              <h2 id="cvDetTitle" class="cv-modal-title"></h2>
              <div class="cv-modal-subtitle" id="cvDetSubtitle"></div>
            </header>

            <div class="cv-details-block" id="cvDetailsBlock">
              <div class="cv-section">
                <div class="cv-section-hdr"><span>Status atual</span></div>
                <div class="cv-fields" id="cvDetFields"></div>
                <div class="cv-section-foot">
                  <span id="cvDetUpdated" class="cv-muted"></span>
                  <button class="btn btn-accent btn-sm" id="cvDetSaveBtn" onclick="cv.saveDetailFields()">Salvar</button>
                </div>
              </div>

              <div class="cv-section">
                <div class="cv-section-hdr"><span>Descrição</span></div>
                <textarea id="cvDetDescricao" rows="3" placeholder="observação geral do caminhão (persiste entre colunas/viagens)"></textarea>
                <div class="cv-section-foot">
                  <button class="btn btn-ghost btn-sm" onclick="cv.saveDescricao()">Salvar descrição</button>
                </div>
              </div>
            </div>

            <div class="cv-activity-block">
              <div class="cv-section-hdr"><span>💬 Atividade & comentários</span></div>
              <form class="cv-comment-form" onsubmit="event.preventDefault(); cv.submitComment()">
                <textarea id="cvCommentInput" rows="2" placeholder="Escrever um comentário..."></textarea>
                <div style="display:flex;justify-content:flex-end">
                  <button type="submit" class="btn btn-accent btn-sm">Enviar</button>
                </div>
              </form>
              <div class="cv-activity-list" id="cvActivityList"></div>
            </div>
          </section>

          <!-- COLUNA DIREITA: viagens -->
          <aside class="cv-viagens-pane">
            <div class="cv-section-hdr cv-viagens-hdr">
              <span>📋 Viagens</span>
              <button class="btn btn-accent btn-sm" onclick="cv.openNewViagem()">+ Nova carga</button>
            </div>
            <div class="cv-viagens-list" id="cvViagensList"></div>
          </aside>

        </div>
      </div>
    </div>

    <!-- Modal de nova viagem / edição -->
    <div class="cv-modal cv-modal-small" id="cvViagemFormModal">
      <div class="cv-modal-content">
        <header class="cv-modal-hdr">
          <h2 class="cv-modal-title" id="cvVgTitle">Nova carga</h2>
          <button class="cv-modal-close" onclick="cv.closeViagemForm()" aria-label="Fechar">✕</button>
        </header>
        <div class="cv-modal-body cv-form-body">
          <div class="form-group">
            <label>Origem</label>
            <input type="text" id="cvVgOrigem" maxlength="200">
          </div>
          <div class="form-group">
            <label>Destino</label>
            <input type="text" id="cvVgDestino" maxlength="200">
          </div>
          <div class="form-group">
            <label>Carga</label>
            <input type="text" id="cvVgCarga" maxlength="500">
          </div>
          <div class="form-group">
            <label>Fábrica</label>
            <input type="text" id="cvVgFabrica" maxlength="200">
          </div>
          <div class="form-group">
            <label>Cliente (descarga)</label>
            <input type="text" id="cvVgCliente" maxlength="200">
          </div>
          <div class="form-group">
            <label>Valor do frete (R$)</label>
            <input type="number" id="cvVgValor" step="0.01" min="0">
          </div>
          <div class="form-group">
            <label>Data de coleta</label>
            <input type="date" id="cvVgColeta">
          </div>
          <div class="form-group">
            <label>Data agendamento entrega</label>
            <input type="date" id="cvVgAgend">
          </div>
          <div class="form-group">
            <label>Observações</label>
            <textarea id="cvVgObs" rows="2" maxlength="4000"></textarea>
          </div>
        </div>
        <div class="cv-modal-foot" style="padding:.8rem 1.2rem;border-top:1px solid var(--border);display:flex;justify-content:flex-end;gap:.5rem">
          <button class="btn btn-ghost btn-sm" onclick="cv.closeViagemForm()">Cancelar</button>
          <button class="btn btn-accent" id="cvVgSaveBtn" onclick="cv.saveViagemForm()">Salvar</button>
        </div>
      </div>
    </div>

  </div>
```

- [ ] **Step 3: Verificar contagem de elementos**

```
grep -c 'id="cvBoard"' public/index.html
grep -c 'id="cvDetailModal"' public/index.html
grep -c 'id="cvViagemFormModal"' public/index.html
grep -c 'id="cvViagensList"' public/index.html
grep -c 'id="cvActivityList"' public/index.html
```

Esperado: cada um retorna `1`.

- [ ] **Step 4: Commit**

```
git commit -m "feat(controle-viagens-v2): HTML do modal com painel de viagens e toggle detalhes" -- public/index.html
```

---

## Task 7: CSS — atualizar estilos pros novos blocos

**Files:**
- Modify: `public/css/controle-viagens.css` (substitui conteúdo)

- [ ] **Step 1: Substituir conteúdo do arquivo**

`public/css/controle-viagens.css` (apagar tudo, colocar):

```css
/* ==========================================================================
   CONTROLE DE VIAGENS V2 — Kanban + Viagens + Activity
   Usa as variáveis de variables.css.
   ========================================================================== */

:root {
  --cv-col-vazio:        #6b7280;
  --cv-col-indo:         #38bdf8;
  --cv-col-fabrica:      #f59e0b;
  --cv-col-carregado:    #0ea5e9;
  --cv-col-descarga:     #facc15;
  --cv-col-manutencao:   #ef4444;
}

/* ---------- HEADER + TOOLBAR + BOARD ---------- */
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

.cv-main { display:flex; flex-direction:column; height:calc(100vh - 60px); background:var(--bg); }

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
  gap:.5rem;
}
.cv-col-title {
  font-family:'Bebas Neue', sans-serif;
  font-size:1rem; letter-spacing:1.5px; color:var(--text);
}
.cv-col-count {
  font-family:'IBM Plex Mono', monospace; font-size:.7rem; color:var(--muted);
  background:var(--surface3); padding:.15rem .5rem; border-radius:10px;
}
.cv-col-sort {
  background:transparent; border:1px solid var(--border); border-radius:6px;
  color:var(--muted); font-size:.7rem;
  padding:.15rem .3rem; cursor:pointer;
}
.cv-col-sort:hover { color:var(--text); border-color:var(--accent); }
.cv-col-body {
  flex:1; min-height:0; overflow-y:auto;
  padding:.55rem; display:flex; flex-direction:column; gap:.55rem;
}
.cv-col.drag-over { background:rgba(227,6,19,.04); }
.cv-col.drag-over .cv-col-body { outline:2px dashed var(--accent); outline-offset:-4px; border-radius:6px; }

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
.cv-card.dragging { opacity:.55; transform:rotate(2deg); box-shadow:0 14px 30px rgba(0,0,0,.35); }
.cv-card .cv-plate {
  font-family:'Bebas Neue', sans-serif;
  font-size:1.15rem; letter-spacing:1.5px; color:var(--text);
}
.cv-card .cv-driver  { font-size:.78rem; color:var(--text); margin-top:.1rem; }
.cv-card .cv-model   { font-size:.7rem;  color:var(--muted); }
.cv-card .cv-divider { border-top:1px dashed var(--border); margin:.4rem 0; }
.cv-card .cv-fields-mini {
  font-size:.72rem; color:var(--muted);
  display:flex; flex-wrap:wrap; gap:.4rem;
}
.cv-card .cv-fields-mini b { color:var(--text); font-weight:500; }
.cv-card .cv-foot {
  display:flex; justify-content:space-between; align-items:center;
  margin-top:.45rem; font-size:.7rem; color:var(--muted);
  font-family:'IBM Plex Mono', monospace;
}
.cv-card .cv-pill {
  display:inline-flex; align-items:center; gap:.25rem;
  padding:.1rem .4rem; border-radius:10px; background:var(--surface3);
}
.cv-card .cv-pill.unread { background:var(--accent); color:#fff; }
.cv-card[data-lp="1"] { touch-action:none; outline:2px solid var(--accent); }
.cv-touch-ghost {
  transform: rotate(2deg) scale(1.03);
  box-shadow: 0 16px 32px rgba(0,0,0,.45);
  border-color: var(--accent) !important;
  transition: none !important;
}

/* ---------- MODAL ---------- */
.cv-modal {
  display:none; position:fixed; inset:0;
  background:rgba(0,0,0,.55); z-index:80;
  align-items:flex-start; justify-content:center;
  padding:2.5rem 1rem 1rem; overflow-y:auto;
}
.cv-modal.open { display:flex; }
.cv-modal-content {
  width:min(1000px, 100%);
  background:var(--surface);
  border:1px solid var(--border);
  border-top:3px solid var(--accent);
  border-radius:10px;
  overflow:hidden;
  display:flex; flex-direction:column;
}
.cv-modal-small .cv-modal-content { width:min(520px, 100%); }

.cv-modal-hdr {
  display:flex; justify-content:space-between; align-items:center;
  padding:.6rem .8rem;
  border-bottom:1px solid var(--border);
  background:var(--surface2);
  gap:.5rem;
}
.cv-modal-actions { display:flex; align-items:center; gap:.4rem; }
.cv-status-select {
  font-family:'IBM Plex Mono', monospace;
  font-size:.75rem;
  background:var(--surface); color:var(--text);
  border:1px solid var(--border); border-radius:6px;
  padding:.35rem .55rem; font-weight:600;
}
.cv-modal-close {
  background:transparent; color:var(--muted); border:none; cursor:pointer;
  font-size:1.1rem; padding:.2rem .5rem;
}
.cv-modal-close:hover { color:var(--text); }
.cv-modal-tabs { display:flex; border-bottom:1px solid var(--border); }
.cv-tab {
  flex:1; padding:.6rem; background:transparent; border:none;
  color:var(--muted); cursor:pointer;
  font-size:.8rem; letter-spacing:1px; text-transform:uppercase;
}
.cv-tab.active { color:var(--text); border-bottom:2px solid var(--accent); }
.cv-modal-body {
  display:grid;
  grid-template-columns:minmax(0, 1fr) 340px;
  min-height:480px;
  max-height:calc(100vh - 200px);
}

/* Toggle "Mostrar/Ocultar detalhes": esconde STATUS + DESCRIÇÃO,
   mantém Atividade visível na coluna esquerda */
.cv-modal-content:not(.cv-show-details) .cv-details-block { display:none; }

.cv-left-pane {
  padding:1rem 1.2rem;
  border-right:1px solid var(--border);
  overflow-y:auto;
  display:flex; flex-direction:column; gap:1rem;
}
.cv-left-hdr { display:flex; flex-direction:column; }
.cv-modal-title {
  font-family:'Bebas Neue', sans-serif;
  font-size:1.6rem; letter-spacing:1.5px; color:var(--text);
}
.cv-modal-subtitle { color:var(--muted); font-size:.8rem; }

.cv-section {
  background:var(--surface2);
  border:1px solid var(--border);
  border-radius:6px;
  padding:.7rem .8rem;
}
.cv-section-hdr {
  font-size:.7rem; letter-spacing:1.5px; text-transform:uppercase;
  color:var(--muted); margin-bottom:.4rem;
  display:flex; justify-content:space-between; align-items:center;
}
.cv-section textarea {
  width:100%; background:var(--surface); color:var(--text);
  border:1px solid var(--border); border-radius:6px; padding:.5rem;
  font-family:inherit; font-size:.85rem; resize:vertical;
}
.cv-section-foot {
  display:flex; justify-content:space-between; align-items:center;
  margin-top:.5rem;
}
.cv-fields { display:flex; flex-direction:column; gap:.5rem; }
.cv-fields .form-group label {
  font-size:.7rem; letter-spacing:1.5px; text-transform:uppercase; color:var(--muted);
}
.cv-muted { color:var(--muted); font-size:.75rem; font-family:'IBM Plex Mono', monospace; }

/* ---------- ACTIVITY ---------- */
.cv-activity-block { background:var(--surface2); border:1px solid var(--border); border-radius:6px; padding:.7rem .8rem; }
.cv-comment-form { display:flex; flex-direction:column; gap:.4rem; margin-bottom:.6rem; }
.cv-comment-form textarea {
  background:var(--surface); color:var(--text);
  border:1px solid var(--border); border-radius:6px; padding:.5rem;
  font-family:inherit; font-size:.85rem; resize:vertical;
}
.cv-activity-list { display:flex; flex-direction:column; gap:.55rem; max-height:340px; overflow-y:auto; }
.cv-event { display:flex; gap:.5rem; align-items:flex-start; padding:.35rem 0; }
.cv-event-icon {
  width:24px; height:24px; flex-shrink:0;
  display:flex; align-items:center; justify-content:center;
  border-radius:50%; font-size:.7rem; color:#fff;
}
.cv-event-icon.comment   { background:var(--accent); }
.cv-event-icon.column    { background:var(--info); }
.cv-event-icon.viagem-add { background:#16a34a; }
.cv-event-icon.viagem-edit { background:#eab308; color:#222; }
.cv-event-icon.viagem-end { background:#065f46; }
.cv-event-icon.viagem-x   { background:var(--muted); }
.cv-event-body { flex:1; min-width:0; }
.cv-event-head { font-size:.72rem; color:var(--muted); font-family:'IBM Plex Mono', monospace; }
.cv-event-head b { color:var(--text); font-weight:600; }
.cv-event-text { font-size:.85rem; color:var(--text); white-space:pre-wrap; word-wrap:break-word; }
.cv-event-delete {
  background:transparent; border:none; cursor:pointer; color:var(--muted);
  font-size:.7rem; margin-left:.5rem; opacity:0; transition:opacity .15s;
}
.cv-event:hover .cv-event-delete { opacity:1; }
.cv-event-delete:hover { color:var(--danger); }

/* ---------- VIAGENS PANEL ---------- */
.cv-viagens-pane {
  display:flex; flex-direction:column; background:var(--surface2);
  overflow:hidden;
}
.cv-viagens-hdr { padding:.7rem .9rem; border-bottom:1px solid var(--border); }
.cv-viagens-list {
  flex:1; overflow-y:auto;
  display:flex; flex-direction:column; gap:.5rem;
  padding:.6rem .7rem;
}
.cv-viagem {
  background:var(--surface);
  border:1px solid var(--border);
  border-radius:6px;
  padding:.6rem .7rem;
  display:flex; flex-direction:column; gap:.4rem;
}
.cv-viagem-hdr {
  display:flex; justify-content:space-between; align-items:center;
  cursor:pointer;
}
.cv-viagem-title { font-weight:600; font-size:.85rem; color:var(--text); }
.cv-viagem-badge {
  font-family:'IBM Plex Mono', monospace; font-size:.65rem;
  padding:.15rem .4rem; border-radius:10px;
  background:var(--surface3); color:var(--muted); text-transform:uppercase;
}
.cv-viagem-badge.em_curso     { background:var(--info); color:#fff; }
.cv-viagem-badge.planejada    { background:#16a34a;     color:#fff; }
.cv-viagem-badge.finalizada   { background:#065f46;     color:#fff; }
.cv-viagem-badge.cancelada    { background:var(--muted); color:#fff; }
.cv-viagem-body { font-size:.78rem; color:var(--muted); display:flex; flex-direction:column; gap:.2rem; }
.cv-viagem-body b { color:var(--text); font-weight:500; }
.cv-viagem-actions { display:flex; gap:.3rem; flex-wrap:wrap; margin-top:.3rem; }
.cv-viagem-actions .btn { font-size:.7rem; padding:.25rem .5rem; }
.cv-viagem.collapsed .cv-viagem-body,
.cv-viagem.collapsed .cv-viagem-actions { display:none; }
.cv-viagem-caret { color:var(--muted); font-size:.7rem; }

/* ---------- FORM MODAL (nova carga / editar viagem) ---------- */
.cv-form-body {
  grid-template-columns:1fr 1fr;
  gap:.7rem .9rem;
  padding:1rem 1.2rem;
}
.cv-form-body .form-group { display:flex; flex-direction:column; gap:.2rem; }
.cv-form-body textarea {
  background:var(--surface); color:var(--text);
  border:1px solid var(--border); border-radius:6px; padding:.5rem;
  font-family:inherit; font-size:.85rem;
}

/* ---------- MOBILE ---------- */
@media (max-width: 768px) {
  .cv-toolbar { flex-direction:column; align-items:stretch; }
  .cv-board { scroll-snap-type:x mandatory; padding:.8rem; }
  .cv-col { flex:0 0 85%; scroll-snap-align:start; }
  .cv-modal-content { border-radius:8px; height:calc(100vh - 60px); }
  .cv-modal-tabs { display:flex !important; }
  .cv-modal-body { grid-template-columns:1fr; max-height:none; }
  .cv-left-pane, .cv-viagens-pane { display:none; }
  .cv-left-pane.active, .cv-viagens-pane.active { display:flex; }
  .cv-left-pane.tab-detail .cv-activity-block { display:none; }
  .cv-left-pane.tab-activity .cv-details-block { display:none; }
  .cv-form-body { grid-template-columns:1fr; }
  #cvToggleDetails { display:none; }
}
```

- [ ] **Step 2: Commit**

```
git commit -m "feat(controle-viagens-v2): CSS com painel de viagens, activity log e toggle detalhes" -- public/css/controle-viagens.css
```

---

## Task 8: JS — Board (sort por coluna + busca global + polling)

**Files:**
- Modify: `public/js/controle-viagens.js` (reescreve)

- [ ] **Step 1: Substituir conteúdo do arquivo**

`public/js/controle-viagens.js` (substitui tudo):

```js
// controle-viagens.js — Painel Kanban operacional v2.
// Board: cards arrastáveis, sort por coluna, busca global, polling 20s.
// Modal + viagens + activity ficam em arquivos próprios.

import { api } from './api.js';
import { esc } from './utils.js';
import * as modal from './controle-viagens.modal.js';
import * as viagensPane from './controle-viagens.viagens.js';
import * as activityPane from './controle-viagens.activity.js';

const COLUMNS = [
  { key: 'VAZIO_AGUARDANDO_CARGA',   label: 'Vazio aguardando carga',  color: 'var(--cv-col-vazio)' },
  { key: 'INDO_CARREGAR',            label: 'Indo carregar',           color: 'var(--cv-col-indo)' },
  { key: 'NA_FABRICA',               label: 'Na fábrica',              color: 'var(--cv-col-fabrica)' },
  { key: 'CARREGADO_EM_VIAGEM',      label: 'Carregado em viagem',     color: 'var(--cv-col-carregado)' },
  { key: 'EM_DESCARGA_NO_CLIENTE',   label: 'Em descarga no cliente',  color: 'var(--cv-col-descarga)' },
  { key: 'EM_MANUTENCAO',            label: 'Em manutenção',           color: 'var(--cv-col-manutencao)' },
];

const SORT_OPTIONS = [
  { key: 'default',          label: 'Padrão (placa)' },
  { key: 'coleta_asc',       label: 'Coleta ↑' },
  { key: 'coleta_desc',      label: 'Coleta ↓' },
  { key: 'agend_asc',        label: 'Agendamento ↑' },
  { key: 'agend_desc',       label: 'Agendamento ↓' },
];

const POLL_INTERVAL_MS = 20_000;

const state = {
  rows: [],
  fingerprint: null,
  query: '',
  sorts: loadSorts(),
  pollTimer: null,
  initialized: false,
  visibilityHandler: null,
  lastSeen: loadLastSeen(),
};

function loadSorts() {
  try { return JSON.parse(localStorage.getItem('cv_sorts') || '{}'); } catch { return {}; }
}
function saveSorts() {
  try { localStorage.setItem('cv_sorts', JSON.stringify(state.sorts)); } catch {}
}
function loadLastSeen() {
  try { return JSON.parse(localStorage.getItem('cv_last_seen') || '{}'); } catch { return {}; }
}
function saveLastSeen() {
  try { localStorage.setItem('cv_last_seen', JSON.stringify(state.lastSeen)); } catch {}
}
function markSeen(truckId) {
  state.lastSeen[truckId] = new Date().toISOString();
  saveLastSeen();
}

function fmtDate(s) {
  if (!s) return '';
  const d = new Date(s); if (isNaN(d)) return '';
  return `${String(d.getDate()).padStart(2,'0')}/${String(d.getMonth()+1).padStart(2,'0')}`;
}
function fmtTime(s) {
  if (!s) return '';
  const d = new Date(s); if (isNaN(d)) return '';
  return `${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;
}

async function fetchBoard() {
  try {
    const resp = await api.get('/api/controle-viagens/board');
    if (state.fingerprint === resp.fingerprint) {
      updateRefreshInfo();
      return;
    }
    state.rows = resp.board;
    state.fingerprint = resp.fingerprint;
    renderBoard();
    updateRefreshInfo();
  } catch (e) {
    console.error('[cv] fetchBoard:', e);
    const el = document.getElementById('cvBoard');
    if (el) el.innerHTML = `<div class="cv-loading" style="color:var(--danger)">Erro: ${esc(e.message)}</div>`;
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

function matchesQuery(row, q) {
  const t = row.truck;
  const v = row.viagem_em_curso || {};
  const c = row.column || {};
  return (
    (t.placa || '').toLowerCase().includes(q) ||
    (t.motorista || '').toLowerCase().includes(q) ||
    (t.modelo || '').toLowerCase().includes(q) ||
    (v.origem || '').toLowerCase().includes(q) ||
    (v.destino || '').toLowerCase().includes(q) ||
    (v.carga_descricao || '').toLowerCase().includes(q) ||
    (v.fabrica || '').toLowerCase().includes(q) ||
    (v.cliente_descarga || '').toLowerCase().includes(q) ||
    (c.descricao_geral || '').toLowerCase().includes(q) ||
    (c.manutencao_descricao || '').toLowerCase().includes(q)
  );
}

function filteredRows() {
  const q = state.query.trim().toLowerCase();
  if (!q) return state.rows;
  return state.rows.filter(r => matchesQuery(r, q));
}

function sortRows(rows, sortKey) {
  if (!sortKey || sortKey === 'default') {
    return [...rows].sort((a, b) => (a.truck.placa || '').localeCompare(b.truck.placa || ''));
  }
  const dir = sortKey.endsWith('_asc') ? 1 : -1;
  const field = sortKey.startsWith('coleta') ? 'data_coleta' : 'data_agendamento_entrega';
  return [...rows].sort((a, b) => {
    const av = a.viagem_em_curso?.[field];
    const bv = b.viagem_em_curso?.[field];
    if (!av && !bv) return 0;
    if (!av) return 1;  // sem data fica no fim
    if (!bv) return -1;
    return (new Date(av) - new Date(bv)) * dir;
  });
}

function renderBoard() {
  const board = document.getElementById('cvBoard');
  const rows = filteredRows();
  document.getElementById('cvTotal').textContent =
    `${rows.length} de ${state.rows.length} caminhões`;

  board.innerHTML = COLUMNS.map(col => {
    const cards = rows.filter(r => (r.column?.coluna || 'VAZIO_AGUARDANDO_CARGA') === col.key);
    const sortKey = state.sorts[col.key] || 'default';
    const sorted = sortRows(cards, sortKey);
    return `
      <div class="cv-col" data-col-status="${col.key}" style="--col-color:${col.color}">
        <div class="cv-col-hdr">
          <span class="cv-col-title">${esc(col.label)}</span>
          <span class="cv-col-count">${cards.length}</span>
          <select class="cv-col-sort" onchange="cv.setSort('${col.key}', this.value)" title="Ordenar coluna">
            ${SORT_OPTIONS.map(o => `<option value="${o.key}" ${o.key === sortKey ? 'selected' : ''}>${esc(o.label)}</option>`).join('')}
          </select>
        </div>
        <div class="cv-col-body" data-col-body="${col.key}">
          ${sorted.map(renderCard).join('') || '<div class="cv-muted" style="text-align:center;padding:.5rem">—</div>'}
        </div>
      </div>`;
  }).join('');

  wireDragAndDrop();
}

function renderCard(row) {
  const t = row.truck;
  const c = row.column || {};
  const v = row.viagem_em_curso;
  const col = COLUMNS.find(x => x.key === (c.coluna || 'VAZIO_AGUARDANDO_CARGA'));
  const fields = miniFields(c.coluna, v, c);
  const planejadas = row.viagens_planejadas_count || 0;
  const unread = isUnread(row);
  const updated = c.updated_at ? fmtTime(c.updated_at) : '';

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
        <span>
          <span class="cv-pill ${unread ? 'unread' : ''}">💬 ${row.activity_count || 0}</span>
          ${planejadas > 0 ? `<span class="cv-pill" style="margin-left:.3rem">📋 ${planejadas}</span>` : ''}
        </span>
        <span>${updated ? '⏱ ' + updated : ''}</span>
      </div>
    </div>`;
}

function miniFields(coluna, viagem, column) {
  const parts = [];
  const v = viagem || {};
  if (coluna === 'INDO_CARREGAR' || coluna === 'NA_FABRICA') {
    if (v.fabrica)                  parts.push(`🏭 ${esc(v.fabrica)}`);
    if (v.data_coleta)              parts.push(`🚚 <b>${fmtDate(v.data_coleta)}</b>`);
    if (v.data_agendamento_entrega) parts.push(`📅 <b>${fmtDate(v.data_agendamento_entrega)}</b>`);
  } else if (coluna === 'CARREGADO_EM_VIAGEM') {
    if (v.data_agendamento_entrega) parts.push(`📅 <b>${fmtDate(v.data_agendamento_entrega)}</b>`);
    if (v.carga_descricao)          parts.push(esc(v.carga_descricao));
  } else if (coluna === 'EM_DESCARGA_NO_CLIENTE') {
    if (v.cliente_descarga) parts.push(`🏢 ${esc(v.cliente_descarga)}`);
  } else if (coluna === 'EM_MANUTENCAO') {
    if (column.manutencao_descricao) parts.push(`🔧 ${esc(column.manutencao_descricao)}`);
  }
  return parts.join(' · ');
}

function isUnread(row) {
  if (!row.last_activity_at || (row.activity_count || 0) === 0) return false;
  const seen = state.lastSeen[row.truck.id];
  if (!seen) return true;
  return new Date(row.last_activity_at) > new Date(seen);
}

function applySearch() {
  state.query = document.getElementById('cvSearch').value;
  renderBoard();
}

function setSort(colKey, sortKey) {
  state.sorts[colKey] = sortKey;
  saveSorts();
  renderBoard();
}

/* ============================================================
   DRAG-AND-DROP — desktop + mobile (touch)
   ============================================================ */
function wireDragAndDrop() {
  const cards = document.querySelectorAll('.cv-card');
  const cols  = document.querySelectorAll('.cv-col');

  cards.forEach(card => {
    card.addEventListener('dragstart', onDragStart);
    card.addEventListener('dragend',   onDragEnd);

    let lpTimer = null;
    let touchDrag = null;
    card.addEventListener('touchstart', (e) => {
      lpTimer = setTimeout(() => { touchDrag = beginTouchDrag(card, e.touches[0]); }, 350);
    }, { passive: true });
    card.addEventListener('touchmove', (e) => {
      if (touchDrag) { e.preventDefault(); moveTouchDrag(touchDrag, e.touches[0]); }
      else clearTimeout(lpTimer);
    }, { passive: false });
    card.addEventListener('touchend', () => {
      clearTimeout(lpTimer);
      if (touchDrag) { endTouchDrag(touchDrag); touchDrag = null; }
    });
    card.addEventListener('touchcancel', () => {
      clearTimeout(lpTimer);
      if (touchDrag) { cancelTouchDrag(touchDrag); touchDrag = null; }
    });
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
function onDragOver(e) { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; e.currentTarget.classList.add('drag-over'); }
function onDragLeave(e) {
  if (!e.currentTarget.contains(e.relatedTarget)) e.currentTarget.classList.remove('drag-over');
}
async function onDrop(e) {
  e.preventDefault();
  const col = e.currentTarget;
  col.classList.remove('drag-over');
  const newColuna = col.dataset.colStatus;
  const truckId   = e.dataTransfer.getData('text/plain');
  await commitMove(truckId, newColuna);
}

function beginTouchDrag(card, touch) {
  card.classList.add('dragging');
  card.setAttribute('data-lp', '1');
  if (navigator.vibrate) try { navigator.vibrate(20); } catch {}
  const rect = card.getBoundingClientRect();
  const ghost = card.cloneNode(true);
  ghost.style.position = 'fixed';
  ghost.style.left = rect.left + 'px';
  ghost.style.top  = rect.top  + 'px';
  ghost.style.width = rect.width + 'px';
  ghost.style.pointerEvents = 'none';
  ghost.style.zIndex = '1000';
  ghost.style.opacity = '0.85';
  ghost.classList.add('cv-touch-ghost');
  document.body.appendChild(ghost);
  return { truckId: card.dataset.truckId, ghost, offsetX: touch.clientX - rect.left, offsetY: touch.clientY - rect.top, currentCol: null };
}
function moveTouchDrag(drag, touch) {
  drag.ghost.style.left = (touch.clientX - drag.offsetX) + 'px';
  drag.ghost.style.top  = (touch.clientY - drag.offsetY) + 'px';
  drag.ghost.style.display = 'none';
  const el = document.elementFromPoint(touch.clientX, touch.clientY);
  drag.ghost.style.display = '';
  const col = el?.closest?.('.cv-col');
  if (col !== drag.currentCol) {
    if (drag.currentCol) drag.currentCol.classList.remove('drag-over');
    if (col) col.classList.add('drag-over');
    drag.currentCol = col;
  }
}
async function endTouchDrag(drag) {
  drag.ghost.remove();
  if (drag.currentCol) drag.currentCol.classList.remove('drag-over');
  document.querySelectorAll(`.cv-card[data-truck-id="${drag.truckId}"]`).forEach(c => {
    c.classList.remove('dragging'); c.removeAttribute('data-lp');
  });
  if (drag.currentCol) await commitMove(drag.truckId, drag.currentCol.dataset.colStatus);
}
function cancelTouchDrag(drag) {
  drag.ghost.remove();
  if (drag.currentCol) drag.currentCol.classList.remove('drag-over');
  document.querySelectorAll(`.cv-card[data-truck-id="${drag.truckId}"]`).forEach(c => {
    c.classList.remove('dragging'); c.removeAttribute('data-lp');
  });
}

async function commitMove(truckId, newColuna) {
  if (!newColuna || !truckId) return;
  const row = state.rows.find(r => r.truck.id === truckId);
  if (!row) return;
  const oldColuna = row.column?.coluna || 'VAZIO_AGUARDANDO_CARGA';
  if (oldColuna === newColuna) return;

  row.column = { ...(row.column || {}), coluna: newColuna };
  renderBoard();

  try {
    await api.patch(`/api/controle-viagens/truck/${truckId}/column`, { coluna: newColuna });
    await fetchBoard();
  } catch (err) {
    alert('Erro ao mover: ' + err.message);
    row.column.coluna = oldColuna;
    renderBoard();
  }
}

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

  state.visibilityHandler = () => {
    if (document.body.dataset.view !== 'controle-viagens') return;
    if (!document.hidden) fetchBoard();
    updateRefreshInfo();
  };
  document.addEventListener('visibilitychange', state.visibilityHandler);

  await fetchBoard();
  startPolling();
}

export function stopControleViagens() {
  stopPolling();
  if (state.visibilityHandler) {
    document.removeEventListener('visibilitychange', state.visibilityHandler);
    state.visibilityHandler = null;
  }
  state.initialized = false;
}

/* Objeto exposto pro HTML inline */
const cv = {
  manualRefresh,
  applySearch,
  setSort,
  markSeen,
  openDetail: modal.openDetail,
  closeDetail: modal.closeDetail,
  saveDetailFields: modal.saveDetailFields,
  saveDescricao: modal.saveDescricao,
  switchModalTab: modal.switchModalTab,
  toggleDetails: modal.toggleDetails,
  submitComment: activityPane.submitComment,
  deleteComment: activityPane.deleteComment,
  openNewViagem: viagensPane.openNewViagem,
  closeViagemForm: viagensPane.closeViagemForm,
  saveViagemForm: viagensPane.saveViagemForm,
  editViagem: viagensPane.editViagem,
  startViagem: viagensPane.startViagem,
  finalizeViagem: viagensPane.finalizeViagem,
  cancelViagem: viagensPane.cancelViagem,
  deleteViagem: viagensPane.deleteViagem,
  toggleViagem: viagensPane.toggleCollapse,
  // Helpers compartilhados expostos pra outros módulos
  refreshAfterChange: async () => { state.fingerprint = null; await fetchBoard(); },
};
window.cv = cv;
export { cv };
```

- [ ] **Step 2: Static verification**

```
node -e "const fs = require('fs'); const j = fs.readFileSync('public/js/controle-viagens.js', 'utf8'); console.log('init export:', j.includes('export async function initControleViagens'), 'stop export:', j.includes('export function stopControleViagens'), 'cv export:', j.includes('export { cv }'), 'setSort wired:', j.includes('cv.setSort'));"
```

Esperado: todos `true`.

- [ ] **Step 3: Commit**

```
git commit -m "feat(controle-viagens-v2): board com sort por coluna e busca expandida" -- public/js/controle-viagens.js
```

---

## Task 9: JS — Modal (status fields + descrição + toggle ocultar)

**Files:**
- Modify: `public/js/controle-viagens.modal.js` (reescreve)

- [ ] **Step 1: Substituir conteúdo do arquivo**

`public/js/controle-viagens.modal.js`:

```js
// controle-viagens.modal.js — Modal de detalhe do caminhão (v2):
// status dropdown + campos da coluna + descrição persistente.
// O painel de viagens fica em controle-viagens.viagens.js
// O activity log fica em controle-viagens.activity.js

import { api } from './api.js';
import { esc } from './utils.js';
import * as viagensPane from './controle-viagens.viagens.js';
import * as activityPane from './controle-viagens.activity.js';

const COLUMNS_INFO = {
  VAZIO_AGUARDANDO_CARGA: { label: 'Vazio aguardando carga', color: 'var(--cv-col-vazio)',     fields: [] },
  INDO_CARREGAR:          { label: 'Indo carregar',          color: 'var(--cv-col-indo)',      fields: ['fabrica','data_coleta','data_agendamento_entrega','carga_descricao','valor_frete'] },
  NA_FABRICA:             { label: 'Na fábrica',             color: 'var(--cv-col-fabrica)',   fields: ['fabrica','data_coleta','data_agendamento_entrega','carga_descricao','valor_frete'] },
  CARREGADO_EM_VIAGEM:    { label: 'Carregado em viagem',    color: 'var(--cv-col-carregado)', fields: ['carga_descricao','data_carregamento','data_agendamento_entrega','valor_frete'] },
  EM_DESCARGA_NO_CLIENTE: { label: 'Em descarga no cliente', color: 'var(--cv-col-descarga)',  fields: ['cliente_descarga','data_agendamento_entrega','carga_descricao'] },
  EM_MANUTENCAO:          { label: 'Em manutenção',          color: 'var(--cv-col-manutencao)',fields: ['manutencao_descricao'] },
};

const state = {
  truckId: null,
  data: null,
  modalTab: 'detail',
};

function toDateInput(s) {
  if (!s) return '';
  const d = new Date(s); if (isNaN(d)) return '';
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}
function fmtPtBR(s) {
  if (!s) return '';
  const d = new Date(s); if (isNaN(d)) return '';
  return `${String(d.getDate()).padStart(2,'0')}/${String(d.getMonth()+1).padStart(2,'0')} ${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;
}

function populateStatusSelect() {
  const sel = document.getElementById('cvDetStatus');
  sel.innerHTML = Object.entries(COLUMNS_INFO)
    .map(([k, v]) => `<option value="${k}">${v.label}</option>`).join('');
  sel.onchange = () => {
    renderFields();
    sel.style.borderColor = COLUMNS_INFO[sel.value]?.color || 'var(--border)';
  };
}

function getViagemEmCurso() {
  return state.data?.viagens?.find(v => v.status_viagem === 'EM_CURSO') || null;
}

function renderFields() {
  const sel = document.getElementById('cvDetStatus');
  const coluna = sel.value;
  const info = COLUMNS_INFO[coluna];
  const c = state.data?.column || {};
  const v = getViagemEmCurso() || {};
  const fieldsEl = document.getElementById('cvDetFields');
  const parts = [];

  for (const f of info.fields) {
    if (f === 'manutencao_descricao') {
      parts.push(`
        <div class="form-group">
          <label>Descrição da manutenção</label>
          <input type="text" id="cvDetManut" value="${esc(c.manutencao_descricao || '')}" maxlength="500">
        </div>`);
    } else if (f === 'fabrica') {
      parts.push(`
        <div class="form-group">
          <label>Fábrica</label>
          <input type="text" id="cvDetFabrica" value="${esc(v.fabrica || '')}" maxlength="200" placeholder="ex.: Cargill Goiania">
        </div>`);
    } else if (f === 'cliente_descarga') {
      parts.push(`
        <div class="form-group">
          <label>Cliente</label>
          <input type="text" id="cvDetCliente" value="${esc(v.cliente_descarga || '')}" maxlength="200">
        </div>`);
    } else if (f === 'data_coleta') {
      parts.push(`
        <div class="form-group">
          <label>Data coleta</label>
          <input type="date" id="cvDetColeta" value="${toDateInput(v.data_coleta)}">
        </div>`);
    } else if (f === 'data_carregamento') {
      const val = toDateInput(v.data_carregamento) || toDateInput(v.data_coleta);
      parts.push(`
        <div class="form-group">
          <label>Data carregamento</label>
          <input type="date" id="cvDetCarreg" value="${val}">
        </div>`);
    } else if (f === 'data_agendamento_entrega') {
      parts.push(`
        <div class="form-group">
          <label>Agendamento entrega</label>
          <input type="date" id="cvDetAgend" value="${toDateInput(v.data_agendamento_entrega)}">
        </div>`);
    } else if (f === 'carga_descricao') {
      parts.push(`
        <div class="form-group">
          <label>Carga</label>
          <input type="text" id="cvDetCarga" value="${esc(v.carga_descricao || '')}" maxlength="500">
        </div>`);
    } else if (f === 'valor_frete') {
      parts.push(`
        <div class="form-group">
          <label>Valor frete (R$)</label>
          <input type="number" step="0.01" min="0" id="cvDetValor" value="${v.valor_frete ?? ''}">
        </div>`);
    }
  }
  if (parts.length === 0) {
    parts.push('<div class="cv-muted">Nenhum campo nesta coluna. Crie uma viagem pra preencher dados de carga.</div>');
  }
  fieldsEl.innerHTML = parts.join('');
  sel.style.borderColor = info?.color || 'var(--border)';
}

function readColumnPayload() {
  const coluna = document.getElementById('cvDetStatus').value;
  const payload = { coluna };
  if (COLUMNS_INFO[coluna].fields.includes('manutencao_descricao')) {
    payload.manutencao_descricao = (document.getElementById('cvDetManut')?.value || '').trim() || null;
  }
  return payload;
}

function readViagemPayload() {
  const coluna = document.getElementById('cvDetStatus').value;
  const fields = COLUMNS_INFO[coluna].fields;
  const payload = {};
  if (fields.includes('fabrica'))                  payload.fabrica = (document.getElementById('cvDetFabrica')?.value || '').trim() || null;
  if (fields.includes('cliente_descarga'))         payload.cliente_descarga = (document.getElementById('cvDetCliente')?.value || '').trim() || null;
  if (fields.includes('data_coleta'))              payload.data_coleta = document.getElementById('cvDetColeta')?.value || null;
  if (fields.includes('data_carregamento'))        payload.data_carregamento = document.getElementById('cvDetCarreg')?.value || null;
  if (fields.includes('data_agendamento_entrega')) payload.data_agendamento_entrega = document.getElementById('cvDetAgend')?.value || null;
  if (fields.includes('carga_descricao'))          payload.carga_descricao = (document.getElementById('cvDetCarga')?.value || '').trim() || null;
  if (fields.includes('valor_frete')) {
    const raw = document.getElementById('cvDetValor')?.value;
    payload.valor_frete = (raw === '' || raw == null) ? null : Number(raw);
  }
  return payload;
}

export async function openDetail(truckId) {
  state.truckId = truckId;
  state.modalTab = 'detail';

  try {
    state.data = await api.get(`/api/controle-viagens/truck/${truckId}`);
  } catch (e) {
    alert('Erro ao carregar caminhão: ' + e.message);
    return;
  }

  const t = state.data.truck;
  const c = state.data.column || {};
  document.getElementById('cvDetTitle').textContent = `${t.placa} — ${t.motorista || 'sem motorista'}`;
  document.getElementById('cvDetSubtitle').textContent =
    [t.modelo, t.carreta_placa ? `+ ${t.carreta_placa}${t.carreta_modelo ? ' (' + t.carreta_modelo + ')' : ''}` : '']
      .filter(Boolean).join(' ');

  populateStatusSelect();
  document.getElementById('cvDetStatus').value = c.coluna || 'VAZIO_AGUARDANDO_CARGA';
  document.getElementById('cvDetDescricao').value = c.descricao_geral || '';
  renderFields();

  document.getElementById('cvDetUpdated').textContent =
    c.updated_by ? `Última: ${c.updated_by.nome} · ${fmtPtBR(c.updated_at)}` : '';

  // Render viagens + activity (delegados)
  viagensPane.renderForTruck(state.data);
  activityPane.renderFor(state.data);

  document.getElementById('cvDetailModal').classList.add('open');
  switchModalTab('detail');
}

export function closeDetail() {
  document.getElementById('cvDetailModal').classList.remove('open');
  if (window.cv?.markSeen && state.truckId) window.cv.markSeen(state.truckId);
  state.truckId = null;
  state.data = null;
}

export async function saveDetailFields() {
  const btn = document.getElementById('cvDetSaveBtn');
  const original = btn.textContent;
  btn.disabled = true; btn.textContent = 'Salvando...';
  try {
    const coluna = document.getElementById('cvDetStatus').value;
    const colPayload = readColumnPayload();
    await api.patch(`/api/controle-viagens/truck/${state.truckId}/column`, colPayload);

    // Se há viagem em curso E a coluna usa campos de viagem, atualiza viagem também
    const viagem = getViagemEmCurso();
    if (viagem && COLUMNS_INFO[coluna].fields.some(f => f !== 'manutencao_descricao' && f !== 'descricao_geral')) {
      const vPayload = readViagemPayload();
      if (Object.keys(vPayload).length > 0) {
        await api.patch(`/api/controle-viagens/viagens/${viagem.id}`, vPayload);
      }
    }
    if (window.cv?.refreshAfterChange) await window.cv.refreshAfterChange();
    await reload();
  } catch (e) {
    alert('Erro ao salvar: ' + e.message);
  } finally {
    btn.disabled = false; btn.textContent = original;
  }
}

export async function saveDescricao() {
  const desc = document.getElementById('cvDetDescricao').value;
  try {
    await api.patch(`/api/controle-viagens/truck/${state.truckId}/column`, { descricao_geral: desc });
    await reload();
  } catch (e) {
    alert('Erro ao salvar descrição: ' + e.message);
  }
}

export function switchModalTab(tab) {
  state.modalTab = tab;
  document.querySelectorAll('#cvModalTabs .cv-tab').forEach(b => b.classList.toggle('active', b.dataset.cvTab === tab));
  const left = document.querySelector('.cv-left-pane');
  const right = document.querySelector('.cv-viagens-pane');
  if (left)  { left.classList.toggle('active', tab !== 'viagens');
               left.classList.toggle('tab-detail',   tab === 'detail');
               left.classList.toggle('tab-activity', tab === 'activity'); }
  if (right) right.classList.toggle('active', tab === 'viagens');
}

export function toggleDetails() {
  const content = document.querySelector('#cvDetailModal .cv-modal-content');
  const btn = document.getElementById('cvToggleDetails');
  const showing = content.classList.toggle('cv-show-details');
  btn.textContent = showing ? 'Ocultar detalhes' : 'Mostrar detalhes';
}

export async function reload() {
  if (!state.truckId) return;
  try {
    state.data = await api.get(`/api/controle-viagens/truck/${state.truckId}`);
    viagensPane.renderForTruck(state.data);
    activityPane.renderFor(state.data);
  } catch (e) {
    console.error('[cv modal reload]', e);
  }
}

export function getCurrentTruckId() { return state.truckId; }
export function getCurrentData() { return state.data; }
```

- [ ] **Step 2: Static verification**

```
node -e "const fs = require('fs'); const m = fs.readFileSync('public/js/controle-viagens.modal.js', 'utf8'); console.log('openDetail:', m.includes('export async function openDetail'), 'toggleDetails:', m.includes('export function toggleDetails'), 'reload:', m.includes('export async function reload'));"
```

Esperado: todos `true`.

- [ ] **Step 3: Commit**

```
git commit -m "feat(controle-viagens-v2): modal com campos da coluna, descricao e toggle" -- public/js/controle-viagens.modal.js
```

---

## Task 10: JS — Painel de Viagens (CRUD + start/finalize/cancel)

**Files:**
- Create: `public/js/controle-viagens.viagens.js`

- [ ] **Step 1: Criar arquivo**

`public/js/controle-viagens.viagens.js`:

```js
// controle-viagens.viagens.js — Painel direito do modal: lista, criar,
// editar e gerenciar transições de status das viagens do caminhão.

import { api } from './api.js';
import { esc } from './utils.js';
import * as modal from './controle-viagens.modal.js';

const state = {
  formMode: null, // 'create' ou 'edit'
  editingViagemId: null,
  collapsed: new Set(),  // ids de viagens colapsadas manualmente
};

function fmtDate(s) {
  if (!s) return '—';
  const d = new Date(s); if (isNaN(d)) return '—';
  return `${String(d.getDate()).padStart(2,'0')}/${String(d.getMonth()+1).padStart(2,'0')}/${d.getFullYear()}`;
}
function fmtMoney(v) {
  if (v == null || v === '') return '—';
  const n = Number(v);
  if (isNaN(n)) return '—';
  return 'R$ ' + n.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function shouldCollapse(viagem) {
  if (state.collapsed.has(viagem.id)) return true;
  // Default: finalizada/cancelada colapsa; em curso/planejada expande
  if (state.collapsed.has(`!${viagem.id}`)) return false;
  return (viagem.status_viagem === 'FINALIZADA' || viagem.status_viagem === 'CANCELADA');
}

export function renderForTruck(data) {
  const list = document.getElementById('cvViagensList');
  const viagens = (data.viagens || []);
  if (!viagens.length) {
    list.innerHTML = '<div class="cv-muted" style="text-align:center;padding:1rem">Nenhuma viagem ainda. Clique "+ Nova carga".</div>';
    return;
  }
  // Ordena: EM_CURSO primeiro, depois PLANEJADA, depois FINALIZADA/CANCELADA mais recentes
  const order = { EM_CURSO: 0, PLANEJADA: 1, FINALIZADA: 2, CANCELADA: 3 };
  const sorted = [...viagens].sort((a, b) => {
    const o = (order[a.status_viagem] ?? 99) - (order[b.status_viagem] ?? 99);
    if (o !== 0) return o;
    return new Date(b.created_at) - new Date(a.created_at);
  });
  list.innerHTML = sorted.map(renderViagemItem).join('');
}

function renderViagemItem(v) {
  const collapsed = shouldCollapse(v);
  const status = v.status_viagem.toLowerCase();
  const title  = v.origem || v.destino
    ? `${esc(v.origem || '?')} → ${esc(v.destino || '?')}`
    : esc(v.carga_descricao || 'Nova carga');
  const lines = [];
  if (v.fabrica)                  lines.push(`<b>Fábrica:</b> ${esc(v.fabrica)}`);
  if (v.cliente_descarga)         lines.push(`<b>Cliente:</b> ${esc(v.cliente_descarga)}`);
  if (v.carga_descricao)          lines.push(`<b>Carga:</b> ${esc(v.carga_descricao)}`);
  if (v.valor_frete != null)      lines.push(`<b>Valor:</b> ${esc(fmtMoney(v.valor_frete))}`);
  if (v.data_coleta)              lines.push(`<b>Coleta:</b> ${fmtDate(v.data_coleta)}`);
  if (v.data_carregamento)        lines.push(`<b>Carregamento:</b> ${fmtDate(v.data_carregamento)}`);
  if (v.data_agendamento_entrega) lines.push(`<b>Agend. entrega:</b> ${fmtDate(v.data_agendamento_entrega)}`);
  if (v.data_entrega_realizada)   lines.push(`<b>Entregue em:</b> ${fmtDate(v.data_entrega_realizada)}`);
  if (v.cancel_motivo)            lines.push(`<b>Motivo:</b> ${esc(v.cancel_motivo)}`);

  const actions = [];
  if (v.status_viagem === 'PLANEJADA') {
    actions.push(`<button class="btn btn-accent btn-sm" onclick="cv.startViagem('${esc(v.id)}')">Iniciar</button>`);
    actions.push(`<button class="btn btn-ghost btn-sm"  onclick="cv.editViagem('${esc(v.id)}')">Editar</button>`);
    actions.push(`<button class="btn btn-ghost btn-sm"  onclick="cv.cancelViagem('${esc(v.id)}')">Cancelar</button>`);
    actions.push(`<button class="btn btn-ghost btn-sm"  onclick="cv.deleteViagem('${esc(v.id)}')" style="color:var(--danger)">Apagar</button>`);
  } else if (v.status_viagem === 'EM_CURSO') {
    actions.push(`<button class="btn btn-accent btn-sm" onclick="cv.finalizeViagem('${esc(v.id)}')">Finalizar</button>`);
    actions.push(`<button class="btn btn-ghost btn-sm"  onclick="cv.editViagem('${esc(v.id)}')">Editar</button>`);
    actions.push(`<button class="btn btn-ghost btn-sm"  onclick="cv.cancelViagem('${esc(v.id)}')">Cancelar</button>`);
  } else if (v.status_viagem === 'FINALIZADA') {
    actions.push(`<button class="btn btn-ghost btn-sm" onclick="cv.editViagem('${esc(v.id)}')">Ver / Editar obs</button>`);
  }

  return `
    <div class="cv-viagem ${collapsed ? 'collapsed' : ''}" data-viagem-id="${esc(v.id)}">
      <div class="cv-viagem-hdr" onclick="cv.toggleViagem('${esc(v.id)}')">
        <div>
          <span class="cv-viagem-caret">${collapsed ? '▶' : '▼'}</span>
          <span class="cv-viagem-title">${title}</span>
        </div>
        <span class="cv-viagem-badge ${status}">${esc(v.status_viagem)}</span>
      </div>
      <div class="cv-viagem-body">${lines.join('<br>')}</div>
      <div class="cv-viagem-actions">${actions.join('')}</div>
    </div>`;
}

export function toggleCollapse(viagemId) {
  // Se já está manualmente colapsado, expande. Se já está expandido manualmente, recolhe.
  // Senão inverte o default.
  if (state.collapsed.has(viagemId)) {
    state.collapsed.delete(viagemId);
    state.collapsed.add(`!${viagemId}`);
  } else if (state.collapsed.has(`!${viagemId}`)) {
    state.collapsed.delete(`!${viagemId}`);
  } else {
    state.collapsed.add(viagemId);
  }
  const data = modal.getCurrentData?.();
  if (data) renderForTruck(data);
}

/* ============================================================
   FORM (nova carga / editar)
   ============================================================ */
export function openNewViagem() {
  state.formMode = 'create';
  state.editingViagemId = null;
  document.getElementById('cvVgTitle').textContent = 'Nova carga';
  ['cvVgOrigem','cvVgDestino','cvVgCarga','cvVgFabrica','cvVgCliente','cvVgValor','cvVgColeta','cvVgAgend','cvVgObs']
    .forEach(id => { const el = document.getElementById(id); if (el) el.value = ''; });
  document.getElementById('cvViagemFormModal').classList.add('open');
}

export function editViagem(viagemId) {
  const data = modal.getCurrentData?.();
  if (!data) return;
  const v = data.viagens.find(x => x.id === viagemId);
  if (!v) return;
  state.formMode = 'edit';
  state.editingViagemId = viagemId;
  document.getElementById('cvVgTitle').textContent = `Editar viagem`;
  document.getElementById('cvVgOrigem').value   = v.origem || '';
  document.getElementById('cvVgDestino').value  = v.destino || '';
  document.getElementById('cvVgCarga').value    = v.carga_descricao || '';
  document.getElementById('cvVgFabrica').value  = v.fabrica || '';
  document.getElementById('cvVgCliente').value  = v.cliente_descarga || '';
  document.getElementById('cvVgValor').value    = v.valor_frete ?? '';
  document.getElementById('cvVgColeta').value   = v.data_coleta ? new Date(v.data_coleta).toISOString().slice(0,10) : '';
  document.getElementById('cvVgAgend').value    = v.data_agendamento_entrega ? new Date(v.data_agendamento_entrega).toISOString().slice(0,10) : '';
  document.getElementById('cvVgObs').value      = v.observacoes || '';
  document.getElementById('cvViagemFormModal').classList.add('open');
}

export function closeViagemForm() {
  document.getElementById('cvViagemFormModal').classList.remove('open');
  state.formMode = null;
  state.editingViagemId = null;
}

export async function saveViagemForm() {
  const truckId = modal.getCurrentTruckId?.();
  if (!truckId) return;
  const payload = {
    origem:                   document.getElementById('cvVgOrigem').value.trim()   || null,
    destino:                  document.getElementById('cvVgDestino').value.trim()  || null,
    carga_descricao:          document.getElementById('cvVgCarga').value.trim()    || null,
    fabrica:                  document.getElementById('cvVgFabrica').value.trim()  || null,
    cliente_descarga:         document.getElementById('cvVgCliente').value.trim()  || null,
    valor_frete:              document.getElementById('cvVgValor').value ? Number(document.getElementById('cvVgValor').value) : null,
    data_coleta:              document.getElementById('cvVgColeta').value || null,
    data_agendamento_entrega: document.getElementById('cvVgAgend').value  || null,
    observacoes:              document.getElementById('cvVgObs').value.trim() || null,
  };
  const btn = document.getElementById('cvVgSaveBtn');
  btn.disabled = true;
  try {
    if (state.formMode === 'create') {
      await api.post(`/api/controle-viagens/truck/${truckId}/viagens`, payload);
    } else {
      await api.patch(`/api/controle-viagens/viagens/${state.editingViagemId}`, payload);
    }
    closeViagemForm();
    await modal.reload();
    if (window.cv?.refreshAfterChange) await window.cv.refreshAfterChange();
  } catch (e) {
    alert('Erro: ' + e.message);
  } finally {
    btn.disabled = false;
  }
}

/* ============================================================
   TRANSIÇÕES DE STATUS
   ============================================================ */
export async function startViagem(viagemId) {
  try {
    await api.post(`/api/controle-viagens/viagens/${viagemId}/start`);
    await modal.reload();
    if (window.cv?.refreshAfterChange) await window.cv.refreshAfterChange();
  } catch (e) {
    alert('Erro ao iniciar: ' + e.message);
  }
}

export async function finalizeViagem(viagemId) {
  const today = new Date().toISOString().slice(0,10);
  const dataEntrega = prompt('Data de entrega realizada? (YYYY-MM-DD)', today);
  if (dataEntrega === null) return;
  try {
    await api.post(`/api/controle-viagens/viagens/${viagemId}/finalize`, { data_entrega_realizada: dataEntrega || today });
    await modal.reload();
    if (window.cv?.refreshAfterChange) await window.cv.refreshAfterChange();
  } catch (e) {
    alert('Erro ao finalizar: ' + e.message);
  }
}

export async function cancelViagem(viagemId) {
  const motivo = prompt('Motivo do cancelamento (opcional)');
  if (motivo === null) return;
  try {
    await api.post(`/api/controle-viagens/viagens/${viagemId}/cancel`, { motivo: motivo || null });
    await modal.reload();
    if (window.cv?.refreshAfterChange) await window.cv.refreshAfterChange();
  } catch (e) {
    alert('Erro ao cancelar: ' + e.message);
  }
}

export async function deleteViagem(viagemId) {
  if (!confirm('Apagar essa viagem PLANEJADA? Esta ação não pode ser desfeita.')) return;
  try {
    await api.delete(`/api/controle-viagens/viagens/${viagemId}`);
    await modal.reload();
    if (window.cv?.refreshAfterChange) await window.cv.refreshAfterChange();
  } catch (e) {
    alert('Erro ao apagar: ' + e.message);
  }
}
```

- [ ] **Step 2: Static verification**

```
node -e "const fs = require('fs'); const v = fs.readFileSync('public/js/controle-viagens.viagens.js', 'utf8'); console.log('renderForTruck:', v.includes('export function renderForTruck'), 'openNewViagem:', v.includes('export function openNewViagem'), 'startViagem:', v.includes('export async function startViagem'));"
```

Esperado: todos `true`.

- [ ] **Step 3: Commit**

```
git commit -m "feat(controle-viagens-v2): painel de viagens com CRUD e transicoes" -- public/js/controle-viagens.viagens.js
```

---

## Task 11: JS — Activity log (timeline + comentários)

**Files:**
- Create: `public/js/controle-viagens.activity.js`

- [ ] **Step 1: Criar arquivo**

`public/js/controle-viagens.activity.js`:

```js
// controle-viagens.activity.js — Renderiza a timeline unificada do truck:
// COLUMN_MOVED, VIAGEM_*, COMMENT e COLUMN_FIELD_EDITED, em ordem.

import { api } from './api.js';
import { esc } from './utils.js';
import * as modal from './controle-viagens.modal.js';

const COLUMN_LABELS = {
  VAZIO_AGUARDANDO_CARGA: 'VAZIO',
  INDO_CARREGAR:          'INDO CARREGAR',
  NA_FABRICA:             'NA FÁBRICA',
  CARREGADO_EM_VIAGEM:    'CARREGADO',
  EM_DESCARGA_NO_CLIENTE: 'EM DESCARGA',
  EM_MANUTENCAO:          'MANUTENÇÃO',
};

const FIELD_LABELS = {
  origem: 'origem', destino: 'destino', carga_descricao: 'carga', fabrica: 'fábrica',
  cliente_descarga: 'cliente', valor_frete: 'valor frete',
  data_coleta: 'data coleta', data_carregamento: 'data carregamento',
  data_agendamento_entrega: 'data agendamento', observacoes: 'observações',
  manutencao_descricao: 'descrição manutenção', descricao_geral: 'descrição geral',
};

function fmtRel(s) {
  if (!s) return '';
  const diff = Date.now() - new Date(s).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1)    return 'agora';
  if (m < 60)   return `há ${m}min`;
  const h = Math.floor(m / 60);
  if (h < 24)   return `há ${h}h`;
  const d = Math.floor(h / 24);
  if (d < 30)   return `há ${d}d`;
  return new Date(s).toLocaleDateString('pt-BR');
}

function fmtValue(v) {
  if (v == null) return '—';
  if (typeof v === 'number') return String(v);
  if (v instanceof Date || /^\d{4}-\d{2}-\d{2}/.test(v)) {
    const d = new Date(v);
    if (!isNaN(d)) return `${String(d.getDate()).padStart(2,'0')}/${String(d.getMonth()+1).padStart(2,'0')}/${d.getFullYear()}`;
  }
  return String(v);
}

function describe(event) {
  const author = `<b>${esc(event.author_nome || 'sistema')}</b>`;
  switch (event.tipo) {
    case 'COMMENT':
      return { iconClass: 'comment', icon: '●', text: esc(event.payload?.texto || '') };

    case 'COLUMN_MOVED': {
      const from = COLUMN_LABELS[event.payload?.from] || event.payload?.from || '?';
      const to   = COLUMN_LABELS[event.payload?.to]   || event.payload?.to   || '?';
      return { iconClass: 'column', icon: '↻', text: `${author} moveu de <b>${esc(from)}</b> → <b>${esc(to)}</b>` };
    }
    case 'COLUMN_FIELD_EDITED': {
      const f = FIELD_LABELS[event.payload?.field] || event.payload?.field || '?';
      return { iconClass: 'viagem-edit', icon: '✎',
               text: `${author} alterou <b>${esc(f)}</b>: ${esc(fmtValue(event.payload?.before))} → ${esc(fmtValue(event.payload?.after))}` };
    }
    case 'VIAGEM_CREATED':
      return { iconClass: 'viagem-add', icon: '✚', text: `${author} criou nova viagem` };
    case 'VIAGEM_STARTED':
      return { iconClass: 'viagem-add', icon: '▶', text: `${author} iniciou a viagem` };
    case 'VIAGEM_FIELD_EDITED': {
      const f = FIELD_LABELS[event.payload?.field] || event.payload?.field || '?';
      return { iconClass: 'viagem-edit', icon: '✎',
               text: `${author} alterou <b>${esc(f)}</b>: ${esc(fmtValue(event.payload?.before))} → ${esc(fmtValue(event.payload?.after))}` };
    }
    case 'VIAGEM_FINALIZED':
      return { iconClass: 'viagem-end', icon: '🏁', text: `${author} finalizou a viagem` };
    case 'VIAGEM_CANCELLED':
      return { iconClass: 'viagem-x', icon: '✕', text: `${author} cancelou a viagem` + (event.payload?.motivo ? ` — ${esc(event.payload.motivo)}` : '') };
    case 'VIAGEM_DELETED':
      return { iconClass: 'viagem-x', icon: '🗑', text: `${author} apagou viagem planejada` };
    default:
      return { iconClass: 'column', icon: '?', text: `${author} ${esc(event.tipo)}` };
  }
}

export function renderFor(data) {
  const list = document.getElementById('cvActivityList');
  const events = data.activity || [];
  if (!events.length) {
    list.innerHTML = '<div class="cv-muted" style="text-align:center;padding:1rem">Sem atividade ainda. Faça uma movimentação ou comentário.</div>';
    return;
  }
  const me = window.__currentUser || null;
  const meId = me?.id || null;
  const isAdmin = me?.role === 'ADMIN';

  list.innerHTML = events.map(ev => {
    const d = describe(ev);
    const canDelete = ev.tipo === 'COMMENT' && (isAdmin || (ev.author_id && ev.author_id === meId));
    return `
      <div class="cv-event" data-event-id="${esc(ev.id)}">
        <div class="cv-event-icon ${d.iconClass}">${d.icon}</div>
        <div class="cv-event-body">
          <div class="cv-event-head">
            ${d.text}
            <span> · ${fmtRel(ev.created_at)}</span>
            ${canDelete ? `<button class="cv-event-delete" onclick="cv.deleteComment('${esc(ev.id)}')" title="Apagar">apagar</button>` : ''}
          </div>
        </div>
      </div>`;
  }).join('');
}

export async function submitComment() {
  const truckId = modal.getCurrentTruckId?.();
  if (!truckId) return;
  const input = document.getElementById('cvCommentInput');
  const texto = (input.value || '').trim();
  if (!texto) return;
  try {
    await api.post(`/api/controle-viagens/truck/${truckId}/comments`, { texto });
    input.value = '';
    await modal.reload();
    if (window.cv?.refreshAfterChange) await window.cv.refreshAfterChange();
  } catch (e) {
    alert('Erro ao enviar comentário: ' + e.message);
  }
}

export async function deleteComment(eventId) {
  if (!confirm('Apagar este comentário?')) return;
  try {
    await api.delete(`/api/controle-viagens/activity/${eventId}`);
    await modal.reload();
    if (window.cv?.refreshAfterChange) await window.cv.refreshAfterChange();
  } catch (e) {
    alert('Erro ao apagar: ' + e.message);
  }
}
```

- [ ] **Step 2: Static verification**

```
node -e "const fs = require('fs'); const a = fs.readFileSync('public/js/controle-viagens.activity.js', 'utf8'); console.log('renderFor:', a.includes('export function renderFor'), 'submitComment:', a.includes('export async function submitComment'), 'deleteComment:', a.includes('export async function deleteComment'));"
```

Esperado: todos `true`.

- [ ] **Step 3: Commit**

```
git commit -m "feat(controle-viagens-v2): activity log com timeline unificada" -- public/js/controle-viagens.activity.js
```

---

## Task 12: Verificação ponta-a-ponta + cleanup

**Files:**
- Verify: tudo

- [ ] **Step 1: Static check de todos os exports**

```
node -e "
const fs = require('fs');
const files = [
  'public/js/controle-viagens.js',
  'public/js/controle-viagens.modal.js',
  'public/js/controle-viagens.viagens.js',
  'public/js/controle-viagens.activity.js',
];
files.forEach(f => {
  const c = fs.readFileSync(f, 'utf8');
  const exports = (c.match(/export\s+(?:async\s+)?(?:function|const)\s+(\w+)/g) || []).map(m => m.replace(/export\s+(?:async\s+)?(?:function|const)\s+/, ''));
  console.log(f, '→', exports.join(', '));
});
"
```

Esperado:
- `controle-viagens.js` → `initControleViagens, stopControleViagens, cv`
- `controle-viagens.modal.js` → `openDetail, closeDetail, saveDetailFields, saveDescricao, switchModalTab, toggleDetails, reload, getCurrentTruckId, getCurrentData`
- `controle-viagens.viagens.js` → `renderForTruck, toggleCollapse, openNewViagem, editViagem, closeViagemForm, saveViagemForm, startViagem, finalizeViagem, cancelViagem, deleteViagem`
- `controle-viagens.activity.js` → `renderFor, submitComment, deleteComment`

- [ ] **Step 2: Confirmar wiring do `cv` global**

```
node -e "const fs = require('fs'); const j = fs.readFileSync('public/js/controle-viagens.js', 'utf8'); ['openDetail','closeDetail','saveDetailFields','saveDescricao','switchModalTab','toggleDetails','submitComment','deleteComment','openNewViagem','closeViagemForm','saveViagemForm','editViagem','startViagem','finalizeViagem','cancelViagem','deleteViagem','toggleViagem','setSort','manualRefresh'].forEach(fn => console.log(fn, ':', j.includes(fn + ':') || j.includes(fn + ' =') || j.includes(fn + ',')));"
```

Todos devem retornar `true`.

- [ ] **Step 3: Confirmar `api.delete`, `api.patch`, `api.post`, `api.get` existem**

```
grep -c "get:" public/js/api.js
grep -c "post:" public/js/api.js
grep -c "patch:" public/js/api.js
grep -c "delete:" public/js/api.js
```

Cada um deve ser `>= 1`. Se algum for 0, adicionar no arquivo o método faltante.

- [ ] **Step 4: Confirmar permission middleware existe**

```
node -e "const r = require('./src/middleware/permission'); console.log(typeof r)"
```

Esperado: `function`. (Já foi criado na v1, deve estar intacto.)

- [ ] **Step 5: Iniciar o servidor (smoke check sem DB)**

Tentar:
```
node src/server.js
```

(Use `Bash` com `run_in_background: true`.) Server deve subir e logar a porta. `prisma` vai falhar ao tentar conectar mas o express continua respondendo 401/403 nos endpoints que exigem auth.

Curl básico (rota requer auth, esperamos 401 sem token):
```
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3000/api/controle-viagens/board
```

Esperado: `401`. Se for `404`, a rota não foi montada — debug.

Matar o server depois (`TaskStop` no background task).

- [ ] **Step 6: Verificar lista de commits**

```
git log --oneline 5582635..HEAD
```

Esperado: lista limpa começando em `feat(controle-viagens-v2): schema...` e terminando no último commit da Task 11.

- [ ] **Step 7: Push da branch (mesma `feat/controle-viagens-kanban`)**

```
git push origin feat/controle-viagens-kanban
```

Como a branch já existe no remoto com os commits da v1, a v2 vai como novos commits em cima.

- [ ] **Step 8: Atualizar/recriar PR**

Se já existe PR aberto pra `feat/controle-viagens-kanban` → o push atualiza automaticamente.
Se não existe → criar novo PR pela URL: `https://github.com/lucasprimaveratransportadora-tech/acerto-viagens/pull/new/feat/controle-viagens-kanban`.

Body do PR deve mencionar: "v2 substitui v1 — viagens como entidade, activity log, painel direito de viagens, toggle ocultar detalhes."

---

## Self-review do plano

**Cobertura do spec:**
- §2 No escopo: 3 tabelas (Task 1), múltiplas viagens (Task 3), ciclo PLANEJADA→EM_CURSO→FINALIZADA (Task 3), campos persistem (Task 4 + 9), activity log (Task 2, 11), painel viagens (Task 10), toggle ocultar (Task 6 HTML + 7 CSS + 9 JS), sort por coluna (Task 8), busca expandida (Task 8), permission mantida (Task 5 routes), manutenção ortogonal (Task 4), comments soft-delete (Task 2).
- §4 Endpoints: todos os 13 cobertos na Task 5.
- §5 Campos por coluna: Task 9 mapeia exato `COLUMNS_INFO.fields`.
- §7 Fluxos críticos: nova carga (Task 10), iniciar (Task 10), mover (Task 8 + 4), finalizar (Task 10), comentar (Task 11).
- §10 Testes: deixados como itens futuros, plano cobre só implementação + smoke check.

**Placeholder scan:** Sem TBDs, TODOs vagos, ou "implement later". Todo código aparece literal.

**Consistência:** Nomes `truck_columns`, `truck_viagens`, `truck_activity_events` consistentes. Endpoints prefixados `/api/controle-viagens/`. Enum values escritos igual em SQL e Prisma. `getCurrentTruckId` e `getCurrentData` exportados pela modal.js e usados em viagens/activity. `cv.refreshAfterChange` definido em controle-viagens.js, usado pelos outros 3 arquivos JS.
