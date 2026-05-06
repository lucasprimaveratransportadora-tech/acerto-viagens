# Admin Panel — Design Spec

**Data:** 2026-05-06
**Status:** Aprovado para planejamento
**Stack alvo:** Node 20 + Express + Prisma 5 + Postgres + Vanilla JS ESM (já em produção no Railway)

---

## 1. Contexto e objetivo

O sistema **Prima Acerto Viagens** está em produção, mas hoje só tem login e CRUD de viagens. Antes de evoluir para o fechamento financeiro completo, é necessário criar uma área administrativa que permita:

1. **Gerenciar usuários** (criar/editar/desativar/resetar senha/forçar logout)
2. **Auditar mudanças financeiras** (quem editou o quê, antes/depois) com paginação
3. **Visualizar logins** das últimas 48h (sucessos e falhas) com paginação

A intenção é dar **visibilidade e controle ao dono do sistema (Lucas)** antes de novos colaboradores começarem a usar a ferramenta diariamente.

## 2. Decisões de escopo

| Pergunta | Decisão |
|---|---|
| Multi-empresa na UI? | **Não nesta fase** — UI focada na Prima. Backend continua multi-tenant intacto (porta aberta para virar produto no futuro). |
| Tipo de auditoria? | **Trilha financeira (B)** — registra criar/editar/excluir de Trip, CTE, Fuel, Expense, e também User/Truck. Sem TTL. |
| Login history? | **Sim, simples**, retenção 48h, paginado. Captura sucesso, falha, logout, refresh failure. |
| Ações de admin no usuário? | **Reset senha + Forçar logout + Ver atividade**. Editar/criar/desativar já existem no backend. |
| Trocar a própria senha (auto-serviço)? | **Fora de escopo nesta fase.** Por enquanto, admin reseta para o usuário se preciso. |

## 3. Out of scope

- Trocar senha pelo próprio usuário (auto-serviço)
- Convite por email / verificação de email
- 2FA / MFA
- Lock automático após N falhas
- Telas de gestão de empresa (a porta fica aberta no backend, mas a UI não exibe)
- Anexos / upload de arquivos (já modelado, mas continua fora deste MVP)
- Export CSV/PDF do audit log
- Notificações em tempo real (WebSocket)
- Testes automatizados (decisão: testes manuais via checklist neste MVP)

## 4. Arquitetura

### 4.1 Inventário de arquivos

| Componente | Novo / Editar | Caminho |
|---|---|---|
| Tabela `audit_logs` | 🆕 | `prisma/schema.prisma` |
| Tabela `login_events` | 🆕 | `prisma/schema.prisma` |
| Migration | 🆕 | `prisma/migrations/<timestamp>_add_audit_and_login_events/migration.sql` |
| Helper de audit | 🆕 | `src/services/audit.service.js` |
| Service de login events | 🆕 | `src/services/loginEvents.service.js` |
| Controller audit | 🆕 | `src/controllers/audit.controller.js` |
| Controller login events | 🆕 | `src/controllers/loginEvents.controller.js` |
| Routes audit | 🆕 | `src/routes/audit.routes.js` |
| Routes login events | 🆕 | `src/routes/loginEvents.routes.js` |
| Job de cleanup 48h | 🆕 | `src/jobs/cleanupLoginEvents.js` |
| Service de users (extrair lógica do controller) | 🆕 | `src/services/users.service.js` |
| Validators novos | 🆕 | `src/validators/admin.validator.js` (reset password, audit filters) |
| Auth service — eventos de login | 🔧 | `src/services/auth.service.js` |
| Auth controller — passar req | 🔧 | `src/controllers/auth.controller.js` |
| Users controller — endpoints novos | 🔧 | `src/controllers/users.controller.js` |
| Users routes — endpoints novos | 🔧 | `src/routes/users.routes.js` |
| Trips/Ctes/Fuels/Expenses services — chamada audit | 🔧 | `src/services/{trips,ctes,fuels,expenses}.service.js` |
| Trucks service — chamada audit | 🔧 | `src/services/trucks.service.js` |
| Server — agendar cleanup | 🔧 | `src/server.js` |
| Routes index | 🔧 | `src/routes/index.js` |
| Frontend admin orchestrator | 🆕 | `public/js/admin/index.js` |
| Frontend users tab | 🆕 | `public/js/admin/users.js` |
| Frontend audit tab | 🆕 | `public/js/admin/audit.js` |
| Frontend logins tab | 🆕 | `public/js/admin/logins.js` |
| Frontend diff renderer | 🆕 | `public/js/admin/diff-renderer.js` |
| Admin CSS | 🆕 | `public/css/admin.css` |
| Index HTML — botão e view de admin | 🔧 | `public/index.html` |
| App entrypoint — wiring admin | 🔧 | `public/js/app.js` |
| State store | 🔧 | `public/js/state.js` |
| Checklist de testes manuais | 🆕 | `docs/superpowers/testing/admin-panel-checklist.md` |

