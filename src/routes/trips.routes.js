const { Router } = require('express');
const controller = require('../controllers/trips.controller');
const { createTrip, updateTrip } = require('../validators/trip.validator');
const validate = require('../middleware/validate');
const auth = require('../middleware/auth');
const tenant = require('../middleware/tenant');

const router = Router();

router.get('/truck/:truckId', auth, tenant, controller.listByTruck);
router.post('/truck/:truckId', auth, tenant, createTrip, validate, controller.create);
router.get('/:id', auth, tenant, controller.getById);
router.patch('/:id', auth, tenant, updateTrip, validate, controller.update);
router.delete('/:id', auth, tenant, controller.remove);

module.exports = router;
