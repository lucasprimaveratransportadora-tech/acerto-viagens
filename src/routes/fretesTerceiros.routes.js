const { Router } = require('express');
const multer = require('multer');
const controller = require('../controllers/fretesTerceiros.controller');
const {
  createFreteTerceiro, updateFreteTerceiro,
  baixar, linkTrip, addAnexo,
} = require('../validators/freteTerceiro.validator');
const validate = require('../middleware/validate');
const { uuidParams } = require('../middleware/paramValidators');
const { anexoFilter } = require('../middleware/uploadFilter');
const auth = require('../middleware/auth');
const tenant = require('../middleware/tenant');

const router = Router();

// Upload em memória — bytes vão direto pro Postgres (BYTEA).
// Limite de 10 MB por arquivo é suficiente pra comprovantes/CT-e em PDF/JPG.
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: anexoFilter,
});

router.get   ('/',           auth, tenant, controller.list);
router.get   ('/summary',    auth, tenant, controller.summary);
router.get   ('/:id',        auth, tenant, uuidParams('id'), controller.getById);
router.post  ('/',           auth, tenant, createFreteTerceiro, validate, controller.create);
router.patch ('/:id',        auth, tenant, uuidParams('id'), updateFreteTerceiro, validate, controller.update);

// Baixas
router.post  ('/:id/baixar',           auth, tenant, uuidParams('id'), baixar, validate, controller.baixar);
router.delete('/:id/baixas/:baixaId',  auth, tenant, uuidParams('id', 'baixaId'), controller.removeBaixa);

// Anexos — URL externa (link) ou upload de arquivo
router.post  ('/:id/anexos',                      auth, tenant, uuidParams('id'), addAnexo, validate, controller.addAnexo);
router.post  ('/:id/anexos/upload',               auth, tenant, uuidParams('id'), upload.single('arquivo'), controller.uploadAnexo);
router.get   ('/:id/anexos/:anexoId/download',    auth, tenant, uuidParams('id', 'anexoId'), controller.downloadAnexo);
router.delete('/:id/anexos/:anexoId',             auth, tenant, uuidParams('id', 'anexoId'), controller.removeAnexo);

// Vínculo com viagem
router.post  ('/:id/link-trip',   auth, tenant, uuidParams('id'), linkTrip, validate, controller.linkTrip);
router.post  ('/:id/unlink-trip', auth, tenant, uuidParams('id'), controller.unlinkTrip);

router.delete('/:id',        auth, tenant, uuidParams('id'), controller.remove);

module.exports = router;