### 4.2 Fluxo de uma operação financeira (com audit)

```
PATCH /api/expenses/:id  → expenses.controller
                        → expenses.service.update(id, empresaId, req, data)
                            ├─ verifyTripOwnership(...)
                            ├─ before = prisma.expense.findUnique(...)
                            ├─ after = prisma.expense.update(...)
                            └─ audit.log({ req, empresaId, entity: 'EXPENSE',
                                           action: 'UPDATE',
                                           entityId: id, before, after })
                                 └─ INSERT audit_logs
                        → 200 OK { ...after }
```

### 4.3 Fluxo de login (com event)

```
POST /api/auth/login → auth.controller.login(req, res)
                    → auth.service.login(email, senha, reqMeta)
                        ├─ prisma.user.findUnique(...)
                        ├─ if user invalido OR senha invalida:
                        │   ├─ loginEvents.log({ action: LOGIN_FAILED, email, ip, ua })
                        │   └─ throw 401
                        ├─ accessToken + refreshToken
                        └─ loginEvents.log({ action: LOGIN_SUCCESS, user, ip, ua })
                    → 200 OK
```

## 5. Schema de banco

### 5.1 Enums novos

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

### 5.2 Modelo `AuditLog` (append-only)

```prisma
model AuditLog {
  id           String       @id @default(uuid())
  empresa_id   String
  empresa      Empresa      @relation(fields: [empresa_id], references: [id])
  actor_id     String?
  actor        User?        @relation(fields: [actor_id], references: [id])
  actor_email  String       // snapshot — sobrevive a delete do user
  entity_type  AuditEntity
  entity_id    String
  action       AuditAction
  before       Json?        // null em CREATE
  after        Json?        // null em DELETE
  ip           String?
  user_agent   String?
  created_at   DateTime     @default(now())

  @@index([empresa_id, created_at(sort: Desc)])
  @@index([entity_type, entity_id])
  @@index([actor_id, created_at(sort: Desc)])
  @@map("audit_logs")
}
```

**Decisões:**

- `before` e `after` armazenam o **registro completo** (JSON), não diff. ~1KB por linha; ~100-500 eventos/semana em 19 veículos. Postgres aguenta milhões de linhas sem dor.
- `actor_email` é **snapshot** denormalizado para sobreviver a delete do user.
- **Append-only**: nenhuma rota update ou delete em `audit_logs`. Sem `updated_at`, sem `deleted_at`.
- **Sem TTL** — usuário pediu retenção total para fins contábeis.

### 5.3 Modelo `LoginEvent` (janela 48h)

```prisma
model LoginEvent {
  id            String       @id @default(uuid())
  empresa_id    String?      // null em LOGIN_FAILED com email desconhecido
  empresa       Empresa?     @relation(fields: [empresa_id], references: [id])
  user_id       String?      // null em LOGIN_FAILED com email desconhecido
  user          User?        @relation(fields: [user_id], references: [id])
  email_attempt String       // sempre preenchido (até em falhas)
  action        LoginAction
  ip            String?
  user_agent    String?
  created_at    DateTime     @default(now())

  @@index([empresa_id, created_at(sort: Desc)])
  @@index([user_id, created_at(sort: Desc)])
  @@index([created_at])  // para o cleanup job
  @@map("login_events")
}
```

**Decisões:**

