const { body } = require('express-validator');

const VALID_COLUMNS = [
  'VAZIO_AGUARDANDO_CARGA',
  'INDO_CARREGAR',
  'NA_FABRICA',
  'CARREGADO_EM_VIAGEM',
  'EM_DESCARGA_NO_CLIENTE',
  'EM_MANUTENCAO',
];

const updateColumn = [
  body('coluna').optional({ checkFalsy: false }).custom((v) => {
    if (v === '' || v === null) throw new Error('Coluna não pode ser vazia.');
    if (!VALID_COLUMNS.includes(v)) throw new Error('Coluna inválida.');
    return true;
  }),
  body('manutencao_descricao').optional({ nullable: true }).isLength({ max: 500 }),
  body('descricao_geral').optional({ nullable: true }).isLength({ max: 4000 }),
];

const createViagem = [
  body('origem').optional({ nullable: true }).isLength({ max: 200 }),
  body('destino').optional({ nullable: true }).isLength({ max: 200 }),
  body('carga_descricao').optional({ nullable: true }).isLength({ max: 500 }),
  body('fabrica').optional({ nullable: true }).isLength({ max: 200 }),
  body('cliente_descarga').optional({ nullable: true }).isLength({ max: 200 }),
  body('valor_frete').optional({ nullable: true, checkFalsy: true }).isFloat({ min: 0 }).withMessage('Valor frete deve ser número.'),
  body('data_coleta').optional({ nullable: true, checkFalsy: true }).isISO8601().withMessage('Data coleta inválida.'),
  body('data_carregamento').optional({ nullable: true, checkFalsy: true }).isISO8601().withMessage('Data carregamento inválida.'),
  body('data_agendamento_entrega').optional({ nullable: true, checkFalsy: true }).isISO8601().withMessage('Data agendamento inválida.'),
  body('observacoes').optional({ nullable: true }).isLength({ max: 4000 }),
];

const updateViagem = createViagem; // mesma whitelist

const finalizeViagem = [
  body('data_entrega_realizada').optional({ nullable: true, checkFalsy: true }).isISO8601().withMessage('Data entrega inválida.'),
];

const cancelViagem = [
  body('motivo').optional({ nullable: true }).isLength({ max: 500 }),
];

const addComment = [
  body('texto').notEmpty().withMessage('Texto obrigatório.').isLength({ max: 4000 }).withMessage('Máx 4000 caracteres.'),
  body('viagem_id').optional({ nullable: true }).isUUID().withMessage('viagem_id deve ser UUID.'),
];

module.exports = {
  updateColumn, createViagem, updateViagem,
  finalizeViagem, cancelViagem, addComment,
  VALID_COLUMNS,
};
