const { Router } = require('express');
const authController = require('../controllers/auth.controller');
const { loginValidator } = require('../validators/auth.validator');
const validate = require('../middleware/validate');
const auth = require('../middleware/auth');
const { authLimiter } = require('../middleware/rateLimiter');

const router = Router();

router.post('/login', authLimiter, loginValidator, validate, authController.login);
router.post('/refresh', authController.refresh);
router.post('/logout', authController.logout);
router.get('/me', auth, authController.me);

module.exports = router;
