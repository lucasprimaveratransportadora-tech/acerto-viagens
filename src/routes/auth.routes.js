const { Router } = require('express');
const authController = require('../controllers/auth.controller');
const { loginValidator } = require('../validators/auth.validator');
const { body } = require('express-validator');
const rbac = require('../middleware/rbac');
const validate = require('../middleware/validate');
const auth = require('../middleware/auth');
const { authLimiter, refreshLimiter } = require('../middleware/rateLimiter');

const router = Router();

router.post('/login', authLimiter, loginValidator, validate, authController.login);
router.post('/refresh', refreshLimiter, authController.refresh);
router.post('/logout', refreshLimiter, authController.logout);
router.get('/me', auth, authController.me);
router.post('/impersonar', auth, rbac('SUPER_ADMIN'), body('empresa_id').isUUID(), validate, authController.impersonate);
router.post('/sair-impersonacao', auth, authController.stopImpersonation);

module.exports = router;
