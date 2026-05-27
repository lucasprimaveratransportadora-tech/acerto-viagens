const { body } = require('express-validator');

const CATEGORIAS = [
  'AQUISICAO','IPVA','SEGURO','MANUTENCAO','PNEU','RASTREADOR',
  'DESPACHANTE_TAXAS','PEDAGIO_AVULSO','ABASTECIMENTO_AVULSO',
  'ACERTO_CTE','OUTRO_CUSTO','OUTRA_RECEITA',
];

const createEntry = [
  body('data').notEmpty().withMessage('Data obrigatória.').isISO8601().withMessage('Data inválida.'),
  body('historico').notEmpty().withMessage('Histórico obrigatório.').isLength({ max: 500 }).withMessage('Histórico muito longo.'),
  body('tipo').notEmpty().isIn(['DEBITO','CREDITO']).withMessage('Tipo inválido.'),
  body('valor').notEmpty().withMessage('Valor obrigatório.').isFloat({ gt: 0 }).withMessage('Valor deve ser maior que zero.'),
  body('categoria').optional().isIn(CATEGORIAS).withMessage('Categoria inválida.'),
  body('observacoes').optional().isLength({ max: 1000 }),
];

const updateEntry = [
  body('data').optional().isISO8601().withMessage('Data inválida.'),
  body('historico').optional().notEmpty().isLength({ max: 500 }),
  body('tipo').optional().isIn(['DEBITO','CREDITO']),
  body('valor').optional().isFloat({ gt: 0 }),
  body('categoria').optional().isIn(CATEGORIAS),
  body('observacoes').optional().isLength({ max: 1000 }),
];

const addAnexoUrl = [
  body('nome').notEmpty().withMessage('Nome obrigatório.').isLength({ max: 200 }),
  // isURL valida que tem protocolo (http/https). Antes só checava notEmpty
  // e length — qualquer string passava e o /download tentava fetch.
  body('url')
    .notEmpty().withMessage('URL obrigatória.')
    .isURL({ require_protocol: true }).withMessage('URL inválida (precisa começar com http:// ou https://).')
    .isLength({ max: 4000 }),
];

module.exports = { createEntry, updateEntry, addAnexoUrl };
