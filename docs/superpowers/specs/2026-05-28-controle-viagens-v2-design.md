# Controle de Viagens v2 — Viagens como Entidade + Activity Log + UI Trello

**Data:** 2026-05-28
**Autor:** brainstorming session com Lucas
**Estado:** aprovado para implementação
**Substitui:** [2026-05-27-controle-viagens-kanban-design.md](2026-05-27-controle-viagens-kanban-design.md) (v1 nunca aplicada em produção)

## 1. Objetivo

Evoluir o módulo Controle de Viagens pra que cada **carga** seja uma entidade própria (`TruckViagem`), com ciclo de vida (PLANEJADA → EM_CURSO → FINALIZADA/CANCELADA) e histórico permanente por caminhão. Adiciona **log de atividade auditável e visível na UI** (movimentações entre colunas, edições de campos, criação/finalização de viagens, comentários humanos misturados na mesma timeline estilo Trello). Reorganiza o modal pra mostrar uma lista de viagens (current + planejadas + histórico) na lateral direita, com toggle "Mostrar/Ocultar detalhes" estilo Trello.

A v1 ainda não chegou em produção — esta v2 substitui o schema e a implementação.

## 2. Escopo

### No escopo

- Substituir `TruckOperationalState` (1-1) e `TruckOperationalComment` (timeline simples) por:
  - `TruckColumn` (1-1 com Truck) — posição atual no Kanban
  - `TruckViagem` (N-1 com Truck) — cada carga é uma entidade
  - `TruckActivityEvent` (N-1 com Truck, opcional N-1 com Viagem) — log unificado
- **Múltiplas viagens ativas por caminhão** (PLANEJADA + EM_CURSO em paralelo). No máximo uma EM_CURSO por vez.
- Botão "Nova carga" no card e no modal cria viagem PLANEJADA.
- Ciclo de viagem: PLANEJADA → EM_CURSO (botão "Iniciar") → FINALIZADA (botão "Finalizar") ou CANCELADA.
- Persistência dos campos da viagem ao mover entre colunas (carga, datas, fábrica, valor frete não se perdem).
- Campos por coluna (ver §5).
- Activity log unificado mostrando: COLUMN_MOVED, VIAGEM_CREATED, VIAGEM_FIELD_EDITED, VIAGEM_STARTED, VIAGEM_FINALIZED, VIAGEM_CANCELLED, COMMENT.
- Modal Trello-like com painel de viagens à direita (atual expandida, planejadas expandidas, finalizadas colapsadas) + activity log no painel esquerdo inferior.
- Toggle "Mostrar/Ocultar detalhes" — ocultar esconde Status/Descrição, mantém Atividade & Viagens.
- Sort por coluna no quadro (data coleta ↑↓, data agendamento ↑↓). Persiste por usuário em localStorage.
- Busca global no quadro (placa, motorista, modelo, carga, origem, destino, cliente, fábrica).
- Permissão `controle-viagens` mantida (ADMIN bypassa).
- Manutenção como coluna ortogonal (não cancela viagens em curso).
- Comentários com soft-delete (próprio autor ou ADMIN), eventos automáticos não-apagáveis.
- AuditLog (entity TRUCK) continua registrando mudanças estruturais, em paralelo ao activity_events visível na UI.

### Fora do escopo

- Migrar dados do schema v1 (v1 nunca foi aplicada em prod — descartar limpo).
- Integração automática com módulo Acerto de Viagem (criar Trip a partir de Viagem finalizada).
- Notificações push / e-mail quando viagem finaliza.
- WebSocket / SSE (polling 20s segue suficiente).
- Anexos de viagem (CT-e, fotos da carga, etc.) — fica pra v3.
- Relatórios / dashboards baseados no histórico de viagens.
- Filtros avançados (período, motorista, etc.) além do sort por coluna e busca global.
- "Iniciar viagem automático" ao mover pra INDO_CARREGAR (mantém manual pra evitar ambiguidades).

## 3. Arquitetura

### 3.1 Backend

