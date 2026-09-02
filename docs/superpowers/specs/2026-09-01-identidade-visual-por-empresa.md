# Identidade visual por empresa

## Objetivo

Cada transportadora enxerga sua própria marca desde o login: logotipo, cor, capa
do hub, textos de abertura e impressão de acerto. A RPM será configurada como o
primeiro caso real usando o logotipo fornecido por Lucas.

## Direção visual aprovada

**Capa RPM:** fundo escuro industrial, com textura discreta de aço/asfalto e um
gradiente vermelho derivado da cor RPM. O logotipo RPM entra em escala grande e
nítida. Não há foto de frota disponível nos arquivos recebidos: o JPEG do WhatsApp
e o PDF contêm o logotipo, não uma foto. Quando a RPM fornecer uma foto, ela poderá
substituir apenas a imagem de fundo, sem alterar logo, cor ou layout.

## Dados por empresa

`Empresa` ganha os campos opcionais:

- `capa_dados Bytes?`
- `capa_mime String?`
- `capa_tamanho Int?`
- `capa_posicao String?` com default `center`

O logo existente continua em `logo_dados/logo_mime/logo_tamanho`; a capa é um
arquivo distinto. Logo aceita PNG/JPEG/WEBP de até 2 MB. Capa aceita JPEG/WEBP de
até 5 MB. SVG não entra em nenhum upload para evitar vetor de XSS.

## API e segurança

- `POST /api/empresas/:id/capa`: somente `SUPER_ADMIN`; upload em memória,
  whitelist de MIME e limite de tamanho.
- `GET /api/empresas/:id/capa`: público, assim como a rota da logo; a imagem é
  identidade visual, não dado operacional.
- `GET /api/auth/me` já devolve `user.empresa`; ele passa a incluir somente os
  metadados da capa (`capa_mime`, `capa_posicao`), nunca os bytes.
- O upload grava auditoria com tamanho e MIME, sem armazenar bytes no log.

## Frontend

`applyBranding(empresa)` passa a:

1. aplicar `--accent` e `--accent2`;
2. trocar todos os `img.logo-img`;
3. preencher textos marcados com `data-brand-name`;
4. configurar `--brand-hero-image` no hub quando a empresa tiver capa;
5. alternar o hub para modo `brand-cover` — mantendo os overlays, contraste e
   comportamento responsivo atuais.

O HTML do hub troca textos fixos da Prima por atributos de marca:

- `ACOMPANHAMENTO FROTA / <empresa>`
- selo `<empresa>`
- título `ACOMPANHAMENTO FROTA / <empresa>`

Sem capa cadastrada, a empresa preserva a imagem padrão atual; a Prima não muda.
Sem logo cadastrada, preserva o logo padrão atual.

## Painel Empresas

O editor de empresa recebe um segundo seletor: **Capa inicial**. A tela mostra o
estado do upload e permite substituir a capa. A seleção de logo e capa envia
requisições separadas depois de salvar os dados textuais, para uma falha no arquivo
não apagar os dados da empresa.

## RPM inicial

1. Extrair o logotipo do arquivo `RPM - LOGOTIPO.pdf` para PNG nítido, com recorte
   sem as áreas brancas excessivas.
2. Enviar o logo para a empresa RPM no painel de Empresas.
3. Gerar a capa RPM no frontend usando a logo como elemento principal, o vermelho
   `#E30613` e a composição industrial escura. A capa não depende de imagem gerada
   nem de asset de terceiros.

## Verificação

- Teste unitário das regras de MIME e da resolução da URL de capa.
- Schema Prisma válido.
- Login como RPM: logo em todos os cabeçalhos, título/documento e capa RPM.
- Login como Prima: logo e hero atuais, sem regressão.
- Upload inválido (SVG ou arquivo acima do limite): 4xx, sem alteração da marca.
