const { Router } = require('express');
const controller = require('../controllers/dashboard.controller');
const auth = require('../middleware/auth');
const tenant = require('../middleware/tenant');

const router = Router();

router.get('/', auth, tenant, controller.getGlobal);
router.get('/truck/:truckId', auth, tenant, controller.getByTruck);

module.exports = router;
