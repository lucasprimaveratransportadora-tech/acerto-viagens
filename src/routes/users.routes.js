const { Router } = require('express');
const controller = require('../controllers/users.controller');
const { registerValidator } = require('../validators/auth.validator');
const { resetPasswordValidator } = require('../validators/admin.validator');
const validate = require('../middleware/validate');
const auth = require('../middleware/auth');
const rbac = require('../middleware/rbac');

const router = Router();

router.get('/', auth, rbac('ADMIN'), controller.list);
router.post('/', auth, rbac('ADMIN'), registerValidator, validate, controller.create);
router.patch('/:id', auth, rbac('ADMIN'), controller.update);
router.delete('/:id', auth, rbac('ADMIN'), controller.remove);
router.post('/:id/reset-password', auth, rbac('ADMIN'), resetPasswordValidator, validate, controller.resetPassword);
router.delete('/:id/sessions', auth, rbac('ADMIN'), controller.revokeSessions);

module.exports = router;
