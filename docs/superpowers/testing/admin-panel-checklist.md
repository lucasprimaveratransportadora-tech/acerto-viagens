# Admin Panel — Checklist de Aceitação Manual

> Executar após o deploy no Railway. Marcar `[x]` em cada item que passar.
> Para itens de "outro usuário", criar um GESTOR de teste pela tela.

## Setup

- [ ] Após deploy do branch `feat/admin-panel` no Railway, abrir a URL pública
- [ ] Login com a conta admin existente funciona (LOGIN_SUCCESS deve aparecer em login_events)
- [ ] Botão `⚙️ Admin` aparece no header (só para ADMIN)

## Tab Usuários

- [ ] Lista carrega com pelo menos o admin atual
- [ ] Buscar por nome/email filtra a tabela em tempo real
- [ ] `+ Novo Usuário` → criar GESTOR `teste@prima.com.br` com senha `teste1234` → aparece na lista
- [ ] Logar com `teste@prima.com.br` em aba anônima → funciona
- [ ] Botão `⚙️ Admin` NÃO aparece para o GESTOR
- [ ] `Editar` no admin: mudar nome do GESTOR → salva
- [ ] `Editar`: mudar role para ADMIN → ele agora vê o botão Admin
- [ ] `Desativar` → linha mostra "Inativo" → login do GESTOR para de funcionar
- [ ] `Ativar` → volta a funcionar
- [ ] `↻ Senha` no GESTOR de teste com `novaSenha456` → confirmação → aba anônima cai para login → relogar com `novaSenha456` funciona
- [ ] `↻ Senha` com senha curta (5 chars) → erro claro
- [ ] `Sair` (revoke sessions) → aba anônima cai para login na próxima request
- [ ] No próprio admin: tentar `Editar` → erro 403 ou modal mostra erro
- [ ] No próprio admin: `↻ Senha` → erro 403
- [ ] No próprio admin: `Sair` (revoke) → erro 403

## Tab Auditoria

- [ ] Tab carrega com eventos das ações já realizadas
- [ ] Voltar à frota, criar uma viagem nova → tab Audit mostra `TRIP CREATE`
- [ ] Editar uma despesa de viagem → audit mostra `EXPENSE UPDATE` com valor antes/depois corretos
- [ ] Excluir um CTE → audit mostra `CTE DELETE`
- [ ] Excluir um caminhão (soft delete) → audit mostra `TRUCK DELETE`
- [ ] Filtrar por entidade `EXPENSE` → reduz lista
- [ ] Filtrar por ação `UPDATE` → reduz lista
- [ ] Filtrar por período (ex: hoje) → reduz lista
- [ ] Limpar filtros → volta tudo
- [ ] Clicar `Ver` em uma ação UPDATE → modal mostra ANTES/DEPOIS lado a lado, campos alterados destacados em amarelo
- [ ] Modal mostra IP e User-Agent corretos (não 127.0.0.1 nem vazio em produção)
- [ ] Resumo da linha mostra `campo: antes → depois` para até 3 mudanças
- [ ] Paginação `«` `‹` `›` `»` funciona se houver > 50 registros
- [ ] Senha hash NÃO aparece em nenhum entry de audit (verificar no Prisma Studio: `before` e `after` das ações em USER não têm `senha_hash`)

## Tab Logins (48h)

- [ ] Tab carrega com aviso "últimas 48 horas..."
- [ ] Login bem-sucedido aparece como ✅ LOGIN_SUCCESS
- [ ] Login com email errado em aba anônima → aparece como ❌ LOGIN_FAILED com email tentado
- [ ] Login com senha errada → também aparece como ❌ LOGIN_FAILED
- [ ] Logout pelo botão "Sair" → aparece como 🚪 LOGOUT
- [ ] Filtrar por ação `LOGIN_FAILED` → mostra só falhas
- [ ] IP exibido corresponde ao IP real (não 127.0.0.1 no Railway atrás de proxy)
- [ ] User-Agent é truncado se > 60 chars

## Segurança (curl ou DevTools)

> Pegar o accessToken do GESTOR (devtools → Application → SessionStorage → accessToken).

- [ ] `GET /api/audit` com token GESTOR → 403
- [ ] `POST /api/users` com token GESTOR → 403
- [ ] `POST /api/users/<id>/reset-password` com token GESTOR → 403
- [ ] `DELETE /api/users/<id>/sessions` com token GESTOR → 403
- [ ] `GET /api/login-events` com token GESTOR → 403

## Cleanup

- [ ] Verificar nos logs do Railway: na inicialização aparece `Login events cleanup scheduled (every 6h, retention 48h)`
- [ ] (Opcional, requer Prisma Studio) — inserir manualmente um login_event com `created_at = NOW() - INTERVAL '49 hours'`. Aguardar 6h ou reiniciar o app. Ele deve ser removido pelo cleanup.

---

**Aprovação final:** todas as checkboxes acima `[x]` antes de declarar a feature aceita.
