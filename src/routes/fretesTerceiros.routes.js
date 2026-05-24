const { Router } = require('express');
const multer = require('multer');
const controller = require('../controllers/fretesTerceiros.controller');
const {
  createFreteTerceiro, updateFreteTerceiro,
  baixar, linkTrip, addAnexo,
} = require('../validators/freteTerceiro.validator');
const validate = require('../middleware/validate');
const auth = require('../middleware/auth');
const tenant = require('../middleware/tenant');

const router = Router();

// Upload em memória — bytes vão direto pro Postgres (BYTEA).
// Limite de 10 MB por arquivo é suficiente pra comprovantes/CT-e em PDF/JPG.
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
});

router.get   ('/',           auth, tenant, controller.list);
router.get   ('/summary',    auth, tenant, controller.summary);
router.get   ('/:id',        auth, tenant, controller.getById);
router.post  ('/',           auth, tenant, createFreteTerceiro, validate, controller.create);
router.patch ('/:id',        auth, tenant, updateFreteTerceiro, validate, controller.update);

// Baixas
router.post  ('/:id/baixar',           auth, tenant, baixar, validate, controller.baixar);
router.delete('/:id/baixas/:baixaId',  auth, tenant, controller.removeBaixa);

// Anexos — URL externa (link) ou upload de arquivo
router.post  ('/:id/anexos',                      auth, tenant, addAnexo, validate, controller.addAnexo);
router.post  ('/:id/anexos/upload',               auth, tenant, upload.single('arquivo'), controller.uploadAnexo);
router.get   ('/:id/anexos/:anexoId/download',    auth, tenant, controller.downloadAnexo);
router.delete('/:id/anexos/:anexoId',             auth, tenant, controller.removeAnexo);

// Vínculo com viagem
router.post  ('/:id/link-trip',   auth, tenant, linkTrip, validate, controller.linkTrip);
router.post  ('/:id/unlink-trip', auth, tenant, controller.unlinkTrip);

router.delete('/:id',        auth, tenant, controller.remove);

module.exports = router;
