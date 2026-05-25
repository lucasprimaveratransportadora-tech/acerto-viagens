const { Router } = require('express');
const controller = require('../controllers/fuels.controller');
const { createFuel, updateFuel } = require('../validators/fuel.validator');
const validate = require('../middleware/validate');
const { uuidParams } = require('../middleware/paramValidators');
const auth = require('../middleware/auth');
const tenant = require('../middleware/tenant');

const router = Router();

router.post('/trip/:tripId', auth, tenant, uuidParams('tripId'), createFuel, validate, controller.create);
router.patch('/:id', auth, tenant, uuidParams('id'), updateFuel, validate, controller.update);
router.delete('/:id', auth, tenant, uuidParams('id'), controller.remove);

module.exports = router;
