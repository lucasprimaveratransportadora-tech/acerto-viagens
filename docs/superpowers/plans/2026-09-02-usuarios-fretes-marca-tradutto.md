# Usuários, fretes e marca Tradutto Transporte Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Entregar gestão segura de usuários/senhas, vínculo 1:1 de frete terceiro com CT-e/acerto e a marca “TRADUTTO TRANSPORTE” em toda a experiência web/PWA/documentos.

**Architecture:** Manter Express + Prisma + frontend vanilla existente. A sessão continua sendo a única fonte do tenant; a API fará ownership e permissões antes de cada mutation. O vínculo será persistido diretamente em `Cte` com unicidade, e o branding será centralizado no bootstrap do frontend e nos geradores de documentos.

**Tech Stack:** Node.js 20, Express, Prisma/PostgreSQL, bcrypt, express-validator, frontend ES modules, PWA manifest/service worker.

---

### Task 1: Troca da própria senha e gestão segura de usuários

**Files:**
- Create: `src/validators/account.validator.js`
- Modify: `src/routes/auth.routes.js`
- Modify: `src/controllers/auth.controller.js`
- Modify: `src/services/auth.service.js`
- Modify: `src/middleware/rateLimiter.js`
- Modify: `public/index.html`
- Create: `public/js/account.js`
- Test: `test/account-password.test.js`

- [ ] **Step 1: Write the failing tests** para senha atual incorreta, senha nova válida e revogação das sessões do usuário.
- [ ] **Step 2: Run the focused test** with `node --test test/account-password.test.js`; expect failure because the account password operation does not exist.
- [ ] **Step 3: Add `POST /api/auth/change-password`** protected by `auth`, validating `senha_atual` and `nova_senha` (8+ characters, letters and numbers), comparing with bcrypt, updating only the session user and deleting that user’s refresh tokens in one transaction.
- [ ] **Step 4: Keep the active request usable** by returning a clear success response; the next API refresh must require login again because all refresh tokens were revoked. Never include password hashes in responses or audit metadata.
- [ ] **Step 5: Add a rate limiter** for password changes and render a “Minha conta / Alterar senha” modal from the current-user menu.
- [ ] **Step 6: Run `node --test test/account-password.test.js`** and expect PASS.
- [ ] **Step 7: Commit** only the task files with `git add src/validators/account.validator.js src/routes/auth.routes.js src/controllers/auth.controller.js src/services/auth.service.js src/middleware/rateLimiter.js public/index.html public/js/account.js test/account-password.test.js && git commit -m "feat: permite usuario trocar propria senha"`.

### Task 2: Reforçar criação de usuários por empresa

**Files:**
- Modify: `src/validators/auth.validator.js`
- Modify: `src/services/users.service.js`
- Modify: `src/controllers/users.controller.js`
- Modify: `public/js/admin/users.js`
- Test: `test/users-permissions.test.js`

- [ ] **Step 1: Write failing tests** proving an ADMIN can create a GESTOR with selected modules, a GESTOR cannot create users, and a request cannot assign `SUPER_ADMIN` or another `empresa_id`.
- [ ] **Step 2: Run `node --test test/users-permissions.test.js`** and confirm the new authorization cases fail.
- [ ] **Step 3: Tighten validators** so the user-management payload accepts only `ADMIN` or `GESTOR`, valid module keys, and rejects `empresa_id` as an authority field for this route.
- [ ] **Step 4: Enforce the same rules in the service**: use `req.user` role as authority, scope all reads/writes by `req.user.empresa_id`, default created users to `GESTOR`, and preserve audit diffs without credentials.
- [ ] **Step 5: Keep the existing admin screen** but make the role/module choices explicit, disable ADMIN assignment when the actor is not allowed, and add account-password access for every logged-in user rather than only admins.
- [ ] **Step 6: Run focused tests and `npm test`; expect all tests to pass.
- [ ] **Step 7: Commit** the task files with `git add src/validators/auth.validator.js src/services/users.service.js src/controllers/users.controller.js public/js/admin/users.js test/users-permissions.test.js && git commit -m "feat: endurece usuarios por empresa"`.

