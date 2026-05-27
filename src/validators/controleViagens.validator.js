const { body } = require('express-validator');

const VALID_STATUS = [
  'VAZIO_AGUARDANDO_CARGA',
  'INDO_CARREGAR',
  'NA_FABRICA',
  'CARREGADO_EM_VIAGEM',
  'EM_DESCARGA_NO_CLIENTE',
  'EM_MANUTENCAO',
];

const upsertState = [
  body('status').optional().isIn(VALID_STATUS).withMessage('Status inválido.'),
  body('contexto_atual').optional({ nullable: true }).isLength({ max: 500 }),
  body('data_coleta').optional({ nullable: true, checkFalsy: true }).isISO8601().withMessage('Data de coleta inválida.'),
  body('data_agendamento_entrega').optional({ nullable: true, checkFalsy: true }).isISO8601().withMessage('Data de agendamento inválida.'),
  body('carga_descricao').optional({ nullable: true }).isLength({ max: 500 }),
  body('descricao').optional({ nullable: true }).isLength({ max: 4000 }),
];

const addComment = [
  body('texto').notEmpty().withMessage('Texto obrigatório.').isLength({ max: 4000 }).withMessage('Comentário muito longo (máx 4000).'),
];

module.exports = { upsertState, addComment, VALID_STATUS };