- **Tentativas falhas são gravadas** (email errado, senha errada). **Senha tentada NUNCA é gravada** — só email.
- `empresa_id` e `user_id` ficam `null` quando a tentativa é com email não cadastrado.
- **Index em `created_at`** garante DELETE rápido no cleanup.
- **Mensagem de erro de login uniforme** ("Email ou senha inválidos") + execução de bcrypt dummy quando user não existe — para impedir enumeração de usuários por timing.

### 5.4 Mudanças nos models existentes

```prisma
model Empresa {
  // ... campos existentes
  audit_logs    AuditLog[]
  login_events  LoginEvent[]
}

model User {
  // ... campos existentes
  audit_logs    AuditLog[]
  login_events  LoginEvent[]
}
```

### 5.5 Migration

Uma única migration aditiva: `<timestamp>_add_audit_and_login_events`. Cria 2 tabelas, 3 enums, 6 índices. Zero alteração destrutiva nos dados existentes.

## 6. API — endpoints

Todos exigem `auth` middleware. Endpoints abaixo exigem `rbac('ADMIN')`.

### 6.1 Auditoria

#### `GET /api/audit`

Lista paginada com filtros.

**Query params:**

| Param | Tipo | Default | Descrição |
|---|---|---|---|
| `page` | int | 1 | página atual |
| `limit` | int | 50 | itens por página (max 200) |
| `entity` | enum | — | TRIP, CTE, FUEL, EXPENSE, USER, TRUCK |
| `entity_id` | uuid | — | atalho para histórico de uma entidade |
| `actor_id` | uuid | — | filtra por usuário que fez a ação |
| `action` | enum | — | CREATE, UPDATE, DELETE |
| `from` | ISO date | — | início do intervalo |
| `to` | ISO date | — | fim do intervalo |

**Response:**

```json
{
  "items": [
    {
      "id": "...",
      "actor": { "id": "...", "nome": "Lucas", "email": "lucas@..." },
      "actor_email": "lucas@prima.com.br",
      "entity_type": "EXPENSE",
      "entity_id": "...",
      "action": "UPDATE",
      "before": { "valor": 100, "categoria": "PEDAGIO" },
      "after":  { "valor": 200, "categoria": "PEDAGIO" },
      "ip": "189.x.x.x",
      "user_agent": "Mozilla/5.0...",
      "created_at": "2026-05-06T17:32:11Z"
    }
  ],
  "total": 1284,
  "page": 1,
  "limit": 50,
  "totalPages": 26
}
```

Backend **sempre** filtra `empresa_id = req.user.empresa_id`.

#### `GET /api/audit/:entityType/:entityId`

Atalho para histórico cronológico decrescente de uma entidade. Sem paginação, limite hardcoded de 100.

### 6.2 Login Events

#### `GET /api/login-events`

Lista paginada com filtros, **janela hardcoded de 48h** (mesmo se a tabela tiver lixo do cleanup).

**Query params:** `page`, `limit` (max 200), `user_id`, `action`.

**Response:** mesma estrutura `{ items, total, page, limit, totalPages }`.

### 6.3 Ações no usuário

#### `POST /api/users/:id/reset-password`

```
Body: { senha: "novaSenhaForte1" }
Response: { message: "Senha redefinida e sessões encerradas." }
```

**Comportamento:**

- Validação: senha mínimo 8 chars, ao menos 1 letra e 1 dígito
- Tudo numa `prisma.$transaction`:
  1. `bcrypt.hash` + `prisma.user.update({ senha_hash })`
  2. `prisma.refreshToken.deleteMany({ user_id })` — força logout
  3. `audit.log({ entity: USER, action: UPDATE, before: { id, email, nome }, after: { id, email, nome, password_reset: true, sessions_revoked: <count> } })` — `senha_hash` é filtrado pelo helper, então `before/after` carregam só metadados (não o hash). A flag `password_reset: true` no `after` é o que diferencia este evento de uma edição de nome/role.
- Bloqueia se `req.user.id === req.params.id` (admin não reseta a própria senha por aqui)

#### `DELETE /api/users/:id/sessions`

```
Response: { message: "Sessões encerradas.", revoked: 3 }
```

- `prisma.refreshToken.deleteMany({ user_id })` retorna count
- `audit.log({ entity: USER, action: UPDATE, before: { id, email, nome }, after: { id, email, nome, sessions_revoked: <count> } })`
- Bloqueia se `req.user.id === req.params.id`

