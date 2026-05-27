# Acerto de Viagem — Redesenho da edição, numeração, identidade e impressão

**Data:** 2026-05-27
**Branch:** `feat/acerto-redesign`
**Módulo afetado:** Acerto de Viagem (frota). Sem sobreposição com o módulo Kanban operacional em paralelo (que mexe em `Truck`/`User`).

---

## 1. Problema

A tela atual de Acerto de Viagem (cartão expansível no dashboard + modal de edição) tem 7 dores reportadas pelo usuário:

1. Campos **Origem/Destino** na aba "Geral" são redundantes — o usuário já informa origem/destino em cada CTE.
2. **Bug de data**: ao editar uma viagem pelo modal, datas de CTE e Abastecimento não aparecem nos inputs (mas a edição inline mostra normalmente).
3. **Bug de despesas no modal**: o campo "Abastecimento (auto = ⛽)" não vem preenchido no modal, embora apareça correto na view inline.
4. **Modal perde estado**: qualquer clique fora fecha o modal e o usuário perde tudo o que digitou. Pediu autosave em todos os campos.
5. **Toggle de status**: hoje exige abrir o modal só pra mudar PENDENTE↔OK. Quer clicar direto no badge do card.
6. **Identidade da viagem**: cada acerto precisa de número sequencial próprio (controle do gestor). O card hoje mostra "ORIGEM → DESTINO" e isso deve virar "Acerto #N — data".
7. **Impressão/PDF**: precisa entregar a folha visual do acerto pro motorista (impressa ou em PDF).

## 2. Objetivo

Resolver todas as 7 dores num único entregável, eliminando complexidade ao invés de adicionar (tirar o modal de edição em vez de fazê-lo autosave). Manter retrocompatibilidade com dados existentes via backfill.

## 3. Decisões locked (confirmadas com o usuário)

| # | Decisão |
|---|---|
| 1 | Numeração sequencial **global por empresa**, sem reset por ano nem por caminhão. |
| 2 | Origem e destino do card vêm **do primeiro CTE** (campo `numero` ASC, fallback `created_at` ASC se número for nulo). Campos `Trip.origem` e `Trip.destino` da aba Geral somem da UI. |
| 3 | **Modal de edição é deletado.** A view inline existente (`buildDetail` em `public/js/trips.js`) já cobre tudo — vira a única forma de editar. Para criar viagem, um mini-modal só com `caminhão` + `data de início` permanece. |
| 4 | Impressão via `window.print()` + CSS `@media print` dedicado. Zero dependências novas. |
| 5 | Badge de status no card vira clicável e cicla **PENDENTE → OK → CANCELADA → PENDENTE**. |

## 4. Mudanças por área

### 4.1 Schema (Prisma)

`Trip` hoje só conhece empresa via `truck.empresa_id`. Como o número é sequencial **por empresa**, precisamos desnormalizar `empresa_id` na tabela `trips` pra ter o unique composto. Trade-off aceito: 1 coluna a mais em troca de simplicidade na geração.

**Migração `20260527120000_trip_numero/migration.sql`:**

```sql
-- 1. Adiciona colunas (nullable durante backfill)
ALTER TABLE trips ADD COLUMN empresa_id UUID;
ALTER TABLE trips ADD COLUMN numero INTEGER;

-- 2. Backfill empresa_id a partir de truck
UPDATE trips
SET empresa_id = trucks.empresa_id
FROM trucks
WHERE trips.truck_id = trucks.id;

-- 3. Backfill numero em ordem cronológica por empresa
WITH numbered AS (
  SELECT id,
         ROW_NUMBER() OVER (PARTITION BY empresa_id
                            ORDER BY data_inicio ASC, created_at ASC) AS rn
  FROM trips
  WHERE deleted_at IS NULL
)
UPDATE trips
SET numero = numbered.rn
FROM numbered
WHERE trips.id = numbered.id;

-- 4. Tornar NOT NULL após backfill
ALTER TABLE trips ALTER COLUMN empresa_id SET NOT NULL;
ALTER TABLE trips ALTER COLUMN numero SET NOT NULL;

-- 5. FK + unique + index
ALTER TABLE trips
  ADD CONSTRAINT trips_empresa_id_fkey
  FOREIGN KEY (empresa_id) REFERENCES empresas(id);

CREATE UNIQUE INDEX trips_empresa_numero_unique ON trips (empresa_id, numero);
CREATE INDEX trips_empresa_id_idx ON trips (empresa_id);
```

