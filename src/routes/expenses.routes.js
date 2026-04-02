const { Router } = require('express');
const controller = require('../controllers/expenses.controller');
const { upsertExpenses } = require('../validators/expense.validator');
const validate = require('../middleware/validate');
const auth = require('../middleware/auth');
const tenant = require('../middleware/tenant');

const router = Router();

router.put('/trip/:tripId', auth, tenant, upsertExpenses, validate, controller.upsertAll);
router.patch('/trip/:tripId/:cat', auth, tenant, controller.updateOne);
router.get('/trip/:tripId', auth, tenant, controller.getByTrip);

module.exports = router;