### 6.4 Modificações em endpoints existentes

#### `POST /api/auth/login`

- **Sucesso:** insere `LoginEvent { action: LOGIN_SUCCESS, user_id, empresa_id, email_attempt, ip, user_agent }`
- **Falha:** insere `LoginEvent { action: LOGIN_FAILED, user_id: nullable, empresa_id: nullable, email_attempt, ip, user_agent }`
- Captura `req.ip` (já correto graças a `trust proxy: 1`) e `req.headers['user-agent']`

#### `POST /api/auth/logout`

- Antes de invalidar refresh token: insere `LoginEvent { action: LOGOUT, ... }`

#### `POST /api/auth/refresh`

- **Falha** (token inválido/expirado): insere `LoginEvent { action: REFRESH_FAILED, ... }`
- Sucesso **NÃO** gera evento (refresh acontece a cada 15min — seria barulho demais)

### 6.5 Helper `audit.service.js`

```js
const SENSITIVE_KEY_PATTERNS = [/_hash$/, /_secret$/, /^senha/, /^password/, /^refresh_token/];

function sanitize(obj) {
  if (!obj) return obj;
  const out = {};
  for (const [k, v] of Object.entries(obj)) {
    if (SENSITIVE_KEY_PATTERNS.some(p => p.test(k))) continue;
    out[k] = v;
  }
  return out;
}

async function log({ req, empresaId, entity, action, entityId, before, after }) {
  await prisma.auditLog.create({
    data: {
      empresa_id: empresaId,
      actor_id: req.user.id,
      actor_email: req.user.email,
      entity_type: entity,
      entity_id: entityId,
      action,
      before: sanitize(before),
      after: sanitize(after),
      ip: req.ip,
      user_agent: (req.headers['user-agent'] || '').slice(0, 500),
    },
  });
}

module.exports = { log };
```

**Decisão:** chamada **síncrona com await**. Se gravar audit falhar, a request inteira falha (500). Em fechamento financeiro, é melhor abortar a operação do que perder a trilha.

### 6.6 Instrumentação nos services

Em **cada** `create / update / delete` de Trip, CTE, Fuel, Expense, User, Truck, adicionar **1 chamada** `audit.log(...)` ao final, dentro da transação quando houver. **Total:** ~20 chamadas adicionadas no codebase.

A assinatura dos services muda para receber `req` (para extrair user/ip/ua):
```js
// antes:
async function update(id, empresaId, data) { ... }
// depois:
async function update(id, empresaId, req, data) { ... }
```

Controllers passam `req` adiante.

## 7. Frontend

### 7.1 Navegação

`public/index.html` ganha:

- Botão `⚙️ Admin` no header (visível apenas se `role === 'ADMIN'`)
- Nova section `<main id="adminView" style="display:none">...</main>` com tabs

Toggle de view por `display:none/flex` (sem hash router por enquanto). Botão `← Voltar à Frota` retorna para a sidebar e tela de viagens.

### 7.2 Layout dos 3 tabs

```
┌─────────────────────────────────────────────────┐
│ [Usuários] [Auditoria] [Logins (48h)]           │  ← tabs
├─────────────────────────────────────────────────┤
│  conteúdo do tab selecionado                    │
└─────────────────────────────────────────────────┘
```

#### Tab 1 — Usuários

- Cabeçalho com `[+ Novo Usuário]` e busca por nome/email (filtro client-side, lista é pequena)
- Tabela: Nome | Email | Role | Status | Criado em | Ações
- Ações por linha: `Editar`, `↻ Senha`, `🚪 Sair`, `⏸ Desativar`/`▶ Ativar`, `📜 Atividade`
- Modais:
  - **Novo / Editar usuário**: nome, email, role (ADMIN/GESTOR), ativo (checkbox). Senha só no novo.
  - **Resetar senha**: input nova senha + confirmação. Warning: *"Isso vai encerrar todas as sessões deste usuário."*
  - **Encerrar sessões**: confirm simples
  - **Atividade do usuário**: abre tab Auditoria já filtrada por aquele user

#### Tab 2 — Auditoria

