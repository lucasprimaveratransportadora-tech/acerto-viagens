# Usuários, fretes terceiros e marca Tradutto Transporte

## Objetivo

Preparar o Acerto de Viagens para ser utilizado por várias transportadoras, com gestão de
usuários por empresa, troca de senha pelo próprio usuário, vínculo rastreável de frete terceiro
ao acerto/CT-e e identidade de plataforma da Tradutto Transporte.

## Escopo funcional

### Usuários e senha

- Usuários autenticados poderão alterar a própria senha informando a senha atual e uma nova senha.
- A troca revogará os refresh tokens existentes para impedir a continuidade de sessões antigas.
- O ADMIN da empresa poderá criar, editar, ativar/desativar e revogar sessões de usuários da própria
  empresa.
- Usuários criados para operação serão GESTOR por padrão, com módulos selecionáveis (`frota`,
  `frete-terceiro`, `veiculos`, `rentabilidade` e `controle-viagens`).
- Nenhuma rota permitirá alterar empresa, role SUPER_ADMIN ou senha sem as validações do servidor.
- A conta `ney@vidallogistica.com` será atualizada para `aneilhomar@icloud.com` preservando o hash
  de senha existente; a senha não será lida nem exibida.

### Frete terceiro e CT-e/acerto

- Todo frete terceiro novo permanece `ABERTO` até que as baixas alterem seu status.
- A criação de CT-e apresentará fretes terceiros da mesma empresa que ainda não estejam vinculados
  a uma viagem/acerto.
- A lista permitirá busca pelo número do CT-e e identificação do frete por empresa pagadora,
  motorista, veículo, origem e destino.
- A relação de negócio será 1:1: cada frete terceiro pode ser vinculado a apenas um CT-e/acerto.
- Ao confirmar, o backend validará a empresa pela sessão, verificará que o frete continua livre e
  vinculará o frete à viagem e ao CT-e em uma transação.
- Frete já vinculado não aparecerá novamente e uma tentativa concorrente será rejeitada.
- Criação, vínculo, alteração e desfazimento serão registrados na auditoria sem senha, token ou PII
  desnecessária.

### Marca e domínio

- A marca global do produto será `TRADUTTO TRANSPORTE` em títulos, textos institucionais,
  downloads/documentos, manifest PWA, favicon e tela inicial instalada no celular.
- A identidade da transportadora continuará contextual: logo, nome e cor da empresa aparecem no
  ambiente dela, acompanhados da marca Tradutto Transporte.
- PDFs e demais documentos baixados terão identificação da plataforma e da transportadora usuária.
- O domínio canônico será `https://transporte.tradutto.com.br`; o Railway deverá receber o domínio
  customizado e o DNS do provedor deverá apontar para o destino informado pelo Railway.

## Arquitetura e segurança

- O `empresa_id` será sempre derivado da sessão/tenant, nunca aceito como autoridade no corpo da
  requisição.
- Consultas e mutations de usuários, fretes, viagens e CT-es terão escopo explícito por empresa.
- Permissões serão aplicadas no backend; esconder botões no frontend não será considerado proteção.
- Alterações de senha usarão o serviço de hash existente, validação de senha atual, rate limit da
  rota e revogação de refresh tokens.
- A seleção de frete e criação de CT-e usarão validação de entrada, ownership do recurso e transação
  para impedir duplicidade.
- Falhas de login/troca de senha e mudanças administrativas continuarão na trilha de auditoria,
  sem registrar credenciais.

## Componentes previstos

- Rotas/controladores/serviço de conta para alteração da própria senha.
- Reforço do serviço e da tela de usuários com criação por módulos e perfil GESTOR.
- Migração Prisma para o vínculo 1:1 entre `Cte` e `FreteTerceiro`, com índice/uniqueness apropriado.
- Endpoint de consulta de fretes disponíveis e extensão da criação de CT-e para vincular o frete.
- Ajustes nas telas de CT-e/acerto, frete terceiro e documentos baixados.
- Camada central de branding para `TRADUTTO TRANSPORTE`, mantendo o branding por empresa.
- Atualização do manifest/PWA, favicon, metadata e configuração de domínio.

## Fluxo de dados do vínculo

1. Usuário abre “Criar CT-e” dentro de uma viagem.
2. Frontend solicita fretes livres usando o tenant da sessão.
3. Usuário busca e seleciona um frete terceiro.
4. Backend confirma que frete e viagem pertencem à mesma empresa e que o frete ainda não possui
   vínculo.
5. Transação cria o CT-e e grava o vínculo do frete com o CT-e/viagem.
6. Auditoria registra a operação; a próxima consulta não devolve o frete já utilizado.

## Testes e aceite

- Testes unitários para troca de senha, senha atual inválida, revogação de sessões e regras de role/
  módulos.
- Testes de isolamento cross-tenant para usuários, fretes, viagens e CT-es.
- Testes de concorrência/uniqueness para impedir dois CT-es no mesmo frete.
- Testes da busca por número de CT-e e do fluxo de criação com e sem frete selecionado.
- Testes de renderização/strings dos documentos e do PWA com `TRADUTTO TRANSPORTE`.
- `npm test`, `npm run typecheck`, `npm run build` e validação de migração antes da publicação.
- No deploy, verificar o domínio Railway e orientar o apontamento DNS; não alterar DNS sem acesso
  autorizado ao provedor.

## Fora do escopo desta entrega

- Recuperação de senha por e-mail (a troca autenticada será entregue primeiro).
- Pagamentos, cobrança SaaS ou planos comerciais.
- Um CT-e contendo múltiplos fretes; a regra aprovada é um frete por CT-e.