Stack mantida: Node 20, Express 4, Prisma 5.22, PostgreSQL. Padrões de service/controller/route/validator do projeto.

Arquivos reescritos (já existem na v1, conteúdo trocado):
```
src/services/controleViagens.service.js
src/controllers/controleViagens.controller.js
src/routes/controleViagens.routes.js
src/validators/controleViagens.validator.js
```

Novos arquivos:
```
src/services/controleViagensActivity.service.js  -- registro de eventos no activity log
prisma/migrations/20260528120000_controle_viagens_v2/migration.sql
```

Reaproveitam:
```
src/middleware/permission.js                     -- requirePermission (já existe)
src/middleware/auth.js / tenant.js               -- (já existem)
src/services/audit.service.js                    -- AuditLog continua sendo usado
```

### 3.2 Frontend

Arquivos reescritos:
```
public/js/controle-viagens.js          -- board, sort por coluna, polling, busca global
public/js/controle-viagens.modal.js    -- modal Trello-like com 2 painéis + toggle
public/css/controle-viagens.css        -- estilos atualizados
```

Novos arquivos:
```
public/js/controle-viagens.viagens.js  -- painel de viagens (CRUD, listagem, start/finalize)
public/js/controle-viagens.activity.js -- timeline de atividades + comentários
```

`public/index.html`: pequenos ajustes na estrutura do `#controleViagensView` pra acomodar os 2 painéis + toggle (sem mexer no hub-card ou nas module-tabs).

### 3.3 Modelo de dados

#### Migration estratégia

A migration v1 (`20260527120000_controle_viagens`) ainda não foi aplicada em prod. A migration v2 (`20260528120000_controle_viagens_v2`) drops as 2 tabelas da v1 e cria as 3 novas. Como ambas estão na mesma branch nunca-merged, na prática a migration v1 será **deletada do repositório** e substituída pela v2 (mais limpo do que dois migrations sequenciais).

#### Schema Prisma final

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
  COLUMN_MOVED          // payload: { from, to }
  VIAGEM_CREATED        // payload: { viagem_id, snapshot }
  VIAGEM_FIELD_EDITED   // payload: { viagem_id, field, before, after }
  VIAGEM_STARTED        // payload: { viagem_id }
  VIAGEM_FINALIZED      // payload: { viagem_id, data_entrega_realizada }
  VIAGEM_CANCELLED      // payload: { viagem_id, motivo? }
  VIAGEM_DELETED        // payload: { viagem_id, snapshot }
  COMMENT               // payload: { texto }
  COLUMN_FIELD_EDITED   // payload: { field, before, after } -- pra manutencao_descricao OU descricao_geral
}

model TruckColumn {
  id                       String             @id @default(uuid())
  truck_id                 String             @unique
  truck                    Truck              @relation(fields: [truck_id], references: [id], onDelete: Cascade)
  coluna                   TruckKanbanColumn  @default(VAZIO_AGUARDANDO_CARGA)
  manutencao_descricao     String?            // só usado em EM_MANUTENCAO
  descricao_geral          String?            // observação livre, persiste entre colunas e viagens
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
  fabrica                     String?             // preenchido em INDO/NA_FABRICA
  cliente_descarga            String?             // preenchido em EM_DESCARGA
  valor_frete                 Decimal?            @db.Decimal(12, 2)
  data_coleta                 DateTime?           @db.Date   // INDO/NA_FABRICA
  data_carregamento           DateTime?           @db.Date   // CARREGADO (puxa de data_coleta se vazio)
  data_agendamento_entrega    DateTime?           @db.Date   // INDO/NA_FABRICA/CARREGADO
  data_entrega_realizada      DateTime?           @db.Date   // setada ao finalizar

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
  payload       Json                // shape varia por tipo (ver enum acima)

  author_id     String?
  author        User?               @relation("TruckActivityAuthor", fields: [author_id], references: [id], onDelete: SetNull)
  author_email  String              // snapshot — sobrevive se user for excluído
  author_nome   String              // snapshot

  created_at    DateTime            @default(now())
  deleted_at    DateTime?           // soft delete (apenas COMMENT)
  deleted_by_id String?

  @@index([truck_id, created_at(sort: Desc)])
  @@index([viagem_id, created_at(sort: Desc)])
  @@index([tipo])
  @@map("truck_activity_events")
}
```

Relações inversas em `Truck` e `User` (substituem as da v1):

```prisma
// Em Truck:
column              TruckColumn?
viagens             TruckViagem[]
activity_events     TruckActivityEvent[]