- Filtros: Entidade, Usuário, Ação, De/Até
- Tabela: Data | Usuário | Ação | Entidade | Resumo | `[Ver detalhe]`
- "Resumo" gerado no front pelo `diff-renderer.js` a partir de `before/after`
- Modal de detalhe com 2 colunas (ANTES / DEPOIS) e diff visual; rodapé com IP e User-Agent
- Paginação: `[«] [‹] Página 1 de 26 [›] [»]` + select `[50 por página]`

#### Tab 3 — Logins (48h)

- Filtros: Usuário, Ação
- Tabela: Data/Hora | Email | Ação (com ícone) | IP | Navegador
- Aviso no topo: *"Mostrando eventos das últimas 48 horas. Eventos mais antigos são removidos automaticamente."*
- Mesma paginação

### 7.3 Estado (state.js)

```js
state.adminView = false;
state.adminTab = 'users';
state.adminFilters = {
  audit:  { entity: null, entity_id: null, actor_id: null, action: null, from: null, to: null, page: 1, limit: 50 },
  logins: { user_id: null, action: null, page: 1, limit: 50 },
};
state.adminUsers = [];
state.adminAuditPage  = { items: [], total: 0, page: 1, totalPages: 1 };
state.adminLoginsPage = { items: [], total: 0, page: 1, totalPages: 1 };
```

### 7.4 Estilos

Reaproveita `variables.css`, `components.css`, modais existentes, `.btn`, `.entry-table`. Adiciona `admin.css` apenas para layouts específicos (filter strip, diff modal, badges de ação).

## 8. Cleanup job (48h)

`src/jobs/cleanupLoginEvents.js`:

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
  // imediato no boot
  cleanup().catch(err => console.error('[cleanup] failed:', err));
  // a cada 6 horas
  setInterval(() => {
    cleanup().catch(err => console.error('[cleanup] failed:', err));
  }, 6 * 60 * 60 * 1000);
}