### Task 3: Persistir vínculo 1:1 frete terceiro → CT-e

**Files:**
- Modify: `prisma/schema.prisma`
- Create: `prisma/migrations/20260902120000_cte_frete_terceiro/migration.sql`
- Modify: `src/services/ctes.service.js`
- Modify: `src/controllers/ctes.controller.js`
- Modify: `src/routes/ctes.routes.js`
- Modify: `src/validators/cte.validator.js`
- Modify: `src/services/fretesTerceiros.service.js`
- Test: `test/cte-frete-terceiro.test.js`

- [ ] **Step 1: Write failing tests** for listing only same-tenant unlinked fretes, creating a CT-e from one frete, rejecting a second link, and rejecting a cross-tenant frete.
- [ ] **Step 2: Run `node --test test/cte-frete-terceiro.test.js`; expect failure before the relation/endpoint exists.
- [ ] **Step 3: Add nullable `frete_terceiro_id` to `Cte` and the inverse relation to `FreteTerceiro`, with a unique database index that permits one CT-e per frete.
- [ ] **Step 4: Generate the Prisma client and write the migration** using the project’s existing Prisma workflow; apply it to the local database before running integration tests.
- [ ] **Step 5: Add `GET /api/ctes/fretes-disponiveis?q=`** returning only fretes in the current tenant with `trip_id = null`, `deleted_at = null`, and status not `CANCELADO`, searching `numero` when the number field exists plus the existing identification fields.
- [ ] **Step 6: Extend CT-e creation** with optional `frete_terceiro_id`; within a transaction, verify the trip and frete belong to the same tenant, verify the frete is unlinked, create the CT-e and set the frete’s `trip_id` together. Translate uniqueness races to a safe conflict response.
- [ ] **Step 7: Include the linked frete in CT-e/trip reads and keep unlink/delete operations consistent, never allowing a link to another tenant.
- [ ] **Step 8: Run focused tests and `npm test`; expect PASS.
- [ ] **Step 9: Commit schema, migration, API and tests with `git add prisma/schema.prisma prisma/migrations/20260902120000_cte_frete_terceiro/migration.sql src/services/ctes.service.js src/controllers/ctes.controller.js src/routes/ctes.routes.js src/validators/cte.validator.js src/services/fretesTerceiros.service.js test/cte-frete-terceiro.test.js && git commit -m "feat: vincula frete terceiro a cte"`.

### Task 4: Interface de seleção no novo CT-e/acerto

**Files:**
- Modify: `public/js/trips.js`
- Modify: `public/js/trip-frete-link.js`
- Modify: `public/index.html`
- Modify: `public/css/trips.css`
- Modify: `public/css/mobile.css`
- Test: `test/cte-frete-ui.test.js`

- [ ] **Step 1: Write a failing frontend test** for opening “Criar CT-e”, searching a free frete by number and submitting its id.
- [ ] **Step 2: Run `node --test test/cte-frete-ui.test.js`; expect failure because the selector and payload are not present.
- [ ] **Step 3: Add a compact selection block** to the CT-e form with debounced search, loading/empty/error states, and a selected-card summary showing pagadora, motorista, veículo and value.
- [ ] **Step 4: Submit `frete_terceiro_id` to the existing CT-e route**, clear the selection after success, refresh the trip, and show the linked frete in the CT-e row.
- [ ] **Step 5: Make the interaction mobile-first**: full-width controls, horizontal-safe card layout, no hidden primary action at zoom, and accessible labels/focus states.
- [ ] **Step 6: Run the focused test plus the existing UI-related tests; expect PASS.
- [ ] **Step 7: Commit with `git add public/js/trips.js public/js/trip-frete-link.js public/index.html public/css/trips.css public/css/mobile.css test/cte-frete-ui.test.js && git commit -m "feat: seleciona frete terceiro ao criar cte"`.

### Task 5: Marca Tradutto Transporte em web, PWA e documentos

