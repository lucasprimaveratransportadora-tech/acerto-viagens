# Identidade visual por empresa — plano de implementação

> **Para o time:** executar este plano pela skill `superpowers:executing-plans`, com TDD e validação antes de integrar.

**Objetivo:** cada transportadora use sua própria marca no sistema: logotipo no cabeçalho, navegação e documentos; capa própria no hub inicial; cor principal e textos institucionais por empresa. A RPM terá uma capa industrial escura com o logotipo em destaque até receber uma foto real de frota.

**Arquitetura:** os arquivos de capa ficam no registro da empresa, como já acontece com o logotipo. A sessão expõe somente os metadados necessários para o frontend. O endpoint público de leitura é usado apenas depois de validar o UUID; upload e troca continuam restritos ao SUPER_ADMIN. O frontend aplica a marca da empresa ativa em um único ponto (`branding.js`) e mantém a aparência atual da Prima como fallback.

## 1. Modelo, migração e regras de arquivo

**Arquivos:**
- Modificar: `prisma/schema.prisma`
- Criar: `prisma/migrations/20260901220000_empresa_capa/migration.sql`
- Criar: `src/services/empresa-brand.js`
- Criar: `test/empresa-capa.test.js`

1. Escrever testes que aceitem JPEG/WebP de até 5 MB e rejeitem outro MIME, arquivo vazio ou maior que o limite.
2. Criar helper puro com a seleção de campos públicos de marca e a validação da capa.
3. Adicionar a `Empresa`: `capa_dados` (bytes), `capa_mime`, `capa_tamanho` e `capa_posicao` com padrão `center`.
4. Criar migration aditiva, sem afetar logos ou empresas existentes.
5. Rodar o teste novo para confirmar o vermelho antes da implementação e verde após ela.

## 2. API de capa e contexto autenticado

**Arquivos:**
- Modificar: `src/services/empresas.service.js`
- Modificar: `src/controllers/empresas.controller.js`
- Modificar: `src/routes/empresas.routes.js`
- Modificar: `src/middleware/auth.js`
- Modificar: `test/auth-context.test.js`

1. Estender o contexto da sessão com os metadados da capa, sem incluir bytes.
2. Implementar `saveCapa` e `getCapa`, registrando na auditoria só MIME, tamanho e posição.
3. Expor `GET /api/empresas/:id/capa` para servir o binário com `Content-Type` e cache seguro.
4. Expor `POST /api/empresas/:id/capa`, multipart, permitido apenas ao `SUPER_ADMIN`.
5. Usar multer separado com limite de 5 MB e JPEG/WebP. Retornar erro claro quando não houver arquivo válido.
6. Cobrir que o contexto de autenticação contém metadados mas nunca dados binários.

## 3. Administração da empresa

**Arquivos:**
- Modificar: `public/js/admin/empresas.js`
- Modificar: `public/css/admin.css` se necessário

1. Incluir no formulário de empresa o campo “Capa do sistema”, aceitando JPEG/WebP.
2. Depois de salvar a empresa, enviar logo e capa aos endpoints individuais, mostrando falha sem descartar os demais dados salvos.
3. Mostrar se há capa cadastrada e manter a gestão exclusiva do SUPER_ADMIN.

## 4. Aplicação visual no sistema e fallback RPM

**Arquivos:**
- Modificar: `public/js/branding.js`
- Modificar: `public/index.html`
- Modificar: `public/css/hub.css`
- Criar ou modificar: `test/branding.test.js`

1. Escrever testes para resolver URL de capa, nome da empresa e fallback visual sem interpolar valores inseguros no CSS.
2. Fazer `applyBranding` trocar logo em todos os elementos `.logo-img`, título da página e os textos marcados no hub.
3. Adicionar marcações de texto no hub para nome da transportadora e chamadas institucionais, preservando Prima no HTML inicial.
4. Quando existir capa, usar `/api/empresas/:id/capa` como fundo do hub e respeitar posição permitida.
5. Quando a empresa tiver marca própria, mas ainda não tiver foto de capa, exibir fallback industrial em preto/vermelho com logotipo grande. A Prima sem customização conserva a foto atual do caminhão.
6. Garantir que páginas de impressão, cabeçalhos e abas usem a mesma logo já aplicada pela marca ativa.

## 5. Configuração da RPM, validação e integração

**Arquivos:**
- Modificar somente se necessário: `scripts/` para uma operação administrativa temporária e não versionada
- Usar os materiais fornecidos: `C:\Users\Lucas\Downloads\WhatsApp Image 2026-08-25 at 15.34.57.jpeg` e `C:\Users\Lucas\Downloads\RPM - LOGOTIPO.pdf`

1. Preparar uma versão PNG do logo RPM com fundo transparente a partir do material fornecido, preservando o desenho e texto originais.
2. Pelo painel SUPER_ADMIN, vincular logo, vermelho de marca e a capa/fallback à empresa RPM já cadastrada.
3. Rodar `npm test`, `npx prisma generate` e a checagem de sintaxe/lint disponível no projeto.
4. Revisar o diff, solicitar revisão técnica e só então criar commit da feature.
5. Após autorização explícita do Lucas, integrar em `main`, enviar ao repositório e acompanhar o deploy Railway. Confirmar no ambiente de produção com a conta do Ney: hub, logo em telas, permissões e documentos.

## Critérios de aceite

- Usuário de RPM vê RPM no hub, cabeçalhos e documento; usuário Prima segue vendo Prima.
- O SUPER_ADMIN consegue trocar logo e capa sem alterar dados operacionais.
- A capa é isolada por empresa, aceita apenas JPEG/WebP até 5 MB e não vaza bytes pela sessão.
- Sem foto cadastrada, RPM recebe o visual industrial vermelho/preto; sem marca, a tela atual da Prima não muda.
- Testes passam e a migration roda em banco existente sem perda de dados.
