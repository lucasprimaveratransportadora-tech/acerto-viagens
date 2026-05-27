# Acerto de Viagem — Redesenho · Plano de Implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Resolver as 7 dores do Acerto de Viagem (numeração, identidade do card, autosave, status, impressão, 2 bugs do modal) em um único entregável — eliminando complexidade ao invés de adicionar.

**Architecture:** Adiciona numeração sequencial por empresa na tabela `trips` (via coluna desnormalizada `empresa_id` + `numero`). Origem/destino do card vêm do 1º CTE em runtime (sem persistir). Modal de edição é **deletado** — a view inline existente vira a única forma de editar. Impressão usa `window.print()` com CSS `@media print` dedicado. Sem novas dependências.

**Tech Stack:** Node.js + Express + Prisma 5 + PostgreSQL. Frontend vanilla JS modular (ESM). Sem framework de teste — verificação manual estruturada após cada tarefa.

**Spec:** [docs/superpowers/specs/2026-05-27-acerto-redesign-design.md](../specs/2026-05-27-acerto-redesign-design.md)

---

## Estrutura de arquivos

### Criar
- `prisma/migrations/20260527130000_trip_numero/migration.sql` — migration de schema + backfill
- `public/css/print.css` — CSS dedicado para impressão

### Modificar
- `prisma/schema.prisma` — adicionar `empresa_id` + `numero` na `Trip`, relation inversa na `Empresa`
- `src/services/trips.service.js` — geração de numero atômica + derivação origem/destino do 1º CTE
- `src/validators/trip.validator.js` — remover validações de `origem`/`destino`
- `public/index.html` — substituir `#tripModal` por `#newTripModal` (mini), importar `print.css`
- `public/js/trips.modal.js` — encolher para só conter abrir/salvar mini-modal de criação
- `public/js/trips.js` — adicionar `cycleTripStatus`, `printAcerto`, e helper `tripTitle`
- `public/js/dashboard.js` — novo header do card (#N + data + rota derivada), badge clicável, botão imprimir, remover botão editar

### Sem encostar (WIP do Kanban / outros módulos)
- `prisma/schema.prisma` — outras seções intocadas (Empresa, Truck, etc.)
- `src/services/controleViagens.service.js`, controllers e rotas do Kanban — não existem nesta branch
- `frete-terceiro.js`, `veiculos.js`, `trucks.modal.js`, `users.js`, `expenses.routes.js`, `fuels.service.js`, `ctes.service.js`

---

## FASE 1 — Schema + migration

### Task 1: Editar `prisma/schema.prisma`

**Files:**
- Modify: `prisma/schema.prisma` — modelo `Trip` (linhas 217-250 aprox.) + modelo `Empresa` (linhas 139-154 aprox.)

- [ ] **Step 1: Adicionar `empresa_id`, relation e `numero` no modelo Trip**

Localizar o bloco `model Trip { ... }` e adicionar os campos novos. O modelo atual tem `truck_id`, `truck`, `data_inicio`, etc. Adicionar logo depois de `truck`:

```prisma
model Trip {
  id           String      @id @default(uuid())
  truck_id     String
  truck        Truck       @relation(fields: [truck_id], references: [id])
  empresa_id   String
  empresa      Empresa     @relation(fields: [empresa_id], references: [id])
  numero       Int
  data_inicio  DateTime
  // ... resto dos campos como já estão
  // ... no fim, dentro do bloco:
  @@unique([empresa_id, numero])
  @@index([empresa_id])
  @@index([truck_id])
  @@index([data_inicio])
  @@index([imported_batch])
  @@map("trips")
}
```

(Mantém os índices que já existiam: `truck_id`, `data_inicio`, `imported_batch`. Adiciona os dois novos.)

- [ ] **Step 2: Adicionar relation inversa no modelo Empresa**

Localizar `model Empresa { ... }` e adicionar `trips` na lista de relations:

```prisma
model Empresa {
  id         String   @id @default(uuid())
  nome       String
  cnpj       String?  @unique
  // ... campos existentes
  users      User[]
  trucks     Truck[]
  attachments Attachment[]
  audit_logs   AuditLog[]
  login_events LoginEvent[]
  fretes_terceiros FreteTerceiro[]
  trips      Trip[]
  @@map("empresas")
}
```

- [ ] **Step 3: Verificar que o schema não tem erros de sintaxe**

Run: `npx prisma format`

Expected: comando termina sem erros e o arquivo é reformatado automaticamente. Se reclamar de relação faltando ou tipo inválido, corrigir antes de prosseguir.

- [ ] **Step 4: NÃO criar a migration via Prisma ainda**

A migration vai ser escrita à mão na Task 2 porque precisa de backfill customizado em SQL puro. Se rodar `prisma migrate dev` agora, ele criaria uma migration vazia ou pediria pra resolver inconsistência. Pular.

---

### Task 2: Criar a migration SQL com backfill

**Files:**
- Create: `prisma/migrations/20260527130000_trip_numero/migration.sql`

- [ ] **Step 1: Criar o diretório da migration**

Run: `New-Item -ItemType Directory -Force prisma/migrations/20260527130000_trip_numero`

Expected: diretório criado (ou já existe, sem erro).

- [ ] **Step 2: Escrever a migration.sql**

Criar `prisma/migrations/20260527130000_trip_numero/migration.sql` com o conteúdo exato:

```sql
-- 1. Adiciona colunas (nullable durante backfill)
ALTER TABLE "trips" ADD COLUMN "empresa_id" UUID;
ALTER TABLE "trips" ADD COLUMN "numero" INTEGER;

-- 2. Backfill empresa_id a partir de trucks
UPDATE "trips"
SET "empresa_id" = "trucks"."empresa_id"
FROM "trucks"
WHERE "trips"."truck_id" = "trucks"."id";

-- 3. Backfill numero em ordem cronologica por empresa (inclui soft-deleted)
WITH numbered AS (
  SELECT "id",
         ROW_NUMBER() OVER (
           PARTITION BY "empresa_id"
           ORDER BY "data_inicio" ASC, "created_at" ASC
         ) AS rn
  FROM "trips"
)
UPDATE "trips"
SET "numero" = numbered.rn
FROM numbered
WHERE "trips"."id" = numbered."id";

-- 4. Tornar NOT NULL apos backfill
ALTER TABLE "trips" ALTER COLUMN "empresa_id" SET NOT NULL;
ALTER TABLE "trips" ALTER COLUMN "numero" SET NOT NULL;

-- 5. FK + unique + index
ALTER TABLE "trips"
  ADD CONSTRAINT "trips_empresa_id_fkey"
  FOREIGN KEY ("empresa_id") REFERENCES "empresas"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE UNIQUE INDEX "trips_empresa_id_numero_key" ON "trips" ("empresa_id", "numero");
CREATE INDEX "trips_empresa_id_idx" ON "trips" ("empresa_id");
```

- [ ] **Step 3: Aplicar a migration no banco de dev**

Run: `npx prisma migrate deploy`

Expected:
- Mensagem `Applying migration '20260527130000_trip_numero'`
- Mensagem final `All migrations have been successfully applied.`
- Sem erro de violação de unique.

Se der erro de "FK not found" — significa que ainda existem trips com `truck_id` apontando pra trucks deletados (improvável). Investigar o caso específico no banco antes de prosseguir.

- [ ] **Step 4: Gerar o client Prisma atualizado**

Run: `npx prisma generate`

Expected: `✔ Generated Prisma Client (5.22.0)` ou similar. Sem erros.

- [ ] **Step 5: Verificar backfill no banco**

Abrir Prisma Studio: `npx prisma studio`

Navegar até a tabela `trips`. Verificar:
- Coluna `empresa_id` preenchida em todas as linhas
- Coluna `numero` preenchida em todas as linhas, sem repetição dentro da mesma `empresa_id`
- Numeração começa em 1 e segue a ordem cronológica

Fechar o Studio (Ctrl+C no terminal).

- [ ] **Step 6: Commit**

```bash
git add prisma/schema.prisma prisma/migrations/20260527130000_trip_numero/migration.sql
git commit -m "feat(acerto): schema com numero sequencial por empresa + backfill cronologico"
```

---

## FASE 2 — Backend (geração de número, derivação origem/destino)

### Task 3: Geração do número na criação da viagem

**Files:**
- Modify: `src/services/trips.service.js`

- [ ] **Step 1: Atualizar `TRIP_PATCH_FIELDS` e `TRIP_CREATE_FIELDS` para remover `origem` e `destino`**

Localizar linhas 15-20 do arquivo:

```javascript
const TRIP_PATCH_FIELDS = [
  'data_inicio', 'data_fim', 'origem', 'destino', 'carga', 'motorista',
  'km_total', 'status', 'adiantamento', 'observacoes',
  'km_inicial', 'km_final',
];
const TRIP_CREATE_FIELDS = [...TRIP_PATCH_FIELDS, 'imported_batch'];
```

Substituir por:

```javascript
const TRIP_PATCH_FIELDS = [
  'data_inicio', 'data_fim', 'carga', 'motorista',
  'km_total', 'status', 'adiantamento', 'observacoes',
  'km_inicial', 'km_final',
];
const TRIP_CREATE_FIELDS = [...TRIP_PATCH_FIELDS, 'imported_batch'];
```

(Removidos: `origem`, `destino`.)

- [ ] **Step 2: Modificar `create()` para gerar `numero` dentro da transação**

Localizar a função `create(truckId, empresaId, req, data)` (linha 119 aprox.). Dentro do `prisma.$transaction(async (tx) => {`, **antes** de `tx.trip.create`, adicionar o cálculo do próximo número:

```javascript
async function create(truckId, empresaId, req, data) {
  await verifyTruckOwnership(truckId, empresaId);

  const tripData = normalizeTripFields(pick(data, TRIP_CREATE_FIELDS));
  const ctes = Array.isArray(data?.ctes) ? data.ctes.map(normalizeCte) : null;
  const fuels = Array.isArray(data?.fuels) ? data.fuels.map(normalizeFuel) : null;

  const trip = await prisma.$transaction(async (tx) => {
    // Numero sequencial por empresa: MAX(numero) + 1.
    // Soft-deleted contam (numero ja consumido nunca eh reusado).
    const last = await tx.trip.findFirst({
      where: { empresa_id: empresaId },
      orderBy: { numero: 'desc' },
      select: { numero: true },
    });
    const proximoNumero = (last?.numero ?? 0) + 1;

    const created = await tx.trip.create({
      data: {
        ...tripData,
        truck_id: truckId,
        empresa_id: empresaId,
        numero: proximoNumero,
      },
    });
    if (ctes && ctes.length > 0) {
      await tx.cte.createMany({
        data: ctes.map((c) => ({ ...c, trip_id: created.id })),
      });
    }
    if (fuels && fuels.length > 0) {
      await tx.fuel.createMany({
        data: fuels.map((f) => ({ ...f, trip_id: created.id })),
      });
    }
    return tx.trip.findUnique({
      where: { id: created.id },
      include: { ctes: true, fuels: true, expenses: true },
    });
  }, {
    isolationLevel: 'Serializable',
  });

  await audit.log({ req, empresaId, entity: 'TRIP', action: 'CREATE', entityId: trip.id, before: null, after: trip });
  return trip;
}
```

Mudanças:
- Lê o último número da empresa dentro da transação.
- Passa `empresa_id` e `numero` no `tx.trip.create`.
- Adiciona `isolationLevel: 'Serializable'` ao `$transaction` para evitar dois `create` concorrentes pegarem o mesmo número.

- [ ] **Step 3: Criar a função auxiliar `deriveOrigemDestino` no topo do arquivo**

Logo após a função `normalizeFuel` (linha 59 aprox.), adicionar:

```javascript
// Origem/destino exibidos no card vem do 1o CTE (data ASC, created_at ASC).
// Fallback: campos legados origem/destino da Trip — para viagens criadas antes
// desta mudança. Sem CTE e sem legado: retorna null/null.
function deriveOrigemDestino(trip) {
  const ctes = Array.isArray(trip?.ctes) ? trip.ctes : [];
  if (ctes.length > 0) {
    const sorted = [...ctes].sort((a, b) => {
      const da = a.data ? new Date(a.data).getTime() : 0;
      const db = b.data ? new Date(b.data).getTime() : 0;
      if (da !== db) return da - db;
      const ca = a.created_at ? new Date(a.created_at).getTime() : 0;
      const cb = b.created_at ? new Date(b.created_at).getTime() : 0;
      return ca - cb;
    });
    const first = sorted[0];
    if (first?.origem || first?.destino) {
      return {
        origem_calc: first.origem || null,
        destino_calc: first.destino || null,
      };
    }
  }
  // Fallback para dados legados (Trips antigas que tinham origem/destino digitados)
  return {
    origem_calc: trip?.origem || null,
    destino_calc: trip?.destino || null,
  };
}
```

- [ ] **Step 4: Aplicar a derivação em `getById` e `listByTruck`**

Localizar `getById` (linha 96 aprox.). No final, antes do `return trip`, adicionar:

```javascript
async function getById(id, empresaId) {
  const trip = await prisma.trip.findFirst({
    where: {
      id,
      deleted_at: null,
      truck: { empresa_id: empresaId, deleted_at: null },
    },
    include: {
      ctes: true,
      fuels: true,
      expenses: true,
      truck: { select: { id: true, placa: true, modelo: true, motorista: true } },
      trip_anexos: {
        where: { deleted_at: null },
        orderBy: { created_at: 'desc' },
        select: TRIP_ANEXO_LIST_SELECT,
      },
    },
  });
  if (!trip) throw ApiError.notFound('Viagem não encontrada.');
  return { ...trip, ...deriveOrigemDestino(trip) };
}
```

Localizar `listByTruck` (linha 81 aprox.). Trocar o `return` por:

```javascript
async function listByTruck(truckId, empresaId) {
  await verifyTruckOwnership(truckId, empresaId);

  const trips = await prisma.trip.findMany({
    where: { truck_id: truckId, deleted_at: null },
    include: {
      ctes: true,
      fuels: true,
      expenses: true,
      _count: { select: { trip_anexos: { where: { deleted_at: null } } } },
    },
    orderBy: { data_inicio: 'desc' },
  });
  return trips.map((t) => ({ ...t, ...deriveOrigemDestino(t) }));
}
```

- [ ] **Step 5: Iniciar o app e testar criação manual de viagem**

Run: `npm run dev`

Em outra aba: abrir o app no browser, selecionar um caminhão na sidebar, clicar "+ Nova Viagem", preencher caminhão + data, salvar.

Verificar:
- Não dá erro 500.
- Resposta do POST contém os novos campos: `empresa_id`, `numero`, `origem_calc` (null), `destino_calc` (null).
- Inspecionar via Prisma Studio: a Trip criada tem `numero = MAX + 1`.

Parar o dev server (Ctrl+C).

- [ ] **Step 6: Commit**

```bash
git add src/services/trips.service.js
git commit -m "feat(acerto): gera numero sequencial na criacao + deriva origem/destino do 1o CTE"
```

---

### Task 4: Atualizar o validator

**Files:**
- Modify: `src/validators/trip.validator.js`

- [ ] **Step 1: Inspecionar o validator atual**

Run: `Get-Content src/validators/trip.validator.js`

Identificar as linhas que validam `origem` e `destino` (provavelmente algo como `body('origem').optional().isString()`).

- [ ] **Step 2: Remover as validações de `origem` e `destino`**

Editar o arquivo removendo as linhas que referenciam `origem` ou `destino` nos arrays `createTrip` e `updateTrip`. Manter todas as outras validações intactas.

- [ ] **Step 3: Testar via curl que POST sem origem/destino funciona**

Iniciar dev: `npm run dev` (em background ou outro terminal).

Em outro terminal, criar viagem nova via curl não é prático pois precisa de auth. Fazer pelo browser: criar mais uma viagem nova com sucesso, conferir no Studio.

Parar dev server.

- [ ] **Step 4: Commit**

```bash
git add src/validators/trip.validator.js
git commit -m "chore(acerto): valida sem origem/destino (campos viraram derivados)"
```

---

## FASE 3 — Card no dashboard (#N + data + rota derivada + status clicável)

### Task 5: Helper `tripTitle` e ajuste do header do card

**Files:**
- Modify: `public/js/dashboard.js` (função `renderMain`, área que renderiza cada `.trip-card`)
- Modify: `public/js/utils.js` (adicionar helper exportado)

- [ ] **Step 1: Adicionar helper `tripTitle` em `utils.js`**

Em `public/js/utils.js`, no fim do arquivo, adicionar:

```javascript
// Titulo curto do card: "#847" se a Trip tem numero, senao "—".
export function tripNumero(trip) {
  return trip?.numero != null ? '#' + trip.numero : '—';
}

// Rota derivada (origem_calc/destino_calc vem do backend a partir do 1o CTE).
// Se nao tem nada: "— sem CTE —". Se tem so um lado: mostra o que tem.
export function tripRota(trip) {
  const o = trip?.origem_calc;
  const d = trip?.destino_calc;
  if (!o && !d) return '— sem CTE —';
  if (o && d) return o + ' → ' + d;
  return o || d;
}
```

- [ ] **Step 2: Importar os helpers em `dashboard.js`**

Em `public/js/dashboard.js`, linha 5, atualizar o import:

```javascript
import { fmt, fmtD, esc, calcFrete, calcDesp, tripNumero, tripRota } from './utils.js';
```

- [ ] **Step 3: Trocar o header do card**

Localizar o bloco que renderiza `<div class="trip-header" ...>` (linha 99 aprox.). Substituir o conteúdo da `.trip-route` e da `.trip-date`:

Trecho antigo:

```javascript
html += `<div class="trip-card">
  <div class="trip-header" onclick="toggleTrip('${esc(tr.id)}')">
    <span class="trip-date">${fmtD(dateField)}</span>
    <span class="trip-route">${esc(tr.origem || '—')} <span class="route-arrow">→</span> ${esc(tr.destino || '—')}${tr.carga ? `<span class="cargo-tag">${esc(tr.carga)}</span>` : ''}</span>
    <div class="trip-nums">
      <span class="val pos">R$ ${fmt(f)}</span>
      <span class="val neg">- R$ ${fmt(d)}</span>
      <span class="val ${l >= 0 ? 'pos' : 'neg'}">${l >= 0 ? '=' : ''} R$ ${fmt(l)}</span>
      ${tr.km_total ? `<span style="color:var(--muted);font-size:.7rem">${parseInt(tr.km_total).toLocaleString('pt-BR')}km</span>` : ''}
    </div>
    <span class="status-badge ${sc}">${sl}</span>
    <div class="trip-actions">
      ${(tr._count?.trip_anexos > 0) ? `<button class="trip-folha-btn" data-trip-id="${esc(tr.id)}" onclick="event.stopPropagation();window.trpAnx?.openGlobalPane('${esc(tr.id)}')" title="Ver folha de acerto ao lado">&#x1F4CE; Folha</button>` : ''}
      <button class="action-btn" onclick="event.stopPropagation();editTrip('${esc(tr.id)}')" title="Editar">&#x270F;&#xFE0F;</button>
      <button class="action-btn del" onclick="event.stopPropagation();confirmDeleteTrip('${esc(tr.id)}')" title="Excluir">&#x1F5D1;&#xFE0F;</button>
    </div>
  </div>
  <div class="trip-detail" id="detail_${esc(tr.id)}">${buildDetail(tr)}</div>
</div>`;
```

Trecho novo:

```javascript
html += `<div class="trip-card" data-trip-id="${esc(tr.id)}">
  <div class="trip-header" onclick="toggleTrip('${esc(tr.id)}')">
    <span class="trip-numero">${tripNumero(tr)}</span>
    <span class="trip-date">${fmtD(dateField)}</span>
    <span class="trip-route">${esc(tripRota(tr))}${tr.carga ? `<span class="cargo-tag">${esc(tr.carga)}</span>` : ''}</span>
    <div class="trip-nums">
      <span class="val pos">R$ ${fmt(f)}</span>
      <span class="val neg">- R$ ${fmt(d)}</span>
      <span class="val ${l >= 0 ? 'pos' : 'neg'}">${l >= 0 ? '=' : ''} R$ ${fmt(l)}</span>
      ${tr.km_total ? `<span style="color:var(--muted);font-size:.7rem">${parseInt(tr.km_total).toLocaleString('pt-BR')}km</span>` : ''}
    </div>
    <span class="status-badge ${sc} clickable" onclick="event.stopPropagation();cycleTripStatus('${esc(tr.id)}',this)" title="Clique para alternar status">${sl}</span>
    <div class="trip-actions">
      ${(tr._count?.trip_anexos > 0) ? `<button class="trip-folha-btn" data-trip-id="${esc(tr.id)}" onclick="event.stopPropagation();window.trpAnx?.openGlobalPane('${esc(tr.id)}')" title="Ver folha de acerto ao lado">&#x1F4CE; Folha</button>` : ''}
      <button class="action-btn" onclick="event.stopPropagation();printAcerto('${esc(tr.id)}')" title="Imprimir folha do motorista">&#x1F5A8;&#xFE0F;</button>
      <button class="action-btn del" onclick="event.stopPropagation();confirmDeleteTrip('${esc(tr.id)}')" title="Excluir">&#x1F5D1;&#xFE0F;</button>
    </div>
  </div>
  <div class="trip-detail" id="detail_${esc(tr.id)}">${buildDetail(tr)}</div>
</div>`;
```

Mudanças:
- Adicionado `data-trip-id` no card (usado pelo modo de impressão).
- Novo `.trip-numero` com o `#N` antes da data.
- `.trip-route` usa `tripRota(tr)` (derivado) em vez de `tr.origem/destino`.
- Badge ganha `class="clickable"` e `onclick="cycleTripStatus(...)"`.
- Botão "Editar" (lápis) removido.
- Botão "Imprimir" (🖨️) adicionado em seu lugar.

- [ ] **Step 4: Adicionar estilos básicos para `.trip-numero` e `.status-badge.clickable`**

Localizar o `<style>` ou arquivo CSS principal. Procurar por `.trip-date` e adicionar logo abaixo:

```css
.trip-numero {
  font-family: 'IBM Plex Mono', monospace;
  font-size: .9rem;
  font-weight: 700;
  color: var(--accent);
  letter-spacing: .02em;
  min-width: 48px;
}
.status-badge.clickable {
  cursor: pointer;
  user-select: none;
  transition: filter .15s;
}
.status-badge.clickable:hover { filter: brightness(1.2); }
.status-badge.clickable.updating { opacity: .5; cursor: wait; }
```

Buscar onde adicionar: `Get-Content public/css/*.css | Select-String -Pattern "trip-date"` (ou usar Grep). Se for em `index.html` direto (estilos inline), adicionar lá.

- [ ] **Step 5: Verificar visualmente**

Run: `npm run dev`

Abrir o app, navegar até um caminhão com viagens. Confirmar:
- Cada card começa com `#N` (número da viagem) em cor de destaque.
- Logo após, a data.
- A rota mostra origem→destino do 1º CTE; se não tem CTE, mostra "— sem CTE —".
- Badge de status tem cursor de mão (pointer) ao passar mouse.
- Sumiu o botão lápis (editar); apareceu o botão 🖨️.
- Clicar no badge ainda **não funciona** (vamos implementar na próxima task).

Parar dev server.

- [ ] **Step 6: Commit**

```bash
git add public/js/utils.js public/js/dashboard.js public/index.html public/css
git commit -m "feat(acerto): card mostra #numero + rota derivada do CTE, botao imprimir"
```

*(Se o CSS foi pra dentro de `index.html`, o `git add public/css` será no-op — sem problema.)*

---

### Task 6: Implementar `cycleTripStatus`

**Files:**
- Modify: `public/js/trips.js`

- [ ] **Step 1: Adicionar o ciclo de status no fim do arquivo `trips.js`**

No final de `public/js/trips.js`, adicionar:

```javascript
// ==================== STATUS CYCLE ====================

const STATUS_NEXT = { PENDENTE: 'OK', OK: 'CANCELADA', CANCELADA: 'PENDENTE' };
const STATUS_LABEL = {
  OK:        ['status-ok',   '✅ Concluida'],
  PENDENTE:  ['status-pend', '⏳ Pendente'],
  CANCELADA: ['status-canc', '❌ Cancelada'],
};

window.cycleTripStatus = async function (tripId, badgeEl) {
  const tr = state.trips.find(t => t.id === tripId);
  if (!tr) return;
  const next = STATUS_NEXT[tr.status] || 'PENDENTE';

  badgeEl.classList.add('updating');
  try {
    await api.patch('/api/trips/' + tripId, { status: next });
    tr.status = next;

    // Atualiza somente o badge (sem re-render do card todo)
    const [cls, label] = STATUS_LABEL[next];
    badgeEl.className = 'status-badge ' + cls + ' clickable';
    badgeEl.textContent = label;
  } catch (e) {
    alert('Erro ao atualizar status: ' + e.message);
  } finally {
    badgeEl.classList.remove('updating');
  }
};
```

- [ ] **Step 2: Verificar imports**

Confirmar que `state` e `api` já estão importados no topo de `trips.js`. Olhar as linhas 1-5:

```javascript
import { api } from './api.js';
import { state, DESP } from './state.js';
```

Sim, já estão. Sem mudanças necessárias.

- [ ] **Step 3: Testar manualmente**

Run: `npm run dev`

Abrir o app, clicar no badge de uma viagem várias vezes. Verificar:
- 1º clique: Pendente → Concluída
- 2º clique: Concluída → Cancelada
- 3º clique: Cancelada → Pendente
- O texto e a cor mudam imediatamente.
- Refresh da página (F5) e o estado persistiu.
- Cliques rápidos não bagunçam (deve ficar "opacidade meia" durante o request).

Parar dev server.

- [ ] **Step 4: Commit**

```bash
git add public/js/trips.js
git commit -m "feat(acerto): clique no badge cicla status pendente/ok/cancelada"
```

---

## FASE 4 — Eliminar modal de edição

### Task 7: Substituir `#tripModal` por `#newTripModal` mini no HTML

**Files:**
- Modify: `public/index.html`

- [ ] **Step 1: Localizar o `<div id="tripModal">` em `index.html`**

Run: `Get-Content public/index.html | Select-String -Pattern "tripModal" -Context 2`

Anotar a linha inicial e final (provavelmente o modal vai de ~linha X até ~linha Y, com várias abas dentro).

- [ ] **Step 2: Substituir o modal inteiro**

Localizar o bloco `<div id="tripModal" ...>` até seu `</div>` fechador correspondente. Substituir pelo mini-modal:

```html
<!-- Mini-modal de criacao de viagem (so caminhao + data). Edicao eh toda inline. -->
<div id="newTripModal" class="modal-overlay">
  <div class="modal" style="max-width:420px">
    <div class="modal-hdr">
      <h3>📋 Nova Viagem</h3>
      <button class="modal-close" onclick="closeNewTripModal()">×</button>
    </div>
    <div class="modal-body">
      <div class="form-group">
        <label for="newTripTruck">Caminhão *</label>
        <select id="newTripTruck"></select>
      </div>
      <div class="form-group">
        <label for="newTripDate">Data de início *</label>
        <input type="date" id="newTripDate">
      </div>
    </div>
    <div class="modal-footer">
      <button class="btn btn-ghost" onclick="closeNewTripModal()">Cancelar</button>
      <button class="btn btn-accent" onclick="saveNewTrip()">Criar viagem</button>
    </div>
  </div>
</div>
```

(O nome de classes — `modal-overlay`, `modal`, `modal-hdr`, `modal-close`, `modal-body`, `modal-footer`, `btn`, `btn-ghost`, `btn-accent`, `form-group` — segue o padrão do `#confirmOverlay` que já existe. Conferir antes que essas classes existam.)

- [ ] **Step 3: Verificar visual**

Run: `npm run dev`

Abrir o app, clicar "+ Nova Viagem". Confirmar:
- Modal pequeno aparece com 2 campos.
- O botão "Cancelar" ainda quebra (esperado — vamos implementar na próxima task).
- O "Criar viagem" ainda quebra (esperado).

Parar dev server.

---

### Task 8: Reescrever `trips.modal.js` enxuto (só criação)

**Files:**
- Modify: `public/js/trips.modal.js` — substituir o arquivo inteiro

- [ ] **Step 1: Substituir o conteúdo de `trips.modal.js`**

O arquivo atual tem 324 linhas: `openTripModal`, `closeTripModal`, `editTrip`, `switchTab`, `addCteRow`, `updateCteTotals`, `addFuelRow`, `autoCalcFuelRow`, `updateFuelTotals`, `buildDespFields`, `updateDespTotal`, `saveTrip`. Tudo isso é eliminado.

Substituir todo o conteúdo por:

```javascript
// trips.modal.js — mini-modal para criacao de viagem (caminhao + data).
// Edicao eh toda inline no card (buildDetail em trips.js).

import { api } from './api.js';
import { state, setSelectedTruck } from './state.js';
import { esc } from './utils.js';
import { renderSidebar } from './sidebar.js';
import { renderMain } from './dashboard.js';

window.openTripModal = function (preTruckId) {
  const sel = document.getElementById('newTripTruck');
  sel.innerHTML = state.trucks.map(t =>
    `<option value="${esc(t.id)}">${esc(t.placa)}${t.modelo ? ' — ' + esc(t.modelo) : ''}</option>`
  ).join('');

  if (preTruckId) sel.value = preTruckId;
  else if (state.selectedTruckId) sel.value = state.selectedTruckId;

  document.getElementById('newTripDate').value = new Date().toISOString().split('T')[0];
  document.getElementById('newTripModal').classList.add('open');
};

window.closeNewTripModal = function () {
  document.getElementById('newTripModal').classList.remove('open');
};

window.saveNewTrip = async function () {
  const truckId = document.getElementById('newTripTruck').value;
  const date = document.getElementById('newTripDate').value;
  if (!truckId || !date) { alert('Informe o caminhao e a data!'); return; }

  const btn = document.querySelector('#newTripModal .btn-accent');
  const original = btn?.textContent;
  if (btn) { btn.disabled = true; btn.textContent = 'Criando...'; }

  try {
    const created = await api.post('/api/trips/truck/' + truckId, {
      data_inicio: date,
    });
    setSelectedTruck(truckId);
    window.closeNewTripModal();
    renderSidebar();
    await renderMain();

    // Auto-expande o card recem-criado para o usuario editar inline
    setTimeout(() => {
      const det = document.getElementById('detail_' + created.id);
      if (det) det.classList.add('open');
    }, 50);
  } catch (e) {
    alert('Erro ao criar viagem: ' + e.message);
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = original; }
  }
};
```

- [ ] **Step 2: Remover referências ao modal grande em outros arquivos**

Run: `Grep` por `editTrip` e `tripModal` no `public/js/` para encontrar referências.

Esperado:
- `dashboard.js`: já removemos o botão de editar na Task 5.
- `trip-anexos.js`: pode referenciar `tripModal` (painel lateral PDF). **Verificar** — se referenciar, será necessário ajustar.

Run: `Grep -r "tripModal\|editTrip" public/js/`

- [ ] **Step 3: Ajustar `trip-anexos.js` se necessário**

Se o arquivo referenciar `tripModal` (provável — pelo `closeTripModal` chamar `window.trpAnx.closePane()`), procurar onde a folha lateral é aberta/fechada e adaptar para abrir só na view inline em vez de no modal.

Se for um ajuste maior (>20 linhas), parar e pedir orientação ao usuário antes de prosseguir.

Se for só remover o gatilho `closeTripModal`, deletar o trecho.

- [ ] **Step 4: Verificar visual completo**

Run: `npm run dev`

Confirmar:
- "+ Nova Viagem" abre o mini-modal corretamente.
- Criar viagem → modal fecha → card aparece no dashboard → card abre automaticamente expandido.
- Edição inline funciona normalmente (faixa de info, CTEs, abastecimentos, despesas).
- Sem erros no console do browser.
- Nenhuma referência ao botão "Editar" antigo.

Parar dev server.

- [ ] **Step 5: Commit**

```bash
git add public/index.html public/js/trips.modal.js public/js/trip-anexos.js
git commit -m "refactor(acerto): elimina modal de edicao — fica so mini-modal de criacao"
```

---

## FASE 5 — Impressão

### Task 9: Criar `print.css`

**Files:**
- Create: `public/css/print.css`

- [ ] **Step 1: Criar o arquivo**

Criar `public/css/print.css` com:

```css
/* Impressao da folha de acerto — entregue ao motorista.
   Mostra so o card da Trip cujo id == body[data-print-trip], oculta o resto. */

@media print {
  /* Reset cores para impressao em preto-no-branco */
  body, .trip-card, .trip-detail, .detail-section {
    background: #fff !important;
    color: #000 !important;
  }

  /* Esconde tudo que e UI ambiente */
  .sidebar,
  .page-header,
  .kpi-row,
  .month-hdr,
  .trip-actions,
  .inline-add-row,
  .inline-del,
  .action-btn,
  .collapse-icon,
  .empty-state,
  #newTripModal,
  #confirmOverlay,
  .modal-overlay,
  .trip-folha-btn,
  .status-badge,
  .trip-info-bar .trip-info-input,
  .desp-inline-input[readonly],
  .desp-inline-input {
    display: none !important;
  }

  /* Esconde todos os cards exceto o que esta sendo impresso */
  .trip-card { display: none !important; }
  body[data-print-trip] .trip-card[data-trip-id-print="match"] { display: block !important; }

  /* Mostra todo o detail aberto */
  .trip-detail { display: block !important; }
  .trip-detail.open { display: block !important; }

  /* Header de impressao (inserido em tempo de print) */
  .print-header {
    display: block !important;
    text-align: center;
    padding: 8mm 0 6mm 0;
    border-bottom: 2px solid #000;
    margin-bottom: 6mm;
    page-break-after: avoid;
  }
  .print-logo {
    max-height: 28mm;
    margin: 0 auto 4mm auto;
    display: block;
  }
  .print-titulo {
    font-size: 18pt;
    font-weight: 800;
    letter-spacing: .04em;
    margin: 0 0 3mm 0;
  }
  .print-subtitulo {
    font-size: 11pt;
    display: flex;
    justify-content: center;
    gap: 12mm;
    flex-wrap: wrap;
  }
  .print-subtitulo strong { font-weight: 700; }

  /* Layout interno do card impresso — desconverte do grid em colunas */
  .detail-grid { display: block !important; }
  .detail-section { page-break-inside: avoid; margin-bottom: 4mm; border: 1px solid #999; padding: 2mm 3mm; }
  .detail-section-hdr { font-weight: 700; border-bottom: 1px solid #999; padding-bottom: 1mm; margin-bottom: 1mm; }
  .desp-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 1mm 6mm; }
  .desp-row { display: flex; justify-content: space-between; padding: 0.5mm 0; }
  .desp-row .desp-inline-input { display: inline !important; border: none !important; background: transparent !important; color: #000 !important; padding: 0; }

  /* Acerto final — sempre na mesma pagina que o resto se couber */
  .acerto-box {
    page-break-inside: avoid;
    border: 2px solid #000;
    padding: 3mm 4mm;
    margin-top: 4mm;
  }
  .acerto-line { display: flex; justify-content: space-between; padding: 1mm 0; }

  /* Cores semanticas — mantem so vermelho para destacar negativos */
  .val.pos, .acerto-line .al-val { color: #000 !important; }
  .val.neg { color: #b91c1c !important; }

  /* Tabelas internas */
  table.mini-table { width: 100%; border-collapse: collapse; }
  table.mini-table th, table.mini-table td { border: 1px solid #ccc; padding: 1mm 2mm; font-size: 9pt; }

  @page {
    size: A4 portrait;
    margin: 10mm;
  }
}

/* Header de impressao - hidden em tela */
.print-header { display: none; }
```

- [ ] **Step 2: Importar `print.css` em `index.html`**

Localizar onde os outros CSS são importados (`<link rel="stylesheet" ...>` no `<head>`). Adicionar:

```html
<link rel="stylesheet" href="/css/print.css">
```

Se o projeto não tem CSS separados (tudo inline no `<style>`), adicionar dentro do `<style>` o conteúdo do print.css.

- [ ] **Step 3: Verificar carregamento**

Run: `npm run dev`

Abrir DevTools → Network. F5 na página. Verificar que `print.css` carregou com 200.

Parar dev server.

---

### Task 10: Implementar `printAcerto` em trips.js

**Files:**
- Modify: `public/js/trips.js`

- [ ] **Step 1: Adicionar `printAcerto` no fim de `trips.js`**

```javascript
// ==================== PRINT ACERTO ====================

window.printAcerto = function (tripId) {
  const tr = state.trips.find(t => t.id === tripId);
  if (!tr) { alert('Viagem nao encontrada.'); return; }

  // Marca somente o card alvo
  document.querySelectorAll('.trip-card').forEach(c => c.removeAttribute('data-trip-id-print'));
  const card = document.querySelector(`.trip-card[data-trip-id="${tripId}"]`);
  if (!card) { alert('Card nao encontrado.'); return; }
  card.setAttribute('data-trip-id-print', 'match');

  // Garante que o detail esta aberto
  const det = document.getElementById('detail_' + tripId);
  if (det) det.classList.add('open');

  // Insere/atualiza o header de impressao no body
  let header = document.getElementById('printHeader');
  if (!header) {
    header = document.createElement('div');
    header.id = 'printHeader';
    header.className = 'print-header';
    document.body.insertBefore(header, document.body.firstChild);
  }

  const truck = tr.truck || state.trucks.find(t => t.id === tr.truck_id) || {};
  const dt = (s) => s ? new Date(String(s).slice(0,10) + 'T12:00:00').toLocaleDateString('pt-BR') : '—';
  const periodo = dt(tr.data_inicio) + (tr.data_fim ? '  →  ' + dt(tr.data_fim) : '');
  const motorista = tr.motorista || truck.motorista || '—';
  const placa = truck.placa || '—';
  const numero = tr.numero != null ? tr.numero : '—';

  header.innerHTML = `
    <img src="/assets/images/logo-full.png" class="print-logo" alt="Prima Transportes">
    <div class="print-titulo">ACERTO Nº ${numero}</div>
    <div class="print-subtitulo">
      <div>Placa: <strong>${esc(placa)}</strong></div>
      <div>Motorista: <strong>${esc(motorista)}</strong></div>
      <div>Periodo: <strong>${periodo}</strong></div>
    </div>
  `;

  document.body.setAttribute('data-print-trip', tripId);

  // Cleanup apos imprimir/cancelar
  const onAfter = () => {
    document.body.removeAttribute('data-print-trip');
    if (card) card.removeAttribute('data-trip-id-print');
    window.removeEventListener('afterprint', onAfter);
  };
  window.addEventListener('afterprint', onAfter);

  window.print();
};
```

- [ ] **Step 2: Garantir que `esc` está importado**

Conferir as linhas 1-5 de `trips.js`:

```javascript
import { fmt, fmtD, esc, calcFrete, calcDesp } from './utils.js';
```

Sim, `esc` já está.

- [ ] **Step 3: Testar impressão**

Run: `npm run dev`

Abrir o app, expandir uma viagem com dados (CTEs, abast, despesas). Clicar no botão 🖨️ no header do card.

Verificar no preview do navegador:
- Logo Prima aparece centralizada no topo.
- "ACERTO Nº 847" embaixo da logo.
- "Placa", "Motorista", "Periodo" na linha de baixo.
- Sidebar não aparece.
- KPIs não aparecem.
- Cabeçalho do mês não aparece.
- Só essa Trip aparece (outras viagens sumiram).
- CTEs, abastecimentos, despesas, saldo aparecem.
- Botões de ação (✏️, 🗑️, 🖨️) escondidos na impressão.

Fechar o preview (Cancelar / Esc).

- [ ] **Step 4: Salvar como PDF**

No mesmo preview de impressão, escolher "Salvar como PDF" no destino. Salvar em uma pasta. Abrir o PDF e conferir que está fiel ao preview.

Parar dev server.

- [ ] **Step 5: Commit**

```bash
git add public/css/print.css public/index.html public/js/trips.js
git commit -m "feat(acerto): impressao da folha do motorista via window.print + CSS dedicado"
```

---

## FASE 6 — Verificação final

### Task 11: Verificação ponta-a-ponta

**Files:** nenhum

- [ ] **Step 1: Rodar dev server**

Run: `npm run dev`

- [ ] **Step 2: Checklist visual completo**

Marcar cada item conforme verifica no browser:

1. [ ] Sidebar mostra a lista de caminhões.
2. [ ] Selecionar um caminhão → lista de viagens aparece.
3. [ ] Cada card mostra `#N data rota R$.... [badge]`.
4. [ ] Viagens antigas têm números sequenciais começando em #1.
5. [ ] Viagem sem CTE: mostra "— sem CTE —" no lugar da rota.
6. [ ] Clicar no card → expande detalhes inline.
7. [ ] Adicionar CTE inline (com data, número, origem, destino, valor) → salva sem erro.
8. [ ] Card atualiza a rota com a origem/destino do novo CTE.
9. [ ] Adicionar abastecimento inline → salva, total atualiza, despesa "Abastecimento (auto)" reflete.
10. [ ] Editar campo de despesa inline → salva.
11. [ ] Clicar badge de status → cicla Pendente→Concluída→Cancelada→Pendente. Persiste após reload.
12. [ ] Botão "+ Nova Viagem" abre mini-modal (caminhão + data).
13. [ ] Criar nova viagem → recebe próximo número (#N+1), card aparece já expandido.
14. [ ] Botão 🖨️ no card abre preview de impressão fiel ao layout esperado.
15. [ ] "Salvar como PDF" do preview gera PDF legível.
16. [ ] Botão 🗑️ (excluir) ainda funciona, com confirmação.
17. [ ] Nenhum erro no console do browser.
18. [ ] Folha de acerto anexada (📎) — abre painel lateral PDF se a viagem tem anexo (testar com uma que tenha).

- [ ] **Step 3: Conferir banco**

Run: `npx prisma studio` (em outro terminal)

Verificar tabela `trips`:
- Todas as linhas têm `empresa_id` preenchido.
- Todas têm `numero` preenchido.
- Sem duplicação de `(empresa_id, numero)`.
- Maior `numero` por empresa = quantidade de viagens daquela empresa.

Fechar Studio.

- [ ] **Step 4: Confirmar branch limpo**

```bash
git status
git log --oneline -10
```

Esperado: working tree limpo, últimos commits são:
- `feat(acerto): impressao da folha do motorista via window.print + CSS dedicado`
- `refactor(acerto): elimina modal de edicao — fica so mini-modal de criacao`
- `feat(acerto): clique no badge cicla status pendente/ok/cancelada`
- `feat(acerto): card mostra #numero + rota derivada do CTE, botao imprimir`
- `chore(acerto): valida sem origem/destino (campos viraram derivados)`
- `feat(acerto): gera numero sequencial na criacao + deriva origem/destino do 1o CTE`
- `feat(acerto): schema com numero sequencial por empresa + backfill cronologico`
- `docs(acerto): spec do redesenho — numeração, identidade, inline, impressão`

- [ ] **Step 5: Não fazer merge nem push automático**

Parar dev server. Reportar conclusão ao usuário com a lista de commits. Ele decide se vai abrir PR, mergear, push, etc.

---

## Riscos & rollback

| Risco | Mitigação |
|---|---|
| Migração falha em produção | Migration usa `ADD COLUMN` nullable + backfill + `SET NOT NULL` (3 passos atômicos). Se o backfill falhar, `prisma migrate deploy` aborta e o schema fica nullable — corrigir e retentar. |
| Dois `create` concorrentes → mesmo número | `isolationLevel: 'Serializable'` na transação. Para empresa de baixa concorrência (caso atual) é suficiente. |
| Viagens legadas sem CTE viram "— sem CTE —" | Fallback no service usa `trip.origem`/`trip.destino` legados se existirem. |
| Botão "Editar" antigo referenciado em algum lugar | Grep removeu todas as referências na Task 8. |
| `trip-anexos.js` referencia `tripModal` | Tratado explicitamente na Task 8 Step 3. |
| CSS de impressão quebra em outros navegadores | Alvo é Chrome (browser principal do gestor). Safari/Firefox aceitam o mesmo CSS. |
| Modal grande deletado, mas usuário precisava de algum campo | Todos os campos do modal antigo (data início, fim, motorista, KM, status, adiantamento, observações, CTEs, abastecimentos, despesas, folha) já existem na view inline. Verificado no Step 2 da Task 8. |

---

## Out of scope (não implementar)

- Reordenar/renumerar viagens manualmente.
- Filtro/busca por número da viagem.
- Imprimir várias viagens em lote.
- Email automático do PDF pro motorista.
- Numeração com prefixo customizável.
