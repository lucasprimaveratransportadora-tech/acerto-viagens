const { Router } = require('express');
const controller = require('../controllers/fuels.controller');
const { createFuel, updateFuel } = require('../validators/fuel.validator');
const validate = require('../middleware/validate');
const auth = require('../middleware/auth');
const tenant = require('../middleware/tenant');

const router = Router();

router.post('/trip/:tripId', auth, tenant, createFuel, validate, controller.create);
router.patch('/:id', auth, tenant, updateFuel, validate, controller.update);
router.delete('/:id', auth, tenant, controller.remove);

module.exports = router;
