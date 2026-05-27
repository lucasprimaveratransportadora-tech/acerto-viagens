# Controle de Viagens — Painel Kanban Operacional

**Data:** 2026-05-27
**Autor:** brainstorming session com Lucas
**Estado:** aprovado para implementação

## 1. Objetivo

Adicionar um novo módulo ao sistema — **Controle de Viagens** — que oferece um quadro Kanban operacional para acompanhamento em tempo real de cada caminhão da frota. Cada caminhão é um card que transita entre 6 colunas conforme o estado da viagem. O quadro funciona em desktop (drag-and-drop) e mobile (drag-and-drop com long-press + dropdown "mover para…"). Cada card tem timeline de comentários com autor e horário, permitindo registrar onde o caminhão está indo, ocorrências e contexto operacional.

O módulo é **totalmente independente** dos registros de `Trip` do módulo Acerto de Viagem — não cria, atualiza nem consome esses dados. Serve como ferramenta de visibilidade operacional do dia-a-dia.

## 2. Escopo

### No escopo

- Novo card no Hub (5º módulo): "Controle de Viagens".
- Quadro Kanban com 6 colunas fixas:
  - VAZIO AGUARDANDO CARGA
  - INDO CARREGAR
  - NA FÁBRICA
  - CARREGADO EM VIAGEM
  - EM DESCARGA NO CLIENTE
  - EM MANUTENÇÃO
