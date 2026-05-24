const { Router } = require('express');
const multer = require('multer');
const controller = require('../controllers/trucks.controller');
const { createTruck, updateTruck, addAnexo } = require('../validators/truck.validator');
const validate = require('../middleware/validate');
const auth = require('../middleware/auth');
const tenant = require('../middleware/tenant');

const router = Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
});

router.get   ('/',           auth, tenant, controller.list);
router.post  ('/',           auth, tenant, createTruck, validate, controller.create);
router.get   ('/:id',        auth, tenant, controller.getById);
router.patch ('/:id',        auth, tenant, updateTruck, validate, controller.update);
router.delete('/:id',        auth, tenant, controller.remove);

// Anexos do caminhão (fichário de documentos / GR aprovado)
router.post  ('/:id/anexos',                   auth, tenant, addAnexo, validate, controller.addAnexo);
router.post  ('/:id/anexos/upload',            auth, tenant, upload.single('arquivo'), controller.uploadAnexo);
router.get   ('/:id/anexos/:anexoId/download', auth, tenant, controller.downloadAnexo);
router.delete('/:id/anexos/:anexoId',          auth, tenant, controller.removeAnexo);

module.exports = router;
