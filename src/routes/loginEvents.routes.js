const { Router } = require('express');
const controller = require('../controllers/loginEvents.controller');
const auth = require('../middleware/auth');
const rbac = require('../middleware/rbac');

const router = Router();

router.get('/', auth, rbac('ADMIN'), controller.list);

module.exports = router;