- Cada caminhão ativo da frota = 1 card. Status default na primeira aparição: VAZIO AGUARDANDO CARGA.
- Movimentar cards: drag-and-drop (desktop e mobile) **e** dropdown "Mover para…" no detalhe do card (estilo Trello).
- Modal de detalhe estilo Trello: 2 colunas (conteúdo à esquerda/centro, comentários à direita).
- Campos contextuais por status (ver §4).
- Timeline cronológica de comentários por caminhão, com autor, data/hora, soft-delete (próprio autor ou ADMIN).
- Busca por placa/motorista (filtra cards do board).
- Contador de cards por coluna no header.
- Auto-refresh do board a cada 20 segundos (pausado quando aba fora de foco).
- Permissão nova: `controle-viagens` no array `permissoes` do User. ADMIN tem acesso independente.
- Identidade visual idêntica ao restante do sistema (CSS variables, tema dark/light, IBM Plex / Bebas Neue, accent #E30613).

### Fora do escopo

- Integração automática com o módulo Acerto de Viagem (criar/atualizar Trip).
- Notificações push, WebSocket / Server-Sent Events (auto-refresh por polling é suficiente).
- Histórico de movimentações exposto na UI (registrado em `AuditLog` mas não exibido).
- Comentários com anexos, menções, edição (apenas criar e apagar).
- WIP limits / regras de transição entre status (qualquer status pode mover pra qualquer outro).
- Notificações por e-mail/SMS.
- Roles além das duas existentes (ADMIN/GESTOR).
- Versão para motoristas (UI orientada a motorista). Fica como evolução futura.

## 3. Arquitetura

### 3.1 Backend (Node + Prisma + Postgres)

Stack já em uso no projeto: Express, Prisma client, `zod` para validação, middleware de auth/audit existentes.

Novos arquivos:

```
src/routes/controleViagens.routes.js       -- handlers HTTP
src/services/controleViagens.service.js    -- lógica de domínio (Prisma)
src/validators/controleViagens.validator.js -- schemas zod
prisma/migrations/<timestamp>_controle_viagens/migration.sql
```

Registro da rota em `src/routes/index.js` (ou onde as rotas são montadas no app.js).

### 3.2 Frontend (vanilla JS modular)

Padrão idêntico aos módulos existentes (frete-terceiro, veiculos, rentabilidade) — lazy-loaded pelo `hub.js`.

Novos arquivos:

```
public/js/controle-viagens.js          -- inicialização, board, drag-drop, refresh
public/js/controle-viagens.modal.js    -- modal de detalhe (status + campos + comentários)
public/css/controle-viagens.css        -- estilos (usa variables.css)
```

Mudanças em arquivos existentes:

```
public/index.html        -- nova <div id="controleViagensView">, novo hub-card, novo module-tab
public/js/hub.js         -- nova função goToControleViagens(), import lazy
public/js/admin/users.js -- novo checkbox de permissão "controle-viagens" na tela de usuários
public/css/variables.css -- (se necessário) cores por coluna do Kanban
```

### 3.3 Modelo de dados

Duas tabelas novas. Nenhuma alteração em `Truck`, `Trip` ou qualquer modelo existente — apenas a permissão default no `User.permissoes`.

```prisma
enum TruckOperationalStatus {
  VAZIO_AGUARDANDO_CARGA
  INDO_CARREGAR
  NA_FABRICA
  CARREGADO_EM_VIAGEM
  EM_DESCARGA_NO_CLIENTE
  EM_MANUTENCAO
}

model TruckOperationalState {
  id                          String                 @id @default(uuid())
  truck_id                    String                 @unique
  truck                       Truck                  @relation(fields: [truck_id], references: [id], onDelete: Cascade)
  status                      TruckOperationalStatus @default(VAZIO_AGUARDANDO_CARGA)

  // Campo único de "contexto textual" — rótulo varia por status:
  // VAZIO            -> "Local atual"
  // NA_FABRICA       -> "Fábrica"
  // EM_DESCARGA      -> "Cliente"
  // EM_MANUTENCAO    -> "Descrição"
  contexto_atual              String?

  // Campos de viagem (INDO_CARREGAR, CARREGADO_EM_VIAGEM)
  data_coleta                 DateTime?              @db.Date
  data_agendamento_entrega    DateTime?              @db.Date
  carga_descricao             String?

  // Texto livre persistente entre mudanças de status
  descricao                   String?

  updated_at                  DateTime               @updatedAt
  updated_by_id               String?
  updated_by                  User?                  @relation(fields: [updated_by_id], references: [id])

  @@index([status])
  @@map("truck_operational_states")
}

model TruckOperationalComment {
  id            String   @id @default(uuid())
  truck_id      String
  truck         Truck    @relation(fields: [truck_id], references: [id], onDelete: Cascade)
  author_id     String?
  author        User?    @relation(fields: [author_id], references: [id])
  author_email  String   // snapshot — sobrevive se user for excluído
  author_nome   String   // snapshot
  texto         String
  created_at    DateTime @default(now())
  deleted_at    DateTime?
  deleted_by_id String?

  @@index([truck_id, created_at(sort: Desc)])
  @@map("truck_operational_comments")
}
```

Relações inversas em `Truck` e `User`:

```prisma
// Em Truck:
operational_state             TruckOperationalState?
operational_comments          TruckOperationalComment[]

// Em User:
operational_state_updates     TruckOperationalState[]
operational_comments_authored TruckOperationalComment[]
```

Migração também atualiza o default de `User.permissoes` para incluir `"controle-viagens"` (apenas para novos usuários; existentes recebem via update script no seed/migration: `UPDATE users SET permissoes = array_append(permissoes, 'controle-viagens') WHERE NOT 'controle-viagens' = ANY(permissoes)`).

### 3.4 Endpoints REST

Todos sob `/api/controle-viagens`, protegidos por `authMiddleware` + check de permissão `controle-viagens` (ou role ADMIN). Filtragem por `empresa_id` do usuário logado.

| Método | Caminho                                       | Função                                                                                                  |
|--------|-----------------------------------------------|---------------------------------------------------------------------------------------------------------|
| GET    | `/api/controle-viagens/board`                 | Lista todos os caminhões ativos (`deleted_at IS NULL`) com seu state (lazy-default se não existir) + contagem de comentários + horário do último comentário. Endpoint do polling. |
| GET    | `/api/controle-viagens/:truckId`              | Detalhe completo de um caminhão (state + comentários, paginados).                                       |
| PATCH  | `/api/controle-viagens/:truckId/state`        | Atualiza status e/ou campos contextuais. Upsert do state. Registra `AuditLog` (entity TRUCK).            |
| GET    | `/api/controle-viagens/:truckId/comments`     | Lista comentários (paginação por cursor, 50 por página).                                                |
| POST   | `/api/controle-viagens/:truckId/comments`     | Cria comentário. Snapshot de autor.                                                                     |
| DELETE | `/api/controle-viagens/:truckId/comments/:id` | Soft-delete. Próprio autor ou role ADMIN.                                                               |

Todos os endpoints validam `truckId` como UUID (padrão existente do projeto, ver commit `cc2b075`).

### 3.5 Auditoria

Reaproveita o sistema de `AuditLog` existente, `entity_type = TRUCK`. Cada `PATCH state` registra um log com `before`/`after` em JSON. Comentários **não** geram audit (são o próprio histórico humano).

## 4. Campos contextuais por status

A UI mostra/esconde campos conforme o status selecionado. O backend não apaga campos não-aplicáveis quando o status muda — apenas valida obrigatoriedade do que é necessário.

| Status                  | Campos visíveis e editáveis no modal                                                  |
|-------------------------|-----------------------------------------------------------------------------------------|
| VAZIO AGUARDANDO CARGA  | **Local atual** (`contexto_atual`)                                                      |
| INDO CARREGAR           | **Data coleta**, **Agend. entrega**, **Carga**                                          |
| NA FÁBRICA              | **Fábrica** (`contexto_atual`)                                                          |
| CARREGADO EM VIAGEM     | **Agend. entrega**, **Carga** (herdadas de INDO CARREGAR, editáveis)                    |
| EM DESCARGA NO CLIENTE  | **Cliente** (`contexto_atual`)                                                          |
| EM MANUTENÇÃO           | **Descrição** (`contexto_atual`)                                                        |

O campo "Descrição" livre (`descricao` na tabela) aparece em **todos** os status como observação geral persistente do caminhão.

### Regras de validação no PATCH

- Status é sempre obrigatório (enum válido).
- Demais campos são opcionais no payload, mas se o usuário **tenta mover sem preencher um campo essencial**, o frontend abre o modal para confirmar. O backend não bloqueia — registra o que vier (operador pode estar tentando refletir o estado real com info parcial).

## 5. UX e identidade visual

### 5.1 Layout do board (desktop)

- Header da página: título "Controle de Viagens — Painel Operacional", contador total ("12 caminhões"), busca por placa/motorista (filtra cards em tempo real no client), indicador da última atualização ("última: 14:32"), botão manual de atualizar.
- 6 colunas em flex horizontal, scrollável horizontalmente se a tela for menor.
- Header de cada coluna: nome + contador `(N)`. Faixa fina superior na cor da coluna.
- Cores das colunas (variáveis CSS novas em `controle-viagens.css`, derivadas de `variables.css`):
  - VAZIO: `--muted` (neutro)
  - INDO CARREGAR: `--info` (azul)
  - NA FÁBRICA: amarelo (#f59e0b)
  - CARREGADO EM VIAGEM: `--info` mais saturado
  - EM DESCARGA: amarelo mais claro
  - EM MANUTENÇÃO: `--accent` (vermelho)

### 5.2 Card (densidade média)

```
+--------------------------+
| ABC 1D23                 |   <- placa, Bebas Neue, destaque
| João Silva               |   <- motorista
| Scania R450              |   <- modelo
| ------------------------ |
| 📅 28/05  Soja-RJ        |   <- 1-2 campos contextuais do status
| 💬 2     ⏱ 14:30          |   <- contador comentários · último update
+--------------------------+
```

- Faixa lateral esquerda 3px na cor da coluna.
- Hover: elevação suave (box-shadow), borda superior accent 2px.
- Ponto vermelho no ícone 💬 se houver comentário criado depois da última visita do usuário a esse caminhão (chave em `localStorage`: `cv_last_seen_<truckId>`).

### 5.3 Modal de detalhe (estilo Trello, 2 colunas)

```
+-----------------------------------------------------------------------+
| [ EM DESCARGA ▾ ]                                          [⋯]  [X]   |
+---------------------------------------+-------------------------------+
| ABC 1D23 — JOÃO SILVA                 | 💬 Comentários e atividade    |
| Scania R450 + Randon XYZ 9P88         |                               |
|                                       | +---------------------------+ |
| ┌─ Status atual ───────────────────┐  | | Escrever um comentário... | |
| │ Cliente   [ Predilecta Tijucas ] │  | +---------------------------+ |
| │                       [ Salvar ] │  |          [ Enviar ]           |
| └─────────────────────────────────-┘  |                               |
|                                       |  ● Lucas Carvalho             |
| ┌─ Descrição ──────────────[ Edit ]┐  |    26/05 14:30                |
| │ texto livre opcional...           │  |    Caminhão saindo de         |
| └──────────────────────────────────┘  |    Rio Verde agora            |
|                                       |                               |
| Última atualização: Lucas · 14:30     |  ● Maria Souza · 26/05 09:15  |
|                                       |    Confirmada coleta...       |
+---------------------------------------+-------------------------------+
```

- Header: dropdown de status com a cor da coluna atual (trocar aqui = arrastar entre colunas), ações secundárias (⋯ apaga state — só ADMIN), fechar.
- Coluna central (~60%): bloco "Status atual" com **apenas** os campos relevantes (transição suave ao trocar status), botão "Salvar". Abaixo, bloco "Descrição" persistente. Rodapé: quem alterou + quando.
- Coluna direita (~40%): input fixo no topo, timeline de comentários (mais recentes em cima). Cada comentário: avatar circular com inicial (background accent), nome, data/hora, texto. Ícone discreto de apagar no hover (próprio autor ou ADMIN).

### 5.4 Mobile (≤ 768px)

- Board: scroll horizontal "snap" — cada coluna ocupa ~85% da viewport (estilo Trello mobile). Header com indicador "2 / 6".
- Cards arrastáveis com long-press (350ms) — reaproveita `mobile-gestures.js`. Tap simples abre detalhe.
- Modal: as duas colunas viram **abas** ("Detalhes" / "Comentários"). Dropdown de status fica visível em ambas. Comentários têm input fixo no rodapé do modal (sticky).

### 5.5 Estados visuais

- Card sendo arrastado: opacidade 0.6, rotação leve, shadow forte.
- Coluna drop target: borda tracejada accent enquanto arrasta sobre ela.
- Loading do board: skeleton dos cards (não spinner).
- Erro ao salvar: toast vermelho no topo, card volta à posição anterior (rollback otimista).
- Aba fora de foco: polling pausado, badge "pausado" no indicador de atualização.

## 6. Fluxos críticos

### 6.1 Mover card

1. Usuário arrasta card de A para B (ou abre modal e troca dropdown).
2. Frontend move otimisticamente, faz `PATCH /api/controle-viagens/:truckId/state` com `{ status: 'NA_FABRICA', contexto_atual: 'Bunge Rio Verde' }`.
3. Backend: transação Prisma — upsert do state, AuditLog `UPDATE`.
4. Resposta 200 → frontend confirma. Erro → reverte e mostra toast.

### 6.2 Auto-refresh

- `setInterval` a cada 20s chama `GET /api/controle-viagens/board`.
- Frontend compara hash do payload (ETag-like; backend retorna `updated_at_max` do board); se igual, não re-renderiza.
- Pausa em `visibilitychange` quando `document.hidden`.

### 6.3 Comentário novo

1. Usuário digita e clica "Enviar".
2. `POST /api/controle-viagens/:truckId/comments` retorna comentário com snapshot de autor.
3. Frontend prepende na timeline e incrementa contador 💬 no card do board (sem refresh).

### 6.4 Novo caminhão cadastrado

- Aparece no board no próximo refresh, em VAZIO AGUARDANDO CARGA, com state virtual (não persistido até primeira movimentação ou edição).
- Persistência ocorre no primeiro `PATCH state`.

### 6.5 Caminhão arquivado (soft-delete em Truck)

- `Truck.deleted_at != null` → some do board.
- State e comentários permanecem no banco (não cascade). Se o caminhão for reativado, retorna ao board com state preservado.

### 6.6 Concorrência

- Se dois usuários movem o mesmo card simultaneamente: último write vence. Não há lock pessimista. Em caso de conflito visível pelo refresh, o usuário enxerga o estado final correto em até 20s.

## 7. Permissões

- Nova string no array `User.permissoes`: `controle-viagens`.
- ADMIN tem acesso independente.
- Middleware de rota: `requirePermission('controle-viagens')` (criar helper se ainda não existir, espelhado em `middleware/permissions.js` ou similar).
- Hub: o card de Controle de Viagens fica oculto se `!hasModuleAccess('controle-viagens')` (padrão atual do `hub.js`).
- Tela de Admin de usuários (`admin/users.js`): adicionar checkbox "Controle de Viagens" no painel de permissões.
- Apagar comentário: próprio autor (via `author_id`) ou role ADMIN.

## 8. Auditoria

- Mudança de status / campos: `AuditLog` com `entity_type=TRUCK`, `action=UPDATE`, before/after = JSON do `truck_operational_state`.
- Criação/exclusão de comentários: **não auditadas** (a timeline é o próprio histórico).
- Para histórico de movimentações por caminhão, basta filtrar `AuditLog` por `entity_type=TRUCK, entity_id=truckId` (não exposto na UI v1).

## 9. Testes

Padrão atual do projeto: testes de integração via `docs/superpowers/testing/`.

- **Backend**:
  - PATCH state cria registro se não existir.
  - PATCH state atualiza e gera AuditLog.
  - PATCH state respeita escopo de `empresa_id` (usuário de empresa A não enxerga/altera caminhão de B).
  - POST comment cria com snapshot do autor.
  - DELETE comment: autor pode, terceiro GESTOR não pode, ADMIN pode.
  - GET board não inclui caminhões com `deleted_at` setado.
  - GET board funciona com caminhão sem state (lazy default).
  - Permissão: usuário sem `controle-viagens` recebe 403.
- **Frontend** (smoke manual via `verify` skill):
  - Drag-and-drop entre todas as colunas.
  - Dropdown de status no modal equivale a drag.
  - Auto-refresh atualiza um card movido por outra sessão (simulado com 2 abas).
  - Busca filtra por placa e por motorista.
  - Modal funciona em viewport mobile (DevTools 375×667).
  - Tema light/dark renderizam corretamente.

## 10. Riscos e mitigações

| Risco                                                              | Mitigação                                                                                       |
|--------------------------------------------------------------------|-------------------------------------------------------------------------------------------------|
| Drag-and-drop em mobile travar a tela (scroll vs drag)             | Long-press de 350ms antes do drag iniciar; reaproveitar `mobile-gestures.js` testado.            |
| Polling pesado com muitos caminhões                                | Endpoint `/board` enxuto (sem comentários, só metadados + last comment preview). Hash de no-op evita render. |
| Conflito de edição (2 usuários movem o mesmo card)                 | Last-write-wins + refresh em 20s reconcilia. AuditLog preserva histórico.                       |
| Esquecer de adicionar nova permissão a usuários antigos            | Migration faz `UPDATE users SET permissoes = array_append(...)` para todos os existentes.        |
| Modelo `TruckOperationalState` desincronizar com `Truck`           | `onDelete: Cascade` no relacionamento — se truck for hard-deleted, state vai junto.              |
| Carga/agendamento se "perderem" ao trocar status                   | Backend **não apaga** campos não-aplicáveis; apenas oculta na UI. Retornar ao status anterior recupera. |

## 11. Critérios de aceitação

- Acesso ao módulo via Hub (5º card) e via tab no header.
- 6 colunas com cores distintas; cards arrastáveis no desktop; long-press + drag no mobile.
- Card mostra placa, motorista, modelo, campos contextuais relevantes ao status, contador de comentários e horário do último update.
- Modal em 2 colunas (Trello-like) no desktop; em abas no mobile.
- Comentários: criar, listar com autor + data, apagar (próprio autor ou ADMIN).
- Permissão `controle-viagens` exigida; ADMIN bypassa.
- Auto-refresh visível a cada ~20s, pausado fora de foco.
- Identidade visual idêntica ao restante do sistema (tema dark/light, fontes, accent).
- AuditLog registra mudanças de state.
- Mobile (375px) usável sem scroll horizontal forçado nos elementos do modal.

## 12. Decisões registradas

- **Tabela 1-1 com Truck (`TruckOperationalState`)**, não campos novos na `Truck`. Mantém o cadastro de caminhão limpo e o estado operacional isolado.
- **Comentários em tabela separada com snapshot de autor**, não usando AuditLog como timeline. AuditLog é log técnico; comentário é comunicação humana.
- **Campo `contexto_atual` único compartilhado entre 4 status**, com rótulo dinâmico. Evita schema com 4 colunas nullable redundantes.
- **Polling 20s**, não WebSocket. Stack atual é REST puro; complexidade de WS não justifica o ganho operacional.
- **Independência total de `Trip`**. Quando a viagem termina, o operador lança a Trip normalmente — Kanban e acerto não conversam. Reavaliar em v2 se ficar evidente que estão duplicando entrada de dados.
- **Nova permissão dedicada**, não reuso de `frota`. Permite liberar o Kanban para operadores que não enxergam acerto financeiro.