**Nota sobre viagens soft-deleted**: a numeração ignora `deleted_at IS NOT NULL` no backfill (item 3). Isso significa que se 5 viagens foram excluídas no histórico, **o número 13 vai pra próxima viagem nova**, mesmo que existam IDs entre 1 e 12 "consumidos" por excluídas. Decisão consciente: número é gerado por `MAX(numero) + 1` por empresa, sem reaproveitar gaps. Simples e previsível.

Como soft-deleted vão receber `numero` durante o backfill (já que rodamos o backfill **sem** filtro WHERE deleted_at), o número delas fica reservado pra sempre — não há conflito. Vou ajustar o backfill pra incluir soft-deleted também, atribuindo número em ordem de `created_at` pra elas serem incluídas sem disputar com as ativas:

```sql
-- versão final do passo 3:
WITH numbered AS (
  SELECT id,
         ROW_NUMBER() OVER (PARTITION BY empresa_id
                            ORDER BY data_inicio ASC, created_at ASC) AS rn
  FROM trips                                     -- inclui deleted_at NOT NULL
)
UPDATE trips
SET numero = numbered.rn
FROM numbered
WHERE trips.id = numbered.id;
```

No Prisma schema adicionar:

```prisma
model Trip {
  // ... campos existentes
  empresa_id   String
  empresa      Empresa  @relation(fields: [empresa_id], references: [id])
  numero       Int
  // ...
  @@unique([empresa_id, numero])
  @@index([empresa_id])
}

model Empresa {
  // ... existentes
  trips        Trip[]
}
```

### 4.2 Backend — geração do número e derivação de origem/destino

**`src/services/trips.service.js`:**

- `create()` passa a calcular `numero` dentro da transação:
  ```js
  const last = await tx.trip.findFirst({
    where: { empresa_id: empresaId },
    orderBy: { numero: 'desc' },
    select: { numero: true },
  });
  const proxNumero = (last?.numero ?? 0) + 1;
  ```
  Atribui `empresa_id: empresaId` e `numero: proxNumero` ao criar a Trip.
  Como a verificação `verifyTruckOwnership` já confirmou que o truck pertence à empresa, `empresa_id` vem dela.

- `getById()` e `listByTruck()` passam a calcular `origem_calc` e `destino_calc` no service (não no banco) lendo o 1º CTE da lista ordenada por `data ASC, created_at ASC`. Para evitar query extra: como `ctes` já vem em `include`, ordenamos no service após a busca. Devolve esses campos calculados no JSON, **sem** persistir.
  - **Fallback para dados legados**: se a Trip **não tem CTE** mas tem `origem`/`destino` antigos preenchidos no banco (viagens criadas antes da mudança), o service usa esses como `origem_calc`/`destino_calc`. Garante que o histórico não vire "— sem CTE —" depois do deploy.
  - Se não tem nem CTE nem origem/destino legados, `origem_calc` e `destino_calc` vêm `null` — a UI mostra "— sem CTE —".

- Whitelist `TRIP_PATCH_FIELDS`: **remover** `origem` e `destino`. A UI deixa de mandar esses campos; o `pick()` simplesmente ignora se vierem (silently). Os valores legados no banco permanecem (não zeramos).

- Whitelist `TRIP_CREATE_FIELDS`: **remover** `origem`, `destino`. Viagens novas têm essas colunas `NULL`.

**`src/validators/trip.validator.js`**: remover validações de `origem`/`destino` (já que o whitelist não aceita mais — manter validador deixaria erro confuso).

### 4.3 UI — card no dashboard (`public/js/dashboard.js`)

**Hoje:**
```
[22/10/2025]  ORIGEM → DESTINO [cargo]   R$ 19.719,14  - R$ 9.816,88  = R$ 9.902,26  2.954km  [Concluída]
```

