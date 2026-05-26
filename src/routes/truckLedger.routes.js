const { Router } = require('express');
const multer = require('multer');
const controller = require('../controllers/truckLedger.controller');
const { createEntry, updateEntry, addAnexoUrl } = require('../validators/truckLedger.validator');
const validate = require('../middleware/validate');
const { uuidParams } = require('../middleware/paramValidators');
const { anexoFilter, xlsxFilter } = require('../middleware/uploadFilter');
const auth = require('../middleware/auth');
const tenant = require('../middleware/tenant');

// mergeParams para acessar :truckId definido na rota pai (/trucks)
const router = Router({ mergeParams: true });

const uploadAnexo = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }, // anexos de comprovante
  fileFilter: anexoFilter,
});

// XLSX completo pode passar de 1 MB — permite até 25 MB
const uploadXlsx = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 25 * 1024 * 1024 },
  fileFilter: xlsxFilter,
});

/* Overview (todos os caminhões da empresa) — não tem :truckId */
router.get('/overview', auth, tenant, controller.overview);

/* Import XLSX em massa — não amarrado a um caminhão específico */
router.post('/import', auth, tenant, uploadXlsx.single('arquivo'), controller.importXlsx);
router.delete('/import/:batchId', auth, tenant, uuidParams('batchId'), controller.undoImport);

/* Lançamentos individuais sob /:truckId */
router.get   ('/:truckId/entries',         auth, tenant, uuidParams('truckId'), controller.list);
router.get   ('/:truckId/entries/summary', auth, tenant, uuidParams('truckId'), controller.summary);
router.post  ('/:truckId/entries',         auth, tenant, uuidParams('truckId'), createEntry, validate, controller.create);
router.patch ('/:truckId/entries/:id',     auth, tenant, uuidParams('truckId', 'id'), updateEntry, validate, controller.update);
router.delete('/:truckId/entries/:id',     auth, tenant, uuidParams('truckId', 'id'), controller.remove);

/* Anexos por lançamento */
router.post  ('/:truckId/entries/:id/anexo/upload',   auth, tenant, uuidParams('truckId', 'id'), uploadAnexo.single('arquivo'), controller.uploadAnexo);
router.post  ('/:truckId/entries/:id/anexo/url',      auth, tenant, uuidParams('truckId', 'id'), addAnexoUrl, validate, controller.addAnexoUrl);
router.get   ('/:truckId/entries/:id/anexo/download', auth, tenant, uuidParams('truckId', 'id'), controller.downloadAnexo);
router.delete('/:truckId/entries/:id/anexo',          auth, tenant, uuidParams('truckId', 'id'), controller.removeAnexo);

module.exports = router;