// Em User:
truck_column_updates    TruckColumn[]         @relation("TruckColumnUpdatedBy")
truck_viagens_created   TruckViagem[]         @relation("TruckViagemCreatedBy")
truck_activity_authored TruckActivityEvent[]  @relation("TruckActivityAuthor")
```

#### Regra de invariante

- Um Truck tem no máximo **1 viagem em status `EM_CURSO`** ao mesmo tempo (enforced no service, não como constraint no banco — facilita transições).
- Manutenção não cancela viagem EM_CURSO; só altera `truck_columns.coluna` para `EM_MANUTENCAO`. A viagem segue como EM_CURSO no banco; ao voltar pra operação, o usuário decide qual coluna assumir.

## 4. Endpoints REST

Todos sob `/api/controle-viagens`. `auth + tenant + requirePermission('controle-viagens')`. Filtragem por `empresa_id` do usuário logado.

| Método | Caminho | Função |
|---|---|---|
| GET    | `/board`                                    | Lista caminhões ativos com coluna + viagem EM_CURSO + contadores. Endpoint do polling. |
| GET    | `/truck/:truckId`                           | Detalhe: column + todas viagens (paginação opcional pras finalizadas) + 50 últimos events. |
| PATCH  | `/truck/:truckId/column`                    | Move o card. Registra `COLUMN_MOVED`. Body: `{ coluna, manutencao_descricao?, descricao_geral? }` |
| PATCH  | `/truck/:truckId/column/descricao`          | Atualiza só `descricao_geral` (sem mudar coluna). |
| POST   | `/truck/:truckId/viagens`                   | Cria viagem PLANEJADA. Body: campos da viagem. Registra `VIAGEM_CREATED`. |
| GET    | `/truck/:truckId/viagens`                   | Lista viagens do caminhão (params: status, paginação). |
| PATCH  | `/viagens/:viagemId`                        | Edita campos. Registra um `VIAGEM_FIELD_EDITED` por campo alterado. |
| POST   | `/viagens/:viagemId/start`                  | PLANEJADA → EM_CURSO. Falha se já tem outra EM_CURSO no mesmo truck. Registra `VIAGEM_STARTED`. |
| POST   | `/viagens/:viagemId/finalize`               | → FINALIZADA. Body opcional `{ data_entrega_realizada }` (default: hoje). Registra `VIAGEM_FINALIZED`. |
| POST   | `/viagens/:viagemId/cancel`                 | → CANCELADA. Body opcional `{ motivo }`. Registra `VIAGEM_CANCELLED`. |
| DELETE | `/viagens/:viagemId`                        | Soft-delete. Permitido apenas se status = PLANEJADA. Registra `VIAGEM_DELETED`. |
| GET    | `/truck/:truckId/activity`                  | Activity log paginado (cursor por created_at). Mistura comentários e eventos auto. |
| POST   | `/truck/:truckId/comments`                  | Cria event tipo COMMENT. Body: `{ texto, viagem_id? }`. |
| DELETE | `/activity/:eventId`                        | Soft-delete só de eventos COMMENT. Autor ou ADMIN. |

**`GET /board` retorna** (formato):

```json
{
  "board": [
    {
      "truck": { "id", "placa", "modelo", "motorista", "carreta_placa" },
      "column": { "coluna", "manutencao_descricao", "descricao_geral", "updated_at", "updated_by": {...} },
      "viagem_em_curso": { /* TruckViagem completa ou null */ },
      "viagens_planejadas_count": 2,
      "activity_count": 17,
      "last_activity_at": "2026-05-28T14:30:00Z"
    }
  ],
  "fingerprint": "12-1716901800000-1716902400000"
}
```

Fingerprint = `{trucks.length}-{maxColumnUpdatedAt}-{maxActivityAt}`. Polling reusa pra evitar re-render.

## 5. Campos contextuais por coluna

| Coluna | Campos editáveis no painel "Status atual" |
|---|---|
| VAZIO AGUARDANDO CARGA | (nenhum) |
| INDO CARREGAR | Fábrica · Data coleta · Data agendamento entrega · Carga · Valor frete |
| NA FÁBRICA | Mesmos da INDO CARREGAR (persistem; pode editar) |
| CARREGADO EM VIAGEM | Carga · Data carregamento (puxa de data coleta se vazio) · Data agendamento entrega · Valor frete |
| EM DESCARGA NO CLIENTE | Cliente · Data agendamento entrega · Carga (read-only) |
| EM MANUTENÇÃO | Descrição da manutenção (`truck_columns.manutencao_descricao`) |

**Importante**: os campos de Fábrica, Carga, Datas, Valor frete vivem em `truck_viagens`, NÃO em `truck_columns`. O modal opera na viagem EM_CURSO quando houver uma. Se não houver viagem EM_CURSO e a coluna não for VAZIO/MANUTENÇÃO, a UI sugere "Criar nova viagem" (não dá pra preencher campos sem viagem).

**Bloco "Descrição"** (texto livre): vive em `truck_columns.descricao_geral`, persiste entre colunas E viagens (é observação do caminhão, não da carga).

## 6. UX e identidade visual

### 6.1 Quadro

Mesma identidade da v1 (faixas coloridas por coluna, card com placa+motorista+modelo, contador). Acréscimos v2:

- **Sort por coluna**: dropdown discreto `⇅` no header de cada coluna. Opções: Padrão / Data coleta ↑ / Data coleta ↓ / Data agendamento ↑ / Data agendamento ↓. Persistido em `localStorage.cv_sort_<status>` por usuário.
- **Busca global**: input no topo do board (já existia) — agora busca também em campos da viagem ativa.
- **Card** mostra placa, motorista, modelo, e na linha de baixo mostra info da viagem EM_CURSO se houver (origem→destino + data próxima relevante).
- **Badge no card** indica se há viagens PLANEJADAS pendentes (ex.: `📋 2`).

### 6.2 Modal (layout principal)

```
+-----------------------------------------------------------------------------------+
| [ COLUNA ATUAL ▾ ]              [ Mostrar/Ocultar detalhes ]    [⋯]   [✕]         |
+-----------------------------------------+-----------------------------------------+
| Título (placa — motorista)              | 📋 VIAGENS                              |
| Modelo + carreta                        | [ + Nova carga ]                        |
|                                         |                                         |
| ┌─ STATUS ATUAL ──────────────────────┐ | ▼ Viagem EM_CURSO (expandida)           |
| │ campos da coluna (ver §5)            │ |   origem→destino · valor frete         |
| │                          [ Salvar ]  │ |   datas relevantes                     |
| └─────────────────────────────────────┘ |   [Iniciar/Finalizar/Cancelar/Editar]  |
|                                         |                                         |
| ┌─ DESCRIÇÃO ─────────────────[ Edit ]┐ | ▼ PLANEJADAS (expandidas)              |
| │ texto livre persistente              │ |   ...                                   |
| └─────────────────────────────────────┘ |                                         |
|                                         | ▶ FINALIZADAS (colapsadas)             |
| ┌─ ATIVIDADE & COMENTÁRIOS ──────────┐ | ▶ MOOCA SP X RJ  · 24-27/05  R$7.800  |
| │ [ Escrever um comentário... ]      │ | ▶ BH X SP        · 20-23/05  R$6.400  |
| │                          [Enviar]  │ |                                         |
| │ ────────────────────────────────── │ |                                         |
| │ timeline mista (eventos + comments)│ |                                         |
| └────────────────────────────────────┘ |                                         |
+-----------------------------------------+-----------------------------------------+
```

**Toggle "Mostrar/Ocultar detalhes"**:
- ON (default): layout acima (2 painéis com STATUS + DESCRIÇÃO + ATIVIDADE à esquerda).
- OFF: esconde os blocos STATUS e DESCRIÇÃO da esquerda; restam só Atividade & Comentários (full-width esquerda) + painel de Viagens à direita. Útil pra ver histórico sem ruído.

**Ícones do activity log**:
- `●` COMMENT (cor accent vermelho)
- `↻` COLUMN_MOVED (azul)
- `✚` VIAGEM_CREATED / VIAGEM_STARTED (verde)
- `✎` VIAGEM_FIELD_EDITED / COLUMN_FIELD_EDITED (amarelo)
- `🏁` VIAGEM_FINALIZED (verde escuro)
- `✕` VIAGEM_CANCELLED / VIAGEM_DELETED (cinza)

Texto do evento gerado no frontend a partir do `tipo` + `payload`. Ex.:
- `COLUMN_MOVED { from: "NA_FABRICA", to: "CARREGADO_EM_VIAGEM" }` → "Lucas moveu de **NA FÁBRICA** → **CARREGADO EM VIAGEM** · há 2h"
- `VIAGEM_FIELD_EDITED { viagem_id, field: "valor_frete", before: 8200, after: 8290 }` → "Lucas alterou **valor frete** de R$ 8.200,00 → R$ 8.290,00 · há 2h"

### 6.3 Painel de viagens (lateral direita)

Cada item da lista exibe:
- Título: `origem → destino` (ou "Nova carga" se vazio)
- Status badge: `EM_CURSO` / `PLANEJADA` / `FINALIZADA` / `CANCELADA`
- Datas resumidas + valor frete
- Botões contextuais por status:
  - PLANEJADA: `Iniciar`, `Editar`, `Cancelar`, `Apagar`
  - EM_CURSO: `Finalizar`, `Editar`, `Cancelar`
  - FINALIZADA: `Editar observações` (não muda dados estruturais)
  - CANCELADA: (somente leitura)

Click no header colapsa/expande. Default:
- EM_CURSO sempre expandida
- PLANEJADAS expandidas
- FINALIZADAS/CANCELADAS colapsadas

Botão **"+ Nova carga"** abre sub-modal com form de viagem (origem, destino, carga, valor frete, datas opcionais). Submit cria PLANEJADA e fecha sub-modal.

### 6.4 Mobile (≤ 768px)

- Modal vira 3 abas: **Detalhes** | **Atividade** | **Viagens**
- Toggle de ocultar detalhes some (cada aba já é uma "visão filtrada")
- Painel de Viagens mantém layout expandir/colapsar funcionando.

## 7. Fluxos críticos

### 7.1 Criar nova carga (planejada)
1. User clica "+ Nova carga" no painel direito (ou no card direto via menu).
2. Frontend abre sub-modal com form.
3. POST `/truck/:truckId/viagens` cria viagem PLANEJADA.
4. Service registra event `VIAGEM_CREATED` no `truck_activity_events` (payload = snapshot da viagem).
5. AuditLog registra entry com entity TRUCK, action UPDATE.
6. Frontend prepende viagem na lista; activity log atualizado no próximo refresh do board (ou imediato via fetch).

### 7.2 Iniciar viagem
1. User clica "Iniciar" numa viagem PLANEJADA.
2. POST `/viagens/:viagemId/start`.
3. Service valida que nenhuma outra viagem do mesmo truck está EM_CURSO. Se houver, retorna 409 Conflict.
4. Marca a viagem como EM_CURSO. Registra `VIAGEM_STARTED`.
5. Frontend re-renderiza painel. Sugere via toast "Mover caminhão pra INDO CARREGAR?" com botão de atalho.

### 7.3 Mover entre colunas
1. User arrasta o card ou usa dropdown.
2. PATCH `/truck/:truckId/column` com `{ coluna }` e opcionalmente `manutencao_descricao` se for MANUTENÇÃO.
3. Service atualiza `truck_columns.coluna`. Registra `COLUMN_MOVED` (payload `{ from, to }`).
4. Se a coluna alvo for INDO/FABRICA/CARREGADO/DESCARGA e o truck NÃO tem viagem EM_CURSO, frontend mostra toast "Crie ou inicie uma viagem pra preencher detalhes desta coluna" — não bloqueia.

### 7.4 Editar campos da viagem
1. User clica "Editar" numa viagem (ou edita inline campos do "Status atual" no modal principal — que opera na viagem EM_CURSO).
2. PATCH `/viagens/:viagemId` com diff dos campos.
3. Service compara before/after e registra **um** `VIAGEM_FIELD_EDITED` por campo alterado (várias entries possíveis numa só request).
4. AuditLog também registra a mudança como entity TRUCK_VIAGEM (novo entity_type) ou TRUCK.

### 7.5 Mover de NA FÁBRICA pra CARREGADO EM VIAGEM
1. User arrasta. Coluna muda.
2. UI do modal pega os valores atuais da viagem (`data_coleta`, `data_agendamento_entrega`, `carga_descricao`, `valor_frete`) e os mostra no painel "Status atual".
3. Campo "Data carregamento" puxa o valor de `data_coleta` se `data_carregamento` está vazio.
4. User pode editar livremente; salvar PATCH'a a viagem.

### 7.6 Finalizar viagem
1. User clica "Finalizar" na viagem EM_CURSO.
2. Modal de confirmação com input de `data_entrega_realizada` pré-preenchida com hoje.
3. POST `/viagens/:viagemId/finalize`.
4. Viagem vira FINALIZADA, `finalized_at = now`, `data_entrega_realizada` setada.
5. Registra `VIAGEM_FINALIZED`.
6. Card NÃO se move automaticamente; toast pergunta "Mover caminhão pra VAZIO AGUARDANDO CARGA?" com atalho.
7. Viagem colapsa no painel direito; fica visível em "Finalizadas".

### 7.7 Comentar
1. User digita no input "Escrever um comentário" + Enviar.
2. POST `/truck/:truckId/comments` (opcional `viagem_id` se contexto da viagem).
3. Event tipo COMMENT criado; aparece imediatamente na timeline.

### 7.8 Apagar comentário
1. User clica 🗑 no hover. Confirma.
2. DELETE `/activity/:eventId`. Service valida que tipo é COMMENT e que requester é autor ou ADMIN.
3. Soft-delete (`deleted_at` set). Some da UI.

### 7.9 Auto-refresh
- Mesmo padrão da v1: 20s, pausa quando aba escondida ou quando navega pra outro módulo (via `stopControleViagens`). Fingerprint-diff evita re-render.

## 8. Permissões

- Mantém permissão `controle-viagens` (já existe na v1).
- ADMIN bypassa.
- Todas as ações de leitura e escrita exigem a permissão.
- Apagar comentário: autor (via `author_id`) ou role ADMIN.
- Cancelar/Apagar viagem: qualquer usuário com permissão (sem restrição extra). Apagar só PLANEJADA não-iniciada.

## 9. Auditoria

Dois canais paralelos:

1. **`truck_activity_events`** (novo) — fonte de verdade pra UI. Cada operação relevante gera entries específicas, com payload tipado. Visível na timeline do modal. Comentários humanos são apenas mais um tipo de event.

2. **`AuditLog`** (existente) — continua registrando mudanças estruturais com before/after de tabelas, entity TRUCK. Diagnóstico interno, não exposto na UI v2.

## 10. Testes

Testes de integração via `docs/superpowers/testing/`:

- POST viagem cria PLANEJADA + event VIAGEM_CREATED.
- PATCH viagem registra um VIAGEM_FIELD_EDITED por campo alterado.
- POST /start falha se já há EM_CURSO no truck.
- POST /finalize seta data_entrega_realizada = hoje quando body vazio.
- DELETE viagem falha se status != PLANEJADA.
- DELETE comment: autor pode, terceiro GESTOR não pode, ADMIN pode.
- DELETE comment falha em events não-COMMENT.
- PATCH /column registra COLUMN_MOVED.
- GET /board não inclui caminhões com deleted_at.
- GET /board lazy-default: caminhão sem TruckColumn aparece em VAZIO.
- Multi-tenant: usuário de empresa A não vê truck de B (todas as rotas).
- Permissão: usuário sem `controle-viagens` recebe 403.

Smoke manual via skill `verify`:
- Drag-and-drop entre colunas.
- Sort por coluna persiste após refresh.
- Toggle Mostrar/Ocultar detalhes.
- Múltiplas viagens (1 EM_CURSO, 2 PLANEJADAS) na lateral.
- Botões Iniciar/Finalizar/Cancelar funcionam.
- Activity log mostra eventos automáticos + comentários intercalados.
- Mobile 375px: 3 abas funcionando.
- Auto-refresh sincroniza entre 2 abas abertas.

## 11. Riscos e mitigações

| Risco | Mitigação |
|---|---|
| User esquecer de iniciar viagem ao mover pra INDO CARREGAR | Toast sugere ação; não bloqueia. |
| Dois usuários movem o mesmo card simultaneamente | Last-write-wins; fingerprint refresca em 20s; activity log preserva histórico. |
| Activity log crescer demais por truck (milhares de events) | Paginação por cursor no GET /activity. Index `truck_id, created_at DESC`. |
| Edição em massa de viagem gerar muitos events de FIELD_EDITED | Aceitar; é o ponto. Cada campo gera um event = histórico granular. |
| Race condition em start (dois clicks rápidos) | Service usa `prisma.$transaction` com lock por truck no upsert. |
| Migration sai errada e perde dados | v1 não foi aplicada em prod, então DROP em prod = no-op. Em dev local: documenta no plan de implementação que requer reset do schema. |

## 12. Critérios de aceitação

- Cada caminhão pode ter múltiplas viagens (PLANEJADA + EM_CURSO + histórico).
- Botão "+ Nova carga" cria viagem PLANEJADA com os campos do form.
- Botão "Iniciar" promove pra EM_CURSO; bloqueia se já tem outra EM_CURSO.
- Botão "Finalizar" promove pra FINALIZADA com data_entrega_realizada preenchida.
- Mover card entre colunas atualiza `truck_columns.coluna` e registra COLUMN_MOVED.
- Campos da viagem persistem ao mover entre colunas (não se apagam).
- "Data carregamento" puxa de "Data coleta" se vazio quando entra em CARREGADO.
- Toggle Mostrar/Ocultar detalhes funciona no modal.
- Sort por coluna persiste em localStorage.
- Activity log mostra eventos automáticos + comentários humanos intercalados, mais recentes em cima.
- Comentários: criar, apagar (autor ou ADMIN).
- Eventos automáticos não-apagáveis.
- Mobile: 3 abas (Detalhes / Atividade / Viagens).
- Permissão `controle-viagens` mantida; ADMIN bypassa.
- AuditLog continua registrando paralelamente.

## 13. Decisões registradas

- **3 tabelas separadas** (TruckColumn 1-1, TruckViagem N-1, TruckActivityEvent N-1) em vez de 2 da v1. Modelagem por responsabilidade.
- **Activity log = source of truth pra UI**, AuditLog continua como diagnóstico técnico.
- **Múltiplas viagens ativas por truck** (PLANEJADA + EM_CURSO), no máximo 1 EM_CURSO.
- **Coluna do Kanban e ciclo de viagem são independentes** (regra do user). Mover card não muda status de viagem; iniciar/finalizar viagem não move card. Toasts sugerem mas não forçam.
- **Manutenção é ortogonal**: muda só `truck_columns.coluna`, não toca em viagens.
- **Campo `descricao_geral`** (observação do caminhão) vive em `truck_columns`, persiste entre todas as colunas e viagens.
- **Campos da viagem vivem em `truck_viagens`**, não em `truck_columns`. Modal opera na viagem EM_CURSO quando aplicável.
- **v1 substituída**, não migrada. Migration v1 será removida do repo (nunca foi aplicada).