**Vai virar:**
```
[#847]  22/10/2025  📍 JATAI → RJ   R$ 19.719,14  - R$ 9.816,88  = R$ 9.902,26  2.954km  [⏳ Pendente]
```

Convenção visual: **`#N`** no card (compacto) e **`ACERTO Nº N`** no PDF impresso (formal). Mesma numeração, formatações diferentes.

Mudanças:
- "Acerto #N" no início, em destaque (mesma posição da data atual).
- Data ao lado, menor.
- Origem→destino derivado do 1º CTE (campo `origem_calc`/`destino_calc` vindo do backend). Se não houver CTE: mostra `— sem CTE —`.
- Badge de status (`status-badge`) vira clicável: `onclick="cycleTripStatus(tripId)"`. Mostra mini-ícone de lápis pra deixar claro que é interativo.
- Botão "✏️ Editar" (que abria o modal) é **removido**. Pra editar, basta clicar no card e usar a view inline já existente.
- Adiciona botão "🖨️ Imprimir" no `.trip-actions`.

### 4.4 UI — view inline (`public/js/trips.js` `buildDetail`)

A view inline já cobre quase tudo. Mudanças pontuais:

- Remover da faixa de info (`trip-info-bar`) a referência a `tr.origem`/`tr.destino` (não tem hoje, ok — só confirmar).
- O campo Despesa "Abastecimento (auto)" **já está correto** na view inline (linha 151 lê `totFuelVal`). Esse era o bug #3 do modal — vai morrer com o modal.
- Datas de CTE/Abast nos rows inline já usam `<input type="date">` sem valor preenchido (já que são linhas vazias pra adicionar). As datas **das linhas existentes** aparecem como texto via `fmtD(c.data)` (linha 77) — ok, não tem bug aqui. O bug #2 era exclusivo do modal.

### 4.5 Nova Viagem — mini-modal de criação

O modal grande hoje (`#tripModal`) tem 5 abas e tudo. Pra criar uma viagem, o usuário só precisa de:
- Caminhão (já pré-selecionado pelo sidebar)
- Data de início

Substituir `openTripModal` por uma versão mini com só esses 2 campos + botão "Criar". Ao clicar, faz POST, recebe a Trip já com `numero`, e o dashboard re-renderiza com o card novo já expandido pra edição inline.

Botão "+ Nova Viagem" continua no header (`renderMain` linha 54).

### 4.6 Eliminar modal de edição

- Em `public/index.html`: remover o `<div id="tripModal">` inteiro (e suas abas).
- Substituir por um `<div id="newTripModal">` mínimo com só 2 inputs.
- Em `public/js/trips.modal.js`: deletar `editTrip`, `addCteRow`, `addFuelRow`, `buildDespFields`, `saveTrip` (mantendo só o `openNewTripModal` e `saveNewTrip` reduzidos). Arquivo encolhe muito.
- Em `public/js/dashboard.js`: remover botão `editTrip` do card.

### 4.7 Toggle de status no card

Novo handler em `public/js/trips.js`:

```js
const STATUS_CYCLE = { PENDENTE: 'OK', OK: 'CANCELADA', CANCELADA: 'PENDENTE' };

window.cycleTripStatus = async function (tripId, badgeEl) {
  const tr = state.trips.find(t => t.id === tripId);
  if (!tr) return;
  const next = STATUS_CYCLE[tr.status] || 'PENDENTE';
  badgeEl.classList.add('updating'); // feedback visual
  try {
    await api.patch('/api/trips/' + tripId, { status: next });
    tr.status = next;
    // re-renderiza só o badge daquela trip (não a página inteira)
    updateBadgeUI(badgeEl, next);
  } catch (e) {
    alert('Erro ao atualizar status: ' + e.message);
  } finally {
    badgeEl.classList.remove('updating');
  }
};
```

`event.stopPropagation()` no onclick pra não expandir o card.

### 4.8 Impressão (CSS `@media print` + botão)

Arquivo novo: `public/css/print.css` (ou bloco no css existente).

Botão no card:
```html
<button onclick="printAcerto('${id}')" title="Imprimir folha">🖨️</button>
```