**Files:**
- Modify: `public/index.html`
- Modify: `public/manifest.webmanifest`
- Modify: `public/service-worker.js`
- Modify: `public/unregister-sw.html`
- Modify: `public/js/branding.js`
- Modify: `public/js/app.js`
- Modify: `public/js/api.js`
- Modify: `public/css/layout.css`
- Modify: `public/css/hub.css`
- Modify: `public/css/mobile.css`
- Modify: `public/css/print.css`
- Modify: `public/js/trips.js`
- Modify: `public/js/frete-terceiro.js`
- Test: `test/tradutto-branding.test.js`

- [ ] **Step 1: Write failing tests** asserting the global product name, PWA metadata, offline page, document footer and browser title use “TRADUTTO TRANSPORTE” while tenant logo/name remain present.
- [ ] **Step 2: Run `node --test test/tradutto-branding.test.js`; expect failures for the current Prima strings.
- [ ] **Step 3: Centralize constants** for `TRADUTTO TRANSPORTE`, product description and canonical origin; make tenant branding an additive layer rather than replacing the platform identity.
- [ ] **Step 4: Update HTML titles, visible platform labels, manifest, service-worker cache/offline text, favicon/icon references and installed-mobile metadata.
- [ ] **Step 5: Update print/download templates** so every generated document carries Tradutto Transporte plus the active transportadora’s name/logo, without leaking another tenant’s assets.
- [ ] **Step 6: Preserve transparent tenant logos and responsive header sizing; test at narrow viewport/zoom-sensitive CSS selectors with static assertions.
- [ ] **Step 7: Run focused tests and `npm test`; expect PASS.
- [ ] **Step 8: Commit branding changes with `git add public/index.html public/manifest.webmanifest public/service-worker.js public/unregister-sw.html public/js/branding.js public/js/app.js public/js/api.js public/js/trips.js public/js/frete-terceiro.js public/css/layout.css public/css/hub.css public/css/mobile.css public/css/print.css test/tradutto-branding.test.js && git commit -m "feat: aplica marca Tradutto Transporte"`.

### Task 6: Domínio, conta operacional e release

**Files:**
- Modify: `src/config/index.js`
- Test: `test/domain-config.test.js`

- [ ] **Step 1: Write a failing config test** for canonical origin `https://transporte.tradutto.com.br` and allowed-origin behavior.
- [ ] **Step 2: Add configuration** so the custom domain is accepted in production without weakening credentialed CORS for arbitrary origins.
- [ ] **Step 3: Run the config test and full suite; expect PASS.
- [ ] **Step 4: Generate the production migration and verify it against the Railway database before pushing code.
- [ ] **Step 5: Perform the authorized internal account update from `ney@vidallogistica.com` to `aneilhomar@icloud.com` using a one-off script that updates only the email and records no password; verify uniqueness and preserve `senha_hash` without printing it.
- [ ] **Step 6: Run `npm test`, `node --check` on changed JS files, `git diff --check`, `npx prisma validate` and the project’s Prisma migration check. Record exact outputs before any release claim; this JavaScript project has no compilation/build step.
- [ ] **Step 7: Rebase on `origin/main`, confirm `git diff --stat origin/main...HEAD` contains only this work, then merge fast-forward into local `main` and push `main`.
- [ ] **Step 8: Deploy to Railway production, configure/check the custom domain, and validate login, password change, tenant branding, free-frete selection and PWA metadata over HTTPS.
- [ ] **Step 9: Create a new second-brain session note under `CONTEXTO.lucascarvalho/log/2026/09/02/` without editing another chat’s note; if that repository is still dirty, preserve unrelated changes and report the blocked write.

## Verification commands

```powershell
npm test
node --check src/services/auth.service.js
node --check src/services/ctes.service.js
git diff --check
npx prisma validate
npx prisma migrate status
```

Expected result: all automated tests pass, syntax checks exit 0, no whitespace errors, and the local database reports migrations applied. Production validation must confirm tenant isolation and that `aneilhomar@icloud.com` can log in and change the password without exposing the old hash.
