const { Router } = require('express');
const controller = require('../controllers/trucks.controller');
const { createTruck, updateTruck } = require('../validators/truck.validator');
const validate = require('../middleware/validate');
const auth = require('../middleware/auth');
const tenant = require('../middleware/tenant');

const router = Router();

router.get('/', auth, tenant, controller.list);
router.post('/', auth, tenant, createTruck, validate, controller.create);
router.get('/:id', auth, tenant, controller.getById);
router.patch('/:id', auth, tenant, updateTruck, validate, controller.update);
router.delete('/:id', auth, tenant, controller.remove);

module.exports = router;