Função `printAcerto(tripId)`:
1. Expande o card de detalhe se estiver fechado.
2. Adiciona classe `.printing` no body + atributo `data-print-trip="${tripId}"` no body.
3. Insere (uma vez) um header de impressão escondido na tela mas visível na impressão, com:
   ```html
   <div class="print-header">
     <img src="/assets/images/logo-full.png" class="print-logo">
     <h1>ACERTO Nº <span class="print-numero">847</span></h1>
     <div class="print-sub">
       <div>Placa: <strong>RBO5B05</strong></div>
       <div>Motorista: <strong>ANTONIO</strong></div>
       <div>Período: <strong>22/10/2025 → 29/10/2025</strong></div>
     </div>
   </div>
   ```
4. Chama `window.print()`.
5. Listener `afterprint` remove a classe `.printing` e o atributo.

CSS `@media print`:
- Esconde `.sidebar`, `.page-header`, `.kpi-row`, `.month-hdr`, `.trip-actions`, `.inline-add-row`, todos os `.action-btn`, `.inline-del`, `.collapse-icon`.
- Esconde **todas** as `.trip-card` exceto aquela com `data-print-trip` igual ao body's `data-print-trip`.
- Força `.trip-detail.open` (expandido).
- Logo: ~120px de altura, centralizada.
- Cabeçalho ocupa o topo. Quebra `page-break-after: avoid` pra cada seção (CTEs / Abastecimentos / Despesas / Acerto).
- Cores: força paleta clara (fundo branco, texto preto, vermelho mantido pra valores negativos).
- Margens A4: 12mm.

Layout aproximado da impressão (1 página A4 quando couber):

```
┌────────────────────────────────────────────────┐
│              [ LOGO PRIMA TRANSPORTES ]         │
│                                                 │
│              ACERTO Nº 847                      │
│                                                 │
│  Placa: RBO5B05      Motorista: ANTONIO         │
│  Período: 22/10/2025 → 29/10/2025               │
│  KM percorridos: 2.954 km · Média: 2,38 km/L    │
├────────────────────────────────────────────────┤
│ CTes / Fretes                       R$ 19.719,14│
│  22/10  31620  JATAI→RJ           R$ 12.679,14  │
│  29/10  50294  POÇOS→JATAI        R$  7.040,00  │
├────────────────────────────────────────────────┤
│ Abastecimentos        R$ 6.820,88 · 1.240 L     │
│  26/10  500L  R$5,75  SMIDERLE   R$ 2.876,68    │
│  04/11  740L  R$5,33  PRIMA      R$ 3.944,20    │
├────────────────────────────────────────────────┤
│ Despesas                            R$ 9.816,88 │
│  Descarga CTE 1            476,00               │
│  Descarga CTE 2             60,00               │
│  Abastecimento          6.820,88                │
│  Comissão Motorista     2.400,00                │
│  Estacionamento             50,00               │
│  Extras                     10,00               │
├════════════════════════════════════════════════┤
│ Total Fretes (CTes)            R$ 19.719,14     │
│ (-) Total Despesas              R$  9.816,88    │
│ SALDO ACERTO MOTORISTA          R$  9.902,26    │
└────────────────────────────────────────────────┘
```

## 5. Fluxo de migração & backfill

Ordem de execução **sem downtime**:

1. **Migration**: adiciona `empresa_id` e `numero` na tabela, faz backfill de ambos, cria índice único parcial. Migração feita por `prisma migrate dev` (e em produção `prisma migrate deploy`).
2. **Deploy do backend novo**: gera `numero` automaticamente em novas Trips, devolve `origem_calc`/`destino_calc`. Aceita PATCH sem `origem`/`destino` (já aceita — só não usa mais).
3. **Deploy do frontend novo**: card mostra número, derivação, badge clicável, mini-modal de criação. Modal de edição deletado.

Em produção (Railway), são deploys atômicos do mesmo commit — não precisa coordenar; a migração roda no startup via `prisma migrate deploy`.

## 6. Plano de testes manual

Lista que vou cumprir antes de chamar "pronto":

