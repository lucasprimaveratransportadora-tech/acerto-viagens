const { Router } = require('express');
const controller = require('../controllers/fretesTerceiros.controller');
const { createFreteTerceiro, updateFreteTerceiro, baixar, linkTrip } = require('../validators/freteTerceiro.validator');
const validate = require('../middleware/validate');
const auth = require('../middleware/auth');
const tenant = require('../middleware/tenant');

const router = Router();

router.get   ('/',           auth, tenant, controller.list);
router.get   ('/summary',    auth, tenant, controller.summary);
router.get   ('/:id',        auth, tenant, controller.getById);
router.post  ('/',           auth, tenant, createFreteTerceiro, validate, controller.create);
router.patch ('/:id',        auth, tenant, updateFreteTerceiro, validate, controller.update);
router.post  ('/:id/baixar', auth, tenant, baixar,              validate, controller.baixar);
router.post  ('/:id/link-trip',   auth, tenant, linkTrip, validate, controller.linkTrip);
router.post  ('/:id/unlink-trip', auth, tenant,                  controller.unlinkTrip);
router.delete('/:id',        auth, tenant, controller.remove);

module.exports = router;
