const { Router } = require('express');
const controller = require('../controllers/expenses.controller');
const { upsertExpenses, updateOneExpense } = require('../validators/expense.validator');
const validate = require('../middleware/validate');
const { uuidParams, expenseCategoryParam } = require('../middleware/paramValidators');
const auth = require('../middleware/auth');
const tenant = require('../middleware/tenant');

const router = Router();

router.put('/trip/:tripId', auth, tenant, uuidParams('tripId'), upsertExpenses, validate, controller.upsertAll);
router.patch('/trip/:tripId/:cat', auth, tenant, uuidParams('tripId'), expenseCategoryParam('cat'), updateOneExpense, validate, controller.updateOne);
router.get('/trip/:tripId', auth, tenant, uuidParams('tripId'), controller.getByTrip);

module.exports = router;