1. **Backfill**: rodar `prisma migrate dev`, abrir o dashboard, conferir que viagens antigas têm número 1, 2, 3... em ordem cronológica.
2. **Criação**: criar viagem nova → vem com o próximo número (ex: 13).
3. **Origem/destino derivado**: criar viagem nova sem CTE → card mostra "— sem CTE —". Adicionar CTE com origem "X" / destino "Y" inline → card atualiza pra "X → Y".
4. **Múltiplos CTEs**: o card sempre mostra o do 1º CTE (menor número/data).
5. **Bug #2 (data CTE/Abast)**: agora ele não existe — sem modal. Confirmar que adicionar CTE/Abast inline com data preenchida grava certo.
6. **Bug #3 (abast auto)**: confirmar que o campo "Abastecimento (auto = ⛽)" no inline mostra o total dos fuels (já mostra).
7. **Status toggle**: clicar no badge do card → cicla Pendente→OK→Cancelada→Pendente. Persiste após reload.
8. **Impressão**: clicar 🖨️ → preview do navegador mostra layout com logo, número, dados resumidos, sem sidebar/header. Salvar como PDF → arquivo legível.
9. **Outro projeto (Kanban)**: confirmar que `git status` continua mostrando WIP do Kanban intocado.

## 7. Out of scope (não vai entrar agora)

- Configurar número inicial (sempre começa em 1).
- Buscar viagem pelo número (filtro/search). Pode entrar depois.
- Imprimir múltiplas viagens em lote.
- Numeração customizável por usuário/empresa.
- Email automático do PDF pro motorista.
- Mudar layout do `frete-terceiro` (outro módulo).

## 8. Riscos & rollback

| Risco | Mitigação |
|---|---|
| Conflito de unique `(empresa_id, numero)` em concorrência | Geração dentro da transação Prisma com `SERIALIZABLE`. Se a empresa tiver alta concorrência (não tem hoje), trocar para advisory lock por empresa. |
| Backfill atribui número diferente do "esperado" pelo usuário | Backfill ordena por `data_inicio ASC` — a sequência natural. Se quiser remunerar manualmente, é UPDATE direto no banco. |
| Quebrar links / bookmarks antigos | URLs não mudam (continuam por UUID). Número é só display. |
| Print quebra em browsers diferentes | Testar em Chrome (alvo principal). CSS @media print é padrão; fallback é o usuário usar "Imprimir" do menu. |
| Working tree do outro módulo (Kanban) ser engolido por commit | Sempre `git add <arquivo específico>`, nunca `-A`. Documentar arquivos tocados em cada commit. |

## 9. Estimativa de tamanho

| Fase | Arquivos tocados | Esforço |
|---|---|---|
| 1. Schema + migration | `prisma/schema.prisma`, nova migration | Pequeno |
| 2. Backend (numero + derivação) | `trips.service.js`, `trip.validator.js` | Pequeno |
| 3. Card do dashboard | `dashboard.js` | Pequeno |
| 4. Eliminar modal + mini-modal | `trips.modal.js`, `index.html`, `dashboard.js` | Médio |
| 5. Impressão | `print.css` (novo), `trips.js`, `index.html` | Médio |

Total: ~5-6h de trabalho focado. Cada fase é um commit separado.

## 10. Arquivos tocados (exato)

- `prisma/schema.prisma` — model Trip (+ empresa_id, numero, relation, index)
- `prisma/migrations/20260527120000_trip_numero/migration.sql` — novo
- `src/services/trips.service.js` — geração de numero, derivação de origem/destino, remover origem/destino do whitelist
- `src/validators/trip.validator.js` — remover validações de origem/destino
- `public/js/dashboard.js` — novo header do card, badge clicável, botão imprimir
- `public/js/trips.js` — `cycleTripStatus`, `printAcerto` + componente print
- `public/js/trips.modal.js` — encolhe pra só mini-modal de criação
- `public/index.html` — substitui `#tripModal` por `#newTripModal`
- `public/css/print.css` — novo, importado por `index.html`
- (sem novas dependências em `package.json`)

**Não tocar:** frete-terceiro, veículos, trucks.modal, users.js, expenses.routes/service, fuels.service, ctes.service (esses arquivos têm WIP do outro projeto do usuário).

---

**Fim do spec.** Próximo passo: skill `writing-plans` pra detalhar o plano de execução fase por fase.
