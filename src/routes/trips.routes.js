const { Router } = require('express');
const multer = require('multer');
const controller = require('../controllers/trips.controller');
const { createTrip, updateTrip, addAnexo } = require('../validators/trip.validator');
const validate = require('../middleware/validate');
const { uuidParams } = require('../middleware/paramValidators');
const auth = require('../middleware/auth');
const tenant = require('../middleware/tenant');

const router = Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 20 * 1024 * 1024 }, // folha de acerto pode ter scan grande
});

router.get   ('/truck/:truckId', auth, tenant, uuidParams('truckId'), controller.listByTruck);
router.post  ('/truck/:truckId', auth, tenant, uuidParams('truckId'), createTrip, validate, controller.create);
router.get   ('/:id',            auth, tenant, uuidParams('id'), controller.getById);
router.patch ('/:id',            auth, tenant, uuidParams('id'), updateTrip, validate, controller.update);
router.delete('/:id',            auth, tenant, uuidParams('id'), controller.remove);

// Anexos da viagem (folha de acerto digitalizada, comprovantes)
router.post  ('/:id/anexos',                   auth, tenant, uuidParams('id'), addAnexo, validate, controller.addAnexo);
router.post  ('/:id/anexos/upload',            auth, tenant, uuidParams('id'), upload.single('arquivo'), controller.uploadAnexo);
router.get   ('/:id/anexos/:anexoId/download', auth, tenant, uuidParams('id', 'anexoId'), controller.downloadAnexo);
router.delete('/:id/anexos/:anexoId',          auth, tenant, uuidParams('id', 'anexoId'), controller.removeAnexo);

module.exports = router;
