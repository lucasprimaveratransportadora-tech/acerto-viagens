const { Router } = require('express');
const controller = require('../controllers/ctes.controller');
const { createCte, updateCte, listFretesDisponiveis } = require('../validators/cte.validator');
const validate = require('../middleware/validate');
const { uuidParams } = require('../middleware/paramValidators');
const auth = require('../middleware/auth');
const tenant = require('../middleware/tenant');

const router = Router();

router.get('/fretes-disponiveis', auth, tenant, listFretesDisponiveis, validate, controller.listFretesDisponiveis);
router.get('/trip/:tripId', auth, tenant, uuidParams('tripId'), controller.listByTrip);

router.post('/trip/:tripId', auth, tenant, uuidParams('tripId'), createCte, validate, controller.create);
router.patch('/:id', auth, tenant, uuidParams('id'), updateCte, validate, controller.update);
router.delete('/:id', auth, tenant, uuidParams('id'), controller.remove);

module.exports = router;