module.exports = { cleanup, schedule };
```

Em `src/server.js`, após `prisma.$connect()` e antes de `app.listen`:

```js
const { schedule: scheduleCleanup } = require('./jobs/cleanupLoginEvents');
scheduleCleanup();
```

**Por que `setInterval`:** zero infra extra, o Railway só tem 1 instância web rodando. Falha do cleanup loga e tenta de novo na próxima janela; não derruba o servidor.

## 9. Segurança

| Risco | Mitigação |
|---|---|
| Brute force em login | `authLimiter` (existente) + `trust proxy: 1` (já corrigido). Falhas registradas em `login_events` para visibilidade. |
| Audit expõe campos sensíveis (`senha_hash`, etc) | Helper `audit.log()` filtra via `SENSITIVE_KEY_PATTERNS` antes de gravar. Padrões: `_hash$`, `_secret$`, `^senha`, `^password`, `^refresh_token`. |
| Validação fraca em senha resetada | Validator: mínimo 8 chars, ao menos 1 letra e 1 dígito. |
| Admin remove a si mesmo (lockout) | Backend bloqueia `req.user.id === req.params.id` em DELETE, PATCH role, PATCH ativo, reset password e revoke sessions. |
| IP spoofado via X-Forwarded-For | `trust proxy: 1` confia apenas no primeiro proxy (Railway). |
| Vazamento entre empresas (multi-tenant) | `audit_logs` filtra estritamente `empresa_id = req.user.empresa_id`. `login_events` filtra `empresa_id = req.user.empresa_id OR empresa_id IS NULL` — eventos com `empresa_id IS NULL` (LOGIN_FAILED com email desconhecido) ficam visíveis para todos os admins, pois são sinal de segurança útil (tentativa de invasão). Aceitável por enquanto pois a UI é Prima-only; quando virar multi-empresa, precisará revisar (mover para uma tabela `security_events` separada por exemplo). |
| Enumeração de usuários por timing | Login com email inexistente executa um `bcrypt.compare` dummy contra hash fixo, retornando o mesmo erro genérico. |

## 10. Tratamento de erros

- `audit.log()` lança em falha — controller propaga, `errorHandler` retorna 500 com `{ error: "..." }`
- Cleanup falhou → loga e segue, **não derruba o servidor**
- Reset de senha em transação atômica (`prisma.$transaction`): hash + update + revoke + audit. Se qualquer passo falha, rollback total.
- LoginEvent nunca deve quebrar o login se a inserção falhar (envolver em try/catch e logar). Decisão diferente do audit: login não é fechamento financeiro; perder visibilidade vs. impedir o user de entrar — preferimos deixar entrar.

## 11. Testes manuais — checklist

Arquivo: `docs/superpowers/testing/admin-panel-checklist.md`

Cobertura mínima por tab:

**Usuários:**
- [ ] Admin vê botão "⚙️ Admin" no header; gestor não vê
- [ ] Listar usuários da empresa
- [ ] Criar usuário GESTOR — login com nova senha funciona
- [ ] Criar usuário ADMIN — também consegue acessar Admin
- [ ] Editar nome / role / ativo
- [ ] Desativar usuário — login dele para de funcionar imediatamente
- [ ] Reativar usuário — volta a funcionar
- [ ] Resetar senha — usuário cai do sistema, login com nova senha funciona
- [ ] Forçar logout — usuário cai do sistema imediatamente
- [ ] Admin não consegue desativar/resetar a própria conta
- [ ] Filtros de busca funcionam

**Auditoria:**
- [ ] Criar viagem → aparece em audit como CREATE
- [ ] Editar despesa → aparece como UPDATE com before/after corretos
- [ ] Excluir CTE → aparece como DELETE
- [ ] Filtrar por entidade
- [ ] Filtrar por usuário
- [ ] Filtrar por período
- [ ] Modal de detalhe mostra diff colorido corretamente
- [ ] Resumo automático correto para CREATE/UPDATE/DELETE
- [ ] Paginação avança e volta
- [ ] Mudar "por página" reseta para página 1

**Logins:**
- [ ] Login OK aparece como LOGIN_SUCCESS
- [ ] Login com email errado aparece como LOGIN_FAILED
- [ ] Logout aparece como LOGOUT
- [ ] Eventos > 48h não aparecem (verificar após cleanup ou manualmente alterando `created_at` em dev)
- [ ] IP exibido corresponde ao IP real (não 127.0.0.1)
- [ ] User-Agent é truncado se muito longo

**Segurança:**
- [ ] Gestor batendo direto em `GET /api/audit` recebe 403
- [ ] Gestor batendo em `POST /api/users` recebe 403
- [ ] Tentar resetar senha sem ser admin: 403
- [ ] Senha curta (< 8 chars) é rejeitada com mensagem clara
- [ ] Audit log de uma empresa não vaza para usuário de outra empresa

## 12. Métricas de sucesso

- Lucas (admin) consegue criar 2 usuários novos pela UI
- Lucas consegue ver, em < 30s, "última edição feita na viagem X"
- Login do Lucas aparece em "Logins (48h)" em < 5s após o login
- Cleanup remove eventos > 48h sem intervenção manual
- Performance: lista de audit com 1000+ registros carrega em < 1s

## 13. Plano de entrega (sugerido — será refinado em writing-plans)

1. **Migration + helpers backend** (audit.service, loginEvents.service)
2. **Instrumentação nos services existentes** (audit.log nas mutações financeiras)
3. **Endpoints de leitura** (audit, login-events) e users (reset, sessions)
4. **Auth — captura de login events**
5. **Cleanup job + wiring no server**
6. **Frontend — admin tab base + Tab Usuários**
7. **Frontend — Tab Auditoria + diff renderer**
8. **Frontend — Tab Logins**
9. **Checklist manual + ajustes finais**

Cada passo é deployável de forma independente e o sistema continua funcionando para os usuários atuais durante toda a evolução.

---

## Apêndice A — Estado atual relevante

- **Login** já protegido por `authLimiter` em [src/routes/auth.routes.js:10](src/routes/auth.routes.js#L10)
- **`trust proxy: 1`** já habilitado em [src/app.js:14](src/app.js#L14) — IPs reais já estão chegando
- **RBAC** disponível em [src/middleware/rbac.js](src/middleware/rbac.js)
- **CRUD de usuários** já existe em [src/routes/users.routes.js](src/routes/users.routes.js) (list/create/update/remove)
- **Multi-tenant** garantido em [src/middleware/tenant.js](src/middleware/tenant.js)
