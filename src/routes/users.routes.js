const { Router } = require('express');
const controller = require('../controllers/users.controller');
const { registerValidator } = require('../validators/auth.validator');
const validate = require('../middleware/validate');
const auth = require('../middleware/auth');
const rbac = require('../middleware/rbac');

const router = Router();

router.get('/', auth, rbac('ADMIN'), controller.list);
router.post('/', auth, rbac('ADMIN'), registerValidator, validate, controller.create);
router.patch('/:id', auth, rbac('ADMIN'), controller.update);
router.delete('/:id', auth, rbac('ADMIN'), controller.remove);

module.exports = router;
